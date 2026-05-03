/* eslint-disable react/prop-types, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import io from "socket.io-client";
import { Device } from "mediasoup-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const ROOM_CAPACITY = 4;

function ChatRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const deviceRef = useRef(null);
    const sendTransportRef = useRef(null);
    const recvTransportRef = useRef(null);
    const localParticipantIdRef = useRef(null);
    const consumersRef = useRef(new Map());
    const consumedProducerIdsRef = useRef(new Set());
    const remotePeerMediaRef = useRef({});
    const baseStreamRef = useRef(null);
    const activeStreamRef = useRef(null);
    const audioProducerRef = useRef(null);
    const videoProducerRef = useRef(null);

    const [participants, setParticipants] = useState([]);
    const [remoteStreams, setRemoteStreams] = useState({});
    const [localStream, setLocalStream] = useState(null);
    const [displayName] = useState(() => localStorage.getItem("video-call-name") || "");
    const [isConnecting, setIsConnecting] = useState(true);
    const [isJoined, setIsJoined] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [error, setError] = useState("");

    const remoteParticipantCards = useMemo(
        () => participants.filter((participant) => participant.id !== localParticipantIdRef.current),
        [participants]
    );

    useEffect(() => {
        if (!displayName.trim()) {
            navigate("/");
            return;
        }

        let isMounted = true;

        const initialize = async () => {
            try {
                const stream = await getUserMediaStream();
                if (!isMounted) {
                    stopStream(stream);
                    return;
                }

                baseStreamRef.current = stream;
                activeStreamRef.current = stream;
                setLocalStream(stream);
                syncLocalTrackState(stream, isMicOn, isCameraOn);

                const socket = io(SOCKET_URL, {
                    transports: ["websocket", "polling"],
                });
                socketRef.current = socket;

                socket.on("mediasoup-room:participants", ({ participants: roomParticipants }) => {
                    setParticipants(roomParticipants);
                });

                socket.on("mediasoup-room:user-left", ({ participantId }) => {
                    cleanupRemotePeer(participantId);
                });

                socket.on("mediasoup-room:new-producer", async ({ producerId, peerId }) => {
                    if (!recvTransportRef.current || peerId === localParticipantIdRef.current) {
                        return;
                    }

                    await consumeProducer(producerId, peerId);
                });

                socket.on("mediasoup-room:producer-closed", ({ consumerId, producerId }) => {
                    closeConsumer(consumerId, producerId);
                });

                socket.on("disconnect", () => {
                    if (!isMounted) {
                        return;
                    }

                    setError("Disconnected from signaling server.");
                });

                socket.on("connect", async () => {
                    try {
                        const joinResponse = await requestSocket("mediasoup-room:join", {
                            roomId,
                            joinKey: roomId,
                            name: displayName.trim(),
                        });

                        if (!joinResponse.ok) {
                            throw new Error(joinResponse.error || "Failed to join room.");
                        }

                        localParticipantIdRef.current = joinResponse.participantId;
                        setParticipants(joinResponse.participants);

                        const device = new Device();
                        await device.load({ routerRtpCapabilities: joinResponse.routerRtpCapabilities });
                        deviceRef.current = device;

                        sendTransportRef.current = await createSendTransport();
                        recvTransportRef.current = await createRecvTransport();

                        await produceLocalMedia();
                        await hydrateExistingProducers();
                        emitMediaState(isMicOn, isCameraOn, false);

                        setIsJoined(true);
                        setIsConnecting(false);
                        setError("");
                    } catch (joinError) {
                        console.error("mediasoup join failed:", joinError);
                        setError(joinError.message || "Failed to connect to the room.");
                        setIsConnecting(false);
                    }
                });
            } catch (mediaError) {
                console.error("Local media failed:", mediaError);
                if (isMounted) {
                    setError("Camera or microphone access failed. Check browser permissions.");
                    setIsConnecting(false);
                }
            }
        };

        initialize();

        return () => {
            isMounted = false;
            leaveRoom();
        };
    }, []);

    const requestSocket = (eventName, payload) => {
        return new Promise((resolve, reject) => {
            if (!socketRef.current) {
                reject(new Error("Socket is not connected."));
                return;
            }

            socketRef.current.emit(eventName, payload, (response) => {
                if (!response) {
                    reject(new Error(`No response for ${eventName}`));
                    return;
                }

                resolve(response);
            });
        });
    };

    const createSendTransport = async () => {
        const response = await requestSocket("mediasoup-room:create-transport", {
            roomId,
            direction: "send",
        });

        if (!response.ok) {
            throw new Error(response.error || "Failed to create send transport.");
        }

        const transport = deviceRef.current.createSendTransport(response.params);

        transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
            try {
                const result = await requestSocket("mediasoup-room:connect-transport", {
                    transportId: transport.id,
                    dtlsParameters,
                });

                if (!result.ok) {
                    throw new Error(result.error || "Transport connection failed.");
                }

                callback();
            } catch (transportError) {
                errback(transportError);
            }
        });

        transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
                const result = await requestSocket("mediasoup-room:produce", {
                    roomId,
                    transportId: transport.id,
                    kind,
                    rtpParameters,
                    appData,
                });

                if (!result.ok) {
                    throw new Error(result.error || "Producer creation failed.");
                }

                callback({ id: result.producerId });
            } catch (produceError) {
                errback(produceError);
            }
        });

        return transport;
    };

    const createRecvTransport = async () => {
        const response = await requestSocket("mediasoup-room:create-transport", {
            roomId,
            direction: "recv",
        });

        if (!response.ok) {
            throw new Error(response.error || "Failed to create receive transport.");
        }

        const transport = deviceRef.current.createRecvTransport(response.params);
        transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
            try {
                const result = await requestSocket("mediasoup-room:connect-transport", {
                    transportId: transport.id,
                    dtlsParameters,
                });

                if (!result.ok) {
                    throw new Error(result.error || "Receive transport connection failed.");
                }

                callback();
            } catch (transportError) {
                errback(transportError);
            }
        });

        return transport;
    };

    const produceLocalMedia = async () => {
        const audioTrack = baseStreamRef.current?.getAudioTracks()?.[0] || null;
        const videoTrack = activeStreamRef.current?.getVideoTracks()?.[0] || null;

        if (audioTrack && !audioProducerRef.current) {
            audioProducerRef.current = await sendTransportRef.current.produce({
                track: audioTrack,
                appData: { source: "microphone" },
            });
        }

        if (videoTrack && !videoProducerRef.current) {
            videoProducerRef.current = await sendTransportRef.current.produce({
                track: videoTrack,
                appData: { source: isScreenSharing ? "screen" : "camera" },
            });
        }
    };

    const hydrateExistingProducers = async () => {
        const response = await requestSocket("mediasoup-room:get-producers", { roomId });
        if (!response.ok) {
            throw new Error(response.error || "Failed to load room producers.");
        }

        for (const producer of response.producers) {
            await consumeProducer(producer.producerId, producer.peerId);
        }
    };

    const consumeProducer = async (producerId, peerId) => {
        if (!recvTransportRef.current || consumedProducerIdsRef.current.has(producerId)) {
            return;
        }

        const response = await requestSocket("mediasoup-room:consume", {
            roomId,
            transportId: recvTransportRef.current.id,
            producerId,
            rtpCapabilities: deviceRef.current.rtpCapabilities,
        });

        if (!response.ok) {
            return;
        }

        const consumer = await recvTransportRef.current.consume({
            id: response.params.id,
            producerId: response.params.producerId,
            kind: response.params.kind,
            rtpParameters: response.params.rtpParameters,
        });

        consumersRef.current.set(consumer.id, {
            consumer,
            producerId,
            peerId: response.params.producerPeerId || peerId,
        });
        consumedProducerIdsRef.current.add(producerId);

        const targetPeerId = response.params.producerPeerId || peerId;
        const remoteEntry = getOrCreateRemotePeer(targetPeerId);
        remoteEntry.stream.addTrack(consumer.track);
        remoteEntry.consumerIds.add(consumer.id);

        setRemoteStreams((previous) => ({
            ...previous,
            [targetPeerId]: remoteEntry.stream,
        }));

        await requestSocket("mediasoup-room:resume-consumer", {
            consumerId: consumer.id,
        });

        consumer.on("transportclose", () => {
            closeConsumer(consumer.id, producerId);
        });
    };

    const getOrCreateRemotePeer = (peerId) => {
        if (!remotePeerMediaRef.current[peerId]) {
            remotePeerMediaRef.current[peerId] = {
                stream: new MediaStream(),
                consumerIds: new Set(),
            };
        }

        return remotePeerMediaRef.current[peerId];
    };

    const closeConsumer = (consumerId, producerId) => {
        const consumerEntry = consumersRef.current.get(consumerId);
        if (!consumerEntry) {
            return;
        }

        const { consumer, peerId } = consumerEntry;
        const remoteEntry = remotePeerMediaRef.current[peerId];
        if (remoteEntry) {
            remoteEntry.stream.removeTrack(consumer.track);
            remoteEntry.consumerIds.delete(consumerId);

            if (remoteEntry.consumerIds.size === 0) {
                delete remotePeerMediaRef.current[peerId];
                setRemoteStreams((previous) => {
                    const next = { ...previous };
                    delete next[peerId];
                    return next;
                });
            } else {
                setRemoteStreams((previous) => ({
                    ...previous,
                    [peerId]: remoteEntry.stream,
                }));
            }
        }

        consumer.close();
        consumersRef.current.delete(consumerId);
        consumedProducerIdsRef.current.delete(producerId);
    };

    const cleanupRemotePeer = (peerId) => {
        const remoteEntry = remotePeerMediaRef.current[peerId];
        if (remoteEntry) {
            remoteEntry.consumerIds.forEach((consumerId) => {
                const consumerRecord = consumersRef.current.get(consumerId);
                consumerRecord?.consumer.close();
                consumersRef.current.delete(consumerId);
            });

            delete remotePeerMediaRef.current[peerId];
        }

        setRemoteStreams((previous) => {
            const next = { ...previous };
            delete next[peerId];
            return next;
        });
    };

    const emitMediaState = (audioEnabled, videoEnabled, screenSharing) => {
        socketRef.current?.emit("mediasoup-room:media-state", {
            roomId,
            isAudioEnabled: audioEnabled,
            isVideoEnabled: videoEnabled,
            isScreenSharing: screenSharing,
        });
    };

    const handleToggleMic = async () => {
        const nextMicState = !isMicOn;
        setIsMicOn(nextMicState);

        baseStreamRef.current?.getAudioTracks()?.forEach((track) => {
            track.enabled = nextMicState;
        });

        if (audioProducerRef.current) {
            if (nextMicState) {
                await audioProducerRef.current.resume();
            } else {
                await audioProducerRef.current.pause();
            }
        }

        emitMediaState(nextMicState, isCameraOn, isScreenSharing);
    };

    const handleToggleCamera = async () => {
        const nextCameraState = !isCameraOn;
        setIsCameraOn(nextCameraState);

        activeStreamRef.current?.getVideoTracks()?.forEach((track) => {
            track.enabled = nextCameraState;
        });
        baseStreamRef.current?.getVideoTracks()?.forEach((track) => {
            track.enabled = nextCameraState;
        });

        if (videoProducerRef.current) {
            if (nextCameraState) {
                await videoProducerRef.current.resume();
            } else {
                await videoProducerRef.current.pause();
            }
        }

        emitMediaState(isMicOn, nextCameraState, isScreenSharing);
    };

    const handleScreenShare = async () => {
        if (isScreenSharing) {
            await stopScreenShare();
            return;
        }

        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const screenTrack = displayStream.getVideoTracks()?.[0];
            const audioTrack = baseStreamRef.current?.getAudioTracks()?.[0] || null;

            if (!screenTrack) {
                return;
            }

            screenTrack.enabled = isCameraOn;
            const mergedStream = new MediaStream(audioTrack ? [screenTrack, audioTrack] : [screenTrack]);
            activeStreamRef.current = mergedStream;
            setLocalStream(mergedStream);

            if (videoProducerRef.current) {
                await videoProducerRef.current.replaceTrack({ track: screenTrack });
                await videoProducerRef.current.resume();
            } else if (sendTransportRef.current) {
                videoProducerRef.current = await sendTransportRef.current.produce({
                    track: screenTrack,
                    appData: { source: "screen" },
                });
            }

            setIsScreenSharing(true);
            emitMediaState(isMicOn, isCameraOn, true);

            screenTrack.onended = async () => {
                await stopScreenShare();
            };
        } catch (shareError) {
            console.error("Screen share failed:", shareError);
        }
    };

    const stopScreenShare = async () => {
        const screenTrack = activeStreamRef.current?.getVideoTracks()?.[0] || null;
        const cameraTrack = baseStreamRef.current?.getVideoTracks()?.[0] || null;

        if (screenTrack && screenTrack !== cameraTrack) {
            screenTrack.stop();
        }

        activeStreamRef.current = baseStreamRef.current;
        setLocalStream(baseStreamRef.current);

        if (videoProducerRef.current) {
            if (cameraTrack) {
                await videoProducerRef.current.replaceTrack({ track: cameraTrack });
                if (isCameraOn) {
                    await videoProducerRef.current.resume();
                } else {
                    await videoProducerRef.current.pause();
                }
            } else {
                await videoProducerRef.current.close();
                videoProducerRef.current = null;
            }
        }

        setIsScreenSharing(false);
        emitMediaState(isMicOn, isCameraOn, false);
    };

    const leaveRoom = () => {
        socketRef.current?.emit("mediasoup-room:leave", { roomId });
        socketRef.current?.disconnect();
        socketRef.current = null;

        consumersRef.current.forEach(({ consumer }) => consumer.close());
        consumersRef.current.clear();
        consumedProducerIdsRef.current.clear();

        audioProducerRef.current?.close();
        videoProducerRef.current?.close();
        audioProducerRef.current = null;
        videoProducerRef.current = null;

        sendTransportRef.current?.close();
        recvTransportRef.current?.close();
        sendTransportRef.current = null;
        recvTransportRef.current = null;

        stopStream(activeStreamRef.current);
        if (baseStreamRef.current && baseStreamRef.current !== activeStreamRef.current) {
            stopStream(baseStreamRef.current);
        }

        activeStreamRef.current = null;
        baseStreamRef.current = null;
        remotePeerMediaRef.current = {};
        setRemoteStreams({});
        setLocalStream(null);
    };

    const handleLeaveRoom = () => {
        leaveRoom();
        navigate("/");
    };

    const copyRoomKey = async () => {
        try {
            await navigator.clipboard.writeText(roomId);
        } catch (clipboardError) {
            console.error("Copy failed:", clipboardError);
        }
    };

    return (
        <div className="meet-shell">
            <div className="meet-topbar">
                <div>
                    <p className="meet-eyebrow">mediasoup web room</p>
                    <h1>{roomId}</h1>
                </div>
                <div className="meet-topbar-actions">
                    <span>{participants.length}/{ROOM_CAPACITY} joined</span>
                    <button type="button" className="meet-ghost-btn" onClick={copyRoomKey}>
                        Copy key
                    </button>
                </div>
            </div>

            {error ? <div className="meet-error-banner">{error}</div> : null}

            <div className="meet-stage">
                <section className="meet-primary-card">
                    <StreamTile
                        stream={localStream}
                        label={`${displayName} (You)`}
                        isMuted
                        isVideoEnabled={isCameraOn}
                        isScreenSharing={isScreenSharing}
                        isLocal
                    />
                </section>

                <aside className="meet-sidebar">
                    {remoteParticipantCards.map((participant) => (
                        <StreamTile
                            key={participant.id}
                            stream={remoteStreams[participant.id]}
                            label={participant.name}
                            isVideoEnabled={participant.isVideoEnabled}
                            isAudioEnabled={participant.isAudioEnabled}
                            isScreenSharing={participant.isScreenSharing}
                        />
                    ))}

                    {!remoteParticipantCards.length ? (
                        <div className="meet-empty-card">
                            <p>Share the room key to let others join.</p>
                            <span>Streaming is now routed through mediasoup SFU.</span>
                        </div>
                    ) : null}
                </aside>
            </div>

            <div className="meet-bottom-bar">
                <div className="meet-status">
                    <span>{isConnecting ? "Connecting..." : isJoined ? "Connected" : "Waiting"}</span>
                    <span>{isScreenSharing ? "Presenting" : "Camera view"}</span>
                </div>

                <div className="meet-controls">
                    <button type="button" className={`meet-control ${isMicOn ? "" : "off"}`} onClick={handleToggleMic}>
                        {isMicOn ? "Mic on" : "Mic off"}
                    </button>
                    <button type="button" className={`meet-control ${isCameraOn ? "" : "off"}`} onClick={handleToggleCamera}>
                        {isCameraOn ? "Camera on" : "Camera off"}
                    </button>
                    <button type="button" className={`meet-control ${isScreenSharing ? "active" : ""}`} onClick={handleScreenShare}>
                        {isScreenSharing ? "Stop share" : "Present now"}
                    </button>
                    <button type="button" className="meet-control danger" onClick={handleLeaveRoom}>
                        Leave
                    </button>
                </div>
            </div>
        </div>
    );
}

function StreamTile({ stream, label, isMuted = false, isVideoEnabled = true, isAudioEnabled = true, isScreenSharing = false, isLocal = false }) {
    const mediaRef = useRef(null);

    useEffect(() => {
        if (!mediaRef.current || !stream) {
            return;
        }

        mediaRef.current.srcObject = stream;
    }, [stream]);

    const hasVideoTrack = Boolean(stream?.getVideoTracks()?.length) && isVideoEnabled;

    return (
        <div className={`meet-tile ${isLocal ? "local" : ""}`}>
            {hasVideoTrack ? (
                <video ref={mediaRef} autoPlay playsInline muted={isMuted} />
            ) : (
                <div className="meet-avatar-fallback">{label.charAt(0).toUpperCase()}</div>
            )}
            {!hasVideoTrack && stream?.getAudioTracks()?.length ? (
                <audio ref={mediaRef} autoPlay muted={isMuted} />
            ) : null}

            <div className="meet-tile-meta">
                <strong>{label}</strong>
                <span>
                    {isScreenSharing ? "Screen sharing" : isVideoEnabled ? "Video live" : "Camera off"}
                    {!isAudioEnabled ? " • Muted" : ""}
                </span>
            </div>
        </div>
    );
}

async function getUserMediaStream() {
    const constraintCandidates = [
        { audio: true, video: true },
        { audio: true, video: false },
        { audio: false, video: true },
    ];

    for (const constraints of constraintCandidates) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.error("Media request failed for constraints:", constraints, error);
        }
    }

    throw new Error("No media devices available.");
}

function stopStream(stream) {
    stream?.getTracks()?.forEach((track) => track.stop());
}

function syncLocalTrackState(stream, isMicOn, isCameraOn) {
    stream?.getAudioTracks()?.forEach((track) => {
        track.enabled = isMicOn;
    });
    stream?.getVideoTracks()?.forEach((track) => {
        track.enabled = isCameraOn;
    });
}

export default ChatRoom;
