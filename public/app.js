const socket = io();
const roomId = 'test-room'; // Room ID for the call

const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const startCallButton = document.getElementById('startCall');
const shareScreenButton = document.getElementById('shareScreen');

let localStream;
let screenStream;
const peerConnections = {}; // Store peer connections by userId
const servers = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302'
        }
    ]
};

// Join the room when the page loads
socket.emit('join-room', roomId);

// Start the video call (only for screen sharing)
startCallButton.addEventListener('click', async () => {
    // Get the screen sharing stream
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    localVideo.srcObject = screenStream;

    // Notify other users in the room
    socket.emit('start-call', { roomId });
});

// Listen for new user connections
socket.on('user-connected', (userId) => {
    console.log('User connected:', userId);
    createPeerConnection(userId);
});

// Listen for user disconnections
socket.on('user-disconnected', (userId) => {
    console.log('User disconnected:', userId);
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
        const remoteVideo = document.getElementById(userId);
        if (remoteVideo) remoteVideo.remove();
    }
});

// Create a peer connection for a new user
function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(servers);
    peerConnections[userId] = peerConnection;

    // Add screen stream tracks to the peer connection
    screenStream.getTracks().forEach(track => peerConnection.addTrack(track, screenStream));

    // Handle remote tracks
    peerConnection.ontrack = (event) => {
        if (!document.getElementById(userId)) {
            const remoteVideo = document.createElement('video');
            remoteVideo.id = userId;
            remoteVideo.classList.add('remoteVideo');
            remoteVideo.autoplay = true;
            remoteVideos.appendChild(remoteVideo);
        }
        const remoteVideo = document.getElementById(userId);
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('message', { roomId, candidate: event.candidate, to: userId });
        }
    };

    return peerConnection;
}

// Handle signaling messages
socket.on('message', async (data) => {
    const { from, offer, answer, candidate } = data;

    if (offer) {
        const peerConnection = createPeerConnection(from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('message', { roomId, answer, to: from });
    } else if (answer) {
        await peerConnections[from].setRemoteDescription(new RTCSessionDescription(answer));
    } else if (candidate) {
        await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Screen sharing functionality
shareScreenButton.addEventListener('click', async () => {
    if (!screenStream) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localVideo.srcObject = screenStream;

        // Replace the video track for all peers
        const screenTrack = screenStream.getTracks()[0];
        for (const userId in peerConnections) {
            const sender = peerConnections[userId]
                .getSenders()
                .find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
        }

        screenTrack.onended = () => {
            localVideo.srcObject = null;
        };
    }
});
