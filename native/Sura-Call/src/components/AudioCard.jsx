import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import avatar from "../../assets/images/avatar.png"; // Replace with a valid local path or asset
import { MediaStream, RTCView } from "react-native-webrtc";

const AudioCard = ({ title, stream, description, muted }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      // Attach the audio stream to the audio ref (only works in the browser for WebRTC)
      try {
        if (stream instanceof MediaStream) {
          audioRef.current.srcObject = stream;
          audioRef.current.muted = muted;
        }
      } catch (error) {
        console.error("Error playing audio:", error);
      }
    }
  }, [stream]);

  return (
    <View style={styles.card}>
      {/* Avatar or Placeholder */}
      <View style={styles.avatarContainer}>
        <Image source={avatar} style={styles.avatar} resizeMode="contain" />
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#8f8f8f63",
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
    flexDirection: "column",
    margin: 10,
  },
  avatarContainer: {
    flex: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  avatar: {
    width: "100%",
    height: 150,
  },
  titleContainer: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#576c8dbd",
    textTransform: "uppercase",
    textAlign: "center",
  },
});

export default AudioCard;
