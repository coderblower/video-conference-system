import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Button, FlatList } from "react-native";
import { RTCView } from "react-native-webrtc"; // WebRTC view for video streams
import io from "socket.io-client";
import AudioCard from "../components/AudioCard";
import VideoCard from "../components/VideoCard";
import { useLocalStream } from "../context/localStreamContext";
import { useSetupPeerConnection } from "../services/peerConnection";
import { usePeerConnections } from "../context/PeerConnectionsContext";
import Chat from "../components/Chat";

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
  const [userName, setUserName] = useState("User"); // Replace with storage or dynamic name
  const [count, setCount] = useState("");

  useEffect(() => {
    // Join room
    socket.emit("join-room", roomId);

    // Handle new user joining
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
        .catch((error) => console.error("Error creating offer:", error));
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
          await peerConnectionsRef.current[from].addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    });

    // Clean up on unmount
    return () => {
      socket.off("new-user");
      socket.off("user-left");
      socket.off("message");
    };
  }, []);

  const handleStartCall = async () => {
    try {
      const stream = await requestForStream(); // Replace with actual stream request logic
      setLocalStream(stream);
      socket.emit("ready", roomId);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Chat Room</Text>
      <Text style={styles.counter}>{count}</Text>

      <View style={styles.videoContainer}>
        {localStream && (
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localVideo}
          />
        )}

        <FlatList
          data={Object.keys(remoteVideos)}
          keyExtractor={(userId) => userId}
          renderItem={({ item: userId }) => {
            const userStreams = remoteVideos[userId];
            const hasVideoTrack = userStreams && userStreams.video;

            return hasVideoTrack ? (
              <VideoCard stream={userStreams.video} title={`Video - ${userId}`} />
            ) : (
              <AudioCard
                stream={userStreams.audio}
                title={`Audio - ${userId}`}
                description="No video available"
              />
            );
          }}
        />
      </View>

      <Chat roomId={roomId} socket={socket} userId={userName} />

      <Button title="Show Users" onPress={() => setCount(Object.keys(remoteVideos).join(" -> "))} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },
  counter: {
    textAlign: "center",
    marginVertical: 8,
  },
  videoContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  localVideo: {
    width: 150,
    height: 150,
    backgroundColor: "#000",
  },
});

export default ChatRoom;
