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

function normalizeDataPayload(data = {}) {
  return Object.entries(data).reduce((payload, [key, value]) => {
    if (value === undefined || value === null) {
      return payload;
    }

    payload[key] = String(value);
    return payload;
  }, {});
}

async function getUserTokens(userId) {
  if (!firebaseServices.firestore) {
    return [];
  }

  const userDoc = await admin.firestore().collection("users").doc(String(userId)).get();
  if (!userDoc.exists) {
    return [];
  }

  const tokens = new Set();
  const primaryToken = userDoc.data()?.deviceToken;
  if (primaryToken) {
    tokens.add(primaryToken);
  }

  try {
    const devicesSnapshot = await userDoc.ref.collection("devices").get();
    devicesSnapshot.docs.forEach((doc) => {
      const token = doc.data()?.fcmToken;
      if (token) {
        tokens.add(token);
      }
    });
  } catch (error) {
    console.log("⚠️  Failed to inspect device tokens:", error.message);
  }

  return Array.from(tokens);
}

async function sendDataOnlyMessage(tokens, data = {}) {
  if (!firebaseServices.messaging) {
    console.log("⚠️  FCM unavailable - data message not sent");
    return null;
  }

  if (!tokens || tokens.length === 0) {
    console.log("⚠️  No FCM tokens provided");
    return null;
  }

  const payload = {
    data: normalizeDataPayload(data),
  };

  const options = {
    priority: "high",
    contentAvailable: true,
  };

  try {
    const response = await admin.messaging().sendToDevice(tokens, payload, options);
    console.log(`✅ Data-only FCM sent to ${tokens.length} device(s)`);
    return response;
  } catch (error) {
    console.error("❌ Data-only FCM error:", error.message);
    return null;
  }
}

/**
 * Send call notification
 */
async function sendCallNotification(
  calleeId,
  roomId,
  callerName,
  callerId = null,
  callType = "video",
  avatar = null
) {

  console.log(`📲 Sending call notification to user: ${calleeId}`);

  
  if (!firebaseServices.firestore) {
    console.log("⚠️  Cannot send notification - Firestore unavailable");
    return { success: false, error: "firestore_unavailable" };
  }

  try {
    const tokens = await getUserTokens(calleeId);
    if (tokens.length === 0) {
      console.log("❌ User not found:", calleeId);
      return { success: false, error: "user_not_found_or_no_token" };
    }

    const response = await sendFCM(
      tokens, 
      "Incoming Call 📞", 
      `${callerName} is calling you`, 
      normalizeDataPayload({
        type: "CALL",
        callerName,
        roomId,
        callerId,
        callType,
        avatar,
      })
    );

    return {
      success: Boolean(response),
      response,
    };

  } catch (error) {
    console.error("❌ Error sending call notification:", error.message);
    return { success: false, error: error.message };
  }
}

async function sendDataOnlyCallNotification(
  calleeId,
  roomId,
  callerName,
  callerId = null,
  callType = "video",
  avatar = null
) {
  console.log(`📲 Sending data-only call notification to user: ${calleeId}`);

  if (!firebaseServices.firestore) {
    console.log("⚠️  Cannot send notification - Firestore unavailable");
    return { success: false, error: "firestore_unavailable" };
  }

  try {
    const tokens = await getUserTokens(calleeId);
    if (tokens.length === 0) {
      console.log("⚠️  No FCM token for user:", calleeId);
      return { success: false, error: "no_token" };
    }

    const response = await sendDataOnlyMessage(tokens, {
      type: "CALL",
      roomId,
      callerName,
      callerId,
      callType,
      avatar,
    });

    return {
      success: Boolean(response),
      response,
    };
  } catch (error) {
    console.error("❌ Error sending data-only call notification:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { 
  admin,
  sendFCM, 
  sendCallNotification, 
  sendDataOnlyCallNotification,
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
};
