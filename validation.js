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
  const fields = {
    planner: ['subject', 'examDate', 'topics', 'hours'],
    exam: ['subject', 'examDate', 'topics', 'focus'],
    quiz: ['topic'],
    assignment: ['question']
  }[feature] || [];

  for (const field of fields) {
    const result = validateInput(String(data[field] ?? ''));
    if (!result.valid) return { valid: false, message: `Please complete the ${field} field.` };
  }
  return { valid: true };
}
