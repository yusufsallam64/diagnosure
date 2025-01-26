import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

async function getPreReportsCollection() {
  await client.connect();
  return client.db('reports').collection('pre-reports');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, reportId } = req.query
  
  if (!userId || !reportId || Array.isArray(reportId)) {
    return res.status(400).json({ error: 'Valid User ID and Report ID are required' });
  }

  try {
    const collection = await getPreReportsCollection();
    const report = await collection.findOne({
      _id: new ObjectId(reportId),
      userId: userId
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.status(200).json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('Error fetching pre-report:', error);
    return res.status(500).json({
      error: 'Failed to fetch report',
      details: error.message
    });
  } finally {
    await client.close();
  }
}