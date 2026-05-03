import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Welcome() {
    const navigate = useNavigate();
    const [name, setName] = useState(() => localStorage.getItem("video-call-name") || "");
    const [roomKey, setRoomKey] = useState("");

    const goToRoom = (nextRoomKey) => {
        const trimmedName = name.trim();
        const trimmedRoomKey = nextRoomKey.trim().toLowerCase();

        if (!trimmedName || !trimmedRoomKey) {
            return;
        }

        localStorage.setItem("video-call-name", trimmedName);
        navigate(`/room/${trimmedRoomKey}`);
    };

    const handleCreateRoom = () => {
        goToRoom(buildRoomKey());
    };

    const handleJoinRoom = (event) => {
        event.preventDefault();
        goToRoom(roomKey);
    };

    return (
        <div className="lobby-shell">
            <section className="lobby-hero">
                <p className="lobby-eyebrow">Node.js WebRTC Room</p>
                <h1>Join a 4-person call with a room key.</h1>
                <p>
                    Web only. Full-mesh streaming with media swap for screen sharing and a meet-style layout.
                </p>
            </section>

            <section className="lobby-card">
                <label htmlFor="display-name">Your name</label>
                <input
                    id="display-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Enter display name"
                />

                <label htmlFor="room-key">Room key</label>
                <form onSubmit={handleJoinRoom} className="lobby-form">
                    <input
                        id="room-key"
                        type="text"
                        value={roomKey}
                        onChange={(event) => setRoomKey(event.target.value)}
                        placeholder="example: meet-7284"
                    />
                    <button type="submit" className="lobby-primary-btn">
                        Join room
                    </button>
                </form>

                <button type="button" className="lobby-secondary-btn" onClick={handleCreateRoom}>
                    Create new room
                </button>

                <div className="lobby-note">
                    <strong>Rules</strong>
                    <span>Each room is limited to 4 participants and uses the room key as the join ID.</span>
                </div>
            </section>
        </div>
    );
}

function buildRoomKey() {
    return `meet-${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-2)}`;
}

export default Welcome;
