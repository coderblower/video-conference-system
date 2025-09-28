const {Server} = require('socket.io');
const { sendCallNotification, sendDataOnlyCallNotification } = require('../helpers/fcmHelper');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Store users, rooms, messages, and active calls
    const rooms = {};
    const messages = {};
    const activeUsers = {};
    const activeCalls = {};
    let users = {};

    // Connection quality monitoring
    const connectionStats = {};

    setInterval(() => {
        console.log('📊 Server Stats:', {
            activeUsers: Object.keys(activeUsers).length,
            activeCalls: Object.keys(activeCalls).length,
            rooms: Object.keys(rooms).length
        });
        console.log('🕒 Active Users:', activeUsers);
        console.log('🕒 All Users:', users);
    }, 30000);

    io.on('connection', (socket) => {
        console.log('🔗 User connected:', socket.id);
        activeUsers[socket.id] = {
            connectedAt: new Date(),
            lastActivity: new Date()
        };

        socket.emit('connected', socket.id);
    

        // Enhanced user join with presence
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

        // Enhanced call initiation
        socket.on('initiate_call', async (data) => {
            try {
                const { 
                    calleeId, 
                    callerId, 
                    roomId, 
                    callerName, 
                    callerAvatar,
                    callType = 'video'
                } = data;

                console.log('📞 Call initiation:', {
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

                // Store active call
                activeCalls[roomId] = {
                    callerId,
                    calleeId,
                    callerName,
                    callerAvatar,
                    callType,
                    status: 'initiating',
                    createdAt: new Date(),
                    participants: [callerId]
                };

                // Get callee socket connections
                const calleeConnections = users[calleeId]?.map(user => user.socket_id) || [];
                
                if (calleeConnections.length === 0) {
                    socket.emit('call_error', {
                        error: 'User is not online',
                        calleeId
                    });
                    return;
                }

                // Send to all callee devices
                calleeConnections.forEach(socketId => {
                    io.to(socketId).emit('incoming_call', {
                        callerId,
                        roomId,
                        callerName,
                        callerAvatar,
                        callType
                    });
                });

                // Send FCM notification
                const fcmResult = await sendCallNotification(calleeId, roomId, callerName);
                
                if (fcmResult.success) {
                    activeCalls[roomId].status = 'calling';
                    socket.emit('call_initiated', {
                        success: true,
                        roomId,
                        message: 'Call initiated successfully'
                    });
                } else {
                    socket.emit('call_error', {
                        error: 'Failed to send call notification',
                        calleeId,
                        roomId
                    });
                }

            } catch (error) {
                console.error('❌ Error initiating call:', error);
                socket.emit('call_error', {
                    error: 'Failed to initiate call',
                    details: error.message
                });
            }
        });


      

        // Enhanced end call handler
socket.on('end_call', (data) => {

    console.log('🔚 End call request received:', data);

    try {
        const { roomId, from, to, endedBy, timestamp } = data;
        
        console.log('📞 Call ended:', {
            roomId,
            from,
            to,
            endedBy,
            timestamp: new Date(timestamp || Date.now()).toISOString()
        });

        // Clean up active call
        if (activeCalls[roomId]) {
            activeCalls[roomId].status = 'ended';
            activeCalls[roomId].endedBy = endedBy;
            activeCalls[roomId].endedAt = new Date();
        }

        // Notify the specific recipient
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
                console.log('📞 Notified socket of call end:', socketId, 'for user:', to);
            });
        }

        // Also broadcast to room participants as fallback
        socket.to(roomId).emit('call_ended', {
            roomId,
            endedBy,
            timestamp: timestamp || Date.now()
        });

        // Clean up call data after delay
        setTimeout(() => {
            delete activeCalls[roomId];
        }, 5000);

        socket.emit('call_end_confirmed', {
            success: true,
            roomId
        });

    } catch (error) {
        console.error('❌ Error in end_call handler:', error);
        socket.emit('call_error', {
            error: 'Failed to end call',
            details: error.message
        });
    }
});



        



  socket.on('end_call_decline', (data) => {
    try {
        const { callID, roomId } = data;
        const decliningUserId = activeUsers[socket.id]?.userId;

        console.log('❌ Call declined:', {
            callID,
            roomId,
            decliningUserId,
            timestamp: new Date().toISOString()
        });

        // Find sockets for the user being declined
        const targetSockets = Object.keys(activeUsers).filter(socketId => {
            return activeUsers[socketId].userId == callID;
        });

        // Emit decline to target user sockets
        targetSockets.forEach(socketId => {
            io.to(socketId).emit('call_declined', {
                callID,
                roomId,
                declinedBy: decliningUserId || socket.id,
                timestamp: Date.now()
            });
        });

        

        // Clean up call if exists
        if (roomId && activeCalls[roomId]) {
            activeCalls[roomId].status = 'declined';
            activeCalls[roomId].declinedBy = decliningUserId;
            delete activeCalls[roomId];
        }

        // End any CallKit calls
        if (callID) {
            // This would be handled by your FCM/CallKit logic
        }

    } catch (error) {
        console.error('❌ Error in end_call_decline:', error);
    }
});

        // Call status updates
        socket.on('call_status_update', async (data) => {
            try {
                const { roomId, status, userId } = data;
                
                console.log('📞 Call status update:', { roomId, status, userId });

                if (activeCalls[roomId]) {
                    activeCalls[roomId].status = status;
                    activeCalls[roomId].updatedAt = new Date();
                    
                    if (status === 'accepted') {
                        activeCalls[roomId].participants.push(userId);
                        activeCalls[roomId].connectedAt = new Date();
                        
                        // Notify caller that call was accepted
                        const callerConnections = users[activeCalls[roomId].callerId]?.map(user => user.socket_id) || [];
                        callerConnections.forEach(socketId => {
                            io.to(socketId).emit('call_accepted', {
                                roomId,
                                acceptedBy: userId
                            });
                        });
                    } else if (status === 'declined') {
                        // Notify caller that call was declined
                        const callerConnections = users[activeCalls[roomId].callerId]?.map(user => user.socket_id) || [];
                        callerConnections.forEach(socketId => {
                            io.to(socketId).emit('call_declined', {
                                roomId,
                                declinedBy: userId
                            });
                        });
                        
                        // Clean up call
                        delete activeCalls[roomId];
                    } else if (status === 'ended') {
                        activeCalls[roomId].endedAt = new Date();
                        
                        // Notify all participants
                        socket.to(roomId).emit('call_ended', {
                            roomId,
                            endedBy: userId
                        });
                        
                        // Clean up call after a delay
                        setTimeout(() => {
                            delete activeCalls[roomId];
                        }, 5000);
                    }
                }

                socket.emit('call_status_updated', { 
                    success: true, 
                    roomId, 
                    status 
                });

            } catch (error) {
                console.error('❌ Error updating call status:', error);
                socket.emit('call_error', {
                    error: 'Failed to update call status',
                    details: error.message
                });
            }
        });

        // Join call room
        socket.on('join_call_room', (data) => {
            try {
                const { roomId, userId, userType } = data;
                
                console.log(`👥 User ${userId} joining call room: ${roomId} as ${userType}`);
                
                socket.join(roomId);
                
                if (activeCalls[roomId]) {
                    if (!activeCalls[roomId].participants.includes(userId)) {
                        activeCalls[roomId].participants.push(userId);
                    }
                }
                
                socket.to(roomId).emit('user_joined_call', {
                    userId,
                    userType,
                    timestamp: Date.now()
                });

                socket.emit('joined_call_room', {
                    success: true,
                    roomId,
                    participants: activeCalls[roomId]?.participants || []
                });

            } catch (error) {
                console.error('❌ Error joining call room:', error);
                socket.emit('call_error', {
                    error: 'Failed to join call room',
                    details: error.message
                });
            }
        });

        // Leave call room
        socket.on('leave_call_room', (data) => {
            try {
                const { roomId, userId } = data;
                
                console.log(`👋 User ${userId} leaving call room: ${roomId}`);
                
                socket.leave(roomId);
                
                if (activeCalls[roomId]) {
                    activeCalls[roomId].participants = 
                        activeCalls[roomId].participants.filter(id => id !== userId);
                }
                
                socket.to(roomId).emit('user_left_call', {
                    userId,
                    timestamp: Date.now()
                });

                socket.emit('left_call_room', {
                    success: true,
                    roomId
                });

            } catch (error) {
                console.error('❌ Error leaving call room:', error);
            }
        });

        // Enhanced chat messaging
        socket.on('chat_message', (data) => {
            try {
                const { roomId, message } = data;
                
                if (!messages[roomId]) {
                    messages[roomId] = [];
                }
                
                const chatMessage = {
                    ...message,
                    timestamp: Date.now(),
                    socketId: socket.id
                };
                
                messages[roomId].push(chatMessage);
                
                console.log('💬 Chat message in room', roomId, ':', message.text);
                
                // Broadcast to room participants
                socket.to(roomId).emit('chat_message', chatMessage);
                
                // Confirm message sent
                socket.emit('message_sent', {
                    success: true,
                    messageId: message.id
                });

            } catch (error) {
                console.error('❌ Error handling chat message:', error);
                socket.emit('message_error', {
                    error: 'Failed to send message',
                    details: error.message
                });
            }
        });

        // Screen sharing events
        socket.on('screen_share_started', (data) => {
            const { roomId, userId } = data;
            console.log('🖥️ Screen sharing started by', userId, 'in room', roomId);
            
            socket.to(roomId).emit('screen_share_started', {
                userId,
                timestamp: Date.now()
            });
        });

        socket.on('screen_share_stopped', (data) => {
            const { roomId, userId } = data;
            console.log('🖥️ Screen sharing stopped by', userId, 'in room', roomId);
            
            socket.to(roomId).emit('screen_share_stopped', {
                userId,
                timestamp: Date.now()
            });
        });

        // Connection quality monitoring
        socket.on('connection_stats', (data) => {
            const { roomId, stats } = data;
            connectionStats[socket.id] = {
                ...stats,
                timestamp: Date.now(),
                roomId
            };
            
            // Analyze and broadcast quality updates
            const quality = analyzeConnectionQuality(stats);
            socket.to(roomId).emit('connection_quality', {
                userId: activeUsers[socket.id]?.userId,
                quality: quality,
                timestamp: Date.now()
            });
        });

        // Legacy support - Enhanced FCM messaging
        socket.on('send_fcm_message', async (data) => {
            try {
                const { callee, roomId, callerName, callerId, callType } = data;
                
                console.log('📞 FCM call request:', {
                    callee,
                    roomId,
                    callerName,
                    callerId,
                    callType,
                    timestamp: new Date().toISOString()
                });

                if (!callee || !roomId) {
                    socket.emit('fcm_error', { error: 'callee and roomId are required' });
                    return;
                }

                const finalCallerName = callerName || 'Unknown Caller';

                const result = await sendDataOnlyCallNotification(callee, roomId, finalCallerName, callerId, callType);

                if (result.success) {
                    socket.emit('fcm_sent', {
                        success: true,
                        callee,
                        roomId,
                        message: 'Call notification sent successfully'
                    });

                    socket.emit('ringing_call', { roomId });
                    
                    
                    // Also emit to other user devices
                    const userSockets = users[callee]?.map(user => user.socket_id) || [];
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('incoming_call', { 
                            from: socket.id, 
                            room: roomId,
                            callerName: finalCallerName,
                            callerId: callerId
                        });
                    });
                    
                } else {
                    socket.emit('fcm_error', {
                        error: 'Failed to send FCM notification',
                        callee,
                        roomId
                    });
                }

            } catch (error) {
                console.error('❌ Error in send_fcm_message:', error);
                socket.emit('fcm_error', {
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });

        // Legacy call handling
        socket.on('make_call', (data) => {
            const { room, to, id } = data;
            console.log('📞 Legacy call to:', to, 'in room:', room, 'id:', id);
            
            const userSockets = users[id]?.map(user => user.socket_id) || [];
            userSockets.forEach(socketId => {
                io.to(socketId).emit('incoming_call', { 
                    from: socket.id, 
                    room,
                    callerId: activeUsers[socket.id]?.userId
                });
            });
        });

 



        // WebRTC signaling
        socket.on('message', (data) => {
            const { roomId, to, type } = data;
            
            console.log('📡 WebRTC message:', type, 'from:', socket.id, 'to:', to || 'room');
            
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
            
            // Send old messages
            socket.emit('load-old-messages', messages[roomId] || []);
            
            // Notify others
            socket.to(roomId).emit('new-user', socket.id);
        });

        socket.on('leaveRoom', (roomId) => {
            console.log(`👋 User leaving room: ${roomId}`);
            socket.to(roomId).emit('user-left', socket.id);
            socket.leave(roomId);
            
            if (rooms[roomId]) {
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
            }
        });

        // User status check
        socket.on('check_user', () => {
            socket.emit('get_user', users);
        });

        // Heartbeat for connection quality
        socket.on('heartbeat', () => {
            if (activeUsers[socket.id]) {
                activeUsers[socket.id].lastActivity = new Date();
            }
            socket.emit('heartbeat_ack', { timestamp: Date.now() });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('🔌 User disconnected:', socket.id);
            
            const userId = activeUsers[socket.id]?.userId;
            
            // Remove from active users
            delete activeUsers[socket.id];
            
            // Remove from users object
            if (userId) {
                users = Object.keys(users).reduce((acc, uid) => {
                    acc[uid] = users[uid].filter(user => user.socket_id !== socket.id);
                    if (acc[uid].length > 0) {
                        return acc;
                    }
                    // Don't include empty arrays
                    return acc;
                }, {});
            }
            
            // Clean up active calls
            Object.keys(activeCalls).forEach(roomId => {
                const call = activeCalls[roomId];
                if (call.participants.includes(userId)) {
                    call.participants = call.participants.filter(id => id !== userId);
                    
                    // End call if no participants left
                    if (call.participants.length === 0) {
                        delete activeCalls[roomId];
                    } else {
                        // Notify remaining participants
                        io.to(roomId).emit('participant_disconnected', {
                            userId,
                            timestamp: Date.now()
                        });
                    }
                }
            });
            
            // Remove from rooms
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                
                socket.to(roomId).emit('user-left', socket.id);
                
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
            
            // Update online users
            io.emit('online_user', users);
        });
    });

    return io;
}

// Helper function to analyze connection quality
function analyzeConnectionQuality(stats) {
    // Simplified quality analysis
    // In production, you'd analyze RTT, packet loss, bandwidth, etc.
    
    const rtt = stats.rtt || 0;
    const packetLoss = stats.packetLoss || 0;
    
    if (rtt < 100 && packetLoss < 0.01) {
        return 'excellent';
    } else if (rtt < 200 && packetLoss < 0.03) {
        return 'good';
    } else if (rtt < 400 && packetLoss < 0.06) {
        return 'poor';
    } else {
        return 'poor';
    }
}




module.exports = { setupSocket };