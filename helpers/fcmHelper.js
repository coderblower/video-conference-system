


const admin = require("firebase-admin");
const serviceAccount = require("../secrets/auth.json"); // path to the downloaded JSON


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

  const message = {
    token, // 👈 instead of sendToDevice
    notification: { title, body },
    data,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("FCM sent successfully:", response);
  } catch (error) {
    console.error("Error sending FCM:", error);
  }
}


/**
 * Send a call notification by callee userId
 * @param {string} calleeId - Firestore user ID
 * @param {string} callerName - Name of caller
 * @param {string} roomId - Call room ID
 */
async function sendCallNotification(calleeId, roomId, callerName) {
  try {
    const userDocRef = admin.firestore().collection("users").doc(calleeId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      return console.log("No devices found for user:", calleeId);
    }

    // Loop through all device docs
    const sendPromises = devicesSnapshot.docs.map((deviceDoc) => {
      const token = deviceDoc.data().fcmToken;
      if (!token) return null;

      console.log(roomId)

      return sendFCM(token, "Incoming Call 📞", `${callerName} is calling you`, {
        type: "CALL",
        callerName,
        roomId,
      });
    });

    
    await Promise.all(sendPromises.filter(Boolean));
    console.log("Call notification sent to all devices of:", calleeId);

  } catch (err) {
    console.error("Error sending call notification:", err);
  }
}

module.exports = { sendFCM, sendCallNotification };
