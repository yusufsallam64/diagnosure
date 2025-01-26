import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

async function getDiagnosesCollection() {
  await client.connect();
  return client.db('reports').collection('diagnoses');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, doctor_diagnosis, validation_data } = req.body;

  if (!user_id || !doctor_diagnosis || !validation_data) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const collection = await getDiagnosesCollection();
    
    const diagnosisRecord = {
      userId: user_id,
      diagnosis: doctor_diagnosis,
      validationData: validation_data,
      timestamp: new Date(),
      status: 'published'
    };

    const result = await collection.insertOne(diagnosisRecord);

    return res.status(201).json({
      success: true,
      data: {
        diagnosis_id: result.insertedId,
        message: 'Diagnosis published successfully'
      }
    });

  } catch (error: any) {
    console.error('Error publishing diagnosis:', error);
    return res.status(500).json({
      error: 'Failed to publish diagnosis',
      details: error.message
    });
  } finally {
    await client.close();
  }
}