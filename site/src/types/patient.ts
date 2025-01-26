export interface Patient {
   _id: string;
   name: string;
   email: string;
   age?: number;
   role: 'patient' | 'doctor';
   condition?: string;
   nextAppointment?: string;
   prescreens?: Prescreen[];
   image?: string;
 }
 
 export interface Prescreen {
   date: string;
   severity: string;
   symptoms: string[];
 }
 