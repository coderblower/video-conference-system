


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

  const payload = {
    notification: { title, body },
    data,
  };

  try {
    const response = await admin.messaging().sendToDevice(token, payload);
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
async function sendCallNotification(calleeId, callerName, roomId) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(calleeId).get();
    if (!userDoc.exists) return console.log("User not found:", calleeId);

    const token = userDoc.data().deviceToken;
    if (!token) return console.log("No device token for user:", calleeId);

    await sendFCM(token, "Incoming Call 📞", `${callerName} is calling you`, {
      type: "CALL",
      callerName,
      roomId,
    });

  } catch (err) {
    console.error("Error sending call notification:", err);
  }
}

module.exports = { sendFCM, sendCallNotification };
