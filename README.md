# StudyBuddy AI

StudyBuddy AI is a beginner-friendly AI study assistant built for the Week 1 Sprint 1 project, **AI Foundations & Chatbot Development**.

## 1. Problem statement

Students often need quick explanations, revision structure and feedback, but generic AI answers can be confusing, overconfident or encourage students to skip their own learning.

## 2. Solution and target users

StudyBuddy gives students a focused learning companion for explanations, note summaries, study planning, practice quizzes and assignment planning. It is designed for secondary and tertiary students, with simple language and clear responsible-AI boundaries.

## 3. Features

- Explain a topic in beginner-friendly steps.
- Summarise pasted notes while separating AI-added context.
- Build a realistic study plan from subject, exam date, topics and available time.
- Generate a quiz that asks one question at a time.
- Break down an assignment without writing submission-ready work.
- Normal chat, loading states, validation, timeouts and friendly API errors.

## 4. How AI is used

The app uses an existing OpenAI chat model through a server-side API route. It does **not** train a model. The browser sends a validated request to Express, which adds the system prompt and feature instruction before calling the model. The API key never reaches the browser.

## 5. Prompt engineering approach

`prompts.js` uses a strong role prompt plus focused instructions for each feature. The prompt asks for simple language, step-by-step explanations, clarifying questions, uncertainty statements, faithful summaries, learning-focused assignment help and refusal of cheating requests. Low temperature is used to reduce unnecessary variation.

## 6. Responsible AI approach

The interface visibly warns: “StudyBuddy AI can make mistakes. Always verify important information and use AI as a learning assistant, not a replacement for your teacher.” The system prompt says not to invent facts, to acknowledge missing information, to encourage trusted-source verification and to redirect cheating requests toward legitimate revision help.

## 7. Technology

HTML, CSS and browser JavaScript provide the responsive interface. Node.js and Express provide the API boundary. `dotenv` loads local environment variables. Node’s built-in test runner covers validation.

## 8. Installation

Prerequisite: Node.js 18 or newer.

```bash
npm install
copy .env.example .env
```

Open `.env` and set `OPENAI_API_KEY`. You may optionally change `OPENAI_MODEL` and `PORT`. Never commit `.env`.

## 9. Run

```bash
npm start
```

Open http://localhost:3000. During development, `npm run dev` restarts the server when files change.

## 10. Testing approach

Run the automated checks with `npm test`. The manual evidence table in [tests/test-cases.md](tests/test-cases.md) contains more than 20 cases across normal, difficult, ambiguous, unknown, invalid, API-error, planning, summarisation, quiz, assignment and cheating scenarios. Replace “To record” with the observed result during the team test session and attach screenshots to the presentation.

## 11. Known limitations

- A valid OpenAI API key and internet connection are needed for live answers.
- The current quiz score is kept in the conversation rather than persisted in a database.
- There is no login, saved history or teacher-managed knowledge base.
- AI output still requires human verification.

## 12. Future improvements

Add streamed responses, saved study plans, a trusted course-material context option, richer quiz score tracking, accessibility audits and automated API contract tests.

## 13. Team contributions

| Member | Role | Contribution |
|---|---|---|
| 1 | Project coordination and integration | Own the sprint board, merge work, run demos and keep the acceptance criteria visible. |
| 2 | Prompt engineering and chatbot behaviour | Test prompt variations, refine feature instructions and document expected AI behaviour. |
| 3 | Frontend/UI | Build the responsive dashboard, interaction states and accessible controls. |
| 4 | AI features and backend/API integration | Maintain the Express route, environment variables, timeout and API error handling. |
| 5 | Testing, responsible AI and documentation | Execute the test table, review safety behaviour, capture evidence and maintain this README. |

Demonstrate teamwork by showing the shared task board, short commit history, peer review notes, test evidence and a presentation where each member explains their contribution.

## 14. Demonstration flow

1. Introduce the student problem and the responsible-AI notice.
2. Ask “Explain photosynthesis to me like I am a beginner” and point out the simple structure.
3. Open **Summarise notes**, paste a short paragraph, and show faithful bullet points.
4. Open **Study planner**, enter a subject, date, topics and hours, and show the generated schedule.
5. Open **Quiz me**, answer one question, and show feedback in the continuing chat.
6. Open **Assignment helper** and show task breakdown and an outline rather than a completed submission.
7. Ask for exam answers to demonstrate the refusal and legitimate study redirect.
8. Show `npm test` and the manual test table as evidence for working features and problem solving.

## 15. Scope note

This project demonstrates prompt engineering, responsible AI, validation, testing and API integration. It is a learning prototype, not a guarantee of factual accuracy.