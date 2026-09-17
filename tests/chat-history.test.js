import test from 'node:test';
import assert from 'node:assert/strict';

import { generateConversationTitle, normalizeConversation, loadStoredConversations } from '../public/chat-history.js';

test('generates a short title from the first user message', () => {
  assert.equal(generateConversationTitle('Explain Ohm\'s law in simple terms'), 'Explain Ohm\'s law in simple terms');
  assert.equal(generateConversationTitle('This is a very long message that should be cut off and shortened for the conversation title because it exceeds the limit.'), 'This is a very long message that');
});

test('normalizes saved conversations safely when data is incomplete', () => {
  const normalized = normalizeConversation({
    id: 'abc',
    title: 'Untitled',
    feature: 'chat',
    messages: [
      { role: 'user', content: 'Help me study', timestamp: Date.now() },
      { role: 'assistant', content: 'Absolutely', timestamp: Date.now() + 1 }
    ]
  });

  assert.equal(normalized.id, 'abc');
  assert.equal(normalized.messages.length, 2);
  assert.equal(normalized.title, 'Untitled');
});

test('returns an empty array when storage contains invalid data', () => {
  const parsed = loadStoredConversations('not-json');
  assert.deepEqual(parsed, []);
});

test('returns an empty array when localStorage is blocked', () => {
  const previousLocalStorage = global.localStorage;

  global.localStorage = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Storage blocked');
    }
  };

  try {
    assert.deepEqual(loadStoredConversations(), []);
  } finally {
    global.localStorage = previousLocalStorage;
  }
});
