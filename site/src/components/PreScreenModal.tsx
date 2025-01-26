import React from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Prescreen } from '@/types/patient';

interface PatientModalProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

const mockPrescreens: Prescreen[] = [
  {
    date: '2024-01-20',
    severity: 'Moderate',
    symptoms: ['Persistent cough', 'Fatigue', 'Mild fever']
  },
  {
    date: '2024-01-15',
    severity: 'Mild',
    symptoms: ['Headache', 'Sore throat']
  },
  {
    date: '2024-01-10',
    severity: 'Severe',
    symptoms: ['High fever', 'Difficulty breathing', 'Chest pain', 'Extreme fatigue']
  }
];

const PatientModal = ({ patientId, patientName, onClose }: PatientModalProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleContinue = () => {
    router.push(`/diagnosis/${patientId}`);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-800 rounded-xl w-full max-w-2xl p-6 m-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{patientName}'s Prescreens</h2>
          <button onClick={onClose} className="p-2 hover:bg-background-700 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {mockPrescreens.map((prescreen, index) => (
            <div key={index} className="p-4 bg-background-700 rounded-lg">
              <p className="text-sm text-text/60 mb-2">{prescreen.date}</p>
              <p className="mb-2">Severity: {prescreen.severity}</p>
              <div className="space-y-1">
                {prescreen.symptoms.map((symptom, i) => (
                  <p key={i} className="text-sm text-text/80">{symptom}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-background-600 hover:bg-background-700"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white"
          >
            Continue to Diagnosis
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientModal;