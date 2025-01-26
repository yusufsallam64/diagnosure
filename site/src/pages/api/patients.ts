// src/pages/api/patients.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsersCollection } from '@/lib/db/collections';
import type { Patient } from '@/types/patient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const collection = await getUsersCollection();
    const patients = await collection
      .find({ role: 'patient' })
      .project({
        name: 1,
        email: 1,
        age: 1,
        condition: 1,
        nextAppointment: 1,
        image: 1,
        role: 1
      })
      .toArray();
    
    return res.status(200).json(patients);
  } catch (error) {
    console.error('Failed to fetch patients:', error);
    return res.status(500).json({ error: 'Failed to fetch patients' });
  }
}