import React from 'react';
import { Mic, Square } from 'lucide-react';

interface RecordingButtonProps {
  isRecording: boolean;
  onClick: () => void;
}

export const RecordingButton: React.FC<RecordingButtonProps> = ({
  isRecording,
  onClick
}) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 rounded-lg flex items-center gap-2
      transition-colors duration-300
      ${isRecording 
        ? 'bg-accent-500 hover:bg-accent-600 text-background-900' 
        : 'bg-primary-500 hover:bg-primary-600 text-background-900'
      }
    `}
  >
    {isRecording ? (
      <>
        <Square className="w-4 h-4" />
        <span>Stop</span>
      </>
    ) : (
      <>
        <Mic className="w-4 h-4" />
        <span>Start</span>
      </>
    )}
  </button>
);