import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT, FEATURE_INSTRUCTIONS } from './prompts.js';
import { validateInput, validateFeaturePayload } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/tests', express.static(path.join(__dirname, 'tests')));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) });
});

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
  const { message, feature = 'chat', context = '' } = request.body ?? {};
  const messageCheck = validateInput(message);
  if (!messageCheck.valid) return response.status(400).json({ error: messageCheck.message });
  if (!Object.hasOwn(FEATURE_INSTRUCTIONS, feature)) return response.status(400).json({ error: 'That study mode is not available.' });

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: 'The AI service is not configured yet. Add OPENAI_API_KEY to your .env file, then restart StudyBuddy.' });
  }

  const prompt = `${FEATURE_INSTRUCTIONS[feature]}\n\nStudent request:\n${messageCheck.value}${context ? `\n\nRelevant conversation context:\n${context}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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

app.post('/api/feature', (request, response) => {
  const { feature, data } = request.body ?? {};
  const check = validateFeaturePayload(feature, data);
  if (!check.valid) return response.status(400).json({ error: check.message });

  const messages = {
    planner: `Subject: ${data.subject}\nExam date: ${data.examDate}\nNumber of topics: ${data.topics}\nAvailable study time: ${data.hours} hours per week`,
    exam: `Subject: ${data.subject}\nExam date: ${data.examDate}\nKey topics: ${data.topics}\nFocus area: ${data.focus}`,
    quiz: `Create a practice quiz about: ${data.topic}`,
    assignment: data.question
  };
  response.json({ message: messages[feature] });
});

app.get('*', (_request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`StudyBuddy AI is running at http://localhost:${port}`));
