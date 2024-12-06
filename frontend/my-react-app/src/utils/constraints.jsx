export const servers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }, // Public STUN server
        {
            urls: "turn:your.turn.server:3478", // Replace with your TURN server
            username: "yourUsername", // Replace with your TURN credentials
            credential: "yourPassword",
        },
    ],
};