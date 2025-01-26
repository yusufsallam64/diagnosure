import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Prescreen } from '@/types/patient';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PatientModalProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

interface PreReportData {
  validationResult: {
    confidenceScore: number;
    detectedIssues: string[];
    medicalEntities: string[];
  };
  timestamp: string;
}

interface PaginatedResponse {
  success: boolean;
  data: {
    reports: PreReportData[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

const PatientModal = ({ patientId, patientName, onClose }: PatientModalProps) => {
  const router = useRouter();
  const [reports, setReports] = useState<PreReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [currentPage]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/pre-reports?page=${currentPage}&limit=5&sortField=timestamp&sortOrder=desc`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch prescreens');
      }

      const data: PaginatedResponse = await response.json();
      
      if (data.success) {
        setReports(prev => 
          currentPage === 1 ? data.data.reports : [...prev, ...data.data.reports]
        );
        setHasMore(data.data.pagination.hasNextPage);
      } else {
        throw new Error('Failed to fetch prescreens');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = () => {
    router.push(`/diagnosis?id=${patientId}`);
  };

  const loadMore = () => {
    setCurrentPage(prev => prev + 1);
  };

  const getSeverityFromScore = (score: number): 'Mild' | 'Moderate' | 'Severe' => {
    if (score >= 0.8) return 'Mild';
    if (score >= 0.5) return 'Moderate';
    return 'Severe';
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

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {reports.map((report, index) => (
            <button
              key={index}
              onClick={handleNavigation}
              className="w-full p-4 bg-background-700 rounded-lg text-left hover:bg-background-600 transition-colors"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">
                    Prescreen ({new Date(report.timestamp).toLocaleDateString()})
                  </p>
                  <p className="text-sm text-gray-400">
                    Severity: {getSeverityFromScore(report.validationResult.confidenceScore)}
                  </p>
                </div>
                <div className="text-sm text-gray-400">
                  {report.validationResult.medicalEntities.length} findings
                </div>
              </div>
            </button>
          ))}
          
          {loading && (
            <div className="text-center py-4">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          )}
        </div>

        {hasMore && !loading && (
          <button
            onClick={loadMore}
            className="w-full mt-4 px-4 py-2 rounded-lg bg-background-700 hover:bg-background-600 text-gray-200"
          >
            Load More
          </button>
        )}

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