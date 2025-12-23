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
    console.log("\n🔍 Testing Firebase connection...");
    
    // Test Firestore connection
    await admin.firestore().collection("_test").doc("connection").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "connected"
    });
    console.log("✅ Firestore connected successfully");

    // Test Authentication connection
    await admin.auth().listUsers(1);
    console.log("✅ Firebase Auth connected successfully");

    // Test FCM
    if (admin.messaging()) {
      console.log("✅ Firebase Messaging (FCM) initialized successfully");
    }

    // Clean up test document
    await admin.firestore().collection("_test").doc("connection").delete();
    
    return true;
  } catch (error) {
    console.error("❌ Firebase connection failed:", error.message);
    return false;
  }
}

/**
 * Delete all documents in a collection
 * @param {string} collectionPath - Collection to clear
 */
async function clearCollection(collectionPath) {
  try {
    const collectionRef = admin.firestore().collection(collectionPath);
    const snapshot = await collectionRef.get();
    
    if (snapshot.empty) {
      console.log(`   Collection '${collectionPath}' is already empty`);
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

    console.log(`   ✅ Cleared ${totalDeleted} documents from '${collectionPath}'`);
    return totalDeleted;
  } catch (error) {
    console.error(`   ❌ Error clearing collection '${collectionPath}':`, error.message);
    return 0;
  }
}

/**
 * Clear specific collections on startup
 */
async function clearFirebaseData() {
  console.log("\n🧹 Clearing Firebase data...");
  
  // List collections you want to clear
  const collectionsTosClear = [
    "calls",           // Clear call history
    "notifications",   // Clear old notifications
    // "users",        // ⚠️ Uncomment to clear users (be careful!)
  ];

  let totalCleared = 0;
  for (const collection of collectionsTosClear) {
    const cleared = await clearCollection(collection);
    totalCleared += cleared;
  }

  console.log(`\n✨ Total documents cleared: ${totalCleared}\n`);
}

/**
 * Initialize Firebase on server start
 */
async function initializeFirebase() {
  console.log("\n🚀 Initializing Firebase...");
  
  const isConnected = await testFirebaseConnection();
  
  if (!isConnected) {
    console.error("\n❌ Failed to connect to Firebase. Server may not work properly.\n");
    return false;
  }

  // Clear data on startup (optional - comment out if you don't want this)
  await clearFirebaseData();
  
  console.log("✅ Firebase initialized successfully\n");
  return true;
}

async function sendFCM(token, title, body, data = {}) {
  if (!token) {
    console.log("❌ No token provided");
    return;
  }

  // Stringify all data values
  const stringifiedData = {};
  Object.keys(data).forEach(key => {
    stringifiedData[key] = String(data[key]);
  });

  const message = {
    token,
    // Android configuration
    android: {
      priority: "high",
      data: {
        title,
        body,
        ...stringifiedData,
      }
    },
    // iOS configuration - CRITICAL for iOS
    apns: {
      payload: {
        aps: {
          alert: {
            title,
            body
          },
          sound: 'default',
          badge: 1,
          // CRITICAL: This makes the notification visible and actionable
          'content-available': 1,
          'mutable-content': 1,
        },
      },
      headers: {
        "apns-priority": "10", // High priority
        "apns-push-type": "alert", // Alert type for iOS (not background)
      },
    },
    // Data payload - available in both foreground and background
    data: {
      title,
      body,
      ...stringifiedData,
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("✅ FCM sent successfully:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending FCM:", error);
    throw error;
  }
}

<<<<<<< HEAD
async function sendCallNotification(calleeId, callerName, roomId) {
=======
/**
 * Send a call notification by callee userId
 * @param {string} calleeId - Firestore user ID
 * @param {string} roomId - Call room ID
 * @param {string} callerName - Name of caller
 * @param {string} callerId - Caller ID
 * @param {string} callType - Call type (video/audio)
 */
async function sendCallNotification(calleeId, roomId, callerName = "Unknown Caller", callerId, callType = "video") {
>>>>>>> 7f4981cced43b6261490cccf94e9df4b9063deb4
  try {
    console.log(`📞 ========== SENDING CALL NOTIFICATION ==========`);
    console.log(`📞 Callee ID: ${calleeId}`);
    console.log(`📞 Room ID: ${roomId}`);
    console.log(`📞 Caller: ${callerName}`);
    console.log(`📞 Call Type: ${callType}`);

    const userDocRef = admin.firestore().collection("users").doc(calleeId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      console.log("⚠️ No devices found for user:", calleeId);
      return { success: false, message: "No devices found" };
    }

    console.log(`📱 Found ${devicesSnapshot.docs.length} devices for user`);

    const sendPromises = devicesSnapshot.docs.map(async (deviceDoc) => {
      const deviceData = deviceDoc.data();
      const token = deviceData.fcmToken;
      const platform = deviceData.devicePlatform;
      
      if (!token) {
        console.log("⚠️ No FCM token found for device:", deviceDoc.id);
        return null;
      }

      console.log(`📤 Sending to device: ${deviceDoc.id} (${platform})`);
      console.log(`📤 Token: ${token.substring(0, 20)}...`);

      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return await sendFCM(
        token, 
        "Incoming Call 📞", 
        `${callerName} is calling you`, 
        {
          type: "CALL",
          callerName,
          roomId,
          callId,
          callerId: callerId.toString(),
          callType: callType,
          timestamp: Date.now().toString(),
        }
      );
    });

    const results = await Promise.allSettled(sendPromises.filter(Boolean));
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Call notification results: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.log("❌ Failed sends:", 
        results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason)
      );
    }

    console.log(`📞 ========== CALL NOTIFICATION COMPLETED ==========`);

    return { 
      success: successful > 0, 
      successful, 
      failed,
      message: `Sent to ${successful} devices` 
    };

  } catch (err) {
    console.error("❌ Error sending call notification:", err);
    throw err;
  }
}

<<<<<<< HEAD
module.exports = { 
  sendFCM, 
  sendCallNotification, 
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
=======
/**
 * Send data-only notification for silent/background processing
 * @param {string} calleeId - Firestore user ID
 * @param {string} roomId - Call room ID
 * @param {string} callerName - Name of caller
 * @param {string} callerId - Caller ID
 * @param {string} callType - Call type (video/audio)
 */
async function sendDataOnlyCallNotification(calleeId, roomId, callerName = "Unknown Caller", callerId, callType = "video") {
  try {
    console.log(`📞 Sending DATA-ONLY call notification`);
    
    const userDocRef = admin.firestore().collection("users").doc(calleeId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      console.log("⚠️ No devices found for user:", calleeId);
      return { success: false, message: "No devices found" };
    }

    const sendPromises = devicesSnapshot.docs.map(async (deviceDoc) => {
      const token = deviceDoc.data().fcmToken;
      if (!token) return null;

      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Data-only message - works better for terminated apps
      const message = {
        token,
        android: {
          priority: "high",
          data: {
            type: "CALL",
            callerName,
            roomId,
            callId,
            callerId: callerId.toString(),
            callType,
            timestamp: Date.now().toString(),
            title: "Incoming Call",
            body: `${callerName} is calling you`,
          }
        },
        data: {
          type: "CALL", 
          callerName,
          roomId,
          callId,
          callerId: callerId.toString(),
          callType,
          timestamp: Date.now().toString(),
        },
      };

      try {
        const response = await admin.messaging().send(message);
        console.log("✅ Data-only FCM sent:", response);
        return response;
      } catch (error) {
        console.error("❌ Error sending data-only FCM:", error);
        throw error;
      }
    });

    const results = await Promise.allSettled(sendPromises.filter(Boolean));
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    return { 
      success: successful > 0, 
      successful,
      message: `Data-only notification sent to ${successful} devices` 
    };

  } catch (err) {
    console.error("❌ Error sending data-only call notification:", err);
    throw err;
  }
}

module.exports = { 
  sendFCM, 
  sendCallNotification, 
  sendDataOnlyCallNotification 
>>>>>>> 7f4981cced43b6261490cccf94e9df4b9063deb4
};