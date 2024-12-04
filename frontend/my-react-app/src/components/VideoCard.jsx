import React from 'react';
import videoPoster from '../../public/images/video_poster.jpg'

function VideoCard({ title, stream, videoSrc }) {
    return (
        <div className="rounded bg-[#8f8f8f63] overflow-hidden shadow-lg bg-white relative flex flex-col h-full">
        {/* Video section */}
        <div className="flex-[4] w-full h-full">
            <video
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                controls // Optional: Adds playback controls (e.g., play, pause, volume)
                ref={(videoElement) => {
                    if (videoElement && stream) {
                        videoElement.srcObject = stream; // Attach RTC stream
                        videoElement.play().catch((error) => {
                            console.error("Error playing video:", error);
                        });
                    }
                }}
            />
        </div>
        
        {/* Title section */}
        <div className="flex-[1] px-4 py-2 flex items-center justify-center">
            <h2 className="font-bold text-[2.5em] uppercase text-[#576c8dbd] text-center">
                {title}
            </h2>
        </div>
    </div>
    );
}

export default VideoCard;
