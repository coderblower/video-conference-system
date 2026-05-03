import { Outlet } from "react-router-dom";

const Main = () => {
    return (
        <div className="app-shell">
            <header className="app-header">
                <div>
                    <p className="app-header-mark">Video Calling Node.js</p>
                    <h1>Meet-style Web Room</h1>
                </div>
                <span className="app-header-badge">WebRTC x Socket.IO</span>
            </header>

            <main className="app-content">
                <Outlet />
            </main>

            <footer className="app-footer">
                <p>Join with `roomId` / key. Maximum 4 web participants.</p>
            </footer>
        </div>
    );
};

export default Main;
