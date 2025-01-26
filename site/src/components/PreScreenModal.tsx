import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ChevronRight, X } from 'lucide-react';

interface PrescreenModalProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

interface Prescreen {
  _id: string;
  timestamp: Date;
}

export default function PrescreenModal({ patientId, patientName, onClose }: PrescreenModalProps) {
  const router = useRouter();
  const [prescreens, setPrescreens] = useState<Prescreen[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const fetchPrescreens = async () => {
    if (!patientId) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/patients/${patientId}/prescreens`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setPrescreens(data.data.reports);
    } catch (error: any) {
      setError(error.message || 'Failed to fetch prescreens');
      console.error('Error fetching prescreens:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPrescreens();
    }
  }, [patientId]);

  const handlePrescreenClick = (prescreenId: string) => {
    router.push(`/diagnosis?id=${patientId}&prescreenId=${prescreenId}`);
  };

  const handleNavigation = () => {
    router.push(`/diagnosis?id=${patientId}`);
  }


  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-900 rounded-lg w-full max-w-xl mx-4 shadow-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{patientName}'s Prescreens</h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center py-6">{error}</div>
        ) : prescreens.length === 0 ? (
          <div className="text-gray-500 text-center py-6">No prescreens found</div>
        ) : (
          <div className="space-y-3">
            {prescreens.map((prescreen) => (
              <button
                key={prescreen._id}
                onClick={() => handlePrescreenClick(prescreen._id)}
                className="w-full p-3 bg-background-900 rounded-md text-left hover:bg-background-700 transition-colors text-gray-900"
              >
                Prescreen ({new Date(prescreen.timestamp).toLocaleDateString()})
              </button>
            ))}
          </div>
        )}
      </div>

        <div className="p-4 border-t">
          <button
            onClick={handleNavigation}
            className="w-full py-2 px-4 border-primary-500 border text-black hover:bg-primary-500 rounded-md transition-all duration-200 font-medium flex items-center justify-center gap-2 group"
          >
            Skip to Diagnosis 
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
          </button>
        </div>
      </div>
    </div>
  );
}