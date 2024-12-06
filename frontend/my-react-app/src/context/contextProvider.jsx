import React from "react";
import { PeerProvider } from "./PeerContext";
import { StreamProvider } from "./StreamContext";
import { LocalStreamProvider  } from "./localStreamContext";
import { PeerConnectionsProvider } from "./PeerConnectionsContext";


const providers = [
    PeerProvider,
    StreamProvider,
    LocalStreamProvider,
    PeerConnectionsProvider
   
];

const ContextProvider = ({ children }) => {
    return providers.reduce(
        (acc, Provider) => <Provider>{acc}</Provider>,
        children
    );
};

export default ContextProvider;
