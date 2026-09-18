# StudyBuddy AI

StudyBuddy AI is a beginner-friendly study assistant for students who want clearer explanations, smarter revision support, and more confidence while learning.

## Overview

This project combines a browser-based interface with a Node.js Express backend. The app supports normal chat, topic explanations, summaries, study planning, exam prep, quizzes, assignment guidance, coding help, and career guidance. It uses a responsible-AI approach and validates requests before sending them to the AI provider.

## Features

- Beginner-friendly explanations for a topic
- Summaries of pasted notes with clean separation of source content and extra context
- Study planner for subject, exam date, topics, and available hours
- Exam-prep support with focus and revision strategy
- Quiz generation with difficulty settings and optional uploaded material
- Assignment help that breaks down tasks without doing the work for the student
- Coding explanations and debugging guidance
- Career guidance with general learning suggestions
- Downloadable study exports as TXT or PDF for quizzes, plans, and summaries
- Theme switching and saved chat history in the browser
- Upload support for PDF, DOCX, TXT, and common image files for study material extraction
- Server-side validation, timeout handling, and user-friendly API errors

## Technology stack

- HTML, CSS, and browser JavaScript
- Node.js and Express
- dotenv for environment variables
- PDF and DOCX parsing for uploaded material
- OCR support for image uploads with Tesseract
- Gemini and OpenAI as AI providers
- Node.js built-in test runner for project verification

## Prerequisites

- Node.js 18 or newer
- npm
- A valid AI API key in the environment

## Setup

From the project root:

```bash
npm install
copy .env.example .env
```

On Linux/macOS, use:

```bash
cp .env.example .env
```

Then open the `.env` file and add your API configuration. Example:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash

# Optional OpenAI fallback
# OPENAI_API_KEY=your_openai_api_key_here
# OPENAI_MODEL=gpt-4o-mini

PORT=3000
```

You can run the app with Gemini or OpenAI. If neither key is configured, the app will return a 503 error when AI features are used.

## Run the project

Start the app in normal mode:

```bash
npm start
```

Start the app with file watching during development:

```bash
npm run dev
```

Run the app directly with Node:

```bash
node server.js
```

Once running, open:

```text
http://localhost:3000
```

Health check endpoint:

```text
http://localhost:3000/api/health
```

## Testing

Run the automated test suite:

```bash
npm test
```

The project includes tests for validation, upload handling, quiz generation, theme handling, and chat history normalization.

## Project structure

```text
.
├── public/                  # Frontend HTML, CSS, and JavaScript
├── tests/                  # Automated project tests
├── .env.example            # Example environment file
├── package.json            # Scripts and dependencies
├── prompts.js              # AI system and feature prompts
├── server.js               # Express server and routes
├── upload-processing.js    # File validation and text extraction
├── validation.js           # Request validation helpers
├── README.md               # Project documentation
└── notes.txt               # Extra notes or project context
```

## API routes

The server exposes these routes:

- `GET /api/health` – checks whether the app and AI config are available
- `POST /api/upload` – processes uploaded study material and extracts text
- `POST /api/chat` – sends a user message to the selected AI provider
- `POST /api/quiz` – generates a quiz using the selected difficulty and source material
- `POST /api/feature` – prepares feature-specific structured study prompts

## Upload materials

Uploaded files are processed in memory only and are not stored permanently. Supported content includes:

- PDF
- DOCX
- TXT
- PNG
- JPG/JPEG
- WEBP

The upload route validates file type and size, extracts readable text, and sends it to the AI as context when needed.

## Responsible AI and limitations

- AI output should be checked by a student or teacher before being treated as fact.
- The app refuses cheating or exam-answer requests and redirects the student toward legitimate study help.
- The app does not persist user accounts or a database for study history.
- Browser local storage is used only for chat history and theme preferences.
- AI features depend on internet access and a valid API key.

## Future improvements

- Add richer persistence and database-backed history
- Add streamed AI responses
- Improve accessibility and UX testing
- Expand quiz analytics and course content integration
- Add more feature-based API contract tests

## Team contribution example

This project was designed for collaborative work and demonstration. A typical team workflow includes:

1. Prompt engineering and responsible-AI behavior
2. Frontend design and UI interaction flow
3. Backend API and validation work
4. Upload processing and feature logic
5. Testing and documentation review

## Demonstration flow

A suggested demonstration is:

1. Open the app and explain the responsible-AI notice.
2. Ask the app to explain a topic in beginner-friendly language.
3. Use the summary feature with pasted notes.
4. Create a study plan with subject, date, topics, and weekly hours.
5. Generate a quiz and answer a question.
6. Use the assignment helper to break down a task without completing it.
7. Ask for exam answers and show the app redirects to legitimate learning support.
8. Run `npm test` to show the project is validated.

## Scope note

This project demonstrates prompt engineering, frontend interaction design, file processing, backend validation, and AI integration. It is a learning-focused prototype and not a guarantee of factual correctness.