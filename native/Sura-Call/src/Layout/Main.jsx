import React from "react";
import { Outlet } from "react-router-dom";

const Main = () => {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className=" bg-gray-800 text-white p-4">
                <h1 className="text-2xl font-bold"> Versatil▢ Meet</h1>
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
