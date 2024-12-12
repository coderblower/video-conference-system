import React, { createContext, useContext, useState } from 'react';

// Create the context
const LocalStreamContext = createContext();

// Provider component
export const LocalStreamProvider = ({ children }) => {
    const [localStream, setLocalStream] = useState(null);

    return (
        <LocalStreamContext.Provider value={{ localStream, setLocalStream }}>
            {children}
        </LocalStreamContext.Provider>
    );
};

// Hook to use the context
export const useLocalStream = () => useContext(LocalStreamContext);
