import React, { useState } from 'react';
import { Send, RotateCcw, Share2 } from 'lucide-react';
import Card from './ui/Card';
import { useSession } from "next-auth/react";
import { useRouter } from 'next/router';

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

interface DiagnosisChatProps {
  prescreenId: string | null;
  patientId: string;
}

// Function to process markdown-like syntax
const processMarkdown = (text: string): string => {
  if (!text) return '';
  
  // Replace ### headers with styled div
  text = text.replace(/###\s(.*?)(?=\n|$)/g, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
  
  // Replace ** bold ** with styled span
  text = text.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold">$1</span>');
  
  // Replace bullet points
  text = text.replace(/^\s*\-\s/gm, '• ');
  
  // Split into paragraphs and wrap each in a div
  return text.split('\n\n').map((paragraph, index) => 
    `<div class="mb-3" key="${index}">${paragraph}</div>`
  ).join('');
};

const DiagnosisChat = ({ prescreenId, patientId }: DiagnosisChatProps) => {
  const { data: session } = useSession();
  const router = useRouter()
  const [diagnosis, setDiagnosis] = useState('');
  const [previousDiagnosis, setPreviousDiagnosis] = useState('');
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !session?.user?.id) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // First fetch the pre-report
      const preReportResponse = await fetch(`/api/diagnosis-pre-report?userId=${patientId}&reportId=${prescreenId}`);

      if (!preReportResponse.ok) {
        throw new Error('Failed to fetch pre-report');
      }

      const preReportData = await preReportResponse.json();

      // Then make the validation call with the pre-report data included
      const response = await fetch('http://localhost:8080/api/validate_diagnosis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: session.user.id,
          doctor_diagnosis: diagnosis,
          additional_notes: JSON.stringify(preReportData.data)
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
    setPreviousDiagnosis(diagnosis);
    setValidationData(null);
    setDiagnosis('');
    setError(null);
  };

  const handlePublish = async () => {
    if (!validationData || !session?.user?.id) return;

    setIsPublishing(true);
    setError(null);

    try {
      const response = await fetch('/api/publish-diagnosis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: patientId,
          doctor_diagnosis: diagnosis,
          validation_data: validationData
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to publish diagnosis');
      }

      console.log('Diagnosis published successfully:', result);
      handleReset();

      router.push('/doctorView');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish diagnosis');
    } finally {
      setIsPublishing(false);
    }
  };

  const renderAnalysis = () => {
    if (!validationData) return null;

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <h3 className="text-lg font-semibold text-black mb-2">Validation Analysis</h3>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div className="prose prose-invert max-w-none">
            <div
              dangerouslySetInnerHTML={{
                __html: processMarkdown(validationData.validation_result.analysis)
              }}
              className="text-black whitespace-pre-wrap"
            />
          </div>

          <div>
            <h4 className="font-medium text-black mb-2">Suggestions:</h4>
            <div className="space-y-2">
              {validationData.suggestions.map((suggestion, index) => (
                <div 
                  key={index}
                  dangerouslySetInnerHTML={{
                    __html: processMarkdown(suggestion)
                  }}
                  className="p-3 bg-background-800 rounded-md text-black"
                />
              ))}
            </div>
          </div>

          {validationData.validation_result.discrepancies.length > 0 && (
            <div>
              <h4 className="font-medium text-black mb-2">Discrepancies:</h4>
              <ul className="list-disc pl-4 space-y-1">
                {validationData.validation_result.discrepancies.map((discrepancy, index) => (
                  <li 
                    key={index}
                    dangerouslySetInnerHTML={{
                      __html: processMarkdown(discrepancy)
                    }}
                    className="text-black"
                  />
                ))}
              </ul>
            </div>
          )}

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
      <div className="p-4 h-full flex flex-col">
        {!validationData ? (
          // Input View
          <div className="h-full flex flex-col space-y-4">
            {previousDiagnosis && (
              <div className="p-4 rounded-lg bg-background-900 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Previous Diagnosis</h4>
                <div
                  dangerouslySetInnerHTML={{
                    __html: processMarkdown(previousDiagnosis)
                  }}
                  className="text-sm text-gray-800"
                />
              </div>
            )}
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Enter detailed patient symptoms, medical history, and observations.."
              className="flex-1 p-4 rounded-lg bg-background-700 text-black 
                       placeholder-gray-600 border border-background-600 
                       focus:border-primary-500 focus:ring-1 focus:ring-primary-500 
                       resize-none overflow-y-auto"
            />
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}
            <button
              onClick={handleSubmit}
              disabled={isAnalyzing}
              className="flex items-center justify-center gap-2 p-4 
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
            <div className="flex-1 p-6 rounded-lg bg-background-700 border border-background-600 
                          flex flex-col min-h-0 max-h-screen">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-black mb-2">Diagnosis</h3>
                <div
                  dangerouslySetInnerHTML={{
                    __html: processMarkdown(diagnosis)
                  }}
                  className="text-black whitespace-pre-wrap"
                />
              </div>

              <div className="w-full border-t border-background-600 my-4" />

              {renderAnalysis()}

              <div className="pt-4 mt-auto border-t border-background-600 flex gap-3">
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
                  disabled={isPublishing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-primary-500 hover:bg-primary-600 text-white
                           transition-colors duration-200 disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isPublishing ? 'Publishing...' : 'Publish Diagnosis'}</span>
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