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
           
          
        </div>
    );
}

export default AudioCard;
