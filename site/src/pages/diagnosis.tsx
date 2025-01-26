import React, {useEffect, useState} from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import DiagnosisChat from '@/components/DiagnosisChat';

const Tabs = ({ children }: { children: React.ReactNode }) => {
  return <div className="h-full flex flex-col">{children}</div>;
};

const TabsList = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex space-x-2 pt-3 pl-3 border-b border-background-700">
      {children}
    </div>
  );
};
interface ValidatedSegment {
  text: string;
  start: number;
  end: number;
}

const TabsTrigger = ({ 
  value, 
  active, 
  disabled, 
  onClick, 
  children 
}: { 
  value: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => {
  return (
    <button
      className={`px-4 py-2 rounded-t-lg transition-colors ${
        active 
          ? 'bg-background-700 text-primary-500' 
          : 'hover:bg-background-700/50'
      } ${
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const PDFViewer = ({ patientId }: { patientId: string }) => {
  return (
    <div className="flex-1 p-4">
      <iframe 
        src={`data/${patientId}.pdf`}
        className="w-full h-full"
        style={{ minHeight: 'calc(100vh - 180px)' }}
        title="Medical Records"
      />
    </div>
  );
};

const PreScreenDisplay = ({ 
  prescreen, 
  isLoading 
}: { 
  prescreen?: any;
  isLoading: boolean;
}) => {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isResponsesOpen, setIsResponsesOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!prescreen) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-text/60">
          <AlertCircle className="mx-auto mb-4 w-12 h-12" />
          <p>No prescreen data available</p>
        </div>
      </div>
    );
  }

  const transcriptData = prescreen.validatedTranscript || prescreen.originalTranscript || [];

  return (
    <div className="flex-1 p-4 space-y-3 overflow-y-auto">
      {/* Summary Section */}
      <div className="bg-background-700/50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Summary</h3>
        <p className="text-sm">Date: {new Date(prescreen.timestamp).toLocaleDateString()}</p>
        {prescreen.validationResult && (
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              Confidence Score: {prescreen.validationResult.confidenceScore}
            </p>
            <p className="text-sm">
              Valid: {prescreen.validationResult.isValid ? 'Yes' : 'No'}
            </p>
          </div>
        )}
      </div>

      {/* Medical Entities Section */}
      {prescreen.validationResult?.medicalEntities && (
        <div className="bg-background-700/50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Medical Entities</h3>
          <div className="flex flex-wrap gap-2">
            {prescreen.validationResult.medicalEntities.map((entity: string, index: number) => (
              <span key={index} className="px-3 py-1 bg-background-700 rounded-full text-sm">
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Issues Section */}
      {prescreen.validationResult?.detectedIssues && (
        <div className="bg-background-700/50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Detected Issues</h3>
          <ul className="space-y-2">
            {prescreen.validationResult.detectedIssues.map((issue: string, index: number) => (
              <li key={index} className="text-sm bg-background-700 p-2 rounded">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Model Responses Section */}
      {prescreen.modelResponses && prescreen.modelResponses.length > 0 && (
        <div className="bg-background-700/50 rounded-lg">
          <button
            onClick={() => setIsResponsesOpen(!isResponsesOpen)}
            className="w-full p-4 flex items-center justify-between text-lg font-semibold hover:bg-background-700/70 rounded-lg transition-colors"
          >
            <span>Model Responses</span>
            {isResponsesOpen ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
          
          {isResponsesOpen && (
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {prescreen.modelResponses.map((response: string, index: number) => (
                <div key={index} className="text-sm bg-background-700 p-2 rounded">
                  {response}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Transcript Section */}
      <div className="bg-background-700/50 rounded-lg">
        <button
          onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
          className="w-full p-4 flex items-center justify-between text-lg font-semibold hover:bg-background-700/70 rounded-lg transition-colors"
        >
          <span>Transcript</span>
          {isTranscriptOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>
        
        {isTranscriptOpen && (
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {transcriptData.map((segment: ValidatedSegment, index: number) => (
              <div key={index} className="bg-background-700 p-3 rounded">
                <p className="text-sm">{segment.text}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Time: {segment.start}s - {segment.end}s
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const DiagnosisPage = () => {
  const searchParams = useSearchParams();
  const patientId = searchParams.get('id');
  const prescreenId = searchParams.get('prescreenId');
  const [activeTab, setActiveTab] = React.useState(prescreenId ? 'prescreen' : 'records');
  const [prescreen, setPrescreen] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    const fetchPrescreen = async () => {
      if (!prescreenId || !patientId) return;
      
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/diagnosis-pre-report?userId=${patientId}&reportId=${prescreenId}`,
          { method: 'GET' }
        );
    
        if (!response.ok) throw new Error('Failed to fetch prescreen');
        const { data } = await response.json();
        setPrescreen(data);
      } catch (error) {
        console.error('Error fetching prescreen:', error);
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchPrescreen();
  }, [prescreenId, patientId]);

  if (!patientId) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p>No patient ID provided</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 h-screen">
      <div className="lg:col-span-2 bg-background-800 rounded-lg">
        <Tabs>
          <TabsList>
            <TabsTrigger 
              value="records"
              active={activeTab === 'records'}
              onClick={() => setActiveTab('records')}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Medical Records
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="prescreen"
              active={activeTab === 'prescreen'}
              onClick={() => setActiveTab('prescreen')}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Pre-Screen
              </div>
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'records' ? (
            <PDFViewer patientId={patientId} />
          ) : (
            <PreScreenDisplay 
              prescreen={prescreen} 
              isLoading={isLoading}
            />
          )}
        </Tabs>
      </div>
      
      <div className="lg:col-span-1">
        <DiagnosisChat prescreenId={prescreenId} />
      </div>
    </div>
  );
};

export default DiagnosisPage;