import { buildStudyCoachFeedback, calculateQuizScore, getFriendlyApiErrorMessage, createFallbackQuiz, normalizeQuizQuestions } from './studybuddy-logic.js';
import { applyTheme, getStoredTheme, persistTheme, resolveThemePreference } from './theme.js';
import { generateConversationTitle, loadStoredConversations, normalizeConversation, saveConversations } from './chat-history.js';
import { attachExportMenu } from './export-utils.js';

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
const quizSettings = document.querySelector('#quiz-settings');
const quizQuestionCount = document.querySelector('#quiz-question-count');
const quizDifficulty = document.querySelector('#quiz-difficulty');

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

// Escapes user content so text appears safely inside HTML-rendered chat bubbles.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

// Converts markdown-like AI replies into safe HTML for display in the message feed.
function formatAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`)
    .replace(/\n/g, '<br>');
}

function buildExportMeta(feature = 'chat', content = '') {
  const today = new Date().toISOString().slice(0, 10);
  const titles = {
    planner: `Study Plan - ${today}`,
    exam: `Exam Preparation - ${today}`,
    summarize: `Notes Summary - ${today}`,
    quiz: `Quiz Results - ${today}`,
    assignment: `Assignment Help - ${today}`,
    coding: `Coding Guidance - ${today}`,
    career: `Career Guidance - ${today}`,
    explain: `Topic Explanation - ${today}`,
    chat: `StudyBuddy Chat Export - ${today}`
  };
  const kindMap = { planner: 'study-plan', exam: 'study-plan', summarize: 'summary', quiz: 'quiz' };

  return {
    title: titles[feature] || titles.chat,
    content: String(content ?? '').trim(),
    kind: kindMap[feature] || 'studybuddy'
  };
}

function addExportControl(item, exportMeta = null) {
  if (!item || !exportMeta || !exportMeta.content) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'export-button';
  button.textContent = 'Export';
  button.setAttribute('aria-label', `Export ${exportMeta.title}`);

  const wrapper = attachExportMenu({
    trigger: button,
    title: exportMeta.title,
    content: exportMeta.content,
    kind: exportMeta.kind
  });

  item.appendChild(wrapper);
}

// Adds a message bubble to the chat window and returns the created DOM element.
function addMessage(content, role = 'user', loading = false, exportMeta = null) {
  const item = document.createElement('div');
  item.className = `message ${role}${loading ? ' loading-message' : ''}`;
  item.innerHTML = role === 'assistant'
    ? `<div class="avatar">✦</div><div class="bubble">${loading ? '<span class="typing"><i></i><i></i><i></i></span>' : `<div>${formatAnswer(content)}</div>`}</div>`
    : `<div class="bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;

  if (role === 'assistant' && exportMeta && exportMeta.content) {
    addExportControl(item, exportMeta);
  }

  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

// Updates the send button, input state, and status text while the app waits for a response.
function setBusy(value) {
  state.busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  statusText.textContent = value ? 'Thinking...' : 'Ready to learn';
  document.querySelector('.status-dot').classList.toggle('working', value);
}

// Formats uploaded file sizes into readable units such as KB or MB.
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Shows or clears the upload validation message near the file picker.
function setUploadError(message = '') {
  if (!uploadError) return;
  uploadError.textContent = message;
  uploadError.classList.toggle('hidden', !message);
}

// Clears the current uploaded study material and resets the upload UI state.
function clearUpload() {
  state.uploadMaterial = null;
  if (materialFile) materialFile.value = '';
  uploadFile?.classList.add('hidden');
  uploadActions?.classList.add('hidden');
  uploadDropzone?.classList.remove('hidden');
  setUploadError();
  if (uploadStatus) uploadStatus.textContent = 'Optional';
}

// Sends a selected file to the server, extracts its readable text, and stores it for later use.
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

    const extractedText = String(result.text || '').trim();
    if (!extractedText) {
      throw new Error('I couldn\'t read the text in this image. Please upload a clearer photo or paste the text manually instead.');
    }

    state.uploadMaterial = { ...result.file, text: extractedText };
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
  if (feature === 'exam') {
    openFeatureModal(feature);
    return;
  }

  if (feature === 'quiz') {
    input.value = state.uploadMaterial ? 'Create a quiz from the uploaded material.' : '';
    input.focus();
    return;
  }

  input.value = feature === 'summarize'
    ? 'Summarise the uploaded material into key topics, important concepts, definitions, main points, and a quick revision summary.'
    : 'Explain the uploaded material in simple terms and help me understand the key ideas.';
  input.focus();
});

// Switches the active study mode and updates the visible interface for that feature.
function selectFeature(feature) {
  const previousFeature = state.feature;
  if (feature !== previousFeature) {
    clearUpload();
  }

  state.feature = feature;
  quizSettings?.classList.toggle('hidden', feature !== 'quiz');
  document.querySelectorAll('.feature-card').forEach((card) => card.classList.toggle('active', card.dataset.feature === feature));
  document.querySelector('#mode-label').textContent = feature === 'chat' ? 'STUDY CHAT' : featureNames[feature].toUpperCase();
  document.querySelector('#mode-title').textContent = feature === 'chat' ? 'What are you working on?' : `${featureNames[feature]} with confidence.`;
  input.placeholder = feature === 'summarize' ? 'Paste your notes here...' : feature === 'explain' ? 'What topic should we unpack?' : feature === 'planner' ? 'Subject, exam date, topics, and hours per week...' : feature === 'exam' ? 'Tell me what you need to revise before the exam...' : feature === 'quiz' ? 'Type a quiz topic or leave the uploaded material as your source...' : feature === 'coding' ? 'Paste your code and describe what you are trying to do...' : feature === 'career' ? 'Tell me a career you are interested in...' : 'Ask a question or paste your notes...';
  if (!state.history.length && messages) {
    renderMessagesFromHistory();
  }
}

// Builds a compact recent chat summary that can be sent to the AI as conversation context.
function conversationContext() {
  return state.history.slice(-12).map((entry) => `${entry.role === 'user' ? 'Student' : 'StudyBuddy'}: ${entry.content}`).join('\n\n').slice(-12000);
}

// Returns the currently active saved conversation object or null if none is selected.
function getCurrentConversation() {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
}

// Renders the active conversation history into the message panel for the current view.
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

// Syncs the in-memory conversation state with the current chat history so it can be saved.
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

// Saves the current conversation list in a normalised form and refreshes the sidebar list.
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

// Renders the saved conversation list with search filtering and current-selection styling.
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

// Starts a fresh chat and resets the active conversation state without losing saved history.
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

// Opens a saved conversation from the sidebar and restores its messages and feature mode.
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

// Deletes a saved conversation after confirmation and updates the UI state.
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

// Clears every saved conversation after confirmation and resets the chat view.
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

// Closes the history sidebar on small screens after a chat is opened or cleared.
function closeSidebarOnMobile() {
  if (!historySidebar) return;
  historySidebar.classList.remove('open');
  if (layout) layout.classList.add('history-collapsed');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
}

// Toggles the visible state of the history sidebar across mobile and desktop layouts.
function toggleSidebar() {
  if (!historySidebar) return;
  const isOpen = window.innerWidth > 900
    ? layout?.classList.contains('history-collapsed')
    : !historySidebar.classList.contains('open');
  historySidebar.classList.toggle('open', isOpen);
  layout?.classList.toggle('history-collapsed', !isOpen);
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', String(isOpen));
}

// Sends a user message to the backend, handles success or failure states, and stores the result in history.
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
    const exportMeta = buildExportMeta(feature, answer);
    addMessage(answer, 'assistant', false, exportMeta);
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

// Restores saved chat history from storage and chooses the newest conversation to display.
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

// Renders the active question set for the current quiz so the learner can answer each item.
function renderQuizQuestion() {
  if (!state.quizState) return;

  const quiz = state.quizState;
  const item = document.createElement('div');
  item.className = 'message assistant';
  item.innerHTML = `
    <div class="avatar">✦</div>
    <div class="bubble">
      <div class="quiz-card quiz-board">
        <div class="question-label">Quiz · ${quiz.questions.length} questions</div>
        <p class="quiz-instructions">Choose one answer for each question, then submit when you are ready.</p>
        ${quiz.questions.map((question, questionIndex) => `
          <section class="quiz-question" data-question-index="${questionIndex}">
            <div class="question-label">Question ${questionIndex + 1} of ${quiz.questions.length}</div>
            <h3>${escapeHtml(question.concept || 'Quick check')}</h3>
            <p>${escapeHtml(question.question)}</p>
            <div class="quiz-answers">
              ${question.options.map((option, optionIndex) => `<button class="answer-option" data-question-index="${questionIndex}" data-index="${optionIndex}" type="button">${escapeHtml(option)}</button>`).join('')}
            </div>
            <p class="quiz-explanation" hidden></p>
          </section>
        `).join('')}
        <button class="primary-action quiz-submit" type="button" disabled>Submit quiz <span>→</span></button>
      </div>
    </div>
  `;

  const submitButton = item.querySelector('.quiz-submit');
  item.querySelectorAll('.answer-option').forEach((button) => {
    button.addEventListener('click', () => {
      if (quiz.submitted) return;
      const questionIndex = Number(button.dataset.questionIndex);
      const question = quiz.questions[questionIndex];
      const questionId = question.id || `q${questionIndex + 1}`;
      quiz.answers[questionId] = Number(button.dataset.index);
      item.querySelectorAll(`[data-question-index="${questionIndex}"]`).forEach((option) => option.classList.remove('selected'));
      button.classList.add('selected');
      submitButton.disabled = Object.keys(quiz.answers).length < quiz.questions.length;
    });
  });

  submitButton.addEventListener('click', () => {
    if (submitButton.disabled || quiz.submitted) return;
    quiz.submitted = true;
    item.querySelectorAll('.answer-option').forEach((button) => {
      const questionIndex = Number(button.dataset.questionIndex);
      const question = quiz.questions[questionIndex];
      const selectedIndex = quiz.answers[question.id || `q${questionIndex + 1}`];
      const optionIndex = Number(button.dataset.index);
      button.disabled = true;
      if (optionIndex === Number(question.correctAnswerIndex)) button.classList.add('correct');
      if (optionIndex === selectedIndex && selectedIndex !== Number(question.correctAnswerIndex)) button.classList.add('incorrect');
    });
    quiz.questions.forEach((question, questionIndex) => {
      const explanation = item.querySelector(`[data-question-index="${questionIndex}"] .quiz-explanation`);
      if (!explanation) return;
      explanation.textContent = question.explanation || 'Review the concept and compare your reasoning with the correct answer.';
      explanation.hidden = false;
    });
    submitButton.remove();
    finishQuiz();
  });

  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

// Calculates the final score and summarises strengths, weak areas, and next study steps.
function finishQuiz() {
  if (!state.quizState) return;
  const { score, strengths, weaknesses, recommendations, positivity } = buildStudyCoachFeedback(state.quizState.questions, state.quizState.answers);
  const summary = document.createElement('div');
  summary.className = 'message assistant';
  const exportContent = [
    'Quiz Results',
    `Score: ${score}`,
    `Strengths: ${strengths.length ? strengths.join('; ') : 'Keep going — you are building strong foundations.'}`,
    `Weak areas: ${weaknesses.length ? weaknesses.join('; ') : 'Nothing major to flag — keep revising and challenge yourself with a harder quiz.'}`,
    `Recommended next steps: ${recommendations.join('; ')}`
  ].join('\n\n');

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

  addExportControl(summary, {
    title: `Quiz Results - ${new Date().toISOString().slice(0, 10)}`,
    content: exportContent,
    kind: 'quiz'
  });

  summary.querySelector('[data-action="retry-quiz"]').addEventListener('click', () => {
    const quizBoard = messages.querySelector('.quiz-board')?.closest('.message');
    quizBoard?.remove();
    summary.remove();
    state.quizState = { ...state.quizState, currentIndex: 0, answers: {}, submitted: false };
    renderQuizQuestion();
  });

  summary.querySelector('[data-action="practice-weak"]').addEventListener('click', () => {
    const weakAreas = state.quizState.questions.filter((question) => Number(state.quizState.answers[question.id || `q${state.quizState.questions.indexOf(question) + 1}`]) !== Number(question.correctAnswerIndex)).map((question) => question.concept || 'Core topic').slice(0, 3);
    startQuiz(state.quizState.topic, state.quizState.difficulty, weakAreas.join(', '), state.quizState.questionCount);
  });

  messages.append(summary);
  messages.scrollTop = messages.scrollHeight;
}

// Starts a quiz request, shows an analysis state, and falls back to a local question set if needed.
async function startQuiz(topic, difficulty = 'easy', focus = '', questionCount = 5) {
  const materialText = state.uploadMaterial?.text || '';
  const intro = document.createElement('div');
  intro.className = 'message assistant';
  intro.innerHTML = `<div class="avatar">✦</div><div class="bubble"><div class="analysis-state" role="status" aria-live="polite"><div class="analysis-state__visual"><span class="analysis-orbit analysis-orbit--one"></span><span class="analysis-orbit analysis-orbit--two"></span><span class="analysis-core">✦</span></div><div class="analysis-state__copy"><strong>StudyBuddy is thinking</strong><span class="analysis-state__detail">Reading your study material...</span><div class="analysis-progress"><span></span></div><small>Building a ${escapeHtml(difficulty)} quiz${materialText ? ' from your uploaded document' : ''}</small></div></div></div>`;
  messages.append(intro);
  messages.scrollTop = messages.scrollHeight;

  const analysisDetails = materialText
    ? ['Reading your study material...', 'Finding the key concepts...', 'Writing useful questions...', 'Checking answer quality...']
    : ['Understanding the topic...', 'Writing useful questions...', 'Adding plausible answer choices...', 'Checking answer quality...'];
  const analysisDetail = intro.querySelector('.analysis-state__detail');
  const analysisProgress = intro.querySelector('.analysis-progress span');
  let analysisStep = 0;
  const analysisTimer = setInterval(() => {
    analysisStep = (analysisStep + 1) % analysisDetails.length;
    if (analysisDetail) analysisDetail.textContent = analysisDetails[analysisStep];
    if (analysisProgress) analysisProgress.style.width = `${Math.min(88, 22 + analysisStep * 22)}%`;
  }, 1200);

  let questions;
  try {
    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic === 'the uploaded document' ? '' : topic, difficulty, questionCount, materialText, materialName: state.uploadMaterial?.name || '' })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Quiz generation failed.');
    questions = normalizeQuizQuestions(result.questions, questionCount);
    if (questions.length < questionCount) throw new Error('The quiz contained repeated questions.');
  } catch {
    questions = createFallbackQuiz(topic, difficulty, focus, questionCount, materialText);
  } finally {
    clearInterval(analysisTimer);
  }

  intro.remove();
  state.quizState = { topic, difficulty, focus, questionCount, materialText, questions, currentIndex: 0, answers: {}, submitted: false };
  renderQuizQuestion();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  input.value = '';
  if (state.feature === 'quiz') {
    if (!value && !state.uploadMaterial?.text) return;
    const questionCount = Math.min(20, Math.max(1, Number(quizQuestionCount?.value) || 5));
    const difficulty = ['easy', 'hard', 'difficult'].includes(quizDifficulty?.value) ? quizDifficulty.value : 'easy';
    if (quizQuestionCount) quizQuestionCount.value = String(questionCount);
    startQuiz(value || 'the uploaded document', difficulty, '', questionCount);
    return;
  }
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
  if (feature !== 'chat' && ['planner', 'exam', 'assignment', 'coding', 'career'].includes(feature)) {
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

// Opens the modal that collects the fields for a selected feature such as planner or assignment help.
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
    quiz: `<label>Quiz topic <span class="form-note">(optional when a PDF is uploaded)</span><input name="topic" placeholder="e.g. Fractions"></label><label>Number of questions<input name="questionCount" type="number" min="1" max="20" placeholder="e.g. 5" required></label><label>Difficulty<select class="form-select" name="difficulty"><option value="easy">Easy</option><option value="hard">Hard</option><option value="difficult">Difficult</option></select></label><label>Optional PDF study material<input name="quizPdf" type="file" accept=".pdf,application/pdf"></label><p class="form-note">Easy builds confidence, Hard applies concepts, and Difficult uses multi-step reasoning.</p><button class="primary-action" type="submit">Start quiz <span>→</span></button>`,
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

// Closes the active feature modal and clears the current submission state.
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
    if (feature === 'quiz') {
      data.materialText = state.uploadMaterial?.text || '';
      data.materialName = state.uploadMaterial?.name || '';
      if (!String(data.topic || '').trim() && !data.materialText.trim()) {
        throw new Error('Enter a quiz topic or upload a readable PDF.');
      }

      closeModal();
      state.quizState = null;
      startQuiz(data.topic || 'the uploaded document', data.difficulty || 'easy', '', Number(data.questionCount));
      return;
    }
    const response = await fetch('/api/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create your study request.');
    closeModal();

    await sendMessage(result.message, feature);
  } catch (error) {
    modalForm.insertAdjacentHTML('beforeend', `<p class="form-error">${escapeHtml(error.message)}</p>`);
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  }
});

// Syncs the theme button's icon and label to the current application theme.
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

// Reads the saved or system theme preference and applies it when the page loads.
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
  closeSidebarOnMobile();
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
