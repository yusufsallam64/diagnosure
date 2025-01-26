import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { MongoClient, Collection, Sort } from 'mongodb';

const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

interface ValidationResult {
  analysis: string;
  matching_symptoms: boolean;
  discrepancies: string[];
}

interface ValidationData {
  validation_result: ValidationResult;
  suggestions: string[];
  risk_level: string;
  confidence_score: number;
}

interface DiagnosisData {
  _id: string;
  userId: string;
  diagnosis: string;
  validationData: ValidationData;
  timestamp: Date;
  status: string;
}

async function getDiagnosesCollection(): Promise<Collection<DiagnosisData>> {
  await client.connect();
  const db = client.db('reports');
  return db.collection<DiagnosisData>('diagnoses');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id as string;
  let diagnosesCollection: Collection<DiagnosisData> | null = null;

  try {
    diagnosesCollection = await getDiagnosesCollection();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const sortField = (req.query.sortField as string) || 'timestamp';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    const sortObject: Sort = {};
    if (sortField === 'confidence_score') {
      sortObject['validationData.confidence_score'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortField === 'risk_level') {
      sortObject['validationData.risk_level'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortObject[sortField] = sortOrder === 'asc' ? 1 : -1;
    }

    // Build query
    const query: any = { userId };
    if (req.query.startDate || req.query.endDate) {
      query.timestamp = {};
      if (req.query.startDate) query.timestamp.$gte = new Date(req.query.startDate as string);
      if (req.query.endDate) query.timestamp.$lte = new Date(req.query.endDate as string);
    }

    // Get total count
    const totalCount = await diagnosesCollection.countDocuments(query);

    // Fetch diagnoses with sort
    const diagnoses = await diagnosesCollection
      .find(query)
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: {
        diagnoses,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching diagnoses:', error);
    return res.status(500).json({
      error: 'Failed to fetch diagnoses',
      details: error.message
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}