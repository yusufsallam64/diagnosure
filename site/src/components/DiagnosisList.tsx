import React from 'react';
import { User, Calendar, Activity } from 'lucide-react';

const mockDiagnoses = [
  {
    id: 1,
    date: '2024-01-22',
    doctor: 'Dr. Sarah Johnson',
    specialty: 'General Practitioner',
    status: 'In Progress',
    nextAppointment: '2024-02-01'
  },
  {
    id: 2,
    date: '2024-01-10',
    doctor: 'Dr. Michael Chen',
    specialty: 'Cardiologist',
    status: 'Completed',
    nextAppointment: null
  }
];

const DiagnosisList = () => {
  return (
    <div className="mt-8">
      <h3 className="font-heading text-xl text-text mb-4">Current Diagnoses</h3>
      <div className="grid gap-4">
        {mockDiagnoses.map((diagnosis) => (
          <div
            key={diagnosis.id}
            className="bg-background-800 rounded-lg p-4 relative overflow-hidden"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <User className="text-accent-400 w-5 h-5" />
                <div>
                  <p className="font-body font-bold text-text">{diagnosis.doctor}</p>
                  <p className="text-sm text-text/80">{diagnosis.specialty}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Calendar className="text-secondary-500 w-5 h-5" />
                <div>
                  <p className="font-body text-text">{new Date(diagnosis.date).toLocaleDateString()}</p>
                  {diagnosis.nextAppointment && (
                    <p className="text-sm text-accent-400">
                      Next: {new Date(diagnosis.nextAppointment).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className={`px-3 py-1 rounded-full text-sm ${
                  diagnosis.status === 'In Progress' 
                    ? 'bg-secondary-500/20 text-secondary-500' 
                    : 'bg-accent-400/20 text-accent-400'
                }`}>
                  {diagnosis.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiagnosisList;