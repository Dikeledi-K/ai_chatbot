import { buildStudyCoachFeedback, calculateQuizScore, getFriendlyApiErrorMessage, createFallbackQuiz } from './studybuddy-logic.js';

const state = { feature: 'chat', busy: false, quizState: null, history: [] };
const featureNames = { chat: 'Study chat', explain: 'Explain a topic', summarize: 'Summarise notes', planner: 'Study planner', exam: 'Exam preparation', quiz: 'Quiz me', assignment: 'Assignment helper', coding: 'Coding Helper', career: 'Career Guidance' };
const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messages = document.querySelector('#messages');
const sendButton = document.querySelector('#send-button');
const statusText = document.querySelector('#status-text');

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function formatAnswer(value) { return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^- (.*)$/gm, '<li>$1</li>').replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`).replace(/\n/g, '<br>'); }
function addMessage(content, role = 'user', loading = false) { const item = document.createElement('div'); item.className = `message ${role}${loading ? ' loading-message' : ''}`; item.innerHTML = role === 'assistant' ? `<div class="avatar">✦</div><div class="bubble">${loading ? '<span class="typing"><i></i><i></i><i></i></span>' : `<div>${formatAnswer(content)}</div>`}</div>` : `<div class="bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`; messages.append(item); messages.scrollTop = messages.scrollHeight; return item; }
function setBusy(value) { state.busy = value; sendButton.disabled = value; input.disabled = value; statusText.textContent = value ? 'Thinking...' : 'Ready to learn'; document.querySelector('.status-dot').classList.toggle('working', value); }
function selectFeature(feature) { state.feature = feature; document.querySelectorAll('.feature-card').forEach((card) => card.classList.toggle('active', card.dataset.feature === feature)); document.querySelector('#mode-label').textContent = feature === 'chat' ? 'STUDY CHAT' : featureNames[feature].toUpperCase(); document.querySelector('#mode-title').textContent = feature === 'chat' ? 'What are you working on?' : `${featureNames[feature]} with confidence.`; input.placeholder = feature === 'summarize' ? 'Paste your notes here...' : feature === 'explain' ? 'What topic should we unpack?' : feature === 'exam' ? 'Tell me what you need to revise before the exam...' : feature === 'coding' ? 'Paste your code and describe what you are trying to do...' : feature === 'career' ? 'Tell me a career you are interested in...' : 'Ask a question or paste your notes...'; }
function conversationContext() { return state.history.slice(-12).map((entry) => `${entry.role === 'user' ? 'Student' : 'StudyBuddy'}: ${entry.content}`).join('\n\n').slice(-12000); }
async function sendMessage(message, feature = state.feature) { if (state.busy || !message.trim()) return; const context = conversationContext(); setBusy(true); addMessage(message); const loading = addMessage('', 'assistant', true); try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, feature, context }) }); const result = await response.json(); loading.remove(); if (!response.ok) throw new Error(result.error || 'Something went wrong.'); addMessage(result.answer, 'assistant'); state.history.push({ role: 'user', content: message }, { role: 'assistant', content: result.answer }); } catch (error) { loading.remove(); addMessage(getFriendlyApiErrorMessage(error), 'assistant'); } finally { setBusy(false); input.focus(); } }

function renderQuizQuestion() {
  if (!state.quizState) return;

  const quiz = state.quizState;
  const currentQuestion = quiz.questions[quiz.currentIndex];
  if (!currentQuestion) return;

  const item = document.createElement('div');
  item.className = 'message assistant';
  item.innerHTML = `
    <div class="avatar">✦</div>
    <div class="bubble">
      <div class="quiz-card">
        <div class="question-label">Question ${quiz.currentIndex + 1} of ${quiz.questions.length}</div>
        <h3>${escapeHtml(currentQuestion.concept || 'Quick check')}</h3>
        <p>${escapeHtml(currentQuestion.question)}</p>
        <div class="quiz-answers">
          ${currentQuestion.options.map((option, optionIndex) => `<button class="answer-option" data-index="${optionIndex}" type="button">${escapeHtml(option)}</button>`).join('')}
        </div>
      </div>
    </div>
  `;

  item.querySelectorAll('.answer-option').forEach((button) => {
    button.addEventListener('click', () => {
      const value = Number(button.dataset.index);
      quiz.answers[currentQuestion.id || `q${quiz.currentIndex + 1}`] = value;
      if (quiz.currentIndex < quiz.questions.length - 1) {
        quiz.currentIndex += 1;
        renderQuizQuestion();
      } else {
        finishQuiz();
      }
    });
  });

  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

function finishQuiz() {
  if (!state.quizState) return;
  const { score, strengths, weaknesses, recommendations, positivity } = buildStudyCoachFeedback(state.quizState.questions, state.quizState.answers);
  const summary = document.createElement('div');
  summary.className = 'message assistant';
  summary.innerHTML = `
    <div class="avatar">✦</div>
    <div class="bubble">
      <div class="quiz-summary">
        <div class="score-line">Score: ${score}</div>
        <div class="mini-section">
          <h4>${positivity}</h4>
          <ul>${strengths.length ? strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Keep going — you are building strong foundations.</li>'}</ul>
        </div>
        <div class="mini-section">
          <h4>You should spend more time practising:</h4>
          <ul>${weaknesses.length ? weaknesses.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Nothing major to flag — keep revising and challenge yourself with a harder quiz.</li>'}</ul>
        </div>
        <div class="mini-section">
          <h4>Recommended next steps:</h4>
          <ol>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
        </div>
        <div class="secondary-action-row">
          <button type="button" class="secondary-action" data-action="retry-quiz">Retry quiz</button>
          <button type="button" class="secondary-action" data-action="practice-weak">Practice weak areas</button>
        </div>
      </div>
    </div>
  `;

  summary.querySelector('[data-action="retry-quiz"]').addEventListener('click', () => {
    state.quizState = { ...state.quizState, currentIndex: 0, answers: {} };
    renderQuizQuestion();
  });

  summary.querySelector('[data-action="practice-weak"]').addEventListener('click', () => {
    const weakAreas = state.quizState.questions.filter((question) => Number(state.quizState.answers[question.id || `q${state.quizState.questions.indexOf(question) + 1}`]) !== Number(question.correctAnswerIndex)).map((question) => question.concept || 'Core topic').slice(0, 3);
    startQuiz(state.quizState.topic, state.quizState.difficulty, weakAreas.join(', '));
  });

  messages.append(summary);
  messages.scrollTop = messages.scrollHeight;
}

function startQuiz(topic, difficulty = 'medium', focus = '') {
  const questions = createFallbackQuiz(topic, difficulty, focus);
  state.quizState = { topic, difficulty, questions, currentIndex: 0, answers: {} };
  const intro = document.createElement('div');
  intro.className = 'message assistant';
  intro.innerHTML = `<div class="avatar">✦</div><div class="bubble"><p>Let’s practise ${escapeHtml(topic)} at a ${escapeHtml(difficulty)} level. I’ll ask one question at a time and then give you a friendly Study Coach review.</p></div></div>`;
  messages.append(intro);
  renderQuizQuestion();
}

form.addEventListener('submit', (event) => { event.preventDefault(); const value = input.value.trim(); input.value = ''; sendMessage(value); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('.feature-card').forEach((card) => card.addEventListener('click', () => { const feature = card.dataset.feature; selectFeature(feature); if (feature !== 'chat' && ['planner', 'exam', 'quiz', 'assignment', 'coding', 'career'].includes(feature)) openFeatureModal(feature); else input.focus(); }));
document.querySelectorAll('[data-suggestion]').forEach((button) => button.addEventListener('click', () => { selectFeature('chat'); input.value = button.dataset.suggestion; input.focus(); }));
document.querySelector('#clear-chat').addEventListener('click', () => { messages.innerHTML = '<div class="message assistant"><div class="avatar">✦</div><div class="bubble"><p>Fresh page, fresh thinking. What should we work on?</p></div></div>'; state.quizState = null; state.history = []; });

const modal = document.querySelector('#feature-modal');
const modalForm = document.querySelector('#feature-form');
function openFeatureModal(feature) {
  const labels = {
    planner: ['STUDY PLANNER', 'Build a plan that fits your week.'],
    exam: ['EXAM PREPARATION', 'Focus your revision before the big day.'],
    quiz: ['QUIZ ME', 'Turn revision into a quick challenge.'],
    assignment: ['ASSIGNMENT HELPER', 'Understand the task before you start.'],
    coding: ['CODING HELPER', 'Debug code and learn the why behind it.'],
    career: ['CAREER GUIDANCE', 'Map out your next step with confidence.']
  };

  document.querySelector('#modal-kicker').textContent = labels[feature][0];
  document.querySelector('#modal-title').textContent = labels[feature][1];

  const templates = {
    planner: `<label>Subject<input name="subject" placeholder="e.g. Biology" required></label><label>Exam date<input name="examDate" type="date" required></label><label>Number of topics<input name="topics" type="number" min="1" max="100" placeholder="e.g. 8" required></label><label>Study time per week<input name="hours" type="number" min="1" max="80" placeholder="e.g. 4" required></label><button class="primary-action" type="submit">Create my plan <span>→</span></button>`,
    exam: `<label>Subject<input name="subject" placeholder="e.g. History" required></label><label>Exam date<input name="examDate" type="date" required></label><label>Key topics<textarea name="topics" rows="3" placeholder="List the topics you need to revise" required></textarea></label><label>Focus area<input name="focus" placeholder="e.g. Essay structure or photosynthesis" required></label><button class="primary-action" type="submit">Prep for exam <span>→</span></button>`,
    quiz: `<label>Quiz topic<input name="topic" placeholder="e.g. Fractions" required></label><label>Difficulty<select class="form-select" name="difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></label><label>Optional focus area<input name="focus" placeholder="e.g. Variables, loops, functions"></label><p class="form-note">StudyBuddy will ask one question at a time so you can practise, not just peek at answers.</p><button class="primary-action" type="submit">Start quiz <span>→</span></button>`,
    assignment: `<label>Assignment question<textarea name="question" rows="5" placeholder="Paste the question or brief here..." required></textarea></label><button class="primary-action" type="submit">Break it down <span>→</span></button>`,
    coding: `<label>Language<select class="form-select" name="language" required><option value="python">Python</option><option value="java">Java</option><option value="javascript">JavaScript</option></select></label><label>Code<textarea name="code" rows="8" placeholder="Paste your code here..." required></textarea></label><label>What are you trying to do?<textarea name="question" rows="3" placeholder="Optional: explain the goal or the error you are seeing"></textarea></label><button class="primary-action" type="submit">Analyse code <span>→</span></button>`,
    career: `<label>Career you are interested in<input name="career" placeholder="e.g. Data Engineer" required></label><p class="form-note">StudyBuddy gives general guidance and explains how to start learning, without promising job outcomes.</p><button class="primary-action" type="submit">Explore career <span>→</span></button>`
  };

  modalForm.innerHTML = templates[feature];
  modal.classList.remove('hidden');
  modalForm.querySelector('input, textarea, select').focus();
}

function closeModal() { modal.classList.add('hidden'); }
document.querySelector('#modal-close').addEventListener('click', closeModal); modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
modalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const feature = state.feature;
  const data = Object.fromEntries(new FormData(modalForm));
  const button = modalForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Preparing...';

  try {
    const response = await fetch('/api/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create your study request.');
    closeModal();

    if (feature === 'quiz') {
      state.quizState = null;
      startQuiz(data.topic, data.difficulty || 'medium', data.focus || '');
      return;
    }

    await sendMessage(result.message, feature);
  } catch (error) {
    modalForm.insertAdjacentHTML('beforeend', `<p class="form-error">${escapeHtml(error.message)}</p>`);
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  selectFeature('chat');
});
