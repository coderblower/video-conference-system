const admin = require("firebase-admin");
const apn = require('apn');
const path = require('path');

// Initialize APN Provider for VoIP
let apnProvider = null;

/**
 * Initialize APN Provider for VoIP Push using .p12 certificate
 * Call this once when your server starts
 */
function initializeVoIPProvider() {
  try {
    const options = {
      pfx: path.join(__dirname, '../secrets/voip_certificate.p12'), // Your .p12 file
      passphrase: 'mGES@vg123', // Password you set when exporting
      production: false // Set to true for production
    };

    apnProvider = new apn.Provider(options);
    console.log('✅ VoIP APN Provider initialized with .p12 certificate');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize VoIP provider:', error);
    return false;
  }
}

/**
 * Send VoIP Push Notification (for iOS)
 * @param {string} voipToken - Device VoIP token
 * @param {object} callData - Call information
 */
async function sendVoIPPush(voipToken, callData) {
  if (!apnProvider) {
    console.error('❌ VoIP provider not initialized');
    return { success: false, error: 'Provider not initialized' };
  }

  try {
    console.log('📞 Sending VoIP push to token:', voipToken.substring(0, 20) + '...');

    const notification = new apn.Notification({
      alert: undefined, // VoIP pushes don't show alerts
      payload: {
        type: 'CALL',
        callerName: callData.callerName,
        roomId: callData.roomId,
        callerId: callData.callerId,
        callType: callData.callType || 'video',
        timestamp: Date.now()
      },
      topic: 'com.versatilogroup.my_mges.voip', // MUST be your bundle ID + '.voip'
      pushType: 'voip',
      priority: 10,
      expiry: Math.floor(Date.now() / 1000) + 30
    });

    const result = await apnProvider.send(notification, voipToken);
    
    if (result.failed && result.failed.length > 0) {
      console.error('❌ VoIP push failed:', result.failed[0].response);
      return { success: false, error: result.failed[0].response };
    }

    console.log('✅ VoIP push sent successfully');
    return { success: true, result };

  } catch (error) {
    console.error('❌ Error sending VoIP push:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send call notification - handles both iOS (VoIP) and Android (FCM)
 */
async function sendUnifiedCallNotification(userId, roomId, callerName, callerId, callType = 'video') {
  try {
    console.log(`📞 ========== SENDING UNIFIED CALL NOTIFICATION ==========`);
    console.log(`📞 User: ${userId}`);
    console.log(`📞 Room: ${roomId}`);
    console.log(`📞 Caller: ${callerName}`);
    console.log(`📞 Type: ${callType}`);

    const userDocRef = admin.firestore().collection("users").doc(userId);
    const devicesSnapshot = await userDocRef.collection("devices").get();

    if (devicesSnapshot.empty) {
      console.log("⚠️ No devices found");
      return { success: false, message: "No devices found" };
    }

    const results = {
      ios: { success: 0, failed: 0 },
      android: { success: 0, failed: 0 }
    };

    const sendPromises = devicesSnapshot.docs.map(async (deviceDoc) => {
      const deviceData = deviceDoc.data();
      const platform = deviceData.devicePlatform;
      const fcmToken = deviceData.fcmToken;
      const voipToken = deviceData.voipToken;

      console.log(`📱 Device: ${deviceDoc.id} (${platform})`);

      if (platform === 'iOS' || platform === 'ios') {
        if (voipToken) {
          const voipResult = await sendVoIPPush(voipToken, {
            callerName,
            roomId,
            callerId,
            callType
          });

          if (voipResult.success) {
            results.ios.success++;
          } else {
            results.ios.failed++;
            
            if (fcmToken) {
              const fcmResult = await sendIOSFCMCallNotification(fcmToken, {
                callerName,
                roomId,
                callerId,
                callType
              });
              
              if (fcmResult.success) {
                results.ios.success++;
              }
            }
          }
        } else if (fcmToken) {
          const fcmResult = await sendIOSFCMCallNotification(fcmToken, {
            callerName,
            roomId,
            callerId,
            callType
          });
          
          if (fcmResult.success) {
            results.ios.success++;
          } else {
            results.ios.failed++;
          }
        }
      } else if (platform === 'Android' || platform === 'android') {
        if (fcmToken) {
          const fcmResult = await sendAndroidFCMCallNotification(fcmToken, {
            callerName,
            roomId,
            callerId,
            callType
          });
          
          if (fcmResult.success) {
            results.android.success++;
          } else {
            results.android.failed++;
          }
        }
      }
    });

    await Promise.allSettled(sendPromises);

    console.log(`✅ Notification Results:`);
    console.log(`   iOS: ${results.ios.success} success, ${results.ios.failed} failed`);
    console.log(`   Android: ${results.android.success} success, ${results.android.failed} failed`);
    console.log(`📞 ========== NOTIFICATION COMPLETED ==========`);

    return {
      success: (results.ios.success + results.android.success) > 0,
      results
    };

  } catch (error) {
    console.error('❌ Error in sendUnifiedCallNotification:', error);
    throw error;
  }
}

async function sendIOSFCMCallNotification(token, callData) {
  try {
    const message = {
      token,
      data: {
        type: "CALL",
        callerName: callData.callerName,
        roomId: callData.roomId,
        callerId: String(callData.callerId),
        callType: callData.callType,
        timestamp: String(Date.now())
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: "Incoming Call 📞",
              body: `${callData.callerName} is calling you`
            },
            sound: 'default',
            badge: 1,
            'content-available': 1,
            'mutable-content': 1
          }
        },
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert"
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("✅ iOS FCM sent:", response);
    return { success: true, response };
  } catch (error) {
    console.error("❌ iOS FCM error:", error);
    return { success: false, error: error.message };
  }
}

async function sendAndroidFCMCallNotification(token, callData) {
  try {
    const message = {
      token,
      data: {
        type: "CALL",
        callerName: callData.callerName,
        roomId: callData.roomId,
        callerId: String(callData.callerId),
        callType: callData.callType,
        timestamp: String(Date.now())
      },
      android: {
        priority: "high",
        notification: {
          title: "Incoming Call 📞",
          body: `${callData.callerName} is calling you`,
          sound: 'ringtone',
          channelId: 'call_channel'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Android FCM sent:", response);
    return { success: true, response };
  } catch (error) {
    console.error("❌ Android FCM error:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initializeVoIPProvider,
  sendVoIPPush,
  sendUnifiedCallNotification,
  sendIOSFCMCallNotification,
  sendAndroidFCMCallNotification
};