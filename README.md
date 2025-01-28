by Yusuf Sallam and [Safa Karagoz](https://github.com/Safa-Karagoz)

## What is this?
Diagnosure is our submission to [Hoya Hacks 24](https://hoyahacks.georgetown.domains), Georgetown University's annual hackathon. Our project was submitted for the Patient Safety track. Our goal was to increase equity, accessibility, and reliability of the healthcare process through various validation and flexible data collection/summary steps. We aim to reduce the risk of medical harm by bypassing language barriers, cross-checking doctors' diagnoses, and ensuring patients fully understand their conditions.

## Project Structure
This structure heavily utilized generative AI throughout the process. Primary models were provided by OpenAI. The main models used include:
- Whisper
  - Whisper was closely integrated with our data collection process as it enabled real-time transcription of a diverse set of languages into English, enabling patients to document their illnesses/symptoms in their most comfortable language. 
- GPT-4o
  -  4o-mini-realtime powered our live voice-to-voice interactions. The realtime API enabled us to simulate the initial interactions patients have when they first enter a doctor's office and collected a list of their symptoms. Critically, the model used is multilingual, so the model will speak to you in any language you speak to it in. The model also uses contextual understanding to ask follow-up questions that may reveal more details about what the user is suffering from.
  - 4o-mini (due to costs) is used for data cleanup, processing, and summarization. Leveraging this model, we summarize the transcriptions into concise formats that doctors may use. As the doctor makes a diagnosis, we have a RAG pipeline that will work to validate/confirm the doctor's diagnosis based on the patient's historical medical information and any extra data provided. For the final step in our process, we summarize this information back into easy-to-understand for patient consumption.
- BGE
  - This was our embedding model which faciliated our RAG pipeline, enabling us to calculate similarity between the doctor's diagnosis and the symptoms exhibited by the patient.

 ## Running the Project

 To run the project, set the following environment variables:
 - `MONGODB_URI`
 - `GOOGLE_CLIENT_ID`
 - `GOOGLE_CLIENT_SECRET`
 - `OPENAI_API_KEY`
 - `NEXTAUTH_URL`
 - `NEXTAUTH_SECRET`

[Check out our Devpost for a video demo!](https://devpost.com/software/11-diagnosure)
