export const MAX_INPUT_LENGTH = 6000;

export function validateInput(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { valid: false, message: 'Please enter a question or some study material first.' };
  }
  if (value.length > MAX_INPUT_LENGTH) {
    return { valid: false, message: `Please keep your input under ${MAX_INPUT_LENGTH.toLocaleString()} characters.` };
  }
  return { valid: true, value: value.trim() };
}

export function validateFeaturePayload(feature, data = {}) {
  const supportedLanguages = new Set(['python', 'java', 'javascript']);
  const fields = {
    planner: ['subject', 'examDate', 'topics', 'hours'],
    exam: ['subject', 'examDate', 'topics', 'focus'],
    quiz: ['questionCount'],
    assignment: ['question'],
    coding: ['language', 'code'],
    career: ['career']
  }[feature] || [];

  for (const field of fields) {
    const value = String(data[field] ?? '');
    const result = validateInput(value);
    if (!result.valid) return { valid: false, message: `Please complete the ${field} field.` };
  }

  if (feature === 'quiz' && !String(data.topic ?? '').trim() && !String(data.materialText ?? '').trim()) {
    return { valid: false, message: 'Enter a quiz topic or upload a document to generate questions from.' };
  }

  if (feature === 'coding') {
    const language = String(data.language ?? '').trim().toLowerCase();
    if (!supportedLanguages.has(language)) {
      return { valid: false, message: 'Please choose a supported language: Python, Java, or JavaScript.' };
    }
  }

  if (feature === 'quiz' && typeof data.difficulty === 'string' && data.difficulty.trim() && !['easy', 'medium', 'hard'].includes(data.difficulty.trim().toLowerCase())) {
    return { valid: false, message: 'Please choose an easy, medium, or hard difficulty.' };
  }

  if (feature === 'quiz') {
    const questionCount = Number(data.questionCount);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
      return { valid: false, message: 'Choose between 1 and 20 quiz questions.' };
    }
  }

  return { valid: true };
}
