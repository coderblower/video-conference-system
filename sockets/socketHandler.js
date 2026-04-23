const {Server} = require('socket.io');
const {
    sendCallNotification,
    sendDataOnlyCallNotification,
    sendCallLifecycleNotification
} = require('../helpers/fcmHelper');
const callingRepository = require('../services/callingRepository');

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
    const activeCallTimeouts = {};
    let users = {};
    const CALL_RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS || 30000);

    // Connection quality monitoring
    const connectionStats = {};

    const normalizeUserId = (value) => {
        if (value === undefined || value === null || value === '') {
            return null;
        }

        return String(value);
    };

    const emitPresence = (target = io) => {
        target.emit('online_user', users);
    };

    const emitDashboard = async (target = io) => {
        try {
            const dashboard = await callingRepository.getDashboardStats({
                activeCallsCount: Object.keys(activeCalls).length,
                connectedSockets: Object.keys(activeUsers).length,
            });
            target.emit('calling_dashboard', dashboard);
        } catch (error) {
            console.error('⚠️  Failed to emit dashboard:', error.message);
        }
    };

    const emitRealtimeState = async (target = io) => {
        emitPresence(target);
        await emitDashboard(target);
    };

    const getUserSockets = (userId, fallbackSocketId = null) => {
        const normalizedUserId = normalizeUserId(userId);
        const sockets = new Set();

        if (normalizedUserId && Array.isArray(users[normalizedUserId])) {
            users[normalizedUserId]
                .map((user) => user.socket_id)
                .filter(Boolean)
                .forEach((socketId) => sockets.add(socketId));
        }

        if (fallbackSocketId) {
            sockets.add(fallbackSocketId);
        }

        return Array.from(sockets);
    };

    const registerUserPresence = async (socket, userInfo = {}) => {
        const normalizedUserId = normalizeUserId(userInfo.id);
        if (!normalizedUserId) {
            return null;
        }

        const previousUserId = normalizeUserId(activeUsers[socket.id]?.userId);
        if (previousUserId && previousUserId !== normalizedUserId) {
            removeSocketPresence(socket.id);
        }

        users[normalizedUserId] = [
            ...(users[normalizedUserId] || []).filter((user) => user.socket_id && user.socket_id !== socket.id),
            {
                name: `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim(),
                socket_id: socket.id,
                avatar: userInfo.avatar || null,
                status: 'online',
                lastSeen: new Date()
            }
        ];

        activeUsers[socket.id] = {
            ...(activeUsers[socket.id] || {}),
            connectedAt: activeUsers[socket.id]?.connectedAt || new Date(),
            lastActivity: new Date(),
            userId: normalizedUserId,
            userInfo
        };

        try {
            await callingRepository.markSocketConnected({
                userId: normalizedUserId,
                deviceId: userInfo.deviceId || socket.id,
                socketId: socket.id,
                appName: userInfo.appName,
                deviceModel: userInfo.deviceModel,
                devicePlatform: userInfo.devicePlatform,
                userInfo,
            });
        } catch (error) {
            console.error('⚠️  Failed to persist socket presence:', error.message);
        }

        return normalizedUserId;
    };

    const removeSocketPresence = (socketId) => {
        const normalizedUserId = normalizeUserId(activeUsers[socketId]?.userId);
        delete activeUsers[socketId];

        if (!normalizedUserId || !users[normalizedUserId]) {
            return normalizedUserId;
        }

        const remainingConnections = users[normalizedUserId]
            .filter((user) => user.socket_id !== socketId);

        if (remainingConnections.length > 0) {
            users[normalizedUserId] = remainingConnections;
        } else {
            delete users[normalizedUserId];
        }

        return normalizedUserId;
    };

    const clearRingTimeout = (roomId) => {
        if (!activeCallTimeouts[roomId]) {
            return;
        }

        clearTimeout(activeCallTimeouts[roomId]);
        delete activeCallTimeouts[roomId];
    };

    const emitToUser = (userId, eventName, payload = {}, fallbackSocketId = null) => {
        getUserSockets(userId, fallbackSocketId).forEach((socketId) => {
            io.to(socketId).emit(eventName, payload);
        });
    };

    const cacheCallState = (socket, data = {}) => {
        const callerId = normalizeUserId(data.callerId);
        const calleeId = normalizeUserId(data.calleeId || data.callee);
        const roomId = data.roomId;

        if (!callerId || !calleeId || !roomId) {
            return null;
        }

        activeCalls[roomId] = {
            ...(activeCalls[roomId] || {}),
            callerId,
            callerSocketId: socket.id,
            calleeId,
            callerName: data.callerName || activeCalls[roomId]?.callerName,
            callerAvatar: data.callerAvatar || activeCalls[roomId]?.callerAvatar || null,
            callType: data.callType || activeCalls[roomId]?.callType || 'video',
            status: data.status || activeCalls[roomId]?.status || 'calling',
            createdAt: activeCalls[roomId]?.createdAt || new Date(),
            updatedAt: new Date(),
            participants: Array.from(new Set([
                ...(activeCalls[roomId]?.participants || []),
                callerId
            ]))
        };

        return activeCalls[roomId];
    };

    const persistCallState = async (roomId, callData = {}) => {
        try {
            await callingRepository.upsertCallHistory(roomId, {
                callerId: callData.callerId,
                calleeId: callData.calleeId,
                callerName: callData.callerName,
                calleeName: callData.calleeName,
                callType: callData.callType,
                status: callData.status,
                ringingStartedAt: callData.createdAt || new Date(),
                metadata: {
                    callerAvatar: callData.callerAvatar || null,
                },
            });
        } catch (error) {
            console.error('⚠️  Failed to persist call state:', error.message);
        }
    };

    const cleanupCall = async (roomId, options = {}) => {
        const call = activeCalls[roomId];
        if (!call) {
            return;
        }

        const endedAt = new Date();
        const reason = options.reason || options.status || 'ended';
        const payload = {
            roomId,
            endedBy: options.endedBy || null,
            status: options.status || 'ended',
            reason,
            timestamp: endedAt.toISOString(),
        };

        clearRingTimeout(roomId);
        call.status = payload.status;
        call.endedAt = endedAt;

        if (options.notifyCaller !== false) {
            emitToUser(call.callerId, 'call_ended', payload, call.callerSocketId);
        }

        if (options.notifyCallee !== false) {
            emitToUser(call.calleeId, 'call_ended', payload);
        }

        io.to(roomId).emit('call_ended', payload);

        if (options.pushType) {
            await sendCallLifecycleNotification(call.calleeId, options.pushType, roomId, {
                callerId: call.callerId,
                callerName: call.callerName,
                callType: call.callType,
                reason,
            });
        }

        await callingRepository.finalizeCall(roomId, {
            status: payload.status,
            endedBy: options.endedBy || null,
            disconnectReason: reason,
            endedAt,
        });

        delete activeCalls[roomId];
        await emitDashboard();
    };

    const scheduleRingTimeout = (roomId) => {
        clearRingTimeout(roomId);
        activeCallTimeouts[roomId] = setTimeout(async () => {
            try {
                const call = activeCalls[roomId];
                if (!call || !['calling', 'initiating', 'ringing'].includes(call.status)) {
                    return;
                }

                console.log(`⏰ Ring timeout reached for room ${roomId}`);
                await cleanupCall(roomId, {
                    status: 'timeout',
                    reason: 'timeout',
                    endedBy: call.callerId,
                    pushType: 'CALL_TIMEOUT',
                });
            } catch (error) {
                console.error('❌ Error timing out call:', error);
            }
        }, CALL_RING_TIMEOUT_MS);
    };

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
        socket.on('join_online', async (userInfo) => {
            if (userInfo && userInfo.id) {
                await registerUserPresence(socket, userInfo);
            }

            console.log('👤 User joined:', userInfo.id, 'Socket:', socket.id);
            
            socket.emit('new-users', users);
            await emitRealtimeState();
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
                cacheCallState(socket, {
                    callerId,
                    calleeId,
                    roomId,
                    callerName,
                    callerAvatar,
                    callType,
                    status: 'initiating'
                });
                await persistCallState(roomId, activeCalls[roomId]);

                // Get callee socket connections
                const calleeConnections = getUserSockets(calleeId);

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
                const fcmResult = await sendCallNotification(
                    calleeId,
                    roomId,
                    callerName,
                    callerId,
                    callType,
                    callerAvatar
                );
                
                if (fcmResult.success || calleeConnections.length > 0) {
                    activeCalls[roomId].status = 'calling';
                    await callingRepository.upsertCallHistory(roomId, {
                        status: 'calling',
                    });
                    scheduleRingTimeout(roomId);
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
socket.on('end_call', async (data) => {

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

        if (activeCalls[roomId]) {
            await cleanupCall(roomId, {
                status: 'ended',
                reason: 'ended',
                endedBy: normalizeUserId(endedBy) || normalizeUserId(from) || normalizeUserId(to),
                pushType: 'CALL_ENDED',
            });
        }

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



        



  socket.on('end_call_decline', async (data) => {
    try {
        const { callID, roomId } = data;
        const decliningUserId = activeUsers[socket.id]?.userId;
        const targetRoomId =
            roomId ||
            Object.keys(activeCalls).find((activeRoomId) => {
                const call = activeCalls[activeRoomId];
                return (
                    call.callerId === normalizeUserId(callID) ||
                    call.calleeId === normalizeUserId(callID)
                );
            });

        console.log('❌ Call declined:', {
            callID,
            roomId: targetRoomId,
            decliningUserId,
            timestamp: new Date().toISOString()
        });

        // Find sockets for the user being declined
        const activeCall = targetRoomId ? activeCalls[targetRoomId] : null;
        const targetSockets = getUserSockets(callID, activeCall?.callerSocketId);

        // Emit decline to target user sockets
        targetSockets.forEach(socketId => {
            io.to(socketId).emit('call_declined', {
                callID,
                roomId: targetRoomId,
                declinedBy: decliningUserId || socket.id,
                timestamp: Date.now()
            });
        });

        if (targetRoomId && activeCalls[targetRoomId]) {
            await cleanupCall(targetRoomId, {
                status: 'declined',
                reason: 'declined',
                endedBy: decliningUserId || normalizeUserId(callID),
                pushType: 'CALL_DECLINED',
            });
        }

    } catch (error) {
        console.error('❌ Error in end_call_decline:', error);
    }
});

        // Call status updates
        socket.on('call_status_update', async (data) => {
            try {
                const { roomId, status, userId } = data;
                const normalizedUserId = normalizeUserId(userId);
                
                console.log('📞 Call status update:', { roomId, status, userId });

                if (activeCalls[roomId]) {
                    activeCalls[roomId].status = status;
                    activeCalls[roomId].updatedAt = new Date();
                    
                    if (status === 'accepted' && normalizedUserId) {
                        activeCalls[roomId].participants = Array.from(new Set([
                            ...activeCalls[roomId].participants,
                            normalizedUserId
                        ]));
                        activeCalls[roomId].connectedAt = new Date();
                        clearRingTimeout(roomId);
                        await callingRepository.markCallAccepted(roomId, {
                            answeredAt: new Date(),
                        });
                        
                        // Notify caller that call was accepted
                        const callerConnections = getUserSockets(
                            activeCalls[roomId].callerId,
                            activeCalls[roomId].callerSocketId
                        );
                        callerConnections.forEach(socketId => {
                            io.to(socketId).emit('call_accepted', {
                                roomId,
                                acceptedBy: normalizedUserId
                            });
                        });
                    } else if (status === 'declined') {
                        await cleanupCall(roomId, {
                            status: 'declined',
                            reason: 'declined',
                            endedBy: normalizedUserId || userId,
                            pushType: 'CALL_DECLINED',
                        });
                    } else if (status === 'ended') {
                        await cleanupCall(roomId, {
                            status: 'ended',
                            reason: 'ended',
                            endedBy: normalizedUserId || userId,
                            pushType: 'CALL_ENDED',
                        });
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
                const normalizedUserId = normalizeUserId(userId);
                
                console.log(`👥 User ${userId} joining call room: ${roomId} as ${userType}`);
                
                socket.join(roomId);
                
                if (activeCalls[roomId] && normalizedUserId) {
                    if (!activeCalls[roomId].participants.includes(normalizedUserId)) {
                        activeCalls[roomId].participants.push(normalizedUserId);
                    }

                    const isCalleeJoiningAcceptedCall =
                        normalizedUserId === activeCalls[roomId].calleeId &&
                        ['initiating', 'calling', 'ringing'].includes(activeCalls[roomId].status);

                    if (isCalleeJoiningAcceptedCall) {
                        activeCalls[roomId].status = 'accepted';
                        activeCalls[roomId].updatedAt = new Date();
                        activeCalls[roomId].connectedAt = activeCalls[roomId].connectedAt || new Date();
                        clearRingTimeout(roomId);

                        callingRepository.markCallAccepted(roomId, {
                            answeredAt: activeCalls[roomId].connectedAt,
                        }).catch((error) => {
                            console.error('⚠️  Failed to persist accepted call on room join:', error.message);
                        });

                        const callerConnections = getUserSockets(
                            activeCalls[roomId].callerId,
                            activeCalls[roomId].callerSocketId
                        );
                        callerConnections.forEach((socketId) => {
                            io.to(socketId).emit('call_accepted', {
                                roomId,
                                acceptedBy: normalizedUserId
                            });
                        });
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
                const normalizedUserId = normalizeUserId(userId);
                
                console.log(`👋 User ${userId} leaving call room: ${roomId}`);
                
                socket.leave(roomId);
                
                if (activeCalls[roomId] && normalizedUserId) {
                    activeCalls[roomId].participants = 
                        activeCalls[roomId].participants.filter(id => id !== normalizedUserId);
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
                cacheCallState(socket, {
                    callerId,
                    calleeId: callee,
                    roomId,
                    callerName: finalCallerName,
                    callerAvatar: data.callerAvatar,
                    callType: callType || 'video',
                    status: 'calling'
                });
                await persistCallState(roomId, activeCalls[roomId]);

                const result = await sendDataOnlyCallNotification(
                    callee,
                    roomId,
                    finalCallerName,
                    callerId,
                    callType,
                    data.callerAvatar
                );
                const userSockets = getUserSockets(callee);

                if (result.success || userSockets.length > 0) {
                    scheduleRingTimeout(roomId);
                    socket.emit('fcm_sent', {
                        success: true,
                        callee,
                        roomId,
                        message: 'Call notification sent successfully'
                    });

                    socket.emit('ringing_call', { roomId });
                    
                    
                    // Also emit to other user devices
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('incoming_call', { 
                            from: socket.id, 
                            room: roomId,
                            roomId,
                            callerName: finalCallerName,
                            callerId: callerId,
                            callType: callType || 'video'
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

        socket.on('update_call_type', (data) => {
            try {
                const { roomId, callType, from, to } = data;

                if (!roomId || !callType) {
                    socket.emit('call_error', {
                        error: 'roomId and callType are required',
                    });
                    return;
                }

                if (activeCalls[roomId]) {
                    activeCalls[roomId].callType = callType;
                    activeCalls[roomId].updatedAt = new Date();
                }

                const payload = {
                    roomId,
                    callType,
                    from,
                    timestamp: Date.now()
                };

                socket.to(roomId).emit('call_type_changed', payload);
                getUserSockets(to).forEach((socketId) => {
                    io.to(socketId).emit('call_type_changed', payload);
                });
                socket.emit('call_type_changed', payload);
            } catch (error) {
                console.error('❌ Error updating call type:', error);
                socket.emit('call_error', {
                    error: 'Failed to update call type',
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
        socket.on('disconnect', async () => {
            console.log('🔌 User disconnected:', socket.id);
            
            const userId = removeSocketPresence(socket.id);
            await callingRepository.clearSocket(socket.id);
            
            // Clean up active calls
            for (const roomId of Object.keys(activeCalls)) {
                const call = activeCalls[roomId];
                const normalizedUserId = normalizeUserId(userId);
                const isCallParticipant = normalizedUserId && call.participants.includes(normalizedUserId);
                const isCallerSocket = call.callerSocketId === socket.id;

                if (isCallParticipant || isCallerSocket) {
                    call.participants = call.participants.filter(id => id !== normalizedUserId);

                    const shouldEndDisconnectedCall =
                        call.status === 'accepted' ||
                        call.status === 'ended' ||
                        call.participants.length === 0;

                    if (shouldEndDisconnectedCall) {
                        await cleanupCall(roomId, {
                            status: 'ended',
                            reason: 'disconnected',
                            endedBy: normalizedUserId,
                            pushType: 'CALL_ENDED',
                        });
                    } else {
                        // Notify remaining participants
                        io.to(roomId).emit('participant_disconnected', {
                            userId,
                            timestamp: Date.now()
                        });
                    }
                }
            }
            
            // Remove from rooms
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                
                socket.to(roomId).emit('user-left', socket.id);
                
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
            
            // Update online users
            await emitRealtimeState();
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
