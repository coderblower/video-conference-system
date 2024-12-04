import React, {useState} from 'react';
import avatar from '../../public/images/avatar.svg'


function AudioCard({ title, stream, description, muted }) {
 
    


    return (
        <div className=" rounded bg-[#8f8f8f63] overflow-hidden shadow-lg bg-white relative flex flex-col">
            <div className="flex-[4]">
                         <img className="w-full h-full object-cover" src={avatar} alt={title} />
                         <audio
                            className="hidden"
                            autoPlay
                            muted = {muted}
                            ref={(audioElement) => {
                            if (audioElement && stream) {
                                audioElement.srcObject = stream;
                                audioElement.play().catch((error) => {
                                console.error("Error playing audio:", error);
                                });
                            }
                            }}
                        />
            </div>
            <div className="flex-[1] px-4 py-2 flex items-center justify-center">
                <h2 className="font-bold text-[2.5em] uppercase text-[#576c8dbd] text-center">{title}</h2>
            </div>
          
        </div>
    );
}

export default AudioCard;
