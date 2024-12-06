import React, { useState, useEffect, useRef } from "react";


function Chat({ roomId, userId, socket }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const messageInputRef = useRef();

  // Join room when the component is mounted
  useEffect(() => {
    // Notify the server that the user joined a specific room
    

    socket.on("load-old_mesage", (message)=>{
      console.log(message)
      message.forEach(x=>{
        setMessages((prevMessages) => [...prevMessages, x]);
      })
    })

    // Listen for incoming chat messages from other users in the room
    socket.on("chat-message", (message) => {
      console.log('from server ');
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    // Cleanup on unmount
    return () => {
      socket.off("chat-message");
    };
  }, [roomId, userId]);

  // Handle sending a new message
  const sendMessage = () => {
    if (message.trim()) {
      const newMessage = { userId, message };
      // Emit the message to the server
      socket.emit("chat-message", roomId, newMessage);

      // Add the message to the local state (for UI rendering)
      

      // Clear the input field after sending
      setMessage("");
    }
  };

  return (
    <div className="chat-room">
      <div className="chat-header">
        <h2>Chat Room - {roomId}</h2>
      </div>

      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className="message">
            <strong>{msg.userId}: </strong>{msg.message}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          ref={messageInputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;
