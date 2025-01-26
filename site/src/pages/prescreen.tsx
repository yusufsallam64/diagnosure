import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { GetServerSidePropsContext } from "next";
import { AlertCircle, ArrowLeft, Mic, Square } from 'lucide-react';
import LandingModel from '@/components/LandingModel';
import { ModelResponsePanel } from '@/components/prescreen/ModelResponsePanel';
import { TranscriptPanel } from '@/components/prescreen/TranscriptPanel';
import { RecordingButton } from '@/components/RecordingButton';
import { ActiveTool, ModelResponse, RealtimeEvent, Tool, Transcript } from '@/lib/types';
import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from "next/navigation";

const REALTIME_AI_PROMPT = `\
You are a helpful, realtime AI assistant designed to gather patient information before a visit. \
You are to ask solely about symptoms in order to assist the doctors in generating a diagnosis. \
As the user provides more information about symptoms, you should ask follow up questions to try and narrow down potential conditions. \
No matter what, do NOT tell the user what you predict they have. You are not a source of medical guidance. You are only designed to pull medical information out of indiviuals in order to assist doctors in generating a diagnosis. \
Always maintain professionalism and start conversations in a friendly way. Ask the users how they are feeling both physically and mentally and motivate them to begin discussing their conditions. \
Do not overwhelm the user. You should never be asking more than one follow-up question at a time. Make it a natural conversation that leaves the user comfortable and happy. Keep questions short and do not drag the conversation on. \
When you have gathered sufficient medical information for a doctor to make a preliminary assessment: \
******USE THE conclude_conversation FUNCTION AFTER A POLITE MESSAGE ASKING IF USER WANTS TO GIVE ANY LAST DETAILS \
****CALL THE conclude_conversation FUNCTION AT THE END WHEN THE CONVERSATION IS OVER****** \
`;

const TOOLS: Tool[] = [
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

const Prescreen: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [realtimeTranscripts, setRealtimeTranscripts] = useState<Transcript[]>([]);
  const [modelResponses, setModelResponses] = useState<ModelResponse[]>([]);
  const [whisperTranscripts, setWhisperTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInterrupted, setIsInterrupted] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null);
  const [conversationTerminated, setConversationTerminated] = useState<boolean>(false);
  const [visualizerActive, setVisualizerActive] = useState(true);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const isClosingRef = useRef<boolean>(false);
  const pendingResponseRef = useRef<boolean>(false);
  const isSpeakingRef = useRef(false);
  const speechBufferRef = useRef<Float32Array>(new Float32Array(0));

  const setupAudioProcessing = (stream: MediaStream): void => {
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

    processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!isSpeakingRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const tempBuffer = new Float32Array(speechBufferRef.current.length + inputData.length);
      tempBuffer.set(speechBufferRef.current);
      tempBuffer.set(inputData, speechBufferRef.current.length);
      speechBufferRef.current = tempBuffer;
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
  };

  const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string): void => {
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

    const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array): void => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };

    floatTo16BitPCM(view, 44, samples);
    return new Blob([view], { type: 'audio/wav' });
  };

  const sendToWhisper = async (wavBlob: Blob): Promise<void> => {
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

  const setupDataChannel = (peerConnection: RTCPeerConnection): RTCDataChannel => {
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

        const responseCreate = {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
          },
        };
        dataChannel.send(JSON.stringify(responseCreate));
      }
    };

    dataChannel.onmessage = (e: MessageEvent) => {
      if (isClosingRef.current) return;

      try {
        const realtimeEvent = JSON.parse(e.data) as RealtimeEvent;
        console.log('Received event:', realtimeEvent.type);

        switch (realtimeEvent.type) {
          case 'response.content_part.done':
            if (realtimeEvent.part?.transcript) {
              setModelResponses(prev => [...prev, {
                text: realtimeEvent.part?.transcript! ?? "",
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
                  text: realtimeEvent.delta!.text, 
                  timestamp: new Date(), 
                  interim: true 
                });
              } else {
                newTranscripts[newTranscripts.length - 1].text = realtimeEvent.delta!.text;
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
            isSpeakingRef.current = true;
            speechBufferRef.current = new Float32Array(0);
            if (!isInterrupted) {
              setRealtimeTranscripts(prev => [...prev, { 
                text: "Listening...", 
                timestamp: new Date(),
                interim: true 
              }]);
            }
            break;

          case 'input_audio_buffer.speech_stopped':
          case 'input_audio_buffer.committed':
            if (isSpeakingRef.current) {
              isSpeakingRef.current = false;
              if (speechBufferRef.current.length > 0) {
                const wavBlob = encodeWAV(speechBufferRef.current, audioContextRef.current?.sampleRate || 16000);
                sendToWhisper(wavBlob);
                speechBufferRef.current = new Float32Array(0);
              }
              setRealtimeTranscripts(prev => {
                const newTranscripts = [...prev];
                if (newTranscripts.length > 0) {
                  newTranscripts[newTranscripts.length - 1].interim = false;
                }
                return newTranscripts;
              });
            }
            break;

          case 'response.function_call_arguments.done':
            console.log("Function call arguments:", realtimeEvent.function_call_arguments);
            setConversationTerminated(true);
            break;

          case 'response.tool_calls':
            console.log("Tool called:", realtimeEvent.tool_calls);
            if (realtimeEvent.tool_calls && realtimeEvent.tool_calls.length > 0) {
              const toolCall = realtimeEvent.tool_calls[0];
              if (toolCall.function.name === 'conclude_conversation') {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  setActiveTool({
                    name: 'conclude_conversation',
                    message: args.termination_message,
                    timestamp: new Date()
                  });
                  
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
        if (!isClosingRef.current && err instanceof Error) {
          setError(`Message processing error: ${err.message}`);
        }
      }
    };

    dataChannel.onerror = (error: Event) => {
      console.error('Data channel error:', error);
      if (!isClosingRef.current) {
        setError(`Data channel error: ${error.toString()}`);
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

  const setupWebRTC = async (): Promise<void> => {
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

      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
      }

      peerConnection.ontrack = (e: RTCTrackEvent) => {
        if (e.track.kind === 'audio') {
          console.log('Received audio track');
          const audioStream = new MediaStream([e.track]);
          if (audioRef.current) {
            audioRef.current.srcObject = audioStream;
            
            audioRef.current.play().catch(error => {
              console.log('Autoplay prevented:', error);
              document.addEventListener('click', () => {
                audioRef.current?.play();
              }, { once: true });
            });
          }
        }
      };

      peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

      setupDataChannel(peerConnection);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      mediaStreamRef.current = stream;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      setupAudioProcessing(stream);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) throw new Error('Failed to get SDP answer');
      
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await peerConnection.setRemoteDescription(answer);

      setIsRecording(true);

    } catch (err) {
      console.error('Setup error:', err);
      if (err instanceof Error) {
        setError(err.message);
      }
      stopRecording();
    }
  };

  const stopRecording = (): void => {
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
    isSpeakingRef.current = false;
    speechBufferRef.current = new Float32Array(0);
  };

  useEffect(() => {
    if (!activeTool) return;
  
    const handleConclusion = async () => {
      setModelResponses(prev => [...prev, {
        text: activeTool.message,
        timestamp: new Date(),
        complete: true
      }]);
  
      const checkResponse = (): boolean => {
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
    if (conversationTerminated) {
      const payload = {
        whisperTranscripts: whisperTranscripts.map(t => ({
          text: t.text,
          timestamp: t.timestamp.toISOString()
        })),
        modelResponses: modelResponses.map(r => ({
          text: r.text,
          timestamp: r.timestamp.toISOString(),
          complete: r.complete
        }))
      };
  
      fetch('/api/generate-pre-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(error => {
        console.error('Error submitting conversation report:', error);
      });

      stopRecording();
    }
  }, [conversationTerminated, whisperTranscripts, modelResponses]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background-900 to-background-800 text-text">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {conversationTerminated ? (
          <div className="bg-background-800 rounded-xl p-8 text-center">
            <h2 className="text-3xl font-bold mb-4">Conversation Complete</h2>
            <p>Thank you for providing your information. Your doctor will review it shortly.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center mb-8">
              <button
                onClick={() => window.history.back()}
                aria-label="Return to previous page"
                className="flex items-center gap-3 text-lg bg-background-800 hover:bg-primary-600 transition-colors hover:text-primary-950 px-6 py-1 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              >
                <ArrowLeft className="w-6 h-6" aria-hidden="true" />
                <span className="font-medium">Back</span>
              </button>
            </div>

            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold mb-4">Medical Pre-Screen</h1>
              <p className="text-lg opacity-80 mb-8">Speak naturally about your symptoms</p>
              <button
                onClick={isRecording ? stopRecording : setupWebRTC}
                className={`
                  px-8 py-4 rounded-2xl flex items-center gap-3 mx-auto
                  transition-all duration-300 transform hover:scale-105
                  ${isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-primary-500 hover:bg-primary-600 text-background-900'
                  }
                  shadow-lg hover:shadow-xl
                `}
              >
                {isRecording ? (
                  <>
                    <Square className="w-6 h-6" />
                    <span className="text-xl font-semibold">Stop Recording</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6" />
                    <span className="text-xl font-semibold">Start Speaking</span>
                  </>
                )}
              </button>
            </div>

            {visualizerActive && (
              <div className="relative h-64 mb-8">
                <LandingModel />
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-500/10 rounded-xl text-red-500 flex items-center gap-2">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <TranscriptPanel
                title="Your Speech"
                transcripts={whisperTranscripts}
              />
              <ModelResponsePanel responses={modelResponses} />
            </div>

            <div className="mt-8 text-center text-sm opacity-70">
              <div className="flex items-center justify-center gap-2">
                <AlertCircle size={16} />
                <span>Your information is private and will only be shared with your healthcare provider</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if(!session) {
    return {
      redirect: {
        destination: '/auth/signup',
        permanent: false
      }
    };
  }

  return {
    props: {}
  }
}

export default Prescreen;