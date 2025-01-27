import React from "react";
import { Outlet } from "react-router-dom";
import ProfileMenu from "../components/ProfileMenu";

const Main = () => {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="flex bg-gray-800 text-white p-4 justify-between">
                <h1 className="text-2xl font-bold">সহজ কথা</h1>
                <ProfileMenu />
            </header>

            {/* Main content section */}
            <main className="flex-1 p-6">
                <Outlet /> {/* Nested content rendered here */}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 text-white p-4 text-center">
                <p>&copy; {new Date().getFullYear()} Versatilo Group</p>
            </footer>
        </div>
    );
};

export default Main;
