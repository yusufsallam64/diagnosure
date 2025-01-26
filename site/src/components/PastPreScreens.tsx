import React, { useState, useEffect } from 'react';
import { Clock, ChevronRight, AlertCircle, Calendar, ArrowUpDown, Loader2, X } from 'lucide-react';
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

interface PreReport {
  _id: string;
  timestamp: string;
  validationResult: {
    isValid: boolean;
    confidenceScore: number;
    detectedIssues: string[];
    medicalEntities: string[];
  };
  modelResponses: string[];
}

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const PastPreScreens = () => {
  const [reports, setReports] = useState<PreReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [sortField, setSortField] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<PreReport | null>(null);


  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Ensure all parameters are explicitly set
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        sortField: sortField,
        sortOrder: sortOrder,
        ...(startDate && { startDate: startDate.toISOString() }),
        ...(endDate && { endDate: endDate.toISOString() })
      });

      const response = await fetch(`/api/fetch-pre-reports?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch reports');
      
      const data = await response.json();
      setReports(data.data.reports);
      setPagination(data.data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [currentPage, startDate, endDate, sortField, sortOrder]);

  // Separate handlers for field and order changes
  const handleSortFieldChange = (field: string) => {
    setSortField(field);
    // Reset to default order when changing fields
    setSortOrder('desc');
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleSortOrderChange = () => {
    // Simply toggle the order
    setSortOrder(current => current === 'asc' ? 'desc' : 'asc');
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const getUrgencyLevel = (confidence: number): 'default' | 'destructive' => {
    return confidence < 70 ? 'destructive' : 'default';
  };

  const handleReportClick = (report: PreReport) => {
    setSelectedReport(report);
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
        <h3 className="font-heading text-xl text-text">Past Assessments</h3>
        
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
                  classNames={{
                    month: "space-y-4",
                    caption: "flex justify-center pt-2 relative items-center",
                    cell: "text-center",
                    head: "text-muted-foreground",
                  }}
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
                  classNames={{
                    month: "space-y-4",
                    caption: "flex justify-center pt-2 relative items-center",
                    cell: "text-center",
                    head: "text-muted-foreground",
                  }}
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
              <SelectItem value="confidenceScore">Confidence Score</SelectItem>
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
          {reports.length === 0 ? (
            <Alert>
              <AlertDescription>No assessments found for the selected period.</AlertDescription>
            </Alert>
          ) : (
            reports.map((report) => (
              <div
                key={report._id}
                onClick={() => handleReportClick(report)}
                className="bg-background-800 rounded-lg p-4 cursor-pointer hover:bg-background-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="text-secondary-500 w-5 h-5" />
                    <div>
                      <p className="font-body font-bold text-text">
                        {new Date(report.timestamp).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-text/80">
                        Confidence: {report.validationResult.confidenceScore}%
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Assessment Details</DialogTitle>
            <DialogDescription>
              {selectedReport && new Date(selectedReport.timestamp).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          {selectedReport && (
            <div className="space-y-6 overflow-y-auto pr-2">
              <Alert variant={getUrgencyLevel(selectedReport.validationResult.confidenceScore)}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation Summary</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2 mt-2">
                    <div>
                      <strong>Confidence Score:</strong> {selectedReport.validationResult.confidenceScore}%
                    </div>
                    <div>
                      <strong>Valid Assessment:</strong> {selectedReport.validationResult.isValid ? 'Yes' : 'No'}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Medical Entities</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedReport.validationResult.medicalEntities.map((entity, index) => (
                      <span key={index} className="px-2 py-1 bg-secondary-500/10 rounded-md text-sm">
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedReport.validationResult.detectedIssues.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Detected Issues</h4>
                    <ul className="list-disc pl-4 space-y-1">
                      {selectedReport.validationResult.detectedIssues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-2">Model Responses</h4>
                  <div className="space-y-2">
                    {selectedReport.modelResponses.map((response, index) => (
                      <div key={index} className="p-3 bg-background-800 rounded-md">
                        {response}
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

export default PastPreScreens;