const mediasoup = require('mediasoup');

function createMediasoupRoomManager(io) {
    let workerPromise = null;
    const rooms = new Map();
    const peerToRoom = new Map();

    const mediaCodecs = [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
                'x-google-start-bitrate': 1000,
            },
        },
    ];

    const getListenIps = () => {
        const listenIp = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';
        const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

        return [{ ip: listenIp, announcedIp }];
    };

    const ensureWorker = async () => {
        if (!workerPromise) {
            workerPromise = mediasoup.createWorker({
                rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
                rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
                logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
                logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
            });

            const worker = await workerPromise;
            worker.on('died', () => {
                console.error('❌ mediasoup worker died, exiting in 2 seconds');
                setTimeout(() => process.exit(1), 2000);
            });
        }

        return workerPromise;
    };

    const serializeParticipant = (peer) => ({
        id: peer.socketId,
        name: peer.name,
        isAudioEnabled: peer.mediaState.isAudioEnabled,
        isVideoEnabled: peer.mediaState.isVideoEnabled,
        isScreenSharing: peer.mediaState.isScreenSharing,
        joinedAt: peer.joinedAt,
    });

    const emitParticipants = (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            return;
        }

        io.to(roomId).emit('mediasoup-room:participants', {
            roomId,
            participants: Array.from(room.peers.values()).map(serializeParticipant),
            capacity: room.capacity,
        });
    };

    const getOrCreateRoom = async (roomId) => {
        if (rooms.has(roomId)) {
            return rooms.get(roomId);
        }

        const worker = await ensureWorker();
        const router = await worker.createRouter({ mediaCodecs });
        const room = {
            roomId,
            router,
            peers: new Map(),
            capacity: 4,
        };

        rooms.set(roomId, room);
        return room;
    };

    const getPeer = (socketId) => {
        const roomId = peerToRoom.get(socketId);
        if (!roomId) {
            return null;
        }

        const room = rooms.get(roomId);
        if (!room) {
            return null;
        }

        return room.peers.get(socketId) || null;
    };

    const closePeerResources = (peer) => {
        peer.consumers.forEach((consumer) => consumer.close());
        peer.producers.forEach((producer) => producer.close());
        peer.transports.forEach((transport) => transport.close());
        peer.consumers.clear();
        peer.producers.clear();
        peer.transports.clear();
    };

    const removePeer = (socketId) => {
        const roomId = peerToRoom.get(socketId);
        if (!roomId) {
            return;
        }

        const room = rooms.get(roomId);
        if (!room) {
            peerToRoom.delete(socketId);
            return;
        }

        const peer = room.peers.get(socketId);
        if (!peer) {
            peerToRoom.delete(socketId);
            return;
        }

        room.peers.delete(socketId);
        peerToRoom.delete(socketId);

        closePeerResources(peer);

        io.to(roomId).emit('mediasoup-room:user-left', {
            roomId,
            participantId: socketId,
            timestamp: Date.now(),
        });
        emitParticipants(roomId);

        if (room.peers.size === 0) {
            room.router.close();
            rooms.delete(roomId);
        }
    };

    const createWebRtcTransport = async (router) => {
        const transport = await router.createWebRtcTransport({
            listenIps: getListenIps(),
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            appData: {},
        });

        return transport;
    };

    const attachSocket = (socket) => {
        const reply = (callback, payload) => {
            if (typeof callback === 'function') {
                callback(payload);
            }
        };

        socket.on('mediasoup-room:join', async ({ roomId, joinKey, name }, callback) => {
            try {
                const normalizedRoomId = String(roomId || joinKey || '').trim().toLowerCase();
                const normalizedName = String(name || '').trim();

                if (!normalizedRoomId || !normalizedName) {
                    reply(callback, {
                        ok: false,
                        error: 'roomId and name are required.',
                    });
                    return;
                }

                if (peerToRoom.has(socket.id) && peerToRoom.get(socket.id) !== normalizedRoomId) {
                    removePeer(socket.id);
                }

                const room = await getOrCreateRoom(normalizedRoomId);
                if (!room.peers.has(socket.id) && room.peers.size >= room.capacity) {
                    reply(callback, {
                        ok: false,
                        error: 'This room already has 4 participants.',
                        code: 'ROOM_FULL',
                    });
                    return;
                }

                const peer = room.peers.get(socket.id) || {
                    socketId: socket.id,
                    name: normalizedName,
                    joinedAt: Date.now(),
                    transports: new Map(),
                    producers: new Map(),
                    consumers: new Map(),
                    mediaState: {
                        isAudioEnabled: true,
                        isVideoEnabled: true,
                        isScreenSharing: false,
                    },
                };

                peer.name = normalizedName;
                room.peers.set(socket.id, peer);
                peerToRoom.set(socket.id, normalizedRoomId);
                socket.join(normalizedRoomId);

                reply(callback, {
                    ok: true,
                    roomId: normalizedRoomId,
                    participantId: socket.id,
                    routerRtpCapabilities: room.router.rtpCapabilities,
                    participants: Array.from(room.peers.values()).map(serializeParticipant),
                    capacity: room.capacity,
                });

                socket.to(normalizedRoomId).emit('mediasoup-room:user-joined', {
                    roomId: normalizedRoomId,
                    participant: serializeParticipant(peer),
                    timestamp: Date.now(),
                });
                emitParticipants(normalizedRoomId);
            } catch (error) {
                console.error('❌ mediasoup join failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to join mediasoup room.',
                });
            }
        });

        socket.on('mediasoup-room:create-transport', async ({ roomId, direction }, callback) => {
            try {
                const room = rooms.get(roomId);
                const peer = getPeer(socket.id);

                if (!room || !peer) {
                    reply(callback, {
                        ok: false,
                        error: 'Peer is not in a mediasoup room.',
                    });
                    return;
                }

                const transport = await createWebRtcTransport(room.router);
                transport.appData = {
                    ...(transport.appData || {}),
                    direction,
                    peerId: socket.id,
                };

                peer.transports.set(transport.id, transport);
                transport.on('dtlsstatechange', (state) => {
                    if (state === 'closed') {
                        transport.close();
                        peer.transports.delete(transport.id);
                    }
                });
                transport.on('close', () => {
                    peer.transports.delete(transport.id);
                });

                reply(callback, {
                    ok: true,
                    params: {
                        id: transport.id,
                        iceParameters: transport.iceParameters,
                        iceCandidates: transport.iceCandidates,
                        dtlsParameters: transport.dtlsParameters,
                    },
                });
            } catch (error) {
                console.error('❌ mediasoup create transport failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to create transport.',
                });
            }
        });

        socket.on('mediasoup-room:connect-transport', async ({ transportId, dtlsParameters }, callback) => {
            try {
                const peer = getPeer(socket.id);
                const transport = peer?.transports.get(transportId);

                if (!transport) {
                    reply(callback, {
                        ok: false,
                        error: 'Transport not found.',
                    });
                    return;
                }

                await transport.connect({ dtlsParameters });
                reply(callback, { ok: true });
            } catch (error) {
                console.error('❌ mediasoup transport connect failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to connect transport.',
                });
            }
        });

        socket.on('mediasoup-room:produce', async ({ roomId, transportId, kind, rtpParameters, appData }, callback) => {
            try {
                const room = rooms.get(roomId);
                const peer = getPeer(socket.id);
                const transport = peer?.transports.get(transportId);

                if (!room || !peer || !transport) {
                    reply(callback, {
                        ok: false,
                        error: 'Invalid mediasoup producer request.',
                    });
                    return;
                }

                const producer = await transport.produce({
                    kind,
                    rtpParameters,
                    appData: {
                        ...(appData || {}),
                        peerId: socket.id,
                    },
                });

                peer.producers.set(producer.id, producer);

                producer.on('transportclose', () => {
                    peer.producers.delete(producer.id);
                });
                producer.on('close', () => {
                    peer.producers.delete(producer.id);
                });

                socket.to(roomId).emit('mediasoup-room:new-producer', {
                    roomId,
                    producerId: producer.id,
                    peerId: socket.id,
                    kind: producer.kind,
                });

                reply(callback, {
                    ok: true,
                    producerId: producer.id,
                });
            } catch (error) {
                console.error('❌ mediasoup produce failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to produce track.',
                });
            }
        });

        socket.on('mediasoup-room:get-producers', ({ roomId }, callback) => {
            try {
                const room = rooms.get(roomId);
                if (!room) {
                    reply(callback, {
                        ok: true,
                        producers: [],
                    });
                    return;
                }

                const producers = [];
                room.peers.forEach((peer) => {
                    if (peer.socketId === socket.id) {
                        return;
                    }

                    peer.producers.forEach((producer) => {
                        producers.push({
                            producerId: producer.id,
                            peerId: peer.socketId,
                            kind: producer.kind,
                        });
                    });
                });

                reply(callback, {
                    ok: true,
                    producers,
                });
            } catch (error) {
                console.error('❌ mediasoup get producers failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to list producers.',
                });
            }
        });

        socket.on('mediasoup-room:consume', async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
            try {
                const room = rooms.get(roomId);
                const peer = getPeer(socket.id);
                const transport = peer?.transports.get(transportId);

                if (!room || !peer || !transport) {
                    reply(callback, {
                        ok: false,
                        error: 'Invalid mediasoup consumer request.',
                    });
                    return;
                }

                if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                    reply(callback, {
                        ok: false,
                        error: 'Router cannot consume this producer.',
                    });
                    return;
                }

                const consumer = await transport.consume({
                    producerId,
                    rtpCapabilities,
                    paused: true,
                });

                peer.consumers.set(consumer.id, consumer);

                consumer.on('transportclose', () => {
                    peer.consumers.delete(consumer.id);
                });
                consumer.on('producerclose', () => {
                    peer.consumers.delete(consumer.id);
                    socket.emit('mediasoup-room:producer-closed', {
                        consumerId: consumer.id,
                        producerId,
                    });
                    consumer.close();
                });

                const producerPeer = Array.from(room.peers.values()).find((roomPeer) => roomPeer.producers.has(producerId));

                reply(callback, {
                    ok: true,
                    params: {
                        id: consumer.id,
                        producerId,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                        producerPeerId: producerPeer?.socketId || null,
                    },
                });
            } catch (error) {
                console.error('❌ mediasoup consume failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to consume track.',
                });
            }
        });

        socket.on('mediasoup-room:resume-consumer', async ({ consumerId }, callback) => {
            try {
                const peer = getPeer(socket.id);
                const consumer = peer?.consumers.get(consumerId);

                if (!consumer) {
                    reply(callback, {
                        ok: false,
                        error: 'Consumer not found.',
                    });
                    return;
                }

                await consumer.resume();
                reply(callback, { ok: true });
            } catch (error) {
                console.error('❌ mediasoup resume consumer failed:', error);
                reply(callback, {
                    ok: false,
                    error: error.message || 'Failed to resume consumer.',
                });
            }
        });

        socket.on('mediasoup-room:media-state', ({ roomId, isAudioEnabled, isVideoEnabled, isScreenSharing }) => {
            const room = rooms.get(roomId);
            const peer = getPeer(socket.id);

            if (!room || !peer) {
                return;
            }

            if (typeof isAudioEnabled === 'boolean') {
                peer.mediaState.isAudioEnabled = isAudioEnabled;
            }
            if (typeof isVideoEnabled === 'boolean') {
                peer.mediaState.isVideoEnabled = isVideoEnabled;
            }
            if (typeof isScreenSharing === 'boolean') {
                peer.mediaState.isScreenSharing = isScreenSharing;
            }

            io.to(roomId).emit('mediasoup-room:media-state', {
                roomId,
                participantId: socket.id,
                isAudioEnabled: peer.mediaState.isAudioEnabled,
                isVideoEnabled: peer.mediaState.isVideoEnabled,
                isScreenSharing: peer.mediaState.isScreenSharing,
            });
            emitParticipants(roomId);
        });

        socket.on('mediasoup-room:leave', ({ roomId }, callback) => {
            removePeer(socket.id);
            if (roomId) {
                socket.leave(roomId);
            }
            reply(callback, { ok: true });
        });
    };

    const handleDisconnect = (socketId) => {
        removePeer(socketId);
    };

    return {
        attachSocket,
        handleDisconnect,
    };
}

module.exports = { createMediasoupRoomManager };
