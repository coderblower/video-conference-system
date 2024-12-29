

const socket = io('wss://meeting.mges.global', {
    transports: ['websocket', 'polling']
});
const roomId = 'test-room'; // Room ID for the call

var localVideo = document.getElementById('localVideo');


const mainVideo = document.getElementById('mainVideo');
const startCallButton = document.getElementById('startCall');
const shareScreenButton = document.getElementById('shareScreen');

var localStream;
const peerConnections = {}; // Map of peer connections per user
const remoteVideos = {}; // Map of video elementhttp://localhost:3000/s per user

// ICE servers configuration
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Public STUN server
        {
            urls: 'turn:your.turn.server:3478', // Replace with your TURN server
            username: 'yourUsername', // Replace with your TURN credentials
            credential: 'yourPassword'
        }
    ]
};

// Join the room when the page loads
socket.emit('join-room', roomId);

// Handle new user joining
socket.on('new-user', async (userId) => {
    console.log(`New user joined: ${userId}`);
    const peerConnection = await setupPeerConnection(userId);

    // Create and send offer to the new peer
    peerConnection.createOffer().then((offer) => {
        return peerConnection.setLocalDescription(offer);
    }).then(() => {
        socket.emit('message', {
            roomId,
            to: userId,
            offer: peerConnection.localDescription
        });
    }).catch((error) => {
        console.error('Error creating an offer:', error);
    });
});

// Remove user when they leave
socket.on('user-left', (userId) => {
    console.log(`User left: ${userId}`);
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    if (remoteVideos[userId]) {
        remoteVideosContainer.removeChild(remoteVideos[userId]);
        delete remoteVideos[userId];
    }
});

// Start the video call
startCallButton.addEventListener('click', async () => {
    try {
        if (!localStream) {
            
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            
        }
        localVideo.srcObject = localStream;

        // Notify others you're ready
        socket.emit('ready', roomId);
    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
});

// Handle incoming messages (offer/answer/ICE candidates)
socket.on('message', async (data) => {
    const { from, offer, answer, candidate } = data;

    if (offer) {
        console.log('Received offer from', from);
        const peerConnection = await setupPeerConnection(from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('message', { roomId, to: from, answer });
    } else if (answer) {
        console.log('Received answer from', from, peerConnections[from]);
        if (peerConnections[from]) {
            await peerConnections[from].setRemoteDescription(new RTCSessionDescription(answer));
        }
    } else if (candidate) {
        console.log('Received ICE candidate from', from);
        if (peerConnections[from]) {
            await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
        }
    }
});

// Screen sharing functionality
shareScreenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in peer connections
        Object.values(peerConnections).forEach((peerConnection) => {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });

        // Show the screen share on local video
        localVideo.srcObject = screenStream;

        // Revert to webcam when screen sharing stops
        screenTrack.onended = () => {
            Object.values(peerConnections).forEach((peerConnection) => {
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(localStream.getVideoTracks()[0]);
                }
            });
            localVideo.srcObject = localStream;
        };
    } catch (error) {
        console.error('Error sharing screen:', error);
    }
});

async function setupPeerConnection(userId) {
    let peerConnection = new RTCPeerConnection(servers);

    try {
    
        
      peerConnection =  await addLocalStream(peerConnection);
        

    } catch (error) {
        console.error('Error in handling stream:', error);
    }
   

    // Handle remote track
    peerConnection.ontrack = (event) => {
        console.log(`Received track from user: ${userId}`);
        if (!remoteVideos[userId]) {
            remoteVideos[userId] = createRemoteVideoElement(userId);
        }
        remoteVideos[userId][0].srcObject = event.streams[0];
    };

    // Handle ICE candidate
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('message', {
                roomId,
                to: userId,
                candidate: event.candidate
            });
        }
    };

    peerConnections[userId] = peerConnection;
    return peerConnection;
}

// Create a new video element for a remote user
function createRemoteVideoElement(userId) {
    const $remoteVideosContainer = $('#remoteVideosContainer');
    console.dir($remoteVideosContainer);
    const $slide = $('<div class="swiper-slide"></div>');
    const $videoElement = $(`<video id="remoteVideo-${userId}" ></video>`).attr('autoplay', true).attr('muted', false);
    $videoElement[0].playsInline = true; 

    $slide.append($videoElement);

   
    $remoteVideosContainer.append($slide);
    return $videoElement;
}

async function requestForStream() {
    try {
        // Check for available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        let hasVideo = false;
        let hasAudio = false;

        // Loop through devices to check for video and audio
        devices.forEach(device => {
            if (device.kind === 'audioinput') {
                hasAudio = true;
            }
            if (device.kind === 'videoinput') {
                hasVideo = true;
            }
        });

        // Set the media constraints based on available devices
        const constraints = {
            audio: hasAudio,   // Only request audio if audio device exists
            video: hasVideo    // Only request video if video device exists
        };

        // Request the media stream with the selected constraints
        if (hasAudio || hasVideo) {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Handle the case where only audio is available
            if (!hasVideo && hasAudio) {
                console.log('Only audio stream available');
                // You can display a remote avatar here for users without video
            }

            // Handle the stream as needed
            return stream; // Return the stream to the caller
        } else {
            console.log('No audio or video available');
            return null; // No devices available
        }
    } catch (err) {
        console.error('Error getting user media: ', err);
        return null; // Return null in case of error
    }
}


function  displayAvatar(){
    if (localVideo) {
        localVideo.srcObject = null; // Clear any existing stream
        localVideo.poster = './avatar.png'; // Set the avatar image
        localVideo.style.background = 'url(./avatar-bg.webp) center / cover no-repeat';
        localVideo.style.display = 'block'; // Ensure the video tag is visible
    }
}




async function addLocalStream(peerConnection){
       // Check if `localStream` already exists
       if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        console.log('Existing local stream tracks added to peer connection.');

        return peerConnection;
    }

    // Check if the stream is marked as 'no stream'
    // if (localStream === 'no stream') {
    //     displayAvatar();
    //     console.log('Displaying avatar as no stream is available.');
    //     return;
    // }

    // Request a new stream
    const stream = await requestForStream();

    if (!stream) {
        console.log('No stream available. Displaying avatar instead.');
        displayAvatar();
        return;
    }

    // Assign the stream to the local video element if it exists
    if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.muted = false; // Prevent audio feedback
        console.log('Local stream loaded into video element.');
    }

    // Add the stream tracks to the peer connection
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
    console.log('New stream tracks added to peer connection.');

    // Store the stream globally
    localStream = stream;

    return peerConnection;
}