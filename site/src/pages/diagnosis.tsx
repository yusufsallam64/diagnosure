import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, AlertCircle, ChevronDown, ChevronUp, UserCircle, Bot, ArrowLeft } from 'lucide-react';
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
      className={`px-4 py-2 rounded-t-lg transition-colors ${active
        ? 'bg-background-700 text-primary-500'
        : 'hover:bg-background-700/50'
        } ${disabled
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
  const [isConversationOpen, setIsConversationOpen] = useState(false);

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
    <div className="flex-1 p-4 space-y-1 overflow-y-auto">
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

      {/* Rest of the component remains the same */}
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
      {prescreen.validationResult?.detectedIssues?.length > 0 ? (
        <div className="bg-background-700/50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Detected Issues</h3>
          <ul className="space-y-2">
            {prescreen.validationResult.detectedIssues.map((issue: string, index: number) => (
              <li
                key={index}
                className="text-sm bg-background-700 p-2 rounded"
              >
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-background-700/50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Detected Issues</h3>
          <p className="text-sm">No issues detected</p>
        </div>
      )}

      {/* Conversation Section */}
      <div className="bg-background-700/50 rounded-lg">
        <button
          onClick={() => setIsConversationOpen(!isConversationOpen)}
          className="w-full p-4 flex items-center justify-between text-lg font-semibold hover:bg-background-700/70 rounded-lg transition-colors"
        >
          <span>Conversation</span>
          {isConversationOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>

        {isConversationOpen && (
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {transcriptData.map((segment: ValidatedSegment, index: number) => (
              <React.Fragment key={index}>
                {/* Human Message */}
                <div className="bg-background-700 p-3 rounded">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCircle className="w-4 h-4" />
                    <span className="text-xs font-bold">Human</span>
                  </div>
                  <p className="text-sm">{segment.text}</p>
                </div>

                {/* Model Response (if exists) */}
                {prescreen.modelResponses?.[index] && (
                  <div className="bg-background-800 p-3 rounded ml-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs font-medium">Assistant</span>
                    </div>
                    <p className="text-sm">{prescreen.modelResponses[index]}</p>
                  </div>
                )}
              </React.Fragment>
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
  const [activeTab, setActiveTab] = React.useState('records'); // prescreenId ? 'prescreen' : 
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
    <>
    <div className="flex flex-row items-center m-8 my-4 mb-0 mr-auto place-content-start">
      <button
        onClick={() => window.history.back()}
        aria-label="Return to previous page"
        className="flex items-center gap-3 text-lg bg-background-800 hover:bg-primary-600 transition-colors hover:text-primary-950 px-6 py-1 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="w-6 h-6" aria-hidden="true" />
        <span className="font-medium">Back</span>
      </button>
    </div>
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
        <DiagnosisChat prescreenId={prescreenId} patientId={patientId}/>
      </div>
    </div>
    </>
  );
};

export default DiagnosisPage;