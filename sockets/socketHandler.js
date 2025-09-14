const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { sendCallNotification, sendDataOnlyCallNotification } = require('../helpers/fcmHelper');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Adjust for production to specific origins
    methods: ['GET', 'POST'],
  },
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
    rooms: Object.keys(rooms).length,
  });
}, 30000);

io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  activeUsers[socket.id] = {
    connectedAt: new Date(),
    lastActivity: new Date(),
  };

  socket.emit('connected', socket.id);

  // Enhanced user join with presence
  socket.on('join_online', (userInfo) => {
    if (userInfo && userInfo.id) {
      users[userInfo.id] = [
        ...(users[userInfo.id] || []),
        {
          name: userInfo.firstName + ' ' + userInfo.lastName,
          socket_id: socket.id,
          avatar: userInfo.avatar || null,
          status: 'online',
          lastSeen: new Date(),
        },
      ];
      activeUsers[socket.id].userId = userInfo.id;
      activeUsers[socket.id].userInfo = userInfo;
      socket.join('online_users');
      console.log('👤 User joined:', userInfo.id, 'Socket:', socket.id);
      socket.emit('new-users', users);
      io.to('online_users').emit('online_user', users);
    }
  });

  // Create room for WebRTC call
  socket.on('create_room', (data) => {
    const { roomId, offer, from } = data;
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [from], offer, answer: null };
      activeCalls[roomId] = {
        callerId: activeUsers[from]?.userId,
        callerName: userInfo.firstName + ' ' + userInfo.lastName,
        callerAvatar: activeUsers[from]?.userInfo?.avatar || null,
        callType: 'video',
        status: 'initiating',
        createdAt: new Date(),
        participants: [activeUsers[from]?.userId],
      };
      socket.join(roomId);
      socket.emit('room_created', { roomId });
      console.log(`Room created: ${roomId} by ${from}`);
    } else {
      socket.emit('error', { message: `Room ${roomId} already exists` });
    }
  });

  // Join an existing room
  socket.on('join_room', (data) => {
    const { roomId, from } = data;
    if (rooms[roomId]) {
      rooms[roomId].users.push(from);
      activeCalls[roomId].participants.push(activeUsers[from]?.userId);
      activeCalls[roomId].status = 'accepted';
      socket.join(roomId);
      socket.emit('room_joined', { roomId });
      if (rooms[roomId].offer) {
        socket.emit('offer', { roomId, offer: rooms[roomId].offer, from: rooms[roomId].users[0] });
      }
      socket.to(roomId).emit('user_joined_call', {
        userId: activeUsers[from]?.userId,
        userType: 'callee',
        timestamp: Date.now(),
      });
      console.log(`User ${from} joined room: ${roomId}`);
    } else {
      socket.emit('error', { message: `Room ${roomId} does not exist` });
    }
  });

  // Handle WebRTC answer
  socket.on('answer', (data) => {
    const { roomId, answer, to } = data;
    if (rooms[roomId]) {
      rooms[roomId].answer = answer;
      io.to(to).emit('message', { type: 'answer', sdp: answer.sdp, from: socket.id, roomId });
      console.log(`Answer sent to ${to} for room: ${roomId}`);
    }
  });

  // Handle WebRTC ICE candidate
  socket.on('ice_candidate', (data) => {
    const { roomId, candidate, from } = data;
    if (rooms[roomId]) {
      socket.to(roomId).emit('message', { type: 'ice-candidate', candidate, from, roomId });
      console.log(`ICE candidate sent in room: ${roomId}`);
    }
  });

  // Handle leave room
  socket.on('leave_room', (data) => {
    const { roomId } = data;
    if (rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter((userId) => userId !== socket.id);
      if (activeCalls[roomId]) {
        activeCalls[roomId].participants = activeCalls[roomId].participants.filter(
          (id) => id !== activeUsers[socket.id]?.userId
        );
        if (activeCalls[roomId].participants.length === 0) {
          delete activeCalls[roomId];
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted`);
        } else {
          socket.to(roomId).emit('end_call', { roomId });
          socket.to(roomId).emit('user_left_call', {
            userId: activeUsers[socket.id]?.userId,
            timestamp: Date.now(),
          });
        }
      }
      socket.leave(roomId);
      console.log(`User ${socket.id} left room: ${roomId}`);
    }
  });

  // Enhanced call initiation
  socket.on('initiate_call', async (data) => {
    try {
      const { calleeId, callerId, roomId, callerName, callerAvatar, callType = 'video' } = data;

      console.log('📞 Call initiation:', {
        calleeId,
        callerId,
        roomId,
        callerName,
        callType,
        timestamp: new Date().toISOString(),
      });

      if (!calleeId || !callerId || !roomId) {
        socket.emit('call_error', { error: 'Missing required fields: calleeId, callerId, roomId' });
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
        participants: [callerId],
      };

      // Get callee socket connections
      const calleeConnections = users[calleeId]?.map((user) => user.socket_id) || [];

      if (calleeConnections.length === 0) {
        socket.emit('call_error', { error: 'User is not online', calleeId });
        return;
      }

      // Send to all callee devices
      calleeConnections.forEach((socketId) => {
        io.to(socketId).emit('incoming_call', {
          callerId,
          roomId,
          callerName,
          callerAvatar,
          callType,
        });
      });

      // Send FCM notification
      const fcmResult = await sendCallNotification(calleeId, roomId, callerName);

      if (fcmResult.success) {
        activeCalls[roomId].status = 'calling';
        socket.emit('call_initiated', {
          success: true,
          roomId,
          message: 'Call initiated successfully',
        });
      } else {
        socket.emit('call_error', {
          error: 'Failed to send call notification',
          calleeId,
          roomId,
        });
      }
    } catch (error) {
      console.error('❌ Error initiating call:', error);
      socket.emit('call_error', {
        error: 'Failed to initiate call',
        details: error.message,
      });
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
          const callerConnections = users[activeCalls[roomId].callerId]?.map((user) => user.socket_id) || [];
          callerConnections.forEach((socketId) => {
            io.to(socketId).emit('call_accepted', {
              roomId,
              acceptedBy: userId,
            });
          });
        } else if (status === 'declined') {
          // Notify caller that call was declined
          const callerConnections = users[activeCalls[roomId].callerId]?.map((user) => user.socket_id) || [];
          callerConnections.forEach((socketId) => {
            io.to(socketId).emit('call_declined', {
              roomId,
              declinedBy: userId,
            });
          });

          // Clean up call
          delete activeCalls[roomId];
          delete rooms[roomId];
        } else if (status === 'ended') {
          activeCalls[roomId].endedAt = new Date();

          // Notify all participants
          socket.to(roomId).emit('call_ended', {
            roomId,
            endedBy: userId,
          });

          // Clean up call after a delay
          setTimeout(() => {
            delete activeCalls[roomId];
            delete rooms[roomId];
          }, 5000);
        }
      }

      socket.emit('call_status_updated', {
        success: true,
        roomId,
        status,
      });
    } catch (error) {
      console.error('❌ Error updating call status:', error);
      socket.emit('call_error', {
        error: 'Failed to update call status',
        details: error.message,
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
        timestamp: Date.now(),
      });

      socket.emit('joined_call_room', {
        success: true,
        roomId,
        participants: activeCalls[roomId]?.participants || [],
      });
    } catch (error) {
      console.error('❌ Error joining call room:', error);
      socket.emit('call_error', {
        error: 'Failed to join call room',
        details: error.message,
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
        activeCalls[roomId].participants = activeCalls[roomId].participants.filter((id) => id !== userId);
      }

      socket.to(roomId).emit('user_left_call', {
        userId,
        timestamp: Date.now(),
      });

      socket.emit('left_call_room', {
        success: true,
        roomId,
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
        socketId: socket.id,
      };

      messages[roomId].push(chatMessage);

      console.log('💬 Chat message in room', roomId, ':', message.text);

      // Broadcast to room participants
      socket.to(roomId).emit('chat_message', chatMessage);

      // Confirm message sent
      socket.emit('message_sent', {
        success: true,
        messageId: message.id,
      });
    } catch (error) {
      console.error('❌ Error handling chat message:', error);
      socket.emit('message_error', {
        error: 'Failed to send message',
        details: error.message,
      });
    }
  });

  // Screen sharing events
  socket.on('screen_share_started', (data) => {
    const { roomId, userId } = data;
    console.log('🖥️ Screen sharing started by', userId, 'in room', roomId);

    socket.to(roomId).emit('screen_share_started', {
      userId,
      timestamp: Date.now(),
    });
  });

  socket.on('screen_share_stopped', (data) => {
    const { roomId, userId } = data;
    console.log('🖥️ Screen sharing stopped by', userId, 'in room', roomId);

    socket.to(roomId).emit('screen_share_stopped', {
      userId,
      timestamp: Date.now(),
    });
  });

  // Connection quality monitoring
  socket.on('connection_stats', (data) => {
    const { roomId, stats } = data;
    connectionStats[socket.id] = {
      ...stats,
      timestamp: Date.now(),
      roomId,
    };

    // Analyze and broadcast quality updates
    const quality = analyzeConnectionQuality(stats);
    socket.to(roomId).emit('connection_quality', {
      userId: activeUsers[socket.id]?.userId,
      quality,
      timestamp: Date.now(),
    });
  });

  // Enhanced FCM messaging
  socket.on('send_fcm_message', async (data) => {
    try {
      const { userId, roomId, callerName, callerId } = data;

      console.log('📞 FCM call request:', {
        userId,
        roomId,
        callerName,
        callerId,
        timestamp: new Date().toISOString(),
      });

      if (!userId || !roomId) {
        socket.emit('fcm_error', { error: 'userId and roomId are required' });
        return;
      }

      const finalCallerName = callerName || 'Unknown Caller';

      const result = await sendDataOnlyCallNotification(userId, roomId, finalCallerName);

      if (result.success) {
        socket.emit('fcm_sent', {
          success: true,
          userId,
          roomId,
          message: 'Call notification sent successfully',
        });

        // Also emit to other user devices
        const userSockets = users[userId]?.map((user) => user.socket_id) || [];
        userSockets.forEach((socketId) => {
          io.to(socketId).emit('incoming_call', {
            from: socket.id,
            room: roomId,
            callerName: finalCallerName,
            callerId,
          });
        });
      } else {
        socket.emit('fcm_error', {
          error: 'Failed to send FCM notification',
          userId,
          roomId,
        });
      }
    } catch (error) {
      console.error('❌ Error in send_fcm_message:', error);
      socket.emit('fcm_error', {
        error: 'Internal server error',
        details: error.message,
      });
    }
  });

  // Legacy call handling
  socket.on('make_call', (data) => {
    const { room, to, id } = data;
    console.log('📞 Legacy call to:', to, 'in room:', room, 'id:', id);

    const userSockets = users[id]?.map((user) => user.socket_id) || [];
    userSockets.forEach((socketId) => {
      io.to(socketId).emit('incoming_call', {
        from: socket.id,
        room,
        callerId: activeUsers[socket.id]?.userId,
      });
    });
  });

  // Call rejection handling
  socket.on('reject_all_caller', (data) => {
    const { room } = data;
    console.log('❌ Rejecting all calls in room:', room);

    const allSockets = Object.values(users).flat().map((user) => user.socket_id);
    allSockets.forEach((socketId) => {
      if (socketId !== socket.id) {
        io.to(socketId).emit('end_call', {
          from: socket.id,
          room,
        });
      }
    });
  });

  // End call request
  socket.on('request_end_call', (data) => {
    const { room, to } = data;

    if (!to) {
      console.error('❌ No recipient specified for end_call');
      return;
    }

    console.log('📞 Ending call for:', to, 'in room:', room);
    io.to(to).emit('end_call', { from: socket.id, room });
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
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
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
      users[userId] = users[userId]?.filter((user) => user.socket_id !== socket.id) || [];
      if (users[userId].length === 0) {
        delete users[userId];
      }
    }

    // Clean up active calls
    Object.keys(activeCalls).forEach((roomId) => {
      const call = activeCalls[roomId];
      if (call.participants.includes(userId)) {
        call.participants = call.participants.filter((id) => id !== userId);

        // End call if no participants left
        if (call.participants.length === 0) {
          delete activeCalls[roomId];
          delete rooms[roomId];
        } else {
          // Notify remaining participants
          io.to(roomId).emit('participant_disconnected', {
            userId,
            timestamp: Date.now(),
          });
          io.to(roomId).emit('end_call', { roomId });
        }
      }
    });

    // Remove from rooms
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);

      socket.to(roomId).emit('user-left', socket.id);

      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }

    // Update online users
    io.to('online_users').emit('online_user', users);
  });
});

server.listen(3000, () => {
  console.log('Signaling server running on port 3000');
});

// Helper function to analyze connection quality
function analyzeConnectionQuality(stats) {
  // Simplified quality analysis
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