import { buildStudyCoachFeedback, calculateQuizScore, getFriendlyApiErrorMessage, createFallbackQuiz } from './studybuddy-logic.js';
import { applyTheme, getStoredTheme, persistTheme, resolveThemePreference } from './theme.js';
import { generateConversationTitle, loadStoredConversations, normalizeConversation, saveConversations } from './chat-history.js';

const state = { feature: 'chat', busy: false, quizState: null, history: [], conversations: [], activeConversationId: null, uploadMaterial: null, quizUploadPromise: null };
const featureNames = { chat: 'Study chat', explain: 'Explain a topic', summarize: 'Summarise notes', planner: 'Study planner', exam: 'Exam preparation', quiz: 'Quiz me', assignment: 'Assignment helper', coding: 'Coding Helper', career: 'Career Guidance' };
const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messages = document.querySelector('#messages');
const sendButton = document.querySelector('#send-button');
const statusText = document.querySelector('#status-text');
const themeToggle = document.querySelector('#theme-toggle');
const historySidebar = document.querySelector('#history-sidebar');
const historyList = document.querySelector('#history-list');
const historySearch = document.querySelector('#history-search');
const newChatButton = document.querySelector('#new-chat-button');
const clearHistoryButton = document.querySelector('#clear-history');
const sidebarToggle = document.querySelector('#sidebar-toggle');
const sidebarClose = document.querySelector('#sidebar-close');
const layout = document.querySelector('.layout');
const materialFile = document.querySelector('#material-file');
const uploadDropzone = document.querySelector('#upload-dropzone');
const uploadStatus = document.querySelector('#upload-status');
const uploadFile = document.querySelector('#upload-file');
const uploadFileName = document.querySelector('#upload-file-name');
const uploadFileMeta = document.querySelector('#upload-file-meta');
const uploadFileRemove = document.querySelector('#upload-file-remove');
const uploadActions = document.querySelector('#upload-actions');
const uploadError = document.querySelector('#upload-error');

const welcomeMessages = {
  chat: 'Hi! I’m StudyBuddy. Ask me to explain a tricky topic, organise your notes, plan revision, or quiz you.',
  explain: 'Tell me the topic you want to understand, and I’ll break it down step by step with a simple example.',
  summarize: 'Paste your notes here and I’ll pull out the key ideas while keeping the original meaning clear.',
  planner: 'Tell me your subject, exam date, number of topics, and available study time so I can build a realistic plan.',
  exam: 'Tell me what subject and topics you need to revise, and I’ll help you focus before exam day.',
  quiz: 'Choose Quiz me above to start a practice quiz one question at a time.',
  assignment: 'Share your assignment question or brief and I’ll help you understand the task and plan your own work.',
  coding: 'Paste your code and explain what you are trying to do. I’ll help you debug it and understand why.',
  career: 'Tell me about a career you are interested in and I’ll suggest skills, subjects, projects, and learning steps.'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function formatAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`)
    .replace(/\n/g, '<br>');
}

function addMessage(content, role = 'user', loading = false) {
  const item = document.createElement('div');
  item.className = `message ${role}${loading ? ' loading-message' : ''}`;
  item.innerHTML = role === 'assistant'
    ? `<div class="avatar">✦</div><div class="bubble">${loading ? '<span class="typing"><i></i><i></i><i></i></span>' : `<div>${formatAnswer(content)}</div>`}</div>`
    : `<div class="bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function setBusy(value) {
  state.busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  statusText.textContent = value ? 'Thinking...' : 'Ready to learn';
  document.querySelector('.status-dot').classList.toggle('working', value);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setUploadError(message = '') {
  if (!uploadError) return;
  uploadError.textContent = message;
  uploadError.classList.toggle('hidden', !message);
}

function clearUpload() {
  state.uploadMaterial = null;
  if (materialFile) materialFile.value = '';
  uploadFile?.classList.add('hidden');
  uploadActions?.classList.add('hidden');
  uploadDropzone?.classList.remove('hidden');
  setUploadError();
  if (uploadStatus) uploadStatus.textContent = 'Optional';
}

async function uploadMaterial(file) {
  if (!file) return;

  setUploadError();
  uploadDropzone?.classList.add('is-uploading');
  if (uploadStatus) uploadStatus.textContent = 'Uploading...';
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'This file could not be processed.');

    state.uploadMaterial = { ...result.file, text: result.text };
    uploadFileName.textContent = result.file.name;
    uploadFileMeta.textContent = `${result.file.extension.toUpperCase().slice(1)} · ${formatFileSize(result.file.size)} · Text extracted`;
    uploadFile.classList.remove('hidden');
    uploadActions.classList.remove('hidden');
    uploadDropzone.classList.add('hidden');
    if (uploadStatus) uploadStatus.textContent = 'Ready';
  } catch (error) {
    clearUpload();
    setUploadError(error.message || 'I couldn\'t read this file. Please try another file.');
    if (uploadStatus) uploadStatus.textContent = 'Could not process';
  } finally {
    uploadDropzone?.classList.remove('is-uploading');
  }
}

if (materialFile) {
  materialFile.addEventListener('change', () => uploadMaterial(materialFile.files[0]));
}

if (uploadDropzone) {
  ['dragenter', 'dragover'].forEach((eventName) => uploadDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDropzone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => uploadDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDropzone.classList.remove('is-dragging');
  }));
  uploadDropzone.addEventListener('drop', (event) => uploadMaterial(event.dataTransfer.files[0]));
}

uploadFileRemove?.addEventListener('click', clearUpload);

uploadActions?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upload-feature]');
  if (!button) return;

  const feature = button.dataset.uploadFeature;
  selectFeature(feature);
  if (['quiz', 'exam'].includes(feature)) {
    openFeatureModal(feature);
    return;
  }

  input.value = feature === 'summarize'
    ? 'Summarise the uploaded material into key topics, important concepts, definitions, main points, and a quick revision summary.'
    : 'Explain the uploaded material in simple terms and help me understand the key ideas.';
  input.focus();
});

function selectFeature(feature) {
  state.feature = feature;
  document.querySelectorAll('.feature-card').forEach((card) => card.classList.toggle('active', card.dataset.feature === feature));
  document.querySelector('#mode-label').textContent = feature === 'chat' ? 'STUDY CHAT' : featureNames[feature].toUpperCase();
  document.querySelector('#mode-title').textContent = feature === 'chat' ? 'What are you working on?' : `${featureNames[feature]} with confidence.`;
  input.placeholder = feature === 'summarize' ? 'Paste your notes here...' : feature === 'explain' ? 'What topic should we unpack?' : feature === 'planner' ? 'Subject, exam date, topics, and hours per week...' : feature === 'exam' ? 'Tell me what you need to revise before the exam...' : feature === 'coding' ? 'Paste your code and describe what you are trying to do...' : feature === 'career' ? 'Tell me a career you are interested in...' : 'Ask a question or paste your notes...';
  if (!state.history.length && messages) {
    renderMessagesFromHistory();
  }
}

function conversationContext() {
  return state.history.slice(-12).map((entry) => `${entry.role === 'user' ? 'Student' : 'StudyBuddy'}: ${entry.content}`).join('\n\n').slice(-12000);
}

function getCurrentConversation() {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
}

function renderMessagesFromHistory() {
  messages.innerHTML = '';
  if (!state.history.length) {
    const welcome = welcomeMessages[state.feature] || welcomeMessages.chat;
    const suggestions = state.feature === 'chat'
      ? '<div class="suggestions"><button data-suggestion="Explain photosynthesis to me like I am a beginner." data-feature="explain">Explain a topic</button><button data-suggestion="Help me make a study plan for my next test." data-feature="planner">Plan my study</button></div>'
      : '';
    messages.innerHTML = `<div class="message assistant"><div class="avatar">✦</div><div class="bubble"><p>${escapeHtml(welcome)}</p>${suggestions}</div></div>`;
    return;
  }

  state.history.forEach((entry) => addMessage(entry.content, entry.role));
}

function updateConversationSnapshot() {
  if (!state.activeConversationId) {
    return;
  }

  const conversation = getCurrentConversation();
  if (!conversation) {
    return;
  }

  conversation.messages = state.history.map((entry) => ({ ...entry, timestamp: entry.timestamp || Date.now() }));
  conversation.feature = state.feature;
  conversation.updatedAt = Date.now();

  const firstUserMessage = state.history.find((entry) => entry.role === 'user');
  if (firstUserMessage) {
    conversation.title = generateConversationTitle(firstUserMessage.content);
  }
}

function persistConversationState() {
  updateConversationSnapshot();

  const sorted = [...state.conversations]
    .map((conversation) => normalizeConversation(conversation))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  state.conversations = sorted;
  saveConversations(sorted);
  renderHistoryList();
}

function renderHistoryList() {
  if (!historyList) return;

  const query = (historySearch?.value || '').trim().toLowerCase();
  const filtered = state.conversations.filter((conversation) => {
    const haystack = `${conversation.title} ${conversation.messages.map((entry) => entry.content).join(' ')}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!filtered.length) {
    historyList.innerHTML = '<div class="history-empty">No saved chats yet.</div>';
    return;
  }

  historyList.innerHTML = filtered.map((conversation) => {
    const preview = conversation.messages
      .slice(-2)
      .map((entry) => entry.content)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return `
      <div class="history-item ${state.activeConversationId === conversation.id ? 'active' : ''}" data-id="${conversation.id}">
        <div class="history-item__content">
          <div class="history-item__header">
            <strong>${escapeHtml(conversation.title || 'Untitled chat')}</strong>
            <button class="history-item__delete" type="button" data-action="delete" data-id="${conversation.id}" aria-label="Delete conversation">×</button>
          </div>
          <span class="history-item__meta">${new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <p>${escapeHtml(preview || 'No messages yet.')}</p>
        </div>
      </div>
    `;
  }).join('');
}

function createNewConversation() {
  const currentConversation = getCurrentConversation();
  if (currentConversation && state.history.length) {
    currentConversation.messages = [...state.history];
    currentConversation.feature = state.feature;
    currentConversation.updatedAt = Date.now();
    if (state.history.some((entry) => entry.role === 'user')) {
      currentConversation.title = generateConversationTitle(state.history.find((entry) => entry.role === 'user').content);
    }
    persistConversationState();
  }

  const id = `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  state.activeConversationId = id;
  state.history = [];
  state.quizState = null;
  clearUpload();
  state.conversations = state.conversations.filter((conversation) => conversation.id !== id);
  state.conversations.unshift({
    id,
    title: 'New chat',
    feature: 'chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  });
  saveConversations(state.conversations);
  renderMessagesFromHistory();
  renderHistoryList();
  input.focus();
}

function openConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  state.activeConversationId = conversation.id;
  state.history = conversation.messages.map((entry) => ({ ...entry, timestamp: entry.timestamp || Date.now() }));
  state.feature = conversation.feature || 'chat';
  state.quizState = null;
  clearUpload();
  selectFeature(state.feature);
  renderMessagesFromHistory();
  renderHistoryList();
  closeSidebarOnMobile();
}

function deleteConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  const confirmed = window.confirm(`Delete "${conversation.title}"? This cannot be undone.`);
  if (!confirmed) return;

  state.conversations = state.conversations.filter((item) => item.id !== conversationId);

  if (state.activeConversationId === conversationId) {
    state.activeConversationId = null;
    state.history = [];
    state.quizState = null;
    renderMessagesFromHistory();
  }

  saveConversations(state.conversations);
  renderHistoryList();
}

function clearAllHistory() {
  if (!state.conversations.length) return;

  const confirmed = window.confirm('Clear all saved chat history? This cannot be undone.');
  if (!confirmed) return;

  state.conversations = [];
  state.activeConversationId = null;
  state.history = [];
  state.quizState = null;
  saveConversations([]);
  renderMessagesFromHistory();
  renderHistoryList();
}

function closeSidebarOnMobile() {
  if (!historySidebar) return;
  historySidebar.classList.remove('open');
  if (layout) layout.classList.add('history-collapsed');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
}

function toggleSidebar() {
  if (!historySidebar) return;
  const isOpen = window.innerWidth > 900
    ? layout?.classList.contains('history-collapsed')
    : !historySidebar.classList.contains('open');
  historySidebar.classList.toggle('open', isOpen);
  layout?.classList.toggle('history-collapsed', !isOpen);
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', String(isOpen));
}

async function sendMessage(message, feature = state.feature) {
  if (state.busy || !message.trim()) return;

  if (!state.activeConversationId) {
    const id = `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    state.activeConversationId = id;
    state.conversations.unshift({
      id,
      title: generateConversationTitle(message.trim()),
      feature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    });
  }

  const activeConversation = getCurrentConversation();
  if (activeConversation) {
    activeConversation.feature = feature;
    activeConversation.updatedAt = Date.now();
  }

  const userMessage = { role: 'user', content: message.trim(), timestamp: Date.now() };
  state.history.push(userMessage);
  if (activeConversation) {
    activeConversation.messages = [...state.history];
    activeConversation.title = generateConversationTitle(message.trim());
  }
  persistConversationState();

  setBusy(true);
  addMessage(message.trim());
  const loading = addMessage('', 'assistant', true);

  try {
    const context = conversationContext();
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.trim(),
        feature,
        context,
        materialText: state.uploadMaterial?.text || '',
        materialName: state.uploadMaterial?.name || ''
      })
    });

    const result = await response.json();
    loading.remove();
    if (!response.ok) throw new Error(result.error || 'Something went wrong.');

    const answer = result.answer;
    addMessage(answer, 'assistant');
    state.history.push({ role: 'assistant', content: answer, timestamp: Date.now() });
    if (activeConversation) {
      activeConversation.messages = [...state.history];
      activeConversation.updatedAt = Date.now();
    }
    persistConversationState();
  } catch (error) {
    loading.remove();
    const fallback = getFriendlyApiErrorMessage(error);
    addMessage(fallback, 'assistant');
    state.history.push({ role: 'assistant', content: fallback, timestamp: Date.now() });
    if (activeConversation) {
      activeConversation.messages = [...state.history];
      activeConversation.updatedAt = Date.now();
    }
    persistConversationState();
  } finally {
    setBusy(false);
    input.focus();
  }
}

function initializeHistory() {
  const stored = loadStoredConversations();
  state.conversations = stored;

  if (stored.length) {
    const newest = stored[0];
    state.activeConversationId = newest.id;
    state.history = newest.messages.map((entry) => ({ ...entry, timestamp: entry.timestamp || Date.now() }));
    state.feature = newest.feature || 'chat';
    selectFeature(state.feature);
  } else {
    state.activeConversationId = null;
    state.history = [];
  }

  renderMessagesFromHistory();
  renderHistoryList();
}

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
    startQuiz(state.quizState.topic, state.quizState.difficulty, weakAreas.join(', '), state.quizState.questionCount);
  });

  messages.append(summary);
  messages.scrollTop = messages.scrollHeight;
}

function startQuiz(topic, difficulty = 'medium', focus = '', questionCount = 5) {
  const materialText = state.uploadMaterial?.text || '';
  const questions = createFallbackQuiz(topic, difficulty, focus, questionCount, materialText);
  state.quizState = { topic, difficulty, focus, questionCount, materialText, questions, currentIndex: 0, answers: {} };
  const intro = document.createElement('div');
  intro.className = 'message assistant';
  intro.innerHTML = `<div class="avatar">✦</div><div class="bubble"><p>Let’s practise ${escapeHtml(topic)} at a ${escapeHtml(difficulty)} level. I’ll ask one question at a time and then give you a friendly Study Coach review.</p></div></div>`;
  messages.append(intro);
  renderQuizQuestion();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  input.value = '';
  sendMessage(value);
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('.feature-card').forEach((card) => card.addEventListener('click', () => {
  const feature = card.dataset.feature;
  selectFeature(feature);
  if (feature !== 'chat' && ['planner', 'exam', 'quiz', 'assignment', 'coding', 'career'].includes(feature)) {
    openFeatureModal(feature);
  } else {
    input.focus();
  }
}));

messages.addEventListener('click', (event) => {
  const button = event.target.closest('[data-suggestion]');
  if (!button) return;

  const feature = button.dataset.feature || 'chat';
  selectFeature(feature);
  input.value = button.dataset.suggestion || '';

  if (feature === 'planner') {
    openFeatureModal(feature);
    return;
  }

  renderMessagesFromHistory();
  input.focus();
});

document.querySelector('#clear-chat').addEventListener('click', () => {
  createNewConversation();
});

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
    quiz: `<label>Quiz topic<input name="topic" placeholder="e.g. Fractions" required></label><label>Number of questions<input name="questionCount" type="number" min="1" max="20" placeholder="e.g. 5" required></label><label>Difficulty<select class="form-select" name="difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></label><label>Optional focus area<input name="focus" placeholder="e.g. Variables, loops, functions"></label><label>Optional PDF study material<input name="quizPdf" type="file" accept=".pdf,application/pdf"></label><p class="form-note">Choose your quiz settings, or add a PDF so the questions are based on its contents.</p><button class="primary-action" type="submit">Start quiz <span>→</span></button>`,
    assignment: `<label>Assignment question<textarea name="question" rows="5" placeholder="Paste the question or brief here..." required></textarea></label><button class="primary-action" type="submit">Break it down <span>→</span></button>`,
    coding: `<label>Language<select class="form-select" name="language" required><option value="python">Python</option><option value="java">Java</option><option value="javascript">JavaScript</option></select></label><label>Code<textarea name="code" rows="8" placeholder="Paste your code here..." required></textarea></label><label>What are you trying to do?<textarea name="question" rows="3" placeholder="Optional: explain the goal or the error you are seeing"></textarea></label><button class="primary-action" type="submit">Analyse code <span>→</span></button>`,
    career: `<label>Career you are interested in<input name="career" placeholder="e.g. Data Engineer" required></label><p class="form-note">StudyBuddy gives general guidance and explains how to start learning, without promising job outcomes.</p><button class="primary-action" type="submit">Explore career <span>→</span></button>`
  };

  modalForm.innerHTML = templates[feature];
  modal.classList.remove('hidden');
  state.quizUploadPromise = null;
  const quizPdf = modalForm.querySelector('[name="quizPdf"]');
  if (quizPdf) {
    quizPdf.addEventListener('change', () => {
      state.quizUploadPromise = quizPdf.files[0] ? uploadMaterial(quizPdf.files[0]) : null;
    });
  }
  modalForm.querySelector('input, textarea, select').focus();
}

function closeModal() {
  modal.classList.add('hidden');
}

document.querySelector('#modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

modalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const feature = state.feature;
  const data = Object.fromEntries(new FormData(modalForm));
  const button = modalForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Preparing...';

  try {
    if (feature === 'quiz' && state.quizUploadPromise) {
      await state.quizUploadPromise;
      if (!state.uploadMaterial) throw new Error('The PDF could not be processed. Please choose a readable PDF and try again.');
    }
    const response = await fetch('/api/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create your study request.');
    closeModal();

    if (feature === 'quiz') {
      state.quizState = null;
      startQuiz(data.topic, data.difficulty || 'medium', data.focus || '', Number(data.questionCount));
      return;
    }

    await sendMessage(result.message, feature);
  } catch (error) {
    modalForm.insertAdjacentHTML('beforeend', `<p class="form-error">${escapeHtml(error.message)}</p>`);
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  }
});

function updateThemeToggle(theme) {
  if (!themeToggle) return;

  const isDark = theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');

  const icon = themeToggle.querySelector('.theme-toggle__icon');
  const label = themeToggle.querySelector('.theme-toggle__label');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function initializeTheme() {
  const savedTheme = getStoredTheme();
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = resolveThemePreference(savedTheme, systemPrefersDark);

  applyTheme(theme);
  updateThemeToggle(theme);
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    updateThemeToggle(nextTheme);
  });
}

if (newChatButton) {
  newChatButton.addEventListener('click', () => {
    createNewConversation();
    closeSidebarOnMobile();
  });
}

if (clearHistoryButton) {
  clearHistoryButton.addEventListener('click', () => {
    clearAllHistory();
    closeSidebarOnMobile();
  });
}

if (historySearch) {
  historySearch.addEventListener('input', () => {
    renderHistoryList();
  });
}

if (historyList) {
  historyList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-action="delete"]');
    if (deleteButton) {
      deleteConversation(deleteButton.dataset.id);
      return;
    }

    const item = event.target.closest('.history-item');
    if (item) {
      openConversation(item.dataset.id);
    }
  });
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', toggleSidebar);
}

if (sidebarClose) {
  sidebarClose.addEventListener('click', closeSidebarOnMobile);
}

document.addEventListener('click', (event) => {
  if (window.innerWidth > 900 || !historySidebar?.classList.contains('open')) return;
  if (!historySidebar.contains(event.target) && event.target !== sidebarToggle) {
    closeSidebarOnMobile();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  selectFeature('chat');
  initializeTheme();
  initializeHistory();
});

window.addEventListener('beforeunload', () => {
  if (state.activeConversationId && state.history.length) {
    const conversation = getCurrentConversation();
    if (conversation) {
      conversation.messages = [...state.history];
      conversation.feature = state.feature;
      conversation.updatedAt = Date.now();
      saveConversations(state.conversations);
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && historySidebar?.classList.contains('open')) {
    closeSidebarOnMobile();
  }
});

renderMessagesFromHistory();
renderHistoryList();
