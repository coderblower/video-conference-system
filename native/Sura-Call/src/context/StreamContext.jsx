import React, { createContext, useContext, useState } from "react";

const StreamContext = createContext();

export const StreamProvider = ({ children }) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({});

    const addRemoteStream = (userId, stream) => {
        setRemoteStreams((prev) => ({ ...prev, [userId]: stream }));
    };

    const removeRemoteStream = (userId) => {
        setRemoteStreams((prev) => {
            const updated = { ...prev };
            delete updated[userId];
            return updated;
        });
    };

    return (
        <StreamContext.Provider value={{ localStream, setLocalStream, remoteStreams, addRemoteStream, removeRemoteStream }}>
            {children}
        </StreamContext.Provider>
    );
};

export const useStreamContext = () => useContext(StreamContext);
