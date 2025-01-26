import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { MongoClient, Collection, Sort } from 'mongodb';

// Initialize MongoDB client
const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

// Reuse the types from generate-pre-report.ts
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
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  
    const userId = session.user.id as string;
    let preReportsCollection: Collection<ReportData> | null = null;
  
    try {
      preReportsCollection = await getPreReportsCollection();
  
      // Get pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;
  
      // Get sort parameters
      const sortField = (req.query.sortField as string) || 'timestamp';
      const sortOrder = (req.query.sortOrder as string) || 'desc';
  
      // Create sort object based on the field
      const sortObject: Sort = {};
      if (sortField === 'confidenceScore') {
        sortObject['validationResult.confidenceScore'] = sortOrder === 'asc' ? 1 : -1;
      } else if (sortField === 'entityCount') {
        sortObject['validationResult.medicalEntities'] = sortOrder === 'asc' ? 1 : -1;
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
      const totalCount = await preReportsCollection.countDocuments(query);
  
      // Fetch reports with sort
      const reports = await preReportsCollection
        .find(query)
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .toArray();
  
      const totalPages = Math.ceil(totalCount / limit);
      
      console.log(reports)
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
      console.error('Error fetching pre-reports:', error);
      return res.status(500).json({
        error: 'Failed to fetch reports',
        details: error.message
      });
    } finally {
      if (client) {
        await client.close();
      }
    }
  }