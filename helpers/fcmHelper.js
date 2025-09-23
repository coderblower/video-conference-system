const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://video-calling-57c68.firebaseio.com"
  });
}

async function sendFCM(token, title, body, data = {}) {
  if (!token) {
    console.log("No token provided");
    return;
  }

  // 🔑 Make sure all data values are strings
  const stringifiedData = {};
  Object.keys(data).forEach(key => {
    stringifiedData[key] = String(data[key]);
  });

  const message = {
    token,
    android: {
      priority: "high",
      // 🔥 CRITICAL: This ensures the message wakes up terminated apps
      data: {
        title,
        body,
        ...stringifiedData,
      }
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
          sound: 'default',
          badge: 1,
        },
      },
      headers: {
        "apns-priority": "10", // high priority for iOS
        "apns-push-type": "background",
      },
    },
    // 🔥 IMPORTANT: Always include data payload for background handling
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
 */
async function sendCallNotification(calleeId, roomId, callerName = "Unknown Caller") {
  try {
    const userDocRef = admin.firestore().collection("users").doc(calleeId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      console.log("⚠️ No devices found for user:", calleeId);
      return { success: false, message: "No devices found" };
    }

    console.log(`📞 Sending call notification to ${devicesSnapshot.docs.length} devices`);

    // Loop through all device docs
    const sendPromises = devicesSnapshot.docs.map(async (deviceDoc) => {
      const token = deviceDoc.data().fcmToken;
      if (!token) {
        console.log("⚠️ No FCM token found for device:", deviceDoc.id);
        return null;
      }

      console.log("📞 Sending call to room:", roomId);

      return await sendFCM(
        token, 
        "Incoming Call 📞", 
        `${callerName} is calling you`, 
        {
          type: "CALL",
          callerName,
          roomId,
          // 🔥 Add unique call ID for tracking
          callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          // Add timestamp
          timestamp: Date.now().toString(),
        }
      );
    });

    const results = await Promise.allSettled(sendPromises.filter(Boolean));
    
    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`📡 Call notification results: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.log("❌ Failed sends:", 
        results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason)
      );
    }

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

// 🔥 NEW: Function to send high-priority data-only message for better terminated app handling
async function sendDataOnlyCallNotification(calleeId, roomId, callerName = "Unknown Caller", callerId) {
  try {
    const userDocRef = admin.firestore().collection("users").doc(calleeId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      console.log("⚠️ No devices found for user:", calleeId);
      return { success: false, message: "No devices found" };
    }

    const sendPromises = devicesSnapshot.docs.map(async (deviceDoc) => {
      const token = deviceDoc.data().fcmToken;
      if (!token) return null;

      // 🔥 Data-only message - no notification payload
      const message = {
        token,
        android: {
          priority: "high",
          data: {
            type: "CALL",
            callerName,
            roomId,
            callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now().toString(),
            title: "Incoming Call",
            body: `${callerName} is calling you`,
            calleeId,
            callerId: callerId.toString(),
          }
        },
        data: {
          type: "CALL", 
          callerName,
          roomId,
          callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now().toString(),
          title: "Incoming Call",
          body: `${callerName} is calling you`,
          calleeId,
          callerId: callerId.toString(),
        },
      };

      try {
        const response = await admin.messaging().send(message);
        console.log("✅ Data-only FCM sent successfully:", response);
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