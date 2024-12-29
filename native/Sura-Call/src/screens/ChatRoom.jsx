import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Button, FlatList, Text } from "react-native";
import io from "socket.io-client";
import AudioCard from "../components/AudioCard";
import VideoCard from "../components/VideoCard";
import { useLocalStream } from "../context/localStreamContext.jsx";
import { useSetupPeerConnection } from "../services/peerConnection.jsx";
import { usePeerConnections } from "../context/PeerConnectionsContext.jsx";
import Chat from "../components/Chat.jsx";
import { RTCView } from "react-native-webrtc";

// Socket connection
const socket = io("wss://meeting.mges.global", {
  transports: ["websocket", "polling"],
});

const roomId = "test-room"; // Room ID for the call

const ChatRoom = () => {
  const setupPeerConnection = useSetupPeerConnection();
  const { remoteVideosRef, peerConnectionsRef } = usePeerConnections();
  const localVideoRef = useRef(null);
  const [remoteVideos, setRemoteVideos] = useState({});
  const { localStream, setLocalStream } = useLocalStream();
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [userName, setUserName] = useState(null);
  const [count, setCount] = useState("");

  useEffect(() => {
    // Join room
    socket.emit("join-room", roomId);

    // Listen for new users
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
        .catch((error) => console.error("Error creating an offer:", error));
    });

    // Handle user leaving
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

    // Handle signaling messages
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

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("message", { roomId, to: from, answer });
      } else if (answer) {
        console.log("Received answer from", from);
        if (peerConnectionsRef.current[from]?.signalingState !== "stable") {
          await peerConnectionsRef.current[from].setRemoteDescription(new RTCSessionDescription(answer));
        }
      } else if (candidate) {
        console.log("Received ICE candidate from", from);
        await peerConnectionsRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off("new-user");
      socket.off("user-left");
      socket.off("message");
    };
  }, []);

  const handleStartCall = async () => {
    try {
      const stream = await requestForStream();
      setLocalStream(stream);
      setUserName(localStorage.getItem("name") || "You");
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Count Users */}
      <Text style={styles.count}>{count}</Text>

      {/* Local Video */}
      {localStream && (() => {
        const hasVideoTrack = localStream?.getVideoTracks()?.length > 0;
        return hasVideoTrack ? (
          <VideoCard key={userName} stream={localStream} muted={true} title={`Video - ${userName}`} />
        ) : (
          <AudioCard key={userName} stream={localStream} muted={true} title={`Audio - ${userName}`} description="No video available" />
        );
      })()}

      {/* Remote Videos */}
      <FlatList
        data={Object.keys(remoteVideosRef.current)}
        renderItem={({ item: userId }) => {
          const userStreams = remoteVideosRef.current[userId];
          const hasVideoTrack = userStreams?.video;

          return hasVideoTrack ? (
            <VideoCard key={userId} stream={userStreams.video} title={`Video - ${userId}`} />
          ) : (
            <AudioCard key={userId} stream={userStreams.audio} title={`Audio - ${userId}`} description="No video available" />
          );
        }}
        keyExtractor={(userId) => userId}
      />

      {/* Chat */}
      <Chat roomId={roomId} socket={socket} userId={userName} />

      {/* Buttons */}
      <Button title="Start Call" onPress={handleStartCall} />
      <Button title="Show Users" onPress={() => setCount(Object.keys(remoteVideosRef.current).join(", "))} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  count: {
    textAlign: "center",
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
  },
});

export default ChatRoom;
