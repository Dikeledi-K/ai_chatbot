import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validateFeaturePayload } from '../validation.js';

test('rejects empty input', () => assert.equal(validateInput('   ').valid, false));
test('rejects input longer than the limit', () => assert.equal(validateInput('a'.repeat(6001)).valid, false));
test('accepts a normal question', () => assert.equal(validateInput('Explain gravity').valid, true));
test('requires planner fields', () => assert.equal(validateFeaturePayload('planner', { subject: 'Math' }).valid, false));
test('accepts a complete quiz request', () => assert.equal(validateFeaturePayload('quiz', { topic: 'Photosynthesis' }).valid, true));
