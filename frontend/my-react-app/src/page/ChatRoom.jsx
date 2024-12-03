// App.js
import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import AudioCard from "../components/AudioCard";
import VideoCard from "../components/VideoCard";



// Socket connection
const socket = io("https://meeting.mges.global", {
    transports: ["websocket"],
});

const roomId = "test-room"; // Room ID for the call

const ChatRoom = () => {
    const localVideoRef = useRef(null);
    const [remoteVideos, setRemoteVideos] = useState({});
    const [localStream, setLocalStream] = useState(null);
    const [peerConnections, setPeerConnections ] = useState({})
    
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [userName, setUserName] = useState(window.localStorage.getItem('name') || null);
    
    

    // ICE servers configuration
    const servers = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }, // Public STUN server
            {
                urls: "turn:your.turn.server:3478", // Replace with your TURN server
                username: "yourUsername", // Replace with your TURN credentials
                credential: "yourPassword",
            },
        ],
    };

    // Join room
    

    useEffect(() => {
        
        socket.emit("join-room", roomId);


        socket.on("first_in_room", async () =>{
            const stream = await requestForStream();
            setLocalStream(stream);
            
            console.log("First in room");

 
        })
    
        socket.on("new-user", async (userId) => {
            
            console.log(`New user joined: ${userId}`);
            const peerConnection = await setupPeerConnection(userId);
    
          
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
            
            setRemoteVideos((prevVideos) => {
                const newVideos = { ...prevVideos };
                delete newVideos[userId];
                return newVideos;
            });

            setRemoteVideos((prevPeer)=>{
                const prevPeers = {...prevPeer};
                delete prevPeers[userId]; 
                return prevPeers;
            })
        });
    
        socket.on("message", async (data) => {
          const { from, offer, answer, candidate} = data;
      
          if (offer) {
              console.log("Received offer from", from);
              
              const peerConnection = await setupPeerConnection(from);
              
              // Set the remote description first when receiving an offer
              await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
              
              // Create an answer and set it as the local description
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              
              socket.emit("message", { roomId, to: from, answer });
          } else if (answer) {
              console.log("Received answer from", from);
              
              // Set the remote description only if it hasn't been set already
              if (peerConnections[from] && peerConnections[from].signalingState !== 'stable') {
                  await peerConnections[from].setRemoteDescription(new RTCSessionDescription(answer));
              }
          } else if (candidate) {
              console.log("Received ICE candidate from", from);
              
              if (peerConnections[from]) {
                  await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
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
    
    

    // Setup Peer Connection
    const setupPeerConnection = async (userId) => {
        const peerConnection = new RTCPeerConnection(servers);

        try {
            if (localStream) {
                localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
                console.log("Existing local stream tracks added to peer connection.");
            } else {
                const stream = await requestForStream();
                setLocalStream(stream);
                stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.muted = true;
                }
                console.log("New stream tracks added to peer connection.");
            }

            // Handle remote track
            peerConnection.ontrack = (event) => {
                console.log(`Received track from user: ${userId}`);
                if(!remoteVideos[userId]){

                    setRemoteVideos((prevVideos) => ({
                        ...prevVideos,
                        [userId]: {
                            userId: userId,
                            stream: event.streams[0] // Assign a proper key, e.g., "stream"
                        }
                    }));
                
               }
            
                
            };

            // Handle ICE candidate
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("Sending ICE candidate:", event.candidate);
                    socket.emit("message", {
                        roomId,
                        to: userId,
                        candidate: event.candidate,
                    });
                }
            };


           setPeerConnections((prev)=>({
                ...prev, [userId]: peerConnection
           }));

            return peerConnection;
        } catch (error) {
            console.error("Error in setting up peer connection:", error);
        }
    };

    // Create remote video element


    // Request media stream
   const requestForStream = async  () => {
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
  

    // Screen sharing functionality
    const handleScreenShare = async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace video track in peer connections
            Object.values(peerConnections).forEach((peerConnection) => {
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
                    Object.values(peerConnections).forEach((peerConnection) => {
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
            <p>{Object.keys(remoteVideos).length}</p>
            <p>{Object.keys(peerConnections).length}</p>
            {/* <div>
                <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "300px" }} />
            </div> */}

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                 {[<AudioCard title= "saiful" description="world" />, <AudioCard title= "saiful" description="world" />,<AudioCard title= "saiful" description="world" />,<AudioCard title= "saiful" description="world" />,<AudioCard title= "saiful" description="world" />, <VideoCard title="saiful" /> ]}
                 {Object.keys(remoteVideos).map((userId) => (

                    <AudioCard title={userId} />


                ))}
           </div>


           <button onClick={()=>setCount(Object.keys(remoteVideosRef.current).length)}> Show users </button>

            
        </div>
    );
};

export default ChatRoom;