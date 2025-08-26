import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
// import { getUser, logout } from "../api/axios"; // Assuming you have an API to get user info

const ProfileMenu = () => {
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    // Fetch user data (can be done via an API call)
    useEffect(() => {
        const fetchUser = async () => {
            try {
                // const userData = await getUser(); // API to fetch user data (e.g., logged in user's info)
                setUser(userData);
            } catch (error) {
                setUser(null); // In case of error, user is not logged in
            }
        };

        fetchUser();
    }, []);

    // Handle logout
    const handleLogout = () => {
        logout(); // Call your logout API here (clear JWT token)
        setUser(null); // Reset user state
        navigate("/login"); // Redirect to login page
    };

    return (
        <div className="relative">
            {user ? (
                <div className="flex items-center space-x-2 cursor-pointer">
                    <img
                        src={user.avatar || "/default-avatar.png"} // Display avatar
                        alt="Avatar"
                        className="w-8 h-8 rounded-full"
                    />
                    <span>{user.username}</span>
                    <div className="absolute right-0 mt-2 bg-white shadow-md rounded-lg">
                        <button onClick={handleLogout} className="px-4 py-2 text-gray-800 hover:bg-gray-200 w-full text-left">
                            Logout
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-x-4">
                    <button
                        onClick={() => navigate("/login")}
                        className="text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
                    >
                        Login
                    </button>
                    <button
                        onClick={() => navigate("/register")}
                        className="text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded"
                    >
                        Register
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProfileMenu;
