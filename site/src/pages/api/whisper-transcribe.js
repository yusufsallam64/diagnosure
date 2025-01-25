import OpenAI from 'openai';
import { IncomingForm } from 'formidable';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = new IncomingForm({
      keepExtensions: true,
      // Allow larger file sizes for audio
      maxFileSize: 10 * 1024 * 1024 // 10MB
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    if (!files.file || !files.file[0]) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = files.file[0];
    console.log('Received audio file:', {
      filepath: audioFile.filepath,
      mimetype: audioFile.mimetype,
      size: audioFile.size
    });

    // Create a ReadStream for the file
    const fileStream = fs.createReadStream(audioFile.filepath);

    const transcription = await openai.audio.translations.create({
      file: fileStream,
      model: "whisper-1",
      response_format: "json",
      prompt: "Translate to English.",
    });

    // Clean up the temporary file
    fs.unlinkSync(audioFile.filepath);

    return res.status(200).json({ text: transcription.text });
  } catch (error) {
    console.error('Whisper error:', error);
    // More detailed error response
    return res.status(500).json({ 
      error: error.message || 'Error processing audio',
      details: error.response?.data || error.response || error
    });
  }
}