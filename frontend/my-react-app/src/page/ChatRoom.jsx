// App.js
import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import AudioCard from "../components/AudioCard";
import VideoCard from "../components/VideoCard";
import { useLocalStream } from '../context/localStreamContext.jsx';
import { useSetupPeerConnection } from '../services/peerConnection.jsx';
import { usePeerConnections } from "../context/PeerConnectionsContext.jsx";
import Chat from "../components/Chat.jsx"


// Socket connection
const socket = io("http://meeting.mges.global", {
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
        
        socket.emit("join-room", roomId);

  
    
        socket.on("new-user", async (userId) => {
            
           
            console.log(`New user joined: ${userId}`);
            const peerConnection = await setupPeerConnection({
                userId,
                socket,
                roomId,
                setRemoteVideos
            });

    
          
            peerConnection.createOffer().then((offer) => {
                return peerConnection.setLocalDescription(offer);
            }).then(() => {
                socket.emit("message", {
                    roomId,
                    to: userId,
                    offer: peerConnection.localDescription
                });
            }).catch((error) => {
                console.error("Error creating an offer:", error);
            });
        });
    
        
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
    
        socket.on("message", async (data) => {
          const { from, offer, answer, candidate } = data;
      
          if (offer) {
              console.log("Received offer from", from);
              
              const peerConnection = await setupPeerConnection( {
                userId:from,
                socket,
                roomId,
                setRemoteVideos
            } );
              
              // Set the remote description first when receiving an offer
              await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
              
              // Create an answer and set it as the local description
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              
              socket.emit("message", { roomId, to: from, answer });
          } else if (answer) {
              console.log("Received answer from", from);
              
              // Set the remote description only if it hasn't been set already
              if (peerConnectionsRef.current[from] && peerConnectionsRef.current[from].signalingState !== 'stable') {
                  await peerConnectionsRef.current[from].setRemoteDescription(new RTCSessionDescription(answer));
              }
          } else if (candidate) {
              console.log("Received ICE candidate from", from);
              
              if (peerConnectionsRef.current[from]) {
                  await peerConnectionsRef.current[from].addIceCandidate(new RTCIceCandidate(candidate));
              }
          }
      });
      
    
        // Clean up socket on component unmount
        return () => {
            socket.off("new-user");
            socket.off("user-left");
            socket.off("message");
        };
    }, []);  // No dependencies to trigger it unnecessarily
 


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

 
    return (
        <div>
            <h1></h1>
            <p>{count}</p>
            {/* <div>
                <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "300px" }} />
            </div> */}

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                
                {localStream && (()=>{
                    
                    const hasVideoTrack = localStream?.getVideoTracks()?.length > 0;
                    
                    return hasVideoTrack ? (
                    <VideoCard key={userName} stream={localStream} muted = {true} title={`Video - ${userName}`} />
                    ) : (
                    <AudioCard key={userName} stream={localStream} muted = {true} title={`Audio - ${userName}`} description="No video available" />
                    );
                })()}
                 
                 
                 {Object.keys(remoteVideos).map((userId) => {
                    
                    
                    const stream = remoteVideos[userId];
                    const hasVideoTrack = stream?.getVideoTracks()?.length > 0;

                    return hasVideoTrack ? (
                    <VideoCard key={userId} stream={stream} title={`Video - ${userId}`} />
                    ) : (
                    <AudioCard key={userId} stream={stream} title={`Audio - ${userId}`} description="No video available" />
                    );
                                } )}
           </div>

                 <Chat roomId={roomId} socket={socket} userId={userName}  />               

           <button onClick={()=>setCount(Object.keys(remoteVideosRef.current).join` new :   -> `)}> Show users </button>

            
        </div>
    );
};

export default ChatRoom;
