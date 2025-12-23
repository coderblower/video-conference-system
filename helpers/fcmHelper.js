const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

// Track available services
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
  console.log(`   📋 Project: ${serviceAccount.project_id}`);
  console.log(`   📧 Service Account: ${serviceAccount.client_email}\n`);

  // Test Firestore
  try {
    const testRef = admin.firestore().collection("_test").doc("connection_test");
    await testRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "connected"
    });
    await testRef.delete();
    firebaseServices.firestore = true;
    console.log("   ✅ Firestore: Connected");
  } catch (error) {
    console.log("   ❌ Firestore:", error.message);
    console.log("      → Enable Firestore in Firebase Console");
    return false;
  }

  // Test Authentication (optional)
  try {
    await admin.auth().listUsers(1);
    firebaseServices.auth = true;
    console.log("   ✅ Authentication: Enabled");
  } catch (error) {
    if (error.code === 'auth/configuration-not-found') {
      console.log("   ⚠️  Authentication: Not enabled (optional)");
      console.log("      → Enable in: Firebase Console > Authentication > Get Started");
    } else {
      console.log("   ⚠️  Authentication:", error.message);
    }
  }

  // Test Cloud Messaging
  try {
    const messaging = admin.messaging();
    firebaseServices.messaging = true;
    console.log("   ✅ Cloud Messaging: Ready");
  } catch (error) {
    console.log("   ⚠️  Cloud Messaging:", error.message);
  }

  console.log();
  return firebaseServices.firestore;
}

/**
 * Delete all documents in a collection
 */
async function clearCollection(collectionPath) {
  if (!firebaseServices.firestore) {
    console.log(`   ⚠️  Firestore unavailable - cannot clear '${collectionPath}'`);
    return 0;
  }

  try {
    const collectionRef = admin.firestore().collection(collectionPath);
    const snapshot = await collectionRef.get();
    
    if (snapshot.empty) {
      console.log(`   📭 '${collectionPath}' is empty`);
      return 0;
    }

    const batch = admin.firestore().batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`   🗑️  Cleared ${snapshot.size} documents from '${collectionPath}'`);
    return snapshot.size;
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
  
  const collections = ["calls", "notifications", "rooms"];
  let totalCleared = 0;

  for (const collection of collections) {
    totalCleared += await clearCollection(collection);
  }

  console.log(`\n   ✨ Total cleared: ${totalCleared} documents\n`);
}

/**
 * Initialize Firebase on server start
 */
async function initializeFirebase() {
  const isConnected = await testFirebaseConnection();
  
  if (!isConnected) {
    console.log('   ❌ Firestore connection required but failed\n');
    return false;
  }

  const shouldClear = process.env.CLEAR_FIREBASE === 'true' || 
                     process.argv.includes('--clear-firebase');
  
  if (shouldClear) {
    await clearFirebaseData();
  } else {
    console.log('   ℹ️  Data clearing disabled');
    console.log('      Use: node server.js --clear-firebase\n');
  }
  
  return true;
}

/**
 * Send FCM notification
 */
async function sendFCM(token, title, body, data = {}) {
  if (!firebaseServices.messaging) {
    console.log("⚠️  FCM unavailable - notification not sent");
    return null;
  }

  if (!token) {
    console.log("⚠️  No FCM token provided");
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
    console.error("❌ FCM error:", error.message);
    return null;
  }
}

/**
 * Send call notification
 */
async function sendCallNotification(calleeId, callerName, roomId) {
  if (!firebaseServices.firestore) {
    console.log("⚠️  Cannot send notification - Firestore unavailable");
    return;
  }

  try {
    const userDoc = await admin.firestore()
      .collection("users")
      .doc(calleeId)
      .get();
    
    if (!userDoc.exists) {
      console.log("❌ User not found:", calleeId);
      return;
    }

    const token = userDoc.data()?.deviceToken;
    if (!token) {
      console.log("⚠️  No FCM token for user:", calleeId);
      return;
    }

    await sendFCM(
      token, 
      "Incoming Call 📞", 
      `${callerName} is calling you`, 
      { type: "CALL", callerName, roomId }
    );

  } catch (error) {
    console.error("❌ Error sending call notification:", error.message);
  }
}

module.exports = { 
  admin,
  sendFCM, 
  sendCallNotification, 
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
};