import OpenAI from 'openai';
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession, Session } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { MongoClient, Collection } from 'mongodb';

// Initialize MongoDB client
const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  detectedIssues: string[];
  cleanedText: string;
  medicalEntities: string[];
}

interface ReportData {
  userId: string;
  originalTranscript: string;
  validatedTranscript: string;
  modelResponses: string[];
  validationResult: ValidationResult;
  timestamp: Date;
}

export function getUserId(session: Session | null): string | null {
  if (!session?.user.id) return null;
  return session?.user.id as string;
}

async function getPreReportsCollection(): Promise<Collection<ReportData>> {
  await client.connect();
  const db = client.db('reports');
  const collection = db.collection<ReportData>('pre-reports');
  
  // Ensure indexes exist
  await collection.createIndex({ timestamp: 1 });
  await collection.createIndex({ userId: 1 });
  await collection.createIndex({ "timestamp": 1, "userId": 1 });
  
  return collection;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    console.log("Method not allowed")
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (session) {
    const userId = getUserId(session);
    console.log("UserId: ", userId)
    if (!userId) return res.status(401).json({ error: 'Invalid user session' });
  } else {
    console.log("User sess not found")
    return res.status(401).json({ error: 'User session not found' });
  }

  let preReportsCollection: Collection<ReportData> | null = null;

  try {
    // Get database collection
    preReportsCollection = await getPreReportsCollection();

    const { whisperTranscripts, modelResponses } = req.body;

    console.log('Received request:', req.body);

    // Validate whisper transcripts
    if (!Array.isArray(whisperTranscripts) || whisperTranscripts.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing whisper transcripts' });
    }
    
    // Concatenate all transcript texts
    const transcript = whisperTranscripts
      .map((t: { text: string }) => t.text)
      .join(' ')
      .trim();

    // Validate model responses
    if (!Array.isArray(modelResponses) || modelResponses.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing model responses' });
    }
    
    // Extract response texts
    const responseTexts = modelResponses
      .map((r: { text: string }) => r.text)
      .filter(Boolean);

    // Construct validation prompt
    const validationPrompt = `Analyze and validate the following medical conversation data:
    
    Patient Input: """${transcript}"""
    
    AI Responses: """${responseTexts.join('\n')}"""

    Perform the following tasks:
    1. Verify coherence between patient input and AI responses
    2. Identify any non-medical or irrelevant content
    3. Detect potential hallucinations or inaccuracies
    4. Extract medical entities (symptoms, conditions, etc.)
    5. Return JSON format with:
       - isValid (boolean)
       - confidenceScore (0-100)
       - detectedIssues (string array)
       - cleanedText (sanitized version)
       - medicalEntities (string array)

    Important rules:
    - Never add new information
    - Preserve original meaning
    - Translate any non-English content to English
    - Remove any hallucinations or mis-transcriptions
    - Be strict with medical relevance`;

    // Call GPT for validation
    const validationResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a medical data validation expert. Analyze conversations strictly and objectively."
        },
        { 
          role: "user", 
          content: validationPrompt 
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    console.log('Validation response:', validationResponse);

    const validationResult: ValidationResult = JSON.parse(
      validationResponse.choices[0].message.content || '{}'
    );

    if (!validationResult.hasOwnProperty('isValid')) {
      throw new Error('Invalid validation response structure');
    }

    const reportData: ReportData = {
      userId: getUserId(session) as string,
      originalTranscript: transcript,
      validatedTranscript: validationResult.cleanedText,
      modelResponses: responseTexts,
      validationResult: {
        isValid: validationResult.isValid,
        confidenceScore: Math.min(Math.max(validationResult.confidenceScore, 0), 100),
        detectedIssues: validationResult.detectedIssues || [],
        cleanedText: validationResult.cleanedText,
        medicalEntities: validationResult.medicalEntities || []
      },
      timestamp: new Date()
    };

    // Insert the report into the database
    const insertResult = await preReportsCollection.insertOne(reportData);
    
    if (!insertResult.acknowledged) {
      throw new Error('Failed to insert report into database');
    }

    return res.status(200).json({
      success: true,
      report: reportData,
      validationSummary: {
        isValid: reportData.validationResult.isValid,
        confidence: reportData.validationResult.confidenceScore,
        issueCount: reportData.validationResult.detectedIssues.length,
        entityCount: reportData.validationResult.medicalEntities.length
      },
      insertedId: insertResult.insertedId
    });

  } catch (error: any) {
    console.error('Report generation error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate report',
      details: error.response?.data || null
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}