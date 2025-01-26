// diagnosis.tsx
import React from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, AlertCircle } from 'lucide-react';
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

const PreScreenDisplay = ({ prescreen }: { prescreen?: any }) => {
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

  return (
    <div className="flex-1 p-4">
      <div className="space-y-4">
        <p>Date: {prescreen.date}</p>
        <p>Severity: {prescreen.severity}</p>
        <div>
          <h4 className="mb-2">Symptoms:</h4>
          <ul className="list-disc pl-4">
            {prescreen.symptoms.map((symptom: string, index: number) => (
              <li key={index}>{symptom}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const DiagnosisPage = () => {
  const searchParams = useSearchParams();
  const patientId = searchParams.get('id');
  const [activeTab, setActiveTab] = React.useState('records');

  const mockPrescreen = {
    date: '2024-01-20',
    severity: 'Moderate',
    symptoms: ['Persistent cough', 'Fatigue', 'Mild fever']
  };

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
              disabled={!mockPrescreen}
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
            <PreScreenDisplay prescreen={mockPrescreen} />
          )}
        </Tabs>
      </div>
      
      <div className="lg:col-span-1">
        <DiagnosisChat />
      </div>
    </div>
  );
};

export default DiagnosisPage;