// App.js
import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import AudioCard from "../components/AudioCard";
import VideoCard from "../components/VideoCard";
import { useLocalStream } from '../context/localStreamContext.jsx';
import { useSetupPeerConnection } from '../services/peerConnection.jsx';
import { usePeerConnections } from "../context/PeerConnectionsContext.jsx";
import Chat from "../components/Chat.jsx"


import { streamService } from "../utils/helper";


// Socket connection
const socket = io('wss://meeting.mges.global', {
    transports: ["websocket", 'polling'],
});

const roomId = "test-room"; // Room ID for the call

const ChatRoom = () => {

    const setupPeerConnection = useSetupPeerConnection();
    
    const { remoteVideosRef, peerConnectionsRef } = usePeerConnections();
    const localVideoRef = useRef(null);
    const [remoteVideos, setRemoteVideos] = useState({});
    const { localStream, setLocalStream } = useLocalStream();
    
   
   

    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const [userName, setUserName] = useState(window.localStorage.getItem('name') || null);
    const [count, setCount] = useState('')
    
    


    useEffect(() => {
        const initialize = async () => {
            try {
                socket.emit("join-room", roomId);

                //  setupPeerConnection({
                //     userId:socket.id,
                //     socket,
                //     roomId,
                //     setRemoteVideos,
                // });

            
    
                // Socket event for when a new user joins
                socket.on("new-user", async (userId) => {
                    console.log(`New user joined: ${userId}`);
                    const peerConnection = await setupPeerConnection({
                        userId,
                        socket,
                        roomId,
                        setRemoteVideos,
                    });
    
                    peerConnection
                        .createOffer({
                            offerToReceiveAudio: true,
                            offerToReceiveVideo: true,
                        })
                        .then((offer) => peerConnection.setLocalDescription(offer))
                        .then(() => {
                            socket.emit("message", {
                                roomId,
                                to: userId,
                                offer: peerConnection.localDescription,
                            });
                        })
                        .catch((error) => {
                            console.error("Error creating an offer:", error);
                        });
                });
    
                // Socket event for when a user leaves
                socket.on("user-left", (userId) => {
                    
                    console.log(`User left: ${userId}`);
                    if (peerConnectionsRef.current[userId]) {
                        peerConnectionsRef.current[userId].close();
                        delete peerConnectionsRef.current[userId];
                    }
                    setRemoteVideos((prevVideos) => {
                        const newVideos = { ...prevVideos };
                        delete newVideos[userId];
                        return newVideos;
                    });
                });


                socket.on("hi-user", (userId) => {
                    
                    console.log(`Hi user : ${userId}`);
                   
                });
    
                // Socket event for handling messages (offers, answers, and ICE candidates)
                socket.on("message", async (data) => {
                    const { from, offer, answer, candidate } = data;
    
                    if (offer) {
                        console.log("Received offer from", from);
    
                        const peerConnection = await setupPeerConnection({
                            userId: from,
                            socket,
                            roomId,
                            setRemoteVideos,
                        });
    
                        // Set the remote description when receiving an offer
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
                        // Create an answer and set it as the local description
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
    
                        socket.emit("message", { roomId, to: from, answer });
                    } else if (answer) {
                        console.log("Received answer from", from);
    
                        // Set the remote description if not already stable
                        if (
                            peerConnectionsRef.current[from] &&
                            peerConnectionsRef.current[from].signalingState !== "stable"
                        ) {
                            await peerConnectionsRef.current[from].setRemoteDescription(
                                new RTCSessionDescription(answer)
                            );
                        }
                    } else if (candidate) {
                        console.log("Received ICE candidate from", from);
    
                        if (peerConnectionsRef.current[from]) {
                            await peerConnectionsRef.current[from].addIceCandidate(
                                new RTCIceCandidate(candidate)
                            );
                        }
                    }
                });
            } catch (error) {
                console.error("Error in useEffect:", error);
            }
        };
    
        initialize();
    
        // Clean up socket on component unmount
        return () => {
            socket.off("new-user");
            socket.off("user-left");
            socket.off("message");
        };
    }, []); // No dependencies to trigger it unnecessarily
    


    // Screen sharing functionality
    const handleScreenShare = async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace video track in peer connections
            Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
                const sender = peerConnection.getSenders().find((s) => s.track.kind === "video");
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });

            // Update local video stream
            setIsScreenSharing(true);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = screenStream;
            }

            // Revert to webcam when screen sharing stops
            screenTrack.onended = () => {
                setIsScreenSharing(false);
                if (localStream) {
                    const videoTrack = localStream.getVideoTracks()[0];
                    Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
                        const sender = peerConnection.getSenders().find((s) => s.track.kind === "video");
                        if (sender) {
                            sender.replaceTrack(videoTrack);
                        }
                    });
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                    }
                }
            };
        } catch (error) {
            console.error("Error sharing screen:", error);
        }
    };

    // Start video call
    const handleStartCall = async () => {
        try {
            const stream = await requestForStream();
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            socket.emit("ready", roomId);
        } catch (error) {
            console.error("Error accessing media devices:", error);
        }
    };

    
    const handleEndCall = () => {
        try {
            // Stop local media streams
   
       
    
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
                setLocalStream(null);
            }
    
            // Close all peer connections
            Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
                peerConnection.close();
            });
            peerConnectionsRef.current = {};
    
            // Clear remote videos
            setRemoteVideos({});
    
            // Leave the socket room
            socket.emit("leaveRoom", roomId);
    
            console.log("Call ended successfully");
        } catch (error) {
            console.error("Error ending call:", error);
        }
    };
    
 
    return (
        <div>
            <h1></h1>
            <p>{count}</p>
            {/* <div>
                <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "300px" }} />
            </div> */}

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
                
                { localStream  && (()=>{
                    
                    const hasVideoTrack = localStream?.getVideoTracks()?.length > 0;
                    
                    return hasVideoTrack ? (
                    <VideoCard key={userName} stream={localStream} muted = {true} title={`Video - ${userName}`} />
                    ) : (
                    <AudioCard key={userName} stream={localStream} muted = {true} title={`Audio - ${userName}`} description="No video available" />
                    );
                })()}
                 
                 
                {Object.keys(remoteVideos).map((userId) => {
                    const userStreams = remoteVideosRef.current[userId];
                    const hasVideoTrack = userStreams && userStreams.video; // Check for video explicitly

                    return hasVideoTrack ? (
                        <VideoCard key={userId} stream={userStreams.video} title={`Video - ${userId}`} />
                    ) : (
                        <AudioCard key={userId} stream={userStreams.audio} title={`Audio - ${userId}`} description="No video available" />
                    );
                })}

           </div>

              
        {localStream && (<div className=""         style={{
                                                    position: 'fixed',
                                                    bottom: 0,
                                                    left: '50%',
                                                    transform: 'translate(-50%, 0)', // Adjust for centering horizontally only
                                                    background: '#000',
                                                    height: '50px',
                                                    width: '60%', // Optional if you want it to stretch across the screen
                                                    display: 'flex',
                                                    alignItems: 'center', // Centers content vertically
                                                    justifyContent: 'space-around', // Centers content horizontally
                                                    color: '#fff', // Optional, for visibility
                                                    }}>

            <div onClick={handleEndCall} style={{cursor:'pointer'}}> call end </div> 

            <div> mute </div>
        </div>)}
            
        </div>
    );
};

export default ChatRoom;
