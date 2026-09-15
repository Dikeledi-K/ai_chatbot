import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveThemePreference } from '../public/theme.js';

test('uses saved theme when it exists', () => {
  assert.equal(resolveThemePreference('light', true), 'light');
  assert.equal(resolveThemePreference('dark', false), 'dark');
});

test('falls back to the system preference when no saved theme exists', () => {
  assert.equal(resolveThemePreference(null, true), 'dark');
  assert.equal(resolveThemePreference(null, false), 'light');
});
