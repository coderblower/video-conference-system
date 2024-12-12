




export async function addLocalStream({peerConnection, localStream, setLocalStream}){
    

    // Check if `localStream` already exists
    if (localStream) {
     localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
     console.log('Existing local stream tracks added to peer connection.');

     return peerConnection;
 }



 // Request a new stream
let stream = await requestForStream();

    stream = await modifyStreamVolume(stream, 3.0);

 if (!stream) {
     console.log('No stream available. Displaying avatar instead.');
     
     return;
 }

 // Add the stream tracks to the peer connection
 stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
 console.log('New stream tracks added to peer connection.');

 // Store the stream globally
 setLocalStream(stream);

 return peerConnection;
}


const requestForStream = async  () => {
    try {
        // Check for available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        let hasVideo = false;
        let hasAudio = false;

        // Loop through devices to check for video and audio
        devices.forEach(device => {
            if (device.kind === 'audioinput') {
                hasAudio = true;
            }
            if (device.kind === 'videoinput') {
                hasVideo = true;
            }
        });

        // Set the media constraints based on available devices
        const constraints = {
            audio: hasAudio,   // Only request audio if audio device exists
            video: hasVideo    // Only request video if video device exists
        };

        // Request the media stream with the selected constraints
        if (hasAudio || hasVideo) {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Handle the case where only audio is available
            if (!hasVideo && hasAudio) {
                console.log('Only audio stream available');
                // You can display a remote avatar here for users without video
            }

            // Handle the stream as needed
            return stream; // Return the stream to the caller
        } else {
            console.log('No audio or video available');
            return null; // No devices available
        }
    } catch (err) {
        console.error('Error getting user media: ', err);
        return null; // Return null in case of error
    }
}

async function modifyStreamVolume(mediaStream, gainValue = 1.0) {
    if (!mediaStream) {
      throw new Error("A valid MediaStream is required.");
    }
  
    // Create a new AudioContext
    const audioContext = new AudioContext();
  
    // Ensure the AudioContext is resumed (important for browsers that start it in a suspended state)
    await audioContext.resume();
  
    // Create a MediaStreamAudioSourceNode from the input MediaStream
    const streamSource = audioContext.createMediaStreamSource(mediaStream);
  
    // Create a GainNode to adjust the volume
    const gainNode = audioContext.createGain();
    gainNode.gain.value = gainValue; // Set the desired gain value
  
    // Create a BiquadFilterNode for noise reduction (high-pass filter)
    const biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = "highpass";
    biquadFilter.frequency.value = 100; // Adjust frequency threshold for noise reduction
  
    // Connect the source to the GainNode and BiquadFilter, then to the destination
    streamSource.connect(biquadFilter);
    biquadFilter.connect(gainNode);
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);
  
    // Return the modified MediaStream
    return destination.stream;
  }
