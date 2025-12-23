const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://video-calling-57c68.firebaseio.com"
  });
}

/**
 * Test Firebase connection
 */
async function testFirebaseConnection() {
  try {
    // Test Firestore connection
    await admin.firestore().collection("_test").doc("connection").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "connected"
    });
    console.log("   ✅ Firestore connected");

    // Test Authentication connection
    await admin.auth().listUsers(1);
    console.log("   ✅ Firebase Auth connected");

    // Test FCM
    if (admin.messaging()) {
      console.log("   ✅ Firebase Messaging (FCM) ready");
    }

    // Clean up test document
    await admin.firestore().collection("_test").doc("connection").delete();
    
    return true;
  } catch (error) {
    console.error("   ❌ Connection failed:", error.message);
    return false;
  }
}

/**
 * Delete all documents in a collection
 */
async function clearCollection(collectionPath) {
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
  console.log('\n   🧹 Clearing Firebase data...');
  
  // Configure which collections to clear
  const collectionsTosClear = [
    "calls",           // Clear call history
    "notifications",   // Clear old notifications
    "rooms",          // Clear room data
    // "users",        // ⚠️ DANGEROUS - Uncomment only if you want to delete all users
  ];

  let totalCleared = 0;
  for (const collection of collectionsTosClear) {
    const cleared = await clearCollection(collection);
    totalCleared += cleared;
  }

  console.log(`   ✨ Total cleared: ${totalCleared} documents\n`);
}

/**
 * Initialize Firebase on server start
 */
async function initializeFirebase() {
  try {
    const isConnected = await testFirebaseConnection();
    
    if (!isConnected) {
      return false;
    }

    // Clear data based on environment or command line flag
    const shouldClear = process.env.CLEAR_FIREBASE === 'true' || 
                       process.argv.includes('--clear-firebase');
    
    if (shouldClear) {
      await clearFirebaseData();
    } else {
      console.log('   ℹ️  Skipping data clear (use --clear-firebase flag or CLEAR_FIREBASE=true)\n');
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Firebase initialization failed:', error.message);
    return false;
  }
}

async function sendFCM(token, title, body, data = {}) {
  if (!token) {
    console.log("No token provided");
    return;
  }

  const payload = {
    notification: { title, body },
    data,
  };

  try {
    const response = await admin.messaging().sendToDevice(token, payload);
    console.log("FCM sent successfully:", response);
    return response;
  } catch (error) {
    console.error("Error sending FCM:", error);
    throw error;
  }
}

async function sendCallNotification(calleeId, callerName, roomId) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(calleeId).get();
    if (!userDoc.exists) {
      console.log("User not found:", calleeId);
      return;
    }

    const token = userDoc.data().deviceToken;
    if (!token) {
      console.log("No device token for user:", calleeId);
      return;
    }

    await sendFCM(token, "Incoming Call 📞", `${callerName} is calling you`, {
      type: "CALL",
      callerName,
      roomId,
    });

  } catch (err) {
    console.error("Error sending call notification:", err);
  }
}

// Export admin for use in other files
module.exports = { 
  admin,
  sendFCM, 
  sendCallNotification, 
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
};