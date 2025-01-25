import React, { useState, useEffect, useRef } from 'react';

const Dashboard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const setupDataChannel = (peerConnection) => {
    const dataChannel = peerConnection.createDataChannel("oai-events", {
      ordered: true
    });
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      console.log('Data channel opened');
      if (dataChannel.readyState === 'open') {
        const responseCreate = {
          type: "response.create",
          response: {
            modalities: ["text"],
            instructions: "Please transcribe the audio and respond naturally",
          },
        };
        dataChannel.send(JSON.stringify(responseCreate));
      }
    };

    dataChannel.onclose = () => console.log('Data channel closed');
    
    dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      setError('Data channel error: ' + error.message);
    };

    dataChannel.onmessage = (e) => {
      try {
        const realtimeEvent = JSON.parse(e.data);
        if (realtimeEvent.type === 'text') {
          setTranscripts(prev => [...prev, {
            text: realtimeEvent.text,
            timestamp: new Date()
          }]);
        }
        console.log('Received event:', realtimeEvent);
      } catch (err) {
        console.error('Error processing message:', err);
      }
    };

    return dataChannel;
  };

  const setupWebRTC = async () => {
    try {
      // Reset state
      setError(null);
      setTranscripts([]);

      // 1. Get ephemeral token
      const tokenResponse = await fetch('/api/get-realtime-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!tokenResponse.ok) {
        throw new Error('Failed to get token');
      }
      
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.clientSecret;

      // 2. Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = peerConnection;

      // 3. Set up audio handling
      peerConnection.ontrack = e => {
        audioRef.current.srcObject = e.streams[0];
      };

      // 4. Set up data channel before creating offer
      setupDataChannel(peerConnection);

      // 5. Get and add local audio track
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      // 6. Create and set local description
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // 7. Send SDP offer to OpenAI
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to get SDP answer from OpenAI');
      }

      // 8. Set remote description
      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await peerConnection.setRemoteDescription(answer);

      setIsRecording(true);

    } catch (err) {
      console.error('Error setting up WebRTC:', err);
      setError(err.message || 'Failed to setup connection');
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    
    return () => {
      stopRecording();
    };
  }, []);

  return (
    <div className="container mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg mb-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Voice Transcription</h2>
            <button
              onClick={isRecording ? stopRecording : setupWebRTC}
              className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                isRecording 
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } transition-colors`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {transcripts.map((transcript, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-800">{transcript.text}</p>
                <span className="text-sm text-gray-500">
                  {new Date(transcript.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {transcripts.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No transcripts yet. Click "Start Recording" to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;