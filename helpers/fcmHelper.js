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

module.exports = { 
  sendFCM, 
  sendCallNotification, 
  initializeFirebase,
  testFirebaseConnection,
  clearFirebaseData,
  clearCollection
};