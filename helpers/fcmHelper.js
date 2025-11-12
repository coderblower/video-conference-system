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
 * Send FCM notification optimized for iOS
 * @param {string} token - FCM device token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Data payload
 */
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

/**
 * Send a call notification by callee userId
 * @param {string} calleeId - Firestore user ID
 * @param {string} roomId - Call room ID
 * @param {string} callerName - Name of caller
 * @param {string} callerId - Caller ID
 * @param {string} callType - Call type (video/audio)
 */
async function sendCallNotification(calleeId, roomId, callerName = "Unknown Caller", callerId, callType = "video") {
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
};