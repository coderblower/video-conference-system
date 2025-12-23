const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://video-calling-57c68.firebaseio.com"
  });
}

// Track which services are available
const firebaseServices = {
  firestore: false,
  auth: false,
  messaging: false
};

/**
 * Test Firebase connection
 */
async function testFirebaseConnection() {
  console.log('   🔍 Testing Firebase services...\n');
  
  try {
    // Test Firestore connection
    try {
      await admin.firestore().collection("_test").doc("connection").set({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: "connected"
      });
      await admin.firestore().collection("_test").doc("connection").delete();
      firebaseServices.firestore = true;
      console.log("   ✅ Firestore: Connected");
    } catch (firestoreError) {
      console.log("   ❌ Firestore: Failed -", firestoreError.message);
    }

    // Test Authentication connection
    try {
      const listUsersResult = await admin.auth().listUsers(1);
      firebaseServices.auth = true;
      console.log("   ✅ Auth: Connected");
    } catch (authError) {
      console.log("   ⚠️  Auth: Not configured (optional)");
      console.log("      Enable it in Firebase Console > Authentication");
    }

    // Test FCM
    try {
      const messaging = admin.messaging();
      if (messaging) {
        firebaseServices.messaging = true;
        console.log("   ✅ Messaging (FCM): Ready");
      }
    } catch (fcmError) {
      console.log("   ⚠️  Messaging: Not available (optional)");
    }

    console.log();
    
    // At minimum, we need Firestore to work
    return firebaseServices.firestore;
    
  } catch (error) {
    console.error("   ❌ Firebase connection failed:", error.message);
    return false;
  }
}

/**
 * Delete all documents in a collection
 */
async function clearCollection(collectionPath) {
  if (!firebaseServices.firestore) {
    console.log(`   ⚠️  Cannot clear '${collectionPath}' - Firestore not available`);
    return 0;
  }

  try {
    const collectionRef = admin.firestore().collection(collectionPath);
    const snapshot = await collectionRef.get();
    
    if (snapshot.empty) {
      console.log(`   📭 '${collectionPath}' is empty`);
      return 0;
    }

    const batchSize = 500;
    let batch = admin.firestore().batch();
    let count = 0;
    let totalDeleted = 0;

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
      totalDeleted++;
      
      if (count >= batchSize) {
        batch.commit();
        batch = admin.firestore().batch();
        count = 0;
      }
    });

    if (count > 0) {
      await batch.commit();
    }

    console.log(`   🗑️  Cleared ${totalDeleted} documents from '${collectionPath}'`);
    return totalDeleted;
  } catch (error) {
    console.error(`   ❌ Error clearing '${collectionPath}':`, error.message);
    return 0;
  }
}

/**
 * Clear specific collections on startup
 */
async function clearFirebaseData() {
  console.log('   🧹 Clearing Firebase data...\n');
  
  const collectionsTosClear = [
    "calls",
    "notifications",
    "rooms",
  ];

  let totalCleared = 0;
  for (const collection of collectionsTosClear) {
    const cleared = await clearCollection(collection);
    totalCleared += cleared;
  }

  console.log(`\n   ✨ Total cleared: ${totalCleared} documents\n`);
}

/**
 * Initialize Firebase on server start
 */
async function initializeFirebase() {
  try {
    const isConnected = await testFirebaseConnection();
    
    if (!isConnected) {
      console.log('   ❌ Critical: Firestore is required but not available\n');
      return false;
    }

    const shouldClear = process.env.CLEAR_FIREBASE === 'true' || 
                       process.argv.includes('--clear-firebase');
    
    if (shouldClear) {
      await clearFirebaseData();
    } else {
      console.log('   ℹ️  Data clearing disabled');
      console.log('      Use --clear-firebase flag to enable\n');
    }
    
    console.log('   ✅ Firebase initialized successfully\n');
    return true;
    
  } catch (error) {
    console.error('   ❌ Firebase initialization failed:', error.message);
    return false;
  }
}

/**
 * Send FCM notification
 */
async function sendFCM(token, title, body, data = {}) {
  if (!firebaseServices.messaging) {
    console.log("⚠️  FCM not available - notification not sent");
    return null;
  }

  if (!token) {
    console.log("No token provided");
    return null;
  }

  const payload = {
    notification: { title, body },
    data,
  };

  try {
    const response = await admin.messaging().sendToDevice(token, payload);
    console.log("✅ FCM sent successfully");
    return response;
  } catch (error) {
    console.error("❌ Error sending FCM:", error.message);
    return null;
  }
}

/**
 * Send call notification
 */
async function sendCallNotification(calleeId, callerName, roomId) {
  if (!firebaseServices.firestore) {
    console.log("⚠️  Firestore not available - cannot send notification");
    return;
  }

  try {
    const userDoc = await admin.firestore().collection("users").doc(calleeId).get();
    
    if (!userDoc.exists) {
      console.log("❌ User not found:", calleeId);
      return;
    }

    const token = userDoc.data().deviceToken;
    
    if (!token) {
      console.log("⚠️  No device token for user:", calleeId);
      return;
    }

    await sendFCM(token, "Incoming Call 📞", `${callerName} is calling you`, {
      type: "CALL",
      callerName,
      roomId,
    });

  } catch (err) {
    console.error("❌ Error sending call notification:", err.message);
  }
}

/**
 * Get Firebase services status
 */
function getServicesStatus() {
  return firebaseServices;
}

module.exports = { 
  admin,
  sendFCM, 
  sendCallNotification, 
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection,
  getServicesStatus
};