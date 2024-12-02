import React from "react";
import { Outlet } from "react-router-dom";

const Main = () => {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className=" bg-gray-800 text-white p-4">
                <h1 className="text-2xl font-bold"> Google Meet 2.0</h1>
            </header>

            {/* Main content section */}
            <main className="flex-1 p-6">
                <Outlet /> {/* Nested content rendered here */}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 text-white p-4 text-center">
                <p>&copy; {new Date().getFullYear()} My Application</p>
            </footer>
        </div>
    );
};

export default Main;
