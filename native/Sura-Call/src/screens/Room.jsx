// App.js
import React, { useState, useRef, useEffect } from "react";

import ChatRoom from "./ChatRoom"




const Room = () => { 
    
    const [name, setName ] = useState(window.localStorage.getItem('name'));
    const [submittedName, setSubmittedName] = useState('');






    return (
        
        <div>
            {name && <ChatRoom />}
        </div>
    )
}

export default Room;
