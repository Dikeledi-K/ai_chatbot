import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT, FEATURE_INSTRUCTIONS } from './prompts.js';
import { validateInput, validateFeaturePayload } from './validation.js';
import { buildQuizPrompt, normalizeQuizQuestions, parseQuizResponse } from './public/studybuddy-logic.js';
import { MAX_UPLOAD_SIZE, extractUploadedText, getUploadMetadata, validateUploadedFile } from './upload-processing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 }
});

// The Express app exposes the StudyBuddy UI and the API routes used by the browser.

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/tests', express.static(path.join(__dirname, 'tests')));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) });
});

// Handles uploaded study material by validating file size and returning a concise error if the request is invalid.
const uploadMiddleware = (request, response, next) => upload.single('file')(request, response, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'This file is too large. Please choose a file under 10 MB.' });
  }
  return response.status(400).json({ error: 'The upload could not be received. Please try the file again.' });
});

app.post('/api/upload', uploadMiddleware, async (request, response) => {
  const fileCheck = validateUploadedFile(request.file);
  if (!fileCheck.valid) return response.status(400).json({ error: fileCheck.message });

  try {
    const text = await extractUploadedText(request.file, fileCheck.extension);
    if (!text) {
      return response.status(422).json({ error: 'I could not find readable text in that file. Please try a different document.' });
    }

    response.json({
      file: getUploadMetadata(request.file, fileCheck.extension, text),
      text
    });
  } catch (error) {
    console.error('Upload processing:', error.message);
    response.status(422).json({ error: 'I couldn\'t read this file. Please check that it is not corrupted and try again.' });
  }
});

// Calls the Gemini API with the StudyBuddy system prompt and returns the model text response.
async function requestGemini(prompt, signal) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const result = await aiResponse.json();
  if (!aiResponse.ok) {
    const apiError = new Error(result.error?.message || 'Gemini request failed');
    apiError.status = aiResponse.status;
    throw apiError;
  }
  return result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
}

// Calls the OpenAI chat completion API as the fallback provider when Gemini is not configured.
async function requestOpenAI(prompt, signal) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }] })
  });
  const result = await aiResponse.json();
  if (!aiResponse.ok) {
    const apiError = new Error(result.error?.message || 'OpenAI request failed');
    apiError.code = result.error?.code;
    apiError.status = aiResponse.status;
    throw apiError;
  }
  return result.choices?.[0]?.message?.content;
}

app.post('/api/chat', async (request, response) => {
  const { message, feature = 'chat', context = '', materialText = '', materialName = '' } = request.body ?? {};
  const messageCheck = validateInput(message);
  if (!messageCheck.valid) return response.status(400).json({ error: messageCheck.message });
  if (!Object.hasOwn(FEATURE_INSTRUCTIONS, feature)) return response.status(400).json({ error: 'That study mode is not available.' });

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: 'The AI service is not configured yet. Add OPENAI_API_KEY to your .env file, then restart StudyBuddy.' });
  }

  const materialContext = materialText ? `\n\nUploaded study material${materialName ? ` (${materialName})` : ''}:\n${String(materialText).slice(0, 50000)}\n\nUse the uploaded material as the primary source when the student refers to it. If the answer is not present there, say so clearly instead of inventing details.` : '';
  const prompt = `${FEATURE_INSTRUCTIONS[feature]}\n\nStudent request:\n${messageCheck.value}${materialContext}${context ? `\n\nRelevant conversation context:\n${context}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const answer = process.env.GEMINI_API_KEY
      ? await requestGemini(prompt, controller.signal)
      : await requestOpenAI(prompt, controller.signal);
    if (!answer) throw new Error('The AI returned an empty response');
    response.json({ answer });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'The AI took too long to respond. Please try again.'
      : error.code === 'insufficient_quota' || error.message.includes('no credits remaining')
        ? 'The AI service has no credits available right now. Add billing credits to your AI provider project, then restart StudyBuddy.'
        : error.status === 401
          ? 'The AI service rejected the API key. Check that your key is valid, then restart StudyBuddy.'
          : 'StudyBuddy could not reach the AI service. Check your connection and try again.';
    console.error('AI request:', error.message);
    response.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

app.post('/api/quiz', async (request, response) => {
  const { topic = '', difficulty = 'medium', questionCount = 5, materialText = '', materialName = '' } = request.body ?? {};
  const check = validateFeaturePayload('quiz', { topic, difficulty, questionCount, materialText });
  if (!check.valid) return response.status(400).json({ error: check.message });

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: 'The AI service is not configured.' });
  }

  const source = materialText
    ? `\n\nStudy source${materialName ? ` (${materialName})` : ''}:\n${String(materialText).slice(0, 50000)}\n\nBase every question and answer on this source. Do not invent details that are not supported by it.`
    : '';
  const levelGuidance = difficulty === 'easy'
    ? 'Use clear recall and one-step application questions.'
    : difficulty === 'hard'
      ? 'Use multi-step application questions with plausible misconceptions and practical scenarios.'
      : difficulty === 'difficult'
        ? 'Use challenging unfamiliar scenarios, analysis, trade-offs, and multi-step reasoning. Do not reuse Easy or Hard wording.'
        : 'Use balanced application questions.';
  const prompt = `${buildQuizPrompt(topic || 'the uploaded study document', difficulty, '')}\nDifficulty guidance: ${levelGuidance}\nRequested questions: ${Number(questionCount)}.${source}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const rawAnswer = process.env.GEMINI_API_KEY
      ? await requestGemini(prompt, controller.signal)
      : await requestOpenAI(prompt, controller.signal);
    const questions = normalizeQuizQuestions(parseQuizResponse(rawAnswer)
      .filter((question) => question && typeof question.question === 'string' && Array.isArray(question.options) && question.options.length === 4 && Number.isInteger(Number(question.correctAnswerIndex)))
      .map((question, index) => ({ ...question, id: question.id || `ai-${index + 1}`, correctAnswerIndex: Number(question.correctAnswerIndex), difficulty })), questionCount);
    if (questions.length < Number(questionCount)) throw new Error('The AI returned an incomplete quiz.');
    response.json({ questions });
  } catch (error) {
    console.error('Quiz generation:', error.message);
    response.status(502).json({ error: 'The AI could not generate a reliable quiz right now.' });
  } finally {
    clearTimeout(timeout);
  }
});

app.post('/api/feature', (request, response) => {
  const { feature, data, materialText = '', materialName = '' } = request.body ?? {};
  const check = validateFeaturePayload(feature, data);
  if (!check.valid) return response.status(400).json({ error: check.message });

  const messages = {
    planner: `Subject: ${data.subject}\nExam date: ${data.examDate}\nNumber of topics: ${data.topics}\nAvailable study time: ${data.hours} hours per week`,
    exam: `Subject: ${data.subject}\nExam date: ${data.examDate}\nKey topics: ${data.topics}\nFocus area: ${data.focus}`,
    quiz: `Create a ${data.difficulty || 'medium'}-difficulty practice quiz with ${data.questionCount} questions about: ${data.topic}. Focus: ${data.focus || 'general revision'} .`,
    assignment: data.question,
    coding: `Analyse this ${data.language} code and explain it carefully. Problem description: ${data.question || 'No extra context provided.'}\n\nCode:\n${data.code}`,
    career: `Provide general career guidance for: ${data.career}. Include overview, skills, subjects, beginner projects, learning path and related careers.`
  };
  const materialContext = materialText ? `\n\nUploaded material${materialName ? ` (${materialName})` : ''}:\n${String(materialText).slice(0, 50000)}\n\nUse this material as the primary source. Do not invent information that is not supported by it.` : '';
  response.json({ message: `${messages[feature]}${materialContext}` });
});

app.get('*', (_request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`StudyBuddy AI is running at http://localhost:${port}`));
