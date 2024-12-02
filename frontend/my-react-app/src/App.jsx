import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Main from "./components/Main";
import Welcome from "./components/Welcome";

import Room from "./components/room";


const App = () => {
    return (
        <Router>
            <Routes>
                {/* The Main layout will wrap these pages */}
                <Route path="/" element={<Main />}>
                  <Route index element={<Welcome />} />
                  <Route path="room" element={<Room />} />
                </Route>
            </Routes>
        </Router>
    );
};

export default App;
