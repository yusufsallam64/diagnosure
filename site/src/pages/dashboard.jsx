import React, { useState, useEffect, useRef } from 'react';

const Dashboard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [realtimeTranscripts, setRealtimeTranscripts] = useState([]);
  const [whisperTranscripts, setWhisperTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const mediaStreamRef = useRef(null);
  
  // Audio processing refs
  const audioContextRef = useRef(null);
  const processorNodeRef = useRef(null);
  const recordingBufferRef = useRef([]);
  const lastSendTimeRef = useRef(0);

  const setupAudioProcessing = (stream) => {
    // Clean up previous instances
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    audioContextRef.current = audioContext;

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNodeRef.current = processorNode;

    processorNode.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      recordingBufferRef.current = [...recordingBufferRef.current, ...Array.from(inputData)];

      // Send every 5 seconds
      if (Date.now() - lastSendTimeRef.current >= 5000) {
        const chunkBuffer = new Float32Array(recordingBufferRef.current);
        recordingBufferRef.current = [];
        lastSendTimeRef.current = Date.now();

        // Convert to WAV and send to Whisper
        const wavBlob = encodeWAV(chunkBuffer, audioContext.sampleRate);
        sendToWhisper(wavBlob);
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
  };

  const encodeWAV = (samples, sampleRate) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Convert to 16-bit PCM
    const floatTo16BitPCM = (output, offset, input) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };

    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
  };

  const sendToWhisper = async (wavBlob) => {
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    
    try {
      const response = await fetch('/api/whisper-transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setWhisperTranscripts(prev => [...prev, {
          text: data.text,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Whisper error:', error);
    }
  };

  const setupDataChannel = (peerConnection) => {
    const dataChannel = peerConnection.createDataChannel("oai-events", { ordered: true });
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      console.log('WebRTC data channel opened');
      if (dataChannel.readyState === 'open') {
        const responseCreate = {
          type: "response.create",
          response: {
            modalities: ["audio"],
            instructions: "Please respond with natural audio",
          },
        };
        dataChannel.send(JSON.stringify(responseCreate));
      }
    };

    dataChannel.onmessage = (e) => {
      try {
        const realtimeEvent = JSON.parse(e.data);
        if (realtimeEvent.type === 'text') {
          setRealtimeTranscripts(prev => [...prev, {
            text: realtimeEvent.text,
            timestamp: new Date()
          }]);
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    };

    return dataChannel;
  };

  const setupWebRTC = async () => {
    try {
      setError(null);
      setRealtimeTranscripts([]);
      setWhisperTranscripts([]);

      const tokenResponse = await fetch('/api/get-realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!tokenResponse.ok) throw new Error('Failed to get token');
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.clientSecret;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        sdpSemantics: 'unified-plan'
      });
      peerConnectionRef.current = peerConnection;

      // Add audio transceiver for bidirectional communication
      peerConnection.addTransceiver('audio', {
        direction: 'sendrecv'
      });

      // Handle incoming audio
      peerConnection.ontrack = (e) => {
        if (e.track.kind === 'audio') {
          audioRef.current.srcObject = e.streams[0];
        }
      };

      setupDataChannel(peerConnection);

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleSize: 16
        }
      });
      mediaStreamRef.current = stream;

      // Add local stream to connection
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      // Setup audio processing
      setupAudioProcessing(stream);

      // Create and modify offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Modify SDP for better compatibility
      const modifiedSDP = offer.sdp
        .replace(/a=fmtp:111/g, 'a=fmtp:111 minptime=10; useinbandfec=1')
        .replace(/profile-level-id=42e01f/g, '');

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-mini-realtime-preview";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: modifiedSDP,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) throw new Error('Failed to get SDP answer');
      
      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await peerConnection.setRemoteDescription(answer);

      setIsRecording(true);

    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message);
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    
    return () => stopRecording();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-lg">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Real-time Transcription</h2>
              <button
                onClick={isRecording ? stopRecording : setupWebRTC}
                className={`px-4 py-2 rounded-md ${
                  isRecording ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {isRecording ? 'Stop' : 'Start'}
              </button>
            </div>
            {error && (
              <div className="bg-red-100 p-3 rounded mb-4">{error}</div>
            )}
            <div className="space-y-4">
              {realtimeTranscripts.map((t, i) => (
                <div key={i} className="bg-gray-50 p-3 rounded">
                  <p>{t.text}</p>
                  <small>{t.timestamp.toLocaleTimeString()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg">
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-4">Whisper Translation</h2>
            <div className="space-y-4">
              {whisperTranscripts.map((t, i) => (
                <div key={i} className="bg-gray-50 p-3 rounded">
                  <p>{t.text}</p>
                  <small>{t.timestamp.toLocaleTimeString()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;