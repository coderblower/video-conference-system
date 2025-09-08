const {Server} = require('socket.io');
const { sendCallNotification, sendDataOnlyCallNotification } = require('../helpers/fcmHelper');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
          origin: "*", // Adjust to allow specific origins for security
          methods: ["GET", "POST"]
        }
      });

    // Store users in rooms
    const rooms = {};
    const messages={};
    let users = {};


    
    setInterval(() => {
        // Emit online users every 10 seconds
        console.log('Online users:', users);
    }, 5000);
    

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.emit('connected', socket.id);


        socket.on('join_online', (userInfo) => {


            if (userInfo && userInfo.id) {
                users[userInfo.id] = [...users[userInfo.id] || [], {
                    name: userInfo.firstName + ' ' + userInfo.lastName,
                    socket_id: socket.id
                }];
            
            }

          

            console.log( 'new User connected :', users);

            socket.emit('new-users', users);

            io.emit('online_user', users);
            
        });
        
        
        
        // Join a room
        socket.on('join-room', (roomId) => {
            
            
            socket.join(roomId);
            
            socket.emit('load-old_mesage', messages[roomId]);

            // Add user to room
            if (!rooms[roomId]) {
                rooms[roomId] = [];
                socket.emit('first_in_room');
            }
            rooms[roomId].push(socket.id);

            console.log(`User ${socket.id} joined room ${roomId}`);

            // Notify other users in the room
            socket.to(roomId).emit('new-user', socket.id);

            
        });


        socket.on('check_room_id', (data)=>{
            console.log(data);
        })


        socket.on('make_call', (data) => {

            
            const { room, to, id  } = data; 

            console.log('Making call to:', to, 'in room:', room, 'id :', id);
            // call to all users[id] array
            const userSockets = users[id]?.map(user => user.socket_id) || [];
            userSockets.forEach(socketId => {
                io.to(socketId).emit('incoming_call', { from: socket.id, room });
            });


        });

socket.on('send_fcm_message', async (data) => {
    try {
        const { userId, roomId, callerName, callerId } = data;
        
        console.log('📞 Incoming FCM call request:', {
            userId,
            roomId,
            callerName,
            callerId,
            timestamp: new Date().toISOString()
        });

        // Validate required data
        if (!userId) {
            console.error('❌ Error: userId is required');
            socket.emit('fcm_error', { error: 'userId is required' });
            return;
        }

        if (!roomId) {
            console.error('❌ Error: roomId is required');
            socket.emit('fcm_error', { error: 'roomId is required' });
            return;
        }

        const finalCallerName = callerName || 'Unknown Caller';
        
        console.log(`📡 Sending call notification to user: ${userId}, room: ${roomId}`);

        // Send both regular and data-only notifications for maximum compatibility
        const [regularResult, dataOnlyResult] = await Promise.allSettled([
            sendDataOnlyCallNotification(userId, roomId, finalCallerName)
        ]);

        // Log results
        if (regularResult.status === 'fulfilled') {
            console.log('✅ Regular FCM notification result:', regularResult.value);
        } else {
            console.error('❌ Regular FCM notification failed:', regularResult.reason);
        }

        if (dataOnlyResult.status === 'fulfilled') {
            console.log('✅ Data-only FCM notification result:', dataOnlyResult.value);
        } else {
            console.error('❌ Data-only FCM notification failed:', dataOnlyResult.reason);
        }

        // Emit success response back to caller
        const success = (regularResult.status === 'fulfilled' && regularResult.value.success) ||
                       (dataOnlyResult.status === 'fulfilled' && dataOnlyResult.value.success);

        if (success) {
            socket.emit('fcm_sent', {
                success: true,
                userId,
                roomId,
                message: 'Call notification sent successfully'
            });
            console.log('✅ FCM call notification sent successfully');
        } else {
            socket.emit('fcm_error', {
                error: 'Failed to send FCM notification',
                userId,
                roomId
            });
            console.error('❌ All FCM notification attempts failed');
        }

    } catch (error) {
        console.error('❌ Fatal error in send_fcm_message handler:', error);
        socket.emit('fcm_error', {
            error: 'Internal server error',
            details: error.message
        });
    }
});

// 🔥 NEW: Enhanced call initiation handler with caller info
socket.on('initiate_call', async (data) => {
    try {
        const { 
            calleeId, 
            callerId, 
            roomId, 
            callerName, 
            callerAvatar,
            callType = 'video' // 'video' or 'audio'
        } = data;

        console.log('🚀 Call initiation request:', {
            calleeId,
            callerId, 
            roomId,
            callerName,
            callType,
            timestamp: new Date().toISOString()
        });

        if (!calleeId || !callerId || !roomId) {
            socket.emit('call_error', { 
                error: 'Missing required fields: calleeId, callerId, roomId' 
            });
            return;
        }

        // Get caller info from database if not provided
        let finalCallerName = callerName;
        let finalCallerAvatar = callerAvatar;

        if (!finalCallerName && callerId) {
            try {
                const callerDoc = await admin.firestore()
                    .collection('users')
                    .doc(callerId)
                    .get();
                
                if (callerDoc.exists) {
                    const callerData = callerDoc.data();
                    finalCallerName = callerData.name || callerData.displayName || 'Unknown Caller';
                    finalCallerAvatar = callerData.avatar || callerData.photoURL || null;
                }
            } catch (dbError) {
                console.error('⚠️ Could not fetch caller info:', dbError);
                finalCallerName = 'Unknown Caller';
            }
        }

        // Send FCM notification with enhanced data
        const fcmData = {
            type: "CALL",
            callerName: finalCallerName,
            callerId,
            roomId,
            callType,
            callerAvatar: finalCallerAvatar || '',
            callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now().toString(),
        };

        console.log('📱 Sending enhanced FCM with data:', fcmData);

        const result = await sendCallNotification(calleeId, roomId, finalCallerName);
        
        if (result.success) {
            // Store call record in database for tracking
            try {
                await admin.firestore().collection('calls').add({
                    callId: fcmData.callId,
                    callerId,
                    calleeId,
                    roomId,
                    callerName: finalCallerName,
                    callType,
                    status: 'initiated',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (dbError) {
                console.error('⚠️ Could not store call record:', dbError);
            }

            socket.emit('call_initiated', {
                success: true,
                callId: fcmData.callId,
                roomId,
                message: 'Call notification sent successfully'
            });
        } else {
            socket.emit('call_error', {
                error: 'Failed to send call notification',
                calleeId,
                roomId
            });
        }

    } catch (error) {
        console.error('❌ Error in initiate_call handler:', error);
        socket.emit('call_error', {
            error: 'Failed to initiate call',
            details: error.message
        });
    }
});

// 🔥 NEW: Handle call status updates
socket.on('call_status_update', async (data) => {
    try {
        const { callId, status, roomId } = data;
        // status can be: 'accepted', 'declined', 'ended', 'missed'
        
        console.log('📞 Call status update:', { callId, status, roomId });

        // Update call record in database
        if (callId) {
            try {
                const callQuery = await admin.firestore()
                    .collection('calls')
                    .where('callId', '==', callId)
                    .limit(1)
                    .get();

                if (!callQuery.empty) {
                    const callDoc = callQuery.docs[0];
                    await callDoc.ref.update({
                        status,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        ...(status === 'ended' && { endedAt: admin.firestore.FieldValue.serverTimestamp() })
                    });
                    console.log(`✅ Call ${callId} status updated to: ${status}`);
                } else {
                    console.warn(`⚠️ Call record not found for callId: ${callId}`);
                }
            } catch (dbError) {
                console.error('❌ Error updating call status:', dbError);
            }
        }

        // Broadcast status to room participants
        if (roomId) {
            socket.to(roomId).emit('call_status_changed', {
                callId,
                status,
                timestamp: Date.now()
            });
        }

        socket.emit('call_status_updated', { success: true, callId, status });

    } catch (error) {
        console.error('❌ Error in call_status_update handler:', error);
        socket.emit('call_error', {
            error: 'Failed to update call status',
            details: error.message
        });
    }
});

// 🔥 NEW: Join call room
socket.on('join_call_room', (data) => {
    try {
        const { roomId, userId, userType } = data; // userType: 'caller' or 'callee'
        
        console.log(`👥 User ${userId} joining call room: ${roomId} as ${userType}`);
        
        socket.join(roomId);
        
        // Notify other participants
        socket.to(roomId).emit('user_joined_call', {
            userId,
            userType,
            timestamp: Date.now()
        });

        socket.emit('joined_call_room', {
            success: true,
            roomId,
            message: 'Successfully joined call room'
        });

    } catch (error) {
        console.error('❌ Error joining call room:', error);
        socket.emit('call_error', {
            error: 'Failed to join call room',
            details: error.message
        });
    }
});

// 🔥 NEW: Leave call room
socket.on('leave_call_room', (data) => {
    try {
        const { roomId, userId } = data;
        
        console.log(`👋 User ${userId} leaving call room: ${roomId}`);
        
        socket.leave(roomId);
        
        // Notify other participants
        socket.to(roomId).emit('user_left_call', {
            userId,
            timestamp: Date.now()
        });

        socket.emit('left_call_room', {
            success: true,
            roomId,
            message: 'Successfully left call room'
        });

    } catch (error) {
        console.error('❌ Error leaving call room:', error);
    }
});

console.log('📡 Enhanced FCM and call management socket handlers registered');


        // this is for ending all ring for all users except the one accepting the call



        socket.on('reject_all_caller', (data) => {   
            const { room, to } = data; 

            //I want only ending call all user except socket.id user in users object
            const userSockets = Object.values(users).flat().map(user => user.socket_id);
                    
            userSockets.forEach(socketId => {
                io.to(socketId).emit('end_call', { from: socket.id, room });
            });

        });

        socket.on('request_end_call', (data) => {
            const { room, to } = data; 

            // Iant to emmit end_call to only data.to .

            if (!to) {
                console.error("No recipient specified for end_call.");  
                return;
            }   
            console.log('Ending call for:', to, 'in room:', room);

            // Emit end_call to the specific user
            io.to(to).emit('end_call', { from: socket.id, room });     
           
        }); 




        socket.on('check_user', () => {      
            socket.emit('get_user', users);
        });

 
        socket.on("chat-message", (roomId, newMessage) => {
            if(!messages[roomId]){
                messages[roomId] = [];
            }
            messages[roomId].push(newMessage);
            console.log(messages);
            io.to(roomId).emit("chat-message", newMessage); // Broadcast message to all users in the room
          });

        // Handle signaling messages (offer/answer/ICE candidates)
        socket.on('message', (data) => {
            const { roomId, to } = data;

            console.log('Message received:', data);

            if (to) {
                // Forward message to a specific user
                io.to(to).emit('message', { ...data, from: socket.id });
            } else {
                // Broadcast to all user s in the room except sender
                socket.to(roomId).emit('message', { ...data, from: socket.id });
            }
        });

        socket.on("leaveRoom", (roomId) => {
            console.log(`User is leaving room: ${roomId}`);
            
            // Perform cleanup tasks (e.g., notify other users, remove from room, etc.)
            
        
            // Optional: Notify other users in the room
            socket.to(roomId).emit('user-left', socket.id);
            socket.leave(roomId);
        });

        // Handle disconnection
        socket.on('disconnect', () => {

            console.log('A user disconnected:', socket.id );


            //remove users from array in users object

            

            
             users = Object.keys(users).reduce((acc, userId) => {
                acc[userId] = users[userId].filter(user => user.socket_id !== socket.id);
                if( acc[userId].length === 0) {
                    delete acc[userId]; // Remove userId if no sockets left 
                }
                if (Object.keys(acc).length === 0) {    
                    acc = {}; // Reset users if empty
                }
                console.log('Updated users:', acc);
                return acc;
            }, {});

            
            // Remove user from the users object
            // for (const userId in users) {
            //     if (users[userId].socket_id === socket.id) {
            //         delete users[userId];
            //         break;
            //     }
            // }

            // Remove user from all rooms they joined
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);

                // Notify other users in the room
                socket.to(roomId).emit('user-left', socket.id);

                // Clean up empty rooms
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }

            // Optionally, notify everyone of the updated online users
            // io.emit('online_user', users);
        });

    });

    return io;
}

module.exports = { setupSocket };
