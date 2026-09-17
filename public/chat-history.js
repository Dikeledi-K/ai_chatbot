const STORAGE_KEY = 'studybuddy-chat-history';

function safeJsonParse(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function generateConversationTitle(input) {
  const normalized = String(input ?? '').trim();
  if (!normalized) {
    return 'New chat';
  }

  const words = normalized.replace(/\s+/g, ' ').split(' ');

  if (words.length <= 7) {
    return words.join(' ');
  }

  return words.slice(0, 7).join(' ');
}

export function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') {
    return null;
  }

  const messages = Array.isArray(conversation.messages) ? conversation.messages.map((entry) => ({
    role: entry && typeof entry.role === 'string' ? entry.role : 'user',
    content: typeof entry?.content === 'string' ? entry.content : '',
    timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now()
  })).filter((entry) => entry.content.trim()) : [];

  const id = typeof conversation.id === 'string' && conversation.id.trim() ? conversation.id : `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const feature = typeof conversation.feature === 'string' ? conversation.feature : 'chat';
  const title = typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : generateConversationTitle(messages.find((entry) => entry.role === 'user')?.content || 'New chat');

  return {
    id,
    title,
    feature,
    createdAt: Number.isFinite(conversation.createdAt) ? conversation.createdAt : Date.now(),
    updatedAt: Number.isFinite(conversation.updatedAt) ? conversation.updatedAt : Date.now(),
    messages
  };
}

export function loadStoredConversations(rawValue) {
  if (rawValue === undefined) {
    try {
      rawValue = localStorage.getItem(STORAGE_KEY);
    } catch {
      return [];
    }
  }

  const parsed = safeJsonParse(rawValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = parsed
    .map((conversation) => normalizeConversation(conversation))
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return normalized;
}

export function saveConversations(conversations) {
  try {
    const normalized = (Array.isArray(conversations) ? conversations : [])
      .map((conversation) => normalizeConversation(conversation))
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [];
  }
}
