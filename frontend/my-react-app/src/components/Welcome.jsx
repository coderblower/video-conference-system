// App.js
import React, { useState, useRef, useEffect } from "react";

import ChatRoom from "../components/ChatRoom"




const Welcome = () => { 
    
    const [name, setName ] = useState('');
    const [submittedName, setSubmittedName] = useState('');





    return (
        <div className=" flex items-center justify-center flex-col ">

            <div>
             <h2 className=" font-bold text-[3em] ">
                Welcome to Live Chating 
             </h2>

             { !submittedName && (<h4 className=" text-[2em]">
                Please Add your Name Before Placed In  
             </h4>)}
            

             
            </div>
            <div>
                { !submittedName ? ( <>
                <div className=" my-5">
                <form onSubmit={(e)=>{
                    e.preventDefault();
                    setSubmittedName(name)
                    window.localStorage.setItem('name', name)
                    setName('')

                    setTimeout(function(){
                        
                    }, 2000)
                    }
         }>
                <input 
                    type="text" 
                    placeholder="Enter your name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className=" border-2 py-3 px-5 w-[12em] text-[28px] font-medium"
                />
                <button type="submit" className=" border-2 py-3 px-2 text-[28px] px-10 font-medium rounded-none border-gray-400 ml-5"> Get In </button>
            </form>

                </div>


            <div>
                {submittedName && <p className=" text-white text-5xl font-extrabold">hello {submittedName} !! </p>}
            </div>
        </>): (
            <h2 className=" text-[2em] py-5" > Success Please wait ... </h2>
        )}
            </div>
        </div>

    )
}

export default Welcome;
