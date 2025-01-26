import React, { useState } from 'react';
import { Send, RotateCcw, Share2 } from 'lucide-react';
import Card from './ui/Card';

const DiagnosisChat = () => {
  const [diagnosis, setDiagnosis] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSubmit = () => {
    if (!diagnosis.trim()) return;
    setIsAnalyzing(true);
    
    // Simulate AI response
    setTimeout(() => {
      setAnalysis('Based on the provided symptoms and medical history, here is the detailed analysis...');
      setIsAnalyzing(false);
    }, 1000);
  };

  const handleReset = () => {
    setAnalysis('');
  };

  const handlePublish = () => {
    // Handle publishing logic
    console.log('Publishing diagnosis');
  };

  return (
    <Card className="h-full">
      <div className="p-4 h-full">
        {!analysis ? (
          // Input View
          <div className="h-full flex flex-col space-y-4">
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Enter detailed patient symptoms, medical history, and observations..."
              className="flex-1 p-4 rounded-lg bg-background-700 text-black 
                       placeholder-gray-600 border border-background-600 
                       focus:border-primary-500 focus:ring-1 focus:ring-primary-500 
                       resize-none min-h-[400px]"
            />
            <button
              onClick={handleSubmit}
              disabled={isAnalyzing}
              className="w-full flex items-center justify-center gap-2 p-4 
                       bg-primary-500 hover:bg-primary-600 text-white rounded-lg 
                       transition-colors duration-200 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
              <span>{isAnalyzing ? 'Analyzing...' : 'Analyze Diagnosis'}</span>
            </button>
          </div>
        ) : (
          // Results View
          <div className="h-full flex flex-col space-y-4">
            <div className="flex-1 p-6 rounded-lg bg-background-700 border border-background-600 flex flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-black mb-2">Diagnosis</h3>
                <p className="text-black whitespace-pre-wrap">{diagnosis}</p>
              </div>
              
              <div className="w-full border-t border-background-600 my-4" />
              
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-black mb-2">Validator</h3>
                <p className="text-black whitespace-pre-wrap">{analysis}</p>
              </div>
              
              <div className="pt-4 border-t border-background-600 flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-background-600 hover:bg-background-500 text-white
                           transition-colors duration-200"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>New Analysis</span>
                </button>
                <button
                  onClick={handlePublish}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-primary-500 hover:bg-primary-600 text-white
                           transition-colors duration-200"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Publish Diagnosis</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DiagnosisChat;