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

  const handleNavigation = () => {
    router.push(`/diagnosis?id=${patientId}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-800 rounded-xl w-full max-w-2xl p-6 m-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{patientName}'s Prescreens</h2>
          <button onClick={onClose} className="p-2 hover:bg-background-700 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {mockPrescreens.map((prescreen, index) => (
            <button
              key={index}
              onClick={handleNavigation}
              className="w-full p-4 bg-background-700 rounded-lg text-left hover:bg-background-600 transition-colors"
            >
              Prescreen ({prescreen.date})
            </button>
          ))}
        </div>

        <div className="mt-6">
          <button
            onClick={handleNavigation}
            className="w-full px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white"
          >
            Skip to Diagnosis
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientModal;