import React, { createContext, useContext, useRef } from "react";

// Create the context
const PeerConnectionsContext = createContext();

// Provider component
export const PeerConnectionsProvider = ({ children }) => {
    // Create references for remote videos and peer connections
    const remoteVideosRef = useRef({});
    const peerConnectionsRef = useRef({});

    return (
        <PeerConnectionsContext.Provider value={{ remoteVideosRef, peerConnectionsRef }}>
            {children}
        </PeerConnectionsContext.Provider>
    );
};

// Hook to use the context
export const usePeerConnections = () => {
    const context = useContext(PeerConnectionsContext);
    if (!context) {
        throw new Error(
            "usePeerConnections must be used within a PeerConnectionsProvider"
        );
    }
    return context;
};
