const socket = io();
const roomId = 'test-room'; // Room ID for the call

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');
const shareScreenButton = document.getElementById('shareScreen');
const switchToCameraButton = document.getElementById('switchToCamera');

let localStream;
let remoteStream;
let peerConnection;
let screenStream;
let currentStream = 'camera'; // Tracks current stream (camera/screen)

const servers = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302' // Google's public STUN server
        }
    ]
};

// Join the room when the page loads
socket.emit('join-room', roomId);

// Start video call
startCallButton.addEventListener('click', startCall);
async function startCall() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Create the peer connection
    peerConnection = new RTCPeerConnection(servers);

    // Add local stream to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Set up remote stream handling
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        }
    };

    // Handle ICE candidate exchange
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('message', { roomId, candidate: event.candidate });
        }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('message', { roomId, offer });
}

// Handle incoming messages (offer/answer/ICE candidates)
socket.on('message', async (data) => {
    if (data.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Create answer and send back
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('message', { roomId, answer });
    } else if (data.answer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Screen sharing functionality
shareScreenButton.addEventListener('click', async () => {
    if (currentStream === 'camera') {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localVideo.srcObject = screenStream;

        // Replace the local video track with the screen sharing track
        const screenTrack = screenStream.getTracks()[0];
        const videoTrack = localStream.getVideoTracks()[0];
        peerConnection.removeTrack(videoTrack);
        peerConnection.addTrack(screenTrack, screenStream);
        currentStream = 'screen'; // Update current stream type

        screenTrack.onended = () => {
            switchToCamera(); // Automatically switch back to camera when screen sharing ends
        };
    }
});

// Switch back to camera
switchToCameraButton.addEventListener('click', switchToCamera);
function switchToCamera() {
    if (currentStream === 'screen') {
        // Stop the screen sharing track
        const screenTrack = screenStream.getTracks()[0];
        screenTrack.stop();

        // Add the camera track back to the peer connection
        const videoTrack = localStream.getVideoTracks()[0];
        peerConnection.removeTrack(screenTrack);
        peerConnection.addTrack(videoTrack, localStream);
        localVideo.srcObject = localStream;
        currentStream = 'camera'; // Update current stream type
    }
}
