import React, { useState } from 'react';
import { Send, RotateCcw, Share2 } from 'lucide-react';
import Card from './ui/card';

interface ValidationResponse {
  validation_result: {
    analysis: string;
    matching_symptoms: boolean;
    discrepancies: string[];
  };
  suggestions: string[];
  risk_level: string;
  confidence_score: number;
}

const DiagnosisChat = (prescreenId:any) => {
  const [diagnosis, setDiagnosis] = useState('');
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!diagnosis.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8080/api/validate_diagnosis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'current-user', // This should be dynamically set based on authenticated user
          doctor_diagnosis: diagnosis,
          additional_notes: ''
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to validate diagnosis');
      }

      const data: ValidationResponse = await response.json();
      setValidationData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setValidationData(null);
    setDiagnosis('');
    setError(null);
  };

  const handlePublish = () => {
    // Handle publishing logic - this could be another API endpoint
    console.log('Publishing diagnosis and validation');
  };

  const renderAnalysis = () => {
    if (!validationData) return null;

    return (
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-black mb-2">Validation Analysis</h3>
        <div className="space-y-4">
          <div>
            <p className="text-black whitespace-pre-wrap">{validationData.validation_result.analysis}</p>
          </div>
          
          <div>
            <h4 className="font-medium text-black mb-2">Suggestions:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {validationData.suggestions.map((suggestion, index) => (
                <li key={index} className="text-black">{suggestion}</li>
              ))}
            </ul>
          </div>
          
          <div className="flex gap-4">
            <div>
              <span className="font-medium">Risk Level: </span>
              <span className={`
                ${validationData.risk_level === 'HIGH' ? 'text-red-600' : ''}
                ${validationData.risk_level === 'MEDIUM' ? 'text-yellow-600' : ''}
                ${validationData.risk_level === 'LOW' ? 'text-green-600' : ''}
              `}>
                {validationData.risk_level}
              </span>
            </div>
            <div>
              <span className="font-medium">Confidence: </span>
              <span>{(validationData.confidence_score * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full">
      <div className="p-4 h-full">
        {!validationData ? (
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
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}
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
              
              {renderAnalysis()}
              
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