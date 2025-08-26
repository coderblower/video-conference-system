import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import videoPoster from '../../public/images/video_poster.jpg'; // Adjust path or use a local asset

function VideoCard({ title, stream, muted }) {
    return (
        <View style={styles.card}>
            {/* Video Section */}
            <View style={styles.videoContainer}>
                {stream ? (
                    <RTCView
                        streamURL={stream.toURL()}
                        style={styles.video}
                        objectFit="cover"
                    />
                ) : (
                    <Image
                        source={videoPoster} // Use a local image or URI
                        style={styles.poster}
                        resizeMode="cover"
                    />
                )}
            </View>

            {/* Title Section */}
            <View style={styles.titleContainer}>
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
    videoContainer: {
        flex: 4,
        width: '100%',
        height: '100%',
    },
    video: {
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
    },
    poster: {
        width: '100%',
        height: '100%',
    },
    titleContainer: {
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

export default VideoCard;
