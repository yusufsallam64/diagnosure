import React, { useState } from 'react';
import { Search, Bell, Menu, UserRound, ChevronRight, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

const DoctorView = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showPrescreen, setShowPrescreen] = useState(false);

  interface Patient {
    id: number;
    name: string;
    age: number;
    condition: string;
    status: PatientStatus['status'];
    prescreen: boolean;
    lastVisit: string;
    nextAppointment: string;
  }

  // Mock patient data - replace with API call later
  const mockPatients: Patient[] = [
    { id: 1, name: "Sarah Johnson", age: 45, condition: "Hypertension", status: "Critical", prescreen: true, lastVisit: "2024-01-15", nextAppointment: "2024-01-28" },
    { id: 2, name: "Mike Peters", age: 32, condition: "Diabetes Type 2", status: "Stable", prescreen: false, lastVisit: "2024-01-18", nextAppointment: "2024-02-01" },
    { id: 3, name: "Emma Wilson", age: 28, condition: "Pregnancy", status: "Routine", prescreen: true, lastVisit: "2024-01-20", nextAppointment: "2024-01-30" },
    { id: 4, name: "Robert Brown", age: 56, condition: "Arthritis", status: "Follow-up", prescreen: false, lastVisit: "2024-01-22", nextAppointment: "2024-02-05" },
  ];

interface StatusColorMap {
   [key: string]: string;
}

interface PatientStatus {
   status: 'Critical' | 'Stable' | 'Routine' | 'Follow-up';
}

const getStatusColor = (status: PatientStatus['status']): string => {
   const statusColors: StatusColorMap = {
      'Critical': 'bg-accent-100 text-accent-700',
      'Stable': 'bg-secondary-100 text-secondary-700',
      'Routine': 'bg-primary-100 text-primary-700',
      'Follow-up': 'bg-background-200 text-background-700'
   };
   return statusColors[status] || 'bg-gray-100 text-gray-700';
};

  // Filter patients based on search and prescreen
  const filteredPatients = mockPatients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.condition.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPrescreen = showPrescreen ? patient.prescreen : true;
    return matchesSearch && matchesPrescreen;
  });

const handlePatientClick = (patientId: number): void => {
   router.push(`/patient/${patientId}`);
};

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-background-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Menu className="text-primary-600 cursor-pointer" size={24} />
              <h1 className="text-xl font-heading font-bold text-primary-800">MediDash</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Bell className="text-primary-400 cursor-pointer hover:text-primary-600 transition-colors" size={20} />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent-500 rounded-full"></span>
              </div>
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">DR</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-heading font-bold text-primary-900">Patient Overview</h2>
          <p className="text-primary-500 mt-1">Manage and monitor your patients</p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-primary-400" size={20} />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-10 rounded-lg border border-background-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
            />
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showPrescreen}
              onChange={() => setShowPrescreen(!showPrescreen)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-background-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            <span className="ml-3 text-sm font-medium text-primary-600">Pre-screen Only</span>
          </label>
        </div>

        {/* Patient Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPatients.map((patient) => (
            <div
              key={patient.id}
              onClick={() => handlePatientClick(patient.id)}
              className="bg-white rounded-xl border border-background-100 hover:border-primary-300 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden group"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
                      <UserRound className="text-primary-600" size={20} />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-primary-900">{patient.name}</h3>
                      <p className="text-sm text-primary-500">Age: {patient.age}</p>
                    </div>
                  </div>
                  <ChevronRight 
                    className="text-primary-300 group-hover:text-primary-600 group-hover:transform group-hover:translate-x-1 transition-all" 
                    size={20} 
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-primary-600">{patient.condition}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(patient.status)}`}>
                      {patient.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-primary-400">
                    <Clock size={14} />
                    <span>Next: {patient.nextAppointment}</span>
                  </div>
                </div>
              </div>
              
              {patient.prescreen && (
                <div className="px-4 py-2 bg-primary-50 border-t border-primary-100">
                  <span className="text-xs font-medium text-primary-600">Pre-screening Required</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default DoctorView;