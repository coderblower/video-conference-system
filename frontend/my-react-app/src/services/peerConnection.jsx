import { usePeerConnections } from "../context/PeerConnectionsContext.jsx";
import { servers } from "../utils/constraints";
import { addLocalStream } from "../utils/helper";
import { useLocalStream } from '../context/localStreamContext';

export const useSetupPeerConnection = () => {
    const { remoteVideosRef, peerConnectionsRef } = usePeerConnections();
    const { localStream, setLocalStream } = useLocalStream();

    const setupPeerConnection = async ({
        userId,
        socket,
        roomId,
        setRemoteVideos,
    }) => {
        


        let peerConnection = new RTCPeerConnection(servers);

        try {
            peerConnection = await addLocalStream({peerConnection, localStream, setLocalStream });
        } catch (error) {
            console.error("Error in handling stream:", error);
        }

        // Handle remote track
        peerConnection.ontrack = (event) => {
            console.log(`Received ${event.track.kind} track from user: ${userId}`);
        
            // Check if the `userId` already exists in `remoteVideosRef`
            if (!remoteVideosRef.current[userId]) {
                remoteVideosRef.current[userId] = {
                    video: null,
                    audio: null,
                };
            }
        
            // Handle the track based on its type
            if (event.track.kind === 'video') {
                remoteVideosRef.current[userId].video = event.streams[0];
            } else if (event.track.kind === 'audio') {
                remoteVideosRef.current[userId].audio = event.streams[0];
            }
        
            // Update the state to trigger re-rendering
            setRemoteVideos((prev) => ({
                ...prev,
                [userId]: {
                    video: remoteVideosRef.current[userId].video,
                    audio: remoteVideosRef.current[userId].audio,
                },
            }));
        };
        // Handle ICE candidate
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate:", event.candidate);
                if (socket) {
                    socket.emit("message", {
                        roomId,
                        to: userId,
                        candidate: event.candidate,
                    });
                } else {
                    console.error("Socket is not available.");
                }
            }
        };

        peerConnectionsRef.current[userId] = peerConnection;
        return peerConnection;
    };

    return setupPeerConnection;
};
