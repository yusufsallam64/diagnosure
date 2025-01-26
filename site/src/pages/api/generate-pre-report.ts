import OpenAI from 'openai';
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession, Session } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { MongoClient, Collection } from 'mongodb';

// Initialize MongoDB client with persistent connection
const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);

// Connection state management
let isConnected = false;
async function ensureConnected() {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ValidatedSegment {
  text: string;
  start: number;
  end: number;
}

interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  detectedIssues: string[];
  validatedTranscript: ValidatedSegment[];
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

export function getUserId(session: Session | null): string | null {
  if (!session?.user.id) return null;
  return session?.user.id as string;
}

async function getPreReportsCollection(): Promise<Collection<ReportData>> {
  await ensureConnected();
  const db = client.db('reports');
  const collection = db.collection<ReportData>('pre-reports');
  
  // Create indexes if they don't exist
  await collection.createIndex({ timestamp: 1 });
  await collection.createIndex({ userId: 1 });
  await collection.createIndex({ "timestamp": 1, "userId": 1 });
  
  return collection;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    console.log("Method not allowed");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = session ? getUserId(session) : null;
  
  if (!userId) {
    console.log("User session not found or invalid");
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const preReportsCollection = await getPreReportsCollection();
    const { whisperTranscripts, modelResponses } = req.body;

    console.log('Received request:', JSON.stringify(req.body, null, 2));

    // Validate request structure
    if (!Array.isArray(whisperTranscripts) || whisperTranscripts.some(t => 
      !t.text || 
      !t.timestamp || 
      isNaN(Date.parse(t.timestamp))
    )) {
      console.log('Invalid whisper transcripts structure');
      return res.status(400).json({ error: 'Invalid whisper transcripts structure' });
    }

    if (!Array.isArray(modelResponses) || modelResponses.length === 0) {
      console.log('Invalid model responses');
      return res.status(400).json({ error: 'Invalid or missing model responses' });
    }

    // Construct validation prompt
    const validationPrompt = `Analyze, validate, and translate these medical conversation segments with timestamps:
    
    Patient Input Segments: ${JSON.stringify(whisperTranscripts)}
    
    AI Responses: ${JSON.stringify(modelResponses)}

    ---TASKS IN ORDER---
    1. Verify coherence between patient input and AI responses
    2. Remove segments with non-medical, irrelevant, or nonsensical content
    3. Translate all text to English
    4. Correct transcription errors in remaining segments
    4. Preserve original timestamps for valid segments
    5. Detect potential hallucinations or inaccuracies and flag them
    6. Extract medical entities (symptoms, conditions, etc.)
    
    Return JSON with:
    - isValid: boolean
    - confidenceScore: 0-100
    - detectedIssues: string array
    - validatedTranscript: array of { text: string, start: number, end: number }
    - medicalEntities: string array

    Rules:
    - Never add new information
    - Only modify text to correct errors
    - Keep original timestamps unchanged
    - ONLY OUTPUT ENGLISH TEXT
    - REMOVE CONVERSATION ENTRIES THAT ARE MEDICALLY IRRELEVANT
    - Be strict with medical relevance`;

    // Get validation from OpenAI
    const validationResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a medical data validation expert. Analyze conversations with timestamps strictly. Preserve timestamps for valid segments."
        },
        { 
          role: "user", 
          content: validationPrompt 
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    console.log('Validation response:', JSON.stringify(validationResponse, null, 2));

    const validationResult: ValidationResult = JSON.parse(
      validationResponse.choices[0].message.content || '{}'
    );

    // Validate GPT response structure
    if (!validationResult.validatedTranscript || !Array.isArray(validationResult.validatedTranscript)) {
      console.error('Invalid validation response structure');
      throw new Error('Invalid validation response structure');
    }

    // Create report document
    const reportData: ReportData = {
      userId,
      originalTranscript: whisperTranscripts,
      validatedTranscript: validationResult.validatedTranscript,
      modelResponses: modelResponses.map((r: { text: string }) => r.text),
      validationResult: {
        isValid: validationResult.isValid,
        confidenceScore: Math.min(Math.max(validationResult.confidenceScore, 0), 100),
        detectedIssues: validationResult.detectedIssues || [],
        medicalEntities: validationResult.medicalEntities || []
      },
      timestamp: new Date()
    };

    // Insert into database
    const insertResult = await preReportsCollection.insertOne(reportData);
    
    if (!insertResult.acknowledged) {
      throw new Error('Failed to insert report into database');
    }

    console.log('Report successfully created:', insertResult.insertedId);

    return res.status(200).json({
      success: true,
      report: reportData,
      validationSummary: {
        isValid: reportData.validationResult.isValid,
        confidence: reportData.validationResult.confidenceScore,
        originalSegments: whisperTranscripts.length,
        validatedSegments: validationResult.validatedTranscript.length,
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
  }
}