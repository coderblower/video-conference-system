const {Server} = require('socket.io');
const { sendCallNotification } = require('../helpers/fcmHelper');

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


        socket.on('make_call', (data) => {

            
            const { room, to, id  } = data; 

            console.log('Making call to:', to, 'in room:', room, 'id :', id);
            // call to all users[id] array
            const userSockets = users[id]?.map(user => user.socket_id) || [];
            userSockets.forEach(socketId => {
                io.to(socketId).emit('incoming_call', { from: socket.id, room });
            });


        });

        socket.on('send_fcm_message', (data) => {
            const { to, title, body, roomId } = data;

            // Find the user's device token
            const user = Object.values(users).flat().find(user => user.socket_id === to);
            if (user) {
                sendCallNotification(user.id, title, body, { roomId });
            }
        });

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
