import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { MongoClient, Collection, ObjectId } from 'mongodb';

// Initialize MongoDB client
const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

interface ValidatedSegment {
  text: string;
  start: number;
  end: number;
}

interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  detectedIssues: string[];
  medicalEntities: string[];
}

interface ReportData {
  userId: string;
  originalTranscript: ValidatedSegment[];
  validatedTranscript: ValidatedSegment[];
  modelResponses: string[];
  validationResult: Omit<ValidationResult, 'validatedTranscript'>;
  timestamp: Date;
  patientId: string; // Added patientId field
}

async function getPreReportsCollection(): Promise<Collection<ReportData>> {
  await client.connect();
  const db = client.db('reports');
  return db.collection<ReportData>('pre-reports');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  
  // if (!session?.user?.id || session?.user?.role !== 'doctor') {
  //   return res.status(401).json({ 
  //     error: 'Unauthorized - Doctor access required' 
  //   });
  // }

  // Get patient ID from the URL parameter
  const { id: patientId } = req.query;

  if (!patientId || typeof patientId !== 'string') {
    return res.status(400).json({ 
      error: 'Invalid patient ID' 
    });
  }

  let preReportsCollection: Collection<ReportData> | null = null;

  try {
    preReportsCollection = await getPreReportsCollection();

    // Get pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Build query for patient's prescreens
    const query = { userId: patientId };

    // Get total count
    const totalCount = await preReportsCollection.countDocuments(query);

    // Fetch reports for the specific patient
    const reports = await preReportsCollection
      .find(query)
      .sort({ timestamp: -1 }) // Sort by most recent first
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: {
        reports,
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
    console.error('Error fetching patient prescreens:', error);
    return res.status(500).json({
      error: 'Failed to fetch prescreens',
      details: error.message
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}