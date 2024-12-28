import React, { useRef, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import avatar from '../../public/images/avatar.svg'; // You may need to adjust this path or use a local asset

function AudioCard({ title, stream, description, muted }) {
    const audioRef = useRef(null);

    useEffect(() => {
        if (audioRef.current && stream) {
            try {
                audioRef.current.srcObject = stream;
            } catch (error) {
                console.error("Error setting audio source:", error);
            }
        }
    }, [stream]);

    return (
        <View style={styles.card}>
            <View style={styles.imageContainer}>
                <Image
                    source={avatar} // Replace with a local image or URI if needed
                    style={styles.image}
                    resizeMode="cover"
                />
                {stream && (
                    <RTCView
                        streamURL={stream.toURL()}
                        style={styles.hiddenAudio}
                        objectFit="cover"
                    />
                )}
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.title}>{title}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 10,
        backgroundColor: '#8f8f8f63',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        flex: 1,
    },
    imageContainer: {
        flex: 4,
        width: '100%',
        height: '100%',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
    },
    hiddenAudio: {
        display: 'none',
    },
    textContainer: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#576c8dbd',
        textAlign: 'center',
        textTransform: 'uppercase',
    },
});

export default AudioCard;
