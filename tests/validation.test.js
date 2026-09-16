import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validateFeaturePayload } from '../validation.js';
import { calculateQuizScore, buildStudyCoachFeedback, createFallbackQuiz, normalizeQuizQuestions } from '../public/studybuddy-logic.js';

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
test('accepts a complete quiz request with a chosen question count', () => assert.equal(validateFeaturePayload('quiz', { topic: 'Photosynthesis', questionCount: '8' }).valid, true));
test('accepts a document-only quiz request without a topic', () => assert.equal(validateFeaturePayload('quiz', { topic: '', materialText: 'Photosynthesis converts light energy into chemical energy.', questionCount: '5' }).valid, true));
test('requires a topic when no quiz document is provided', () => assert.equal(validateFeaturePayload('quiz', { topic: '', questionCount: '5' }).valid, false));
test('rejects quiz question counts outside the supported range', () => {
  assert.equal(validateFeaturePayload('quiz', { topic: 'Photosynthesis', questionCount: '0' }).valid, false);
  assert.equal(validateFeaturePayload('quiz', { topic: 'Photosynthesis', questionCount: '21' }).valid, false);
});
test('creates the requested number of fallback quiz questions', () => {
  const questions = createFallbackQuiz('Photosynthesis', 'medium', '', 8);
  assert.equal(questions.length, 8);
  assert.ok(new Set(questions.map((question) => question.question)).size > 1);
  assert.ok(new Set(questions.map((question) => question.correctAnswerIndex)).size > 1);
  questions.forEach((question) => {
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options[question.correctAnswerIndex].includes('guess'), false);
  });
});
test('creates subject-specific Python data-structures questions', () => {
  const questions = createFallbackQuiz('Python data structures', 'medium', '', 5);
  assert.ok(questions.some((question) => question.question.includes('values[1:3]')));
  assert.ok(questions.some((question) => question.concept === 'Dictionaries'));
  assert.ok(questions.every((question) => question.options.length === 4));
  assert.ok(questions.every((question) => question.options[question.correctAnswerIndex]));
});
test('changes fallback Python questions for hard difficulty', () => {
  const easy = createFallbackQuiz('Python data structures', 'easy', '', 1)[0];
  const hard = createFallbackQuiz('Python data structures', 'hard', '', 1)[0];
  assert.notEqual(easy.question, hard.question);
  assert.equal(hard.concept, 'Aliasing and mutation');
  assert.equal(hard.difficulty, 'hard');
});
test('accepts difficult difficulty and creates a distinct advanced question set', () => {
  assert.equal(validateFeaturePayload('quiz', { topic: 'Python data structures', difficulty: 'difficult', questionCount: '1' }).valid, true);
  const easy = createFallbackQuiz('Python data structures', 'easy', '', 1)[0];
  const hard = createFallbackQuiz('Python data structures', 'hard', '', 1)[0];
  const difficult = createFallbackQuiz('Python data structures', 'difficult', '', 1)[0];
  assert.notEqual(difficult.question, easy.question);
  assert.notEqual(difficult.question, hard.question);
  assert.equal(difficult.difficulty, 'difficult');
  assert.equal(difficult.concept, 'Reference graphs');
});
test('changes fallback Python questions for easy difficulty', () => {
  const easy = createFallbackQuiz('Python data structures', 'easy', '', 1)[0];
  const medium = createFallbackQuiz('Python data structures', 'medium', '', 1)[0];
  assert.notEqual(easy.question, medium.question);
  assert.equal(easy.concept, 'List basics');
  assert.equal(easy.difficulty, 'easy');
});
test('does not repeat easy Python data-structures questions', () => {
  const questions = createFallbackQuiz('Python data structures', 'easy', '', 5);
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map((question) => question.question)).size, 5);
});
test('creates realistic health questions', () => {
  const questions = createFallbackQuiz('Health and nutrition', 'medium', '', 4);
  assert.ok(questions.some((question) => question.concept === 'Evidence and health claims'));
  assert.ok(questions.some((question) => question.question.includes('social media')));
  assert.ok(questions.every((question) => question.options.length === 4));
});
test('creates realistic agriculture questions', () => {
  const questions = createFallbackQuiz('Agriculture and farming', 'medium', '', 4);
  assert.ok(questions.some((question) => question.concept === 'Crop rotation'));
  assert.ok(questions.some((question) => question.question.includes('irrigation')));
  assert.ok(questions.every((question) => question.options.length === 4));
});
test('removes repeated quiz questions and repeated option sets', () => {
  const questions = normalizeQuizQuestions([
    { question: ' What is a list? ', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0 },
    { question: 'What is a list?', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0 },
    { question: 'What is a tuple?', options: ['E', 'F', 'G', 'H'], correctAnswerIndex: 1 },
    { question: 'A differently worded question', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 2 }
  ], 4);

  assert.equal(questions.length, 2);
  assert.deepEqual(questions.map((question) => question.question), ['What is a list?', 'What is a tuple?']);
});
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

test('keeps concepts out of both strengths and weaknesses when they are mixed or repeated', () => {
  const questions = [
    { id: 'q1', concept: 'Loops', correctAnswerIndex: 0 },
    { id: 'q2', concept: 'Loops', correctAnswerIndex: 1 },
    { id: 'q3', concept: 'Conditionals', correctAnswerIndex: 2 },
    { id: 'q4', concept: 'Variables', correctAnswerIndex: 0 }
  ];

  const feedback = buildStudyCoachFeedback(questions, { q1: 0, q2: 0, q3: 2, q4: 2 });

  assert.ok(!feedback.strengths.includes('Loops'));
  assert.ok(!feedback.weaknesses.includes('Loops'));
  assert.ok(feedback.strengths.includes('Conditionals'));
  assert.ok(feedback.weaknesses.includes('Variables'));
});
