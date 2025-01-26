import React, { useState, useEffect } from 'react';
import { Clock, ChevronRight, AlertCircle, Calendar, ArrowUpDown, Loader2, X, Activity } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Diagnosis {
  _id: string;
  userId: string;
  diagnosis: string;
  validationData: {
    validation_result: {
      analysis: string;
      matching_symptoms: boolean;
      discrepancies: string[];
    };
    suggestions: string[];
    risk_level: string;
    confidence_score: number;
  };
  timestamp: string;
  status: string;
}

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const DiagnosisList = () => {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [sortField, setSortField] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<Diagnosis | null>(null);

  const fetchDiagnoses = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '5',
        sortField: sortField,
        sortOrder: sortOrder,
        ...(startDate && { startDate: startDate.toISOString() }),
        ...(endDate && { endDate: endDate.toISOString() })
      });

      const response = await fetch(`/api/diagnoses?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch diagnoses');
      
      const data = await response.json();
      setDiagnoses(data.data.diagnoses);
      setPagination(data.data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnoses();
  }, [currentPage, startDate, endDate, sortField, sortOrder]);

  const handleSortFieldChange = (field: string) => {
    setSortField(field);
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const handleSortOrderChange = () => {
    setSortOrder(current => current === 'asc' ? 'desc' : 'asc');
    setCurrentPage(1);
  };

  const getRiskLevel = (level: string): 'default' | 'warning' | 'destructive' => {
    switch (level.toLowerCase()) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleDiagnosisClick = (diagnosis: Diagnosis) => {
    setSelectedDiagnosis(diagnosis);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-heading text-xl text-text">Historical Diagnoses</h3>
        
        <div className="flex gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Filter Dates
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-2 max-w-[90vw]" 
              align="end"
              collisionPadding={16}
            >
              <div className="flex flex-col md:flex-row gap-4 p-2">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Start Date</label>
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    className="rounded-md border"
                  />
                  {startDate && (
                    <div className="flex items-center gap-2 text-sm">
                      <span>Selected:</span>
                      <span className="font-medium">
                        {startDate.toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStartDate(null)}
                        className="h-6 w-6 p-1 text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <label className="text-sm font-medium">End Date</label>
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    className="rounded-md border"
                  />
                  {endDate && (
                    <div className="flex items-center gap-2 text-sm">
                      <span>Selected:</span>
                      <span className="font-medium">
                        {endDate.toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEndDate(null)}
                        className="h-6 w-6 p-1 text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={sortField} onValueChange={handleSortFieldChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="timestamp">Date</SelectItem>
              <SelectItem value="confidence_score">Confidence Score</SelectItem>
              <SelectItem value="risk_level">Risk Level</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={handleSortOrderChange}
            className="transition-all duration-200"
          >
            <ArrowUpDown 
              className={`h-4 w-4 transition-transform duration-200 ${
                sortOrder === 'desc' ? 'rotate-180' : ''
              }`} 
            />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {diagnoses.length === 0 ? (
            <Alert>
              <AlertDescription>No diagnoses found for the selected period.</AlertDescription>
            </Alert>
          ) : (
            diagnoses.map((diagnosis) => (
              <div
                key={diagnosis._id}
                onClick={() => handleDiagnosisClick(diagnosis)}
                className="bg-background-800 rounded-lg p-4 cursor-pointer hover:bg-background-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="text-secondary-500 w-5 h-5" />
                    <div>
                      <p className="font-body font-bold text-text">
                        {diagnosis.diagnosis}
                      </p>
                      <p className="text-sm text-text/80">
                        {new Date(diagnosis.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      diagnosis.validationData.risk_level === 'HIGH'
                        ? 'bg-destructive/20 text-destructive'
                        : diagnosis.validationData.risk_level === 'MEDIUM'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-secondary/20 text-secondary'
                    }`}>
                      {diagnosis.validationData.risk_level}
                    </span>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={!!selectedDiagnosis} onOpenChange={() => setSelectedDiagnosis(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedDiagnosis?.diagnosis}</DialogTitle>
            <DialogDescription>
              {selectedDiagnosis && new Date(selectedDiagnosis.timestamp).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          {selectedDiagnosis && (
            <div className="space-y-6 overflow-y-auto pr-2">
              <Alert variant={getRiskLevel(selectedDiagnosis.validationData.risk_level)}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation Summary</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2 mt-2">
                    <div>
                      <strong>Risk Level:</strong> {selectedDiagnosis.validationData.risk_level}
                    </div>
                    <div>
                      <strong>Confidence Score:</strong> {(selectedDiagnosis.validationData.confidence_score * 100).toFixed(0)}%
                    </div>
                    <div>
                      <strong>Symptoms Match:</strong> {selectedDiagnosis.validationData.validation_result.matching_symptoms ? 'Yes' : 'No'}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Analysis</h4>
                  <div className="p-3 bg-background-800 rounded-md">
                    {selectedDiagnosis.validationData.validation_result.analysis}
                  </div>
                </div>

                {selectedDiagnosis.validationData.validation_result.discrepancies.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Discrepancies</h4>
                    <ul className="list-disc pl-4 space-y-1">
                      {selectedDiagnosis.validationData.validation_result.discrepancies.map((discrepancy, index) => (
                        <li key={index}>{discrepancy}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-2">Suggestions</h4>
                  <div className="space-y-2">
                    {selectedDiagnosis.validationData.suggestions.map((suggestion, index) => (
                      <div key={index} className="p-3 bg-background-800 rounded-md">
                        {suggestion}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pagination && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            disabled={!pagination.hasPrevPage}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!pagination.hasNextPage}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default DiagnosisList;