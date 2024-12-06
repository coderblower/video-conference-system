import React, { createContext, useContext, useRef } from "react";

const PeerContext = createContext();

export const PeerProvider = ({ children }) => {
    const peerConnections = useRef({});

    const addPeerConnection = (userId, peerConnection) => {
        peerConnections.current[userId] = peerConnection;
    };

    const removePeerConnection = (userId) => {
        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
        }
    };

    return (
        <PeerContext.Provider value={{ peerConnections, addPeerConnection, removePeerConnection }}>
            {children}
        </PeerContext.Provider>
    );
};

export const usePeerContext = () => useContext(PeerContext);
