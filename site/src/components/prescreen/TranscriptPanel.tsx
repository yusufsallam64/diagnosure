import React from 'react';
import { Transcript } from '@/lib/types';

interface TranscriptPanelProps {
  title: string;
  transcripts: Transcript[];
  additionalContent?: React.ReactNode;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  title,
  transcripts,
  additionalContent
}) => (
  <div className="bg-background-800 rounded-xl shadow-lg">
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-heading text-2xl font-bold text-text">{title}</h2>
        {additionalContent}
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {transcripts.map((t, i) => (
          <div 
            key={i} 
            className={`p-3 rounded-lg ${
              t.interim 
                ? 'bg-background-900/50' 
                : 'bg-primary-500/10'
            }`}
          >
            <p className="text-text font-body">{t.text}</p>
            <small className="text-text/70">
              {t.timestamp.toLocaleTimeString()}
            </small>
          </div>
        ))}
      </div>
    </div>
  </div>
);