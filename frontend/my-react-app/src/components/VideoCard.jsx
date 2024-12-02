import React from 'react';
import videoPoster from '../../public/images/video_poster.jpg'

function VideoCard({ title, videoSrc }) {
    return (
        <div className="rounded bg-[#8f8f8f63] overflow-hidden shadow-lg bg-white relative flex flex-col ">
            {/* Video section */}
            <div className="flex-[4] max-h-[300px]">
                <video
                    className="w-full object-cover"
                    // src={videoSrc}
                    controls // Adds play, pause, and other controls
                    poster={videoPoster} // Optional poster image
                >
                    Your browser does not support the video tag.
                </video>
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
