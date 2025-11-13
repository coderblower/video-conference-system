const {Server} = require('socket.io');
const { sendUnifiedCallNotification } = require('../helpers/voipHelper');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    const rooms = {};
    const messages = {};
    const activeUsers = {};
    const activeCalls = {};
    let users = {};

    io.on('connection', (socket) => {
        console.log('🔗 User connected:', socket.id);
        activeUsers[socket.id] = {
            connectedAt: new Date(),
            lastActivity: new Date()
        };

        socket.emit('connected', socket.id);

        // User join
        socket.on('join_online', (userInfo) => {
            if (userInfo && userInfo.id) {
                users[userInfo.id] = [...users[userInfo.id] || [], {
                    name: userInfo.firstName + ' ' + userInfo.lastName,
                    socket_id: socket.id,
                    avatar: userInfo.avatar || null,
                    status: 'online',
                    lastSeen: new Date()
                }];

                activeUsers[socket.id].userId = userInfo.id;
                activeUsers[socket.id].userInfo = userInfo;
            }

            console.log('👤 User joined:', userInfo.id, 'Socket:', socket.id);
            socket.emit('new-users', users);
            io.emit('online_user', users);
        });

        // Enhanced FCM/VoIP call initiation
        socket.on('send_fcm_message', async (data) => {
            try {
                const { callee, roomId, callerName, callerId, callType } = data;
                
                console.log('📞 ========== CALL INITIATION ==========');
                console.log('📞 Callee:', callee);
                console.log('📞 Room:', roomId);
                console.log('📞 Caller:', callerName);
                console.log('📞 Type:', callType);

                if (!callee || !roomId) {
                    socket.emit('fcm_error', { error: 'callee and roomId required' });
                    return;
                }

                // Store active call
                activeCalls[roomId] = {
                    callerId,
                    calleeId: callee,
                    callerName,
                    callType: callType || 'video',
                    status: 'calling',
                    createdAt: new Date(),
                    participants: [callerId]
                };

                // Send unified notification (VoIP for iOS, FCM for Android)
                const result = await sendUnifiedCallNotification(
                    callee,
                    roomId,
                    callerName || 'Unknown Caller',
                    callerId,
                    callType || 'video'
                );

                if (result.success) {
                    console.log('✅ Call notification sent successfully');
                    
                    // Emit ringing status
                    socket.emit('ringing_call', { roomId });
                    socket.emit('fcm_sent', {
                        success: true,
                        callee,
                        roomId,
                        message: 'Call notification sent'
                    });

                    // Notify other user devices via socket
                    const userSockets = users[callee]?.map(user => user.socket_id) || [];
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('incoming_call', { 
                            from: socket.id, 
                            room: roomId,
                            callerName: callerName || 'Unknown Caller',
                            callerId: callerId,
                            callType: callType || 'video'
                        });
                    });

                } else {
                    console.error('❌ Failed to send call notification');
                    socket.emit('fcm_error', {
                        error: 'Failed to send notification',
                        callee,
                        roomId
                    });
                }

                console.log('📞 ========== CALL INITIATION COMPLETED ==========');

            } catch (error) {
                console.error('❌ Error in send_fcm_message:', error);
                socket.emit('fcm_error', {
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });

        // Call status updates
        socket.on('call_status_update', (data) => {
            const { roomId, status, userId } = data;
            
            console.log('📞 Call status update:', { roomId, status, userId });

            if (activeCalls[roomId]) {
                activeCalls[roomId].status = status;
                
                if (status === 'accepted') {
                    activeCalls[roomId].participants.push(userId);
                    activeCalls[roomId].connectedAt = new Date();
                    
                    // Notify caller
                    const callerConnections = users[activeCalls[roomId].callerId]
                        ?.map(user => user.socket_id) || [];
                    callerConnections.forEach(socketId => {
                        io.to(socketId).emit('call_accepted', {
                            roomId,
                            acceptedBy: userId
                        });
                    });
                } else if (status === 'declined') {
                    // Notify caller
                    const callerConnections = users[activeCalls[roomId].callerId]
                        ?.map(user => user.socket_id) || [];
                    callerConnections.forEach(socketId => {
                        io.to(socketId).emit('call_declined', {
                            roomId,
                            declinedBy: userId
                        });
                    });
                    delete activeCalls[roomId];
                }
            }
        });

        // End call handler
        socket.on('end_call', (data) => {
            try {
                const { roomId, from, to, endedBy, timestamp } = data;
                
                console.log('🔚 Call ended:', { roomId, from, to, endedBy });

                if (activeCalls[roomId]) {
                    activeCalls[roomId].status = 'ended';
                    activeCalls[roomId].endedBy = endedBy;
                    activeCalls[roomId].endedAt = new Date();
                }

                // Notify recipient
                if (to) {
                    const recipientSockets = Object.keys(activeUsers).filter(socketId => {
                        return activeUsers[socketId].userId == to;
                    });

                    recipientSockets.forEach(socketId => {
                        io.to(socketId).emit('call_ended', {
                            roomId,
                            from,
                            endedBy,
                            timestamp: timestamp || Date.now()
                        });
                    });
                }

                // Broadcast to room
                socket.to(roomId).emit('call_ended', {
                    roomId,
                    endedBy,
                    timestamp: timestamp || Date.now()
                });

                setTimeout(() => {
                    delete activeCalls[roomId];
                }, 5000);

                socket.emit('call_end_confirmed', { success: true, roomId });

            } catch (error) {
                console.error('❌ Error in end_call:', error);
                socket.emit('call_error', {
                    error: 'Failed to end call',
                    details: error.message
                });
            }
        });

        // Call decline handler
        socket.on('end_call_decline', (data) => {
            try {
                const { callID, roomId } = data;
                const decliningUserId = activeUsers[socket.id]?.userId;

                console.log('❌ Call declined:', { callID, roomId, decliningUserId });

                // Find target user sockets
                const targetSockets = Object.keys(activeUsers).filter(socketId => {
                    return activeUsers[socketId].userId == callID;
                });

                // Notify caller
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit('call_declined', {
                        callID,
                        roomId,
                        declinedBy: decliningUserId || socket.id,
                        timestamp: Date.now()
                    });
                });

                // Clean up call
                if (roomId && activeCalls[roomId]) {
                    delete activeCalls[roomId];
                }

            } catch (error) {
                console.error('❌ Error in end_call_decline:', error);
            }
        });

        // WebRTC signaling
        socket.on('message', (data) => {
            const { roomId, to, type } = data;
            
            if (to) {
                io.to(to).emit('message', { ...data, from: socket.id });
            } else if (roomId) {
                socket.to(roomId).emit('message', { ...data, from: socket.id });
            }
        });

        // Room management
        socket.on('join-room', (roomId) => {
            socket.join(roomId);
            
            if (!rooms[roomId]) {
                rooms[roomId] = [];
                socket.emit('first_in_room');
            }
            
            rooms[roomId].push(socket.id);
            console.log(`👥 User ${socket.id} joined room ${roomId}`);
            
            socket.emit('load-old-messages', messages[roomId] || []);
            socket.to(roomId).emit('new-user', socket.id);
        });

        // Disconnect handler
        socket.on('disconnect', () => {
            console.log('🔌 User disconnected:', socket.id);
            
            const userId = activeUsers[socket.id]?.userId;
            delete activeUsers[socket.id];
            
            if (userId) {
                users = Object.keys(users).reduce((acc, uid) => {
                    acc[uid] = users[uid].filter(user => user.socket_id !== socket.id);
                    if (acc[uid].length > 0) {
                        return acc;
                    }
                    return acc;
                }, {});
            }

            // Clean up active calls
            Object.keys(activeCalls).forEach(roomId => {
                const call = activeCalls[roomId];
                if (call.participants.includes(userId)) {
                    call.participants = call.participants.filter(id => id !== userId);
                    
                    if (call.participants.length === 0) {
                        delete activeCalls[roomId];
                    } else {
                        io.to(roomId).emit('participant_disconnected', {
                            userId,
                            timestamp: Date.now()
                        });
                    }
                }
            });

            // Clean up rooms
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                socket.to(roomId).emit('user-left', socket.id);
                
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
            
            io.emit('online_user', users);
        });
    });

    return io;
}

module.exports = { setupSocket };