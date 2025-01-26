import React from 'react';
import { Clock, ChevronRight, AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

const mockPreScreens = [
  {
    id: 1,
    date: '2024-01-20',
    status: 'Completed',
    summary: 'General Health Assessment',
    urgency: 'low'
  },
  {
    id: 2,
    date: '2024-01-15',
    status: 'Incomplete',
    summary: 'Follow-up Assessment',
    urgency: 'medium'
  }
];

const PastPreScreens = () => {
  return (
    <div className="mt-8">
      <h3 className="font-heading text-xl text-text mb-4">Past Assessments</h3>
      <div className="space-y-4">
        {mockPreScreens.map((screen) => (
          <details
            key={screen.id}
            className="group bg-background-800 rounded-lg p-4 cursor-pointer"
          >
            <summary className="list-none flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="text-secondary-500 w-5 h-5" />
                <div>
                  <p className="font-body font-bold text-text">{new Date(screen.date).toLocaleDateString()}</p>
                  <p className="text-sm text-text/80">{screen.status}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="mt-4 pt-4 border-t border-background-700">
              <Alert variant={screen.urgency === 'medium' ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Assessment Summary</AlertTitle>
                <AlertDescription>{screen.summary}</AlertDescription>
              </Alert>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};

export default PastPreScreens;