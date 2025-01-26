import React from 'react';
import { ModelResponse } from '@/lib/types';

interface ModelResponsePanelProps {
  responses: ModelResponse[];
}

export const ModelResponsePanel: React.FC<ModelResponsePanelProps> = ({ responses }) => (
  <div className="bg-background-800 rounded-xl shadow-lg">
    <div className="p-6">
      <h2 className="font-heading text-2xl font-bold text-text mb-4">
        Model Responses
      </h2>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {responses.map((r, i) => (
          <div key={i} className="p-3 rounded-lg bg-secondary-500/10">
            <p className="text-text font-body">{r.text}</p>
            <small className="text-text/70">
              {r.timestamp.toLocaleTimeString()}
            </small>
          </div>
        ))}
      </div>
    </div>
  </div>
);