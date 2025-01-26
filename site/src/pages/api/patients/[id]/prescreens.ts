// pages/api/patient/[id]/prescreens.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ObjectId } from 'mongodb';
import { getUsersCollection } from '@/lib/db/collections';
import type { Prescreen } from '@/types/patient';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Prescreen[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid patient ID' });
  }

  try {
    const collection = await getUsersCollection();
    const patient = await collection.findOne(
      { _id: id },
      { projection: { prescreens: 1 } }
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    return res.status(200).json(patient.prescreens || []);
  } catch (error) {
    console.error('Failed to fetch prescreens:', error);
    return res.status(500).json({ error: 'Failed to fetch prescreens' });
  }
}