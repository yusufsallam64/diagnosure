import React, { useState } from 'react';
import { Search, User, ChevronRight, Clock, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from "next-auth/react";

const DoctorView = () => {
   const router = useRouter();
   const { data: session } = useSession();
   const [searchQuery, setSearchQuery] = useState('');
   const [showPrescreen, setShowPrescreen] = useState(false);

   interface Patient {
      id: number;
      name: string;
      age: number;
      condition: string;
      prescreen: boolean;
      nextAppointment: string;
   }

   // Mock patient data - replace with API call later
   const mockPatients: Patient[] = [
      { id: 1, name: "Sarah Johnson", age: 45, condition: "Hypertension", prescreen: true, nextAppointment: "2024-01-28" },
      { id: 2, name: "Mike Peters", age: 32, condition: "Diabetes Type 2", prescreen: false, nextAppointment: "2024-02-01" },
      { id: 3, name: "Emma Wilson", age: 28, condition: "Pregnancy", prescreen: true, nextAppointment: "2024-01-30" },
      { id: 4, name: "Robert Brown", age: 56, condition: "Arthritis", prescreen: false, nextAppointment: "2024-02-05" },
   ];

   // Filter patients based on search and prescreen
   const filteredPatients = mockPatients.filter(patient => {
      const matchesSearch = patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
         patient.condition.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPrescreen = showPrescreen ? patient.prescreen : true;
      return matchesSearch && matchesPrescreen;
   });

   const handlePatientClick = (patientId: number) => {
      router.push(`/patient/${patientId}`);
   };

   return (
      <div className="min-h-screen bg-background-900 text-text p-4 md:p-8">
         <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center">
                  <User className="w-6 h-6 text-background-900" />
               </div>
               <div>
                  <h1 className="font-heading text-2xl md:text-3xl font-bold">
                     Doctor's Dashboard
                  </h1>
                  <p className="text-text/80 font-body">
                     Manage your patients
                  </p>
               </div>
            </div>

            {/* Search and Filters */}
            <div className="relative">
               <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 to-secondary-500/20 blur-xl" />
               <div className="relative bg-background-800/40 backdrop-blur-sm rounded-xl p-6 space-y-4">
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                     <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text/50" size={20} />
                        <input
                           type="text"
                           placeholder="Search patients..."
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full pl-10 pr-4 h-12 rounded-lg bg-background-800 border border-background-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all text-text placeholder-text/50"
                        />
                     </div>
                     <div className="flex items-center gap-2 select-none">
                        <label className="inline-flex items-center cursor-pointer">
                           <input
                              type="checkbox"
                              checked={showPrescreen}
                              onChange={() => setShowPrescreen(!showPrescreen)}
                              className="sr-only peer"
                           />
                           <div className="relative w-11 h-6 bg-background-700 rounded-full transition-colors duration-300 peer-checked:bg-primary-500">
                              {/* Toggle Ball */}
                              <div
                                 className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300 ${showPrescreen ? "translate-x-5" : "translate-x-0"
                                    }`}
                              ></div>
                           </div>
                           <span className="ml-3 text-sm font-medium text-text/80">Pre-screen Only</span>
                        </label>
                     </div>
                  </div>
               </div>
            </div>

            {/* Patient List */}
            <div className="grid md:grid-cols-2 gap-6">
               {filteredPatients.map((patient) => (
                  <div
                     key={patient.id}
                     onClick={() => handlePatientClick(patient.id)}
                     className="bg-background-800/40 backdrop-blur-sm rounded-xl border border-background-700 hover:border-primary-500 transition-all duration-200 cursor-pointer overflow-hidden group"
                  >
                     <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center">
                                 <User className="w-6 h-6 text-primary-400" />
                              </div>
                              <div>
                                 <h3 className="font-heading text-xl font-bold text-text">{patient.name}</h3>
                                 <p className="text-text/60">Age: {patient.age}</p>
                              </div>
                           </div>
                           <ChevronRight className="w-8 h-8 text-primary-500 group-hover:translate-x-2 transition-transform" />
                        </div>

                        <div className="space-y-3">
                           <div className="flex items-center justify-between">
                              <span className="text-text/80">{patient.condition}</span>
                           </div>

                           <div className="flex items-center gap-2 text-text/60">
                              <Clock size={16} />
                              <span>Next appointment: {patient.nextAppointment}</span>
                           </div>
                        </div>
                     </div>

                     {patient.prescreen && (
                        <div className="px-6 py-3 bg-primary-500/10 border-t border-primary-500/20">
                           <span className="text-sm font-medium text-primary-400">Pre-screening Required</span>
                        </div>
                     )}
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
};

export default DoctorView;