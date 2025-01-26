import React, { useState, useEffect, useRef } from 'react';

const REALTIME_AI_PROMPT = " \
  You are a helpful, realtime AI assistant designed to gather patient information before a visit. \
  You are to ask solely about symptoms in order to assist the doctors in generating a diagnosis. \
  As the user provides more information about symptoms, you should ask follow up questions to try and narrow down potential conditions. \
  No matter what, do NOT tell the user what you predict they have. You are not a source of medical guidance. You are only designed to pull medical information out of indiviuals in order to assist doctors in generating a diagnosis. \
  Always maintain professionalism and start conversations in a friendly way. Ask the users how they are feeling both physically and mentally and motivate them to begin discussing their conditions. \
  Do not overwhelm the user. You should never be asking more than one follow-up question at a time. Make it a natural conversation that leaves the user comfortable and happy. Keep questions short and do not drag the conversation on. \
  When you have gathered sufficient medical information for a doctor to make a preliminary assessment: \
  ******USE THE conclude_conversation FUNCTION AFTER A POLITE MESSAGE ASKING IF USER WANTS TO GIVE ANY LAST DETAILS \
  ****CALL THE conclude_conversation FUNCTION AT THE END WHEN THE CONVERSATION IS OVER****** \
  ";

const TOOLS = [
  {
    type: "function",
    name: "conclude_conversation",
    description: "End conversation when sufficient medical information has been gathered",
    parameters: {
      type: "object",
      properties: {
        "termination_message": {
          "type": "string",
          "description": "Final message to display before ending conversation"
        }
      },
      required: ["termination_message"]
    }
  }
];

const Dashboard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [realtimeTranscripts, setRealtimeTranscripts] = useState([]);
  const [modelResponses, setModelResponses] = useState([]);
  const [whisperTranscripts, setWhisperTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const audioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const [activeTool, setActiveTool] = useState(null);
  
  const [conversationTerminated, setConversationTerminated] = useState(false);

  // Audio processing refs
  const audioContextRef = useRef(null);
  const processorNodeRef = useRef(null);
  const recordingBufferRef = useRef([]);
  const lastSendTimeRef = useRef(0);

  // Add new refs for tracking connection state
  const isClosingRef = useRef(false);
  const pendingResponseRef = useRef(false);

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
        const sessionUpdate = {
          type: "session.update",
          session: {
            instructions: REALTIME_AI_PROMPT,
            tools: TOOLS,
            tool_choice: "auto",
          },
        };
        dataChannel.send(JSON.stringify(sessionUpdate));

        // Create initial response to start conversation
        const responseCreate = {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
          },
        };
        dataChannel.send(JSON.stringify(responseCreate));
      }
    };

    dataChannel.onmessage = (e) => {
      if (isClosingRef.current) return;

      try {
        const realtimeEvent = JSON.parse(e.data);
        console.log('Received event:', realtimeEvent.type);

        switch (realtimeEvent.type) {
          case 'response.content_part.done':
            if (realtimeEvent.part?.transcript) {
              setModelResponses(prev => [...prev, {
                text: realtimeEvent.part.transcript,
                timestamp: new Date(),
                complete: true
              }]);
            }
            pendingResponseRef.current = false;
            break;

          case 'response.audio_transcript.delta':
            pendingResponseRef.current = true;
            setRealtimeTranscripts(prev => {
              const newTranscripts = [...prev];
              if (newTranscripts.length === 0 || !newTranscripts[newTranscripts.length - 1].interim) {
                newTranscripts.push({ 
                  text: realtimeEvent.delta.text, 
                  timestamp: new Date(), 
                  interim: true 
                });
              } else {
                newTranscripts[newTranscripts.length - 1].text = realtimeEvent.delta.text;
              }
              return newTranscripts;
            });
            break;

          case 'response.audio_transcript.done':
            pendingResponseRef.current = false;
            setRealtimeTranscripts(prev => {
              const newTranscripts = [...prev];
              if (newTranscripts.length > 0) {
                newTranscripts[newTranscripts.length - 1].interim = false;
              }
              return newTranscripts;
            });
            break;

          case 'input_audio_buffer.speech_started':
            if (!isInterrupted) {
              setRealtimeTranscripts(prev => [...prev, { 
                text: "Listening...", 
                timestamp: new Date(),
                interim: true 
              }]);
            }
            break;

          case 'response.function_call_arguments.done':
            console.log("Function call arguments:", realtimeEvent.function_call_arguments);
            console.log("Function call itself:", realtimeEvent);
            setConversationTerminated(true);
            break


          case 'response.tool_calls':
            console.log("Tool called:", realtimeEvent.tool_calls);
            const toolCall = realtimeEvent.tool_calls[0];
            if (toolCall.function.name === 'conclude_conversation') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                setActiveTool({
                  name: 'conclude_conversation',
                  message: args.termination_message,
                  timestamp: new Date()
                });
                
                // Send tool response without closing connection
                const toolResponse = {
                  type: "response.submit_tool_outputs",
                  tool_outputs: [{
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({ status: "awaiting_confirmation" })
                  }]
                };
                if (dataChannel.readyState === 'open') {
                  dataChannel.send(JSON.stringify(toolResponse));
                }
              } catch (err) {
                console.error('Tool call error:', err);
              }
            }
            break;

          case 'error':
            console.error('Realtime API error:', realtimeEvent);
            if (!isClosingRef.current) {
              setError(`API Error: ${realtimeEvent.message}`);
            }
            break;
        }
      } catch (err) {
        console.error('Error processing message:', err);
        if (!isClosingRef.current) {
          setError(`Message processing error: ${err.message}`);
        }
      }
    };

    dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      if (!isClosingRef.current) {
        setError(`Data channel error: ${error.message}`);
      }
    };

    dataChannel.onclose = () => {
      console.log('Data channel closed');
      if (!isClosingRef.current) {
        stopRecording();
      }
    };

    return dataChannel;
  };

  useEffect(() => {
    if (!activeTool) return;
  
    const handleConclusion = async () => {
      setModelResponses(prev => [...prev, {
        text: activeTool.message,
        timestamp: new Date(),
        complete: true
      }]);
  
      const checkResponse = () => {
        if (whisperTranscripts.length === 0) return false;
        const lastTranscript = whisperTranscripts[whisperTranscripts.length - 1];
        return lastTranscript.timestamp > activeTool.timestamp;
      };
  
      const timeout = setTimeout(() => {
        if (!isClosingRef.current) {
          stopRecording();
        }
      }, 10000);
  
      const interval = setInterval(() => {
        if (checkResponse() && !isClosingRef.current) {
          clearTimeout(timeout);
          clearInterval(interval);
          
          const lastMessage = whisperTranscripts[whisperTranscripts.length - 1].text.toLowerCase();
          if (lastMessage.includes('no') || lastMessage.includes('nothing else')) {
            setModelResponses(prev => [...prev, {
              text: "Thank you. Your information has been securely saved for your doctor.",
              timestamp: new Date(),
              complete: true
            }]);
            setTimeout(() => {
              if (!isClosingRef.current) {
                stopRecording();
              }
            }, 2000);
          } else {
            setModelResponses(prev => [...prev, {
              text: "Please continue describing your symptoms...",
              timestamp: new Date(),
              complete: true
            }]);
            setActiveTool(null);
            
            // Create a new response to continue the conversation
            if (dataChannelRef.current?.readyState === 'open') {
              const responseCreate = {
                type: "response.create",
                response: {
                  modalities: ["audio", "text"],
                }
              };
              dataChannelRef.current.send(JSON.stringify(responseCreate));
            }
          }
        }
      }, 500);
  
      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    };
  
    handleConclusion();
  }, [activeTool, whisperTranscripts]);

  const setupWebRTC = async () => {
    try {
      isClosingRef.current = false;
      pendingResponseRef.current = false;
      setIsInterrupted(false);
      setError(null);
      setRealtimeTranscripts([]);
      setModelResponses([]);
      setWhisperTranscripts([]);
      setActiveTool(null);

      const tokenResponse = await fetch('/api/get-realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!tokenResponse.ok) throw new Error('Failed to get token');
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.clientSecret;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = peerConnection;

      // Set up audio element for playback
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
      }

      // Handle incoming audio tracks
      peerConnection.ontrack = (e) => {
        if (e.track.kind === 'audio') {
          console.log('Received audio track');
          const audioStream = new MediaStream([e.track]);
          audioRef.current.srcObject = audioStream;
          
          audioRef.current.play().catch(error => {
            console.log('Autoplay prevented:', error);
            document.addEventListener('click', () => {
              audioRef.current.play();
            }, { once: true });
          });
        }
      };

      // Add audio transceiver for bidirectional audio
      peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

      setupDataChannel(peerConnection);

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      mediaStreamRef.current = stream;

      // Add local stream tracks
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      // Setup audio processing for Whisper
      setupAudioProcessing(stream);

      // Create and set local description
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send offer to server
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-mini-realtime-preview";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
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
    isClosingRef.current = true;
    
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
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    
    setIsRecording(false);
    setIsInterrupted(false);
    isClosingRef.current = false;
  };

  // Handle connection state changes
  useEffect(() => {
    const handleConnectionStateChange = () => {
      if (peerConnectionRef.current?.connectionState === 'disconnected' && !isClosingRef.current) {
        console.log('Connection disconnected unexpectedly');
        stopRecording();
      }
    };

    if (peerConnectionRef.current) {
      peerConnectionRef.current.addEventListener('connectionstatechange', handleConnectionStateChange);
    }

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.removeEventListener('connectionstatechange', handleConnectionStateChange);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      isClosingRef.current = true;
      stopRecording();
    };
  }, []);

  useEffect(() => {
    if(conversationTerminated) {
      stopRecording();
    }
  }, [conversationTerminated]);

  return (
    <div className="container mx-auto p-4">
      { conversationTerminated ? (
          <h2 className="text-2xl font-bold">Conversation Ended</h2>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-lg">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">Your Speech</h2>
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
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {realtimeTranscripts.map((t, i) => (
                    <div key={i} className={`p-3 rounded ${t.interim ? 'bg-gray-50' : 'bg-blue-50'}`}>
                      <p>{t.text}</p>
                      <small>{t.timestamp.toLocaleTimeString()}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Model Responses</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {modelResponses.map((r, i) => (
                    <div key={i} className="p-3 rounded bg-green-50">
                      <p>{r.text}</p>
                      <small>{r.timestamp.toLocaleTimeString()}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Whisper Translation</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto">
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
        )}
    </div>
  );
};

export default Dashboard;