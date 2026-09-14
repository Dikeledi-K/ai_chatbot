import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validateFeaturePayload } from '../validation.js';
import { calculateQuizScore, buildStudyCoachFeedback } from '../public/studybuddy-logic.js';

test('rejects empty input', () => assert.equal(validateInput('   ').valid, false));
test('rejects input longer than the limit', () => assert.equal(validateInput('a'.repeat(6001)).valid, false));
test('accepts a normal question', () => assert.equal(validateInput('Explain gravity').valid, true));
test('requires planner fields', () => assert.equal(validateFeaturePayload('planner', { subject: 'Math' }).valid, false));
test('accepts a complete exam preparation request', () => assert.equal(validateFeaturePayload('exam', {
  subject: 'Biology',
  examDate: '2026-10-20',
  topics: 'Cells and photosynthesis',
  focus: 'Photosynthesis'
}).valid, true));
test('accepts a complete quiz request', () => assert.equal(validateFeaturePayload('quiz', { topic: 'Photosynthesis' }).valid, true));
test('accepts supported coding inputs', () => assert.equal(validateFeaturePayload('coding', { language: 'python', code: 'print(1 + 1)' }).valid, true));
test('validates unsupported coding languages', () => assert.equal(validateFeaturePayload('coding', { language: 'ruby', code: 'puts 1' }).valid, false));
test('accepts career guidance input', () => assert.equal(validateFeaturePayload('career', { career: 'Data Engineer' }).valid, true));
test('calculates the actual quiz score from selected answers', () => {
  const questions = [
    { id: 'q1', concept: 'Variables', correctAnswerIndex: 1 },
    { id: 'q2', concept: 'Loops', correctAnswerIndex: 0 },
    { id: 'q3', concept: 'Conditions', correctAnswerIndex: 2 }
  ];
  const score = calculateQuizScore(questions, { q1: 1, q2: 1, q3: 2 });
  assert.deepEqual(score, { correct: 2, total: 3, percentage: 67, answerSummary: { 0: true, 1: false, 2: true } });
});
test('builds study coach feedback from right and wrong answers', () => {
  const questions = [
    { id: 'q1', concept: 'Variables', correctAnswerIndex: 0 },
    { id: 'q2', concept: 'Loops', correctAnswerIndex: 1 },
    { id: 'q3', concept: 'Conditions', correctAnswerIndex: 2 },
    { id: 'q4', concept: 'Functions', correctAnswerIndex: 0 }
  ];
  const feedback = buildStudyCoachFeedback(questions, { q1: 0, q2: 0, q3: 2, q4: 0 });
  assert.equal(feedback.score, '3/4');
  assert.deepEqual(feedback.strengths, ['Variables', 'Conditions', 'Functions']);
  assert.deepEqual(feedback.weaknesses, ['Loops']);
  assert.ok(feedback.recommendations.some((item) => item.toLowerCase().includes('review loops')));
});
