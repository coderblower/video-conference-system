const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json");
const callingRepository = require("../services/callingRepository");

// Initialize Firebase Admin SDK only once
try {
  if (!admin.apps?.length && admin.initializeApp) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }
} catch (error) {
  if (error.code !== 'app/duplicate-app') {
    console.error('Firebase initialization error:', error);
  }
}

// Track available services
const firebaseServices = {
  auth: false,
  messaging: false
};

function ensureMessagingAvailable() {
  if (firebaseServices.messaging) {
    return true;
  }

  try {
    admin.messaging();
    firebaseServices.messaging = true;
    return true;
  } catch (error) {
    console.log("⚠️  Cloud Messaging unavailable:", error.message);
    return false;
  }
}

/**
 * Test Firebase connection
 */
async function testFirebaseConnection() {
  console.log('   🔍 Testing Firebase services...\n');
  console.log(`   📋 Project: ${serviceAccount.project_id}`);
  console.log(`   📧 Service Account: ${serviceAccount.client_email}\n`);

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
  return firebaseServices.messaging;
}

/**
 * Delete all documents in a collection
 */
async function clearCollection(collectionPath) {
  console.log(`   ℹ️  Firestore clearing disabled. '${collectionPath}' is managed outside Firebase.`);
  return 0;
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
    console.log('   ❌ Cloud Messaging connection required but failed\n');
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
  if (!ensureMessagingAvailable()) {
    console.log("⚠️  FCM unavailable - notification not sent");
    return null;
  }

  const tokens = Array.isArray(token) ? token.filter(Boolean) : [token].filter(Boolean);

  if (tokens.length === 0) {
    console.log("⚠️  No FCM token provided");
    return null;
  }

  const payload = {
    tokens,
    notification: { title, body },
    data: normalizeDataPayload(data),
    android: {
      priority: "high",
      notification: {
        channelId: "incoming_call",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          contentAvailable: true,
        },
      },
      headers: {
        "apns-priority": "10",
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(payload);
    console.log(`✅ FCM sent successfully to ${response.successCount}/${tokens.length} device(s)`);
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
  return callingRepository.getActiveTokensForUser(userId);
}

async function sendDataOnlyMessage(tokens, data = {}) {
  if (!ensureMessagingAvailable()) {
    console.log("⚠️  FCM unavailable - data message not sent");
    return null;
  }

  if (!tokens || tokens.length === 0) {
    console.log("⚠️  No FCM tokens provided");
    return null;
  }

  const payload = {
    tokens,
    data: normalizeDataPayload(data),
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
      headers: {
        "apns-priority": "5",
        "apns-push-type": "background",
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(payload);
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

  try {
    const tokens = await getUserTokens(calleeId);
    if (tokens.length === 0) {
      console.log("❌ No registered call device for user:", calleeId);
      return { success: false, error: "user_not_found_or_no_token" };
    }

    const response = await sendDataOnlyMessage(tokens, {
        type: "CALL",
        callerName,
        roomId,
        callerId,
        callType,
        avatar,
      });

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

async function sendCallLifecycleNotification(
  userId,
  type,
  roomId,
  payload = {}
) {
  try {
    const tokens = await getUserTokens(userId);
    if (tokens.length === 0) {
      return { success: false, error: "no_token" };
    }

    const response = await sendDataOnlyMessage(tokens, {
      type,
      roomId,
      ...payload,
    });

    return {
      success: Boolean(response),
      response,
    };
  } catch (error) {
    console.error(`❌ Error sending ${type} lifecycle notification:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { 
  admin,
  sendFCM, 
  sendCallNotification, 
  sendDataOnlyCallNotification,
  sendCallLifecycleNotification,
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
};
