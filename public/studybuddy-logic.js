export function calculateQuizScore(questions = [], answers = {}) {
  const total = questions.length;
  let correct = 0;
  const answerSummary = {};

  questions.forEach((question, index) => {
    const selected = Number(answers[question.id ?? index] ?? -1);
    const isCorrect = Number(question.correctAnswerIndex) === selected;
    answerSummary[index] = isCorrect;
    if (isCorrect) correct += 1;
  });

  return {
    correct,
    total,
    percentage: total ? Math.round((correct / total) * 100) : 0,
    answerSummary
  };
}

export function buildStudyCoachFeedback(questions = [], answers = {}) {
  const uniqueValues = (items = []) => [...new Set(items.filter(Boolean))];
  const strengths = [];
  const weaknesses = [];

  questions.forEach((question, index) => {
    const selected = Number(answers[question.id ?? index] ?? -1);
    const isCorrect = Number(question.correctAnswerIndex) === selected;
    if (isCorrect) {
      strengths.push(question.concept || 'Core topic');
    } else {
      weaknesses.push(question.concept || 'Core topic');
    }
  });

  const strengthsList = uniqueValues(strengths);
  const weaknessesList = uniqueValues(weaknesses);
  const { correct, total } = calculateQuizScore(questions, answers);

  const recommendations = [];

  if (weaknessesList.length > 0) {
    const weakArea = weaknessesList[0];
    recommendations.push(`Review ${weakArea.toLowerCase()}.`);
    if (weaknessesList.length > 1) {
      recommendations.push(`Practise ${weaknessesList.slice(1).map((item) => item.toLowerCase()).join(' and ')}.`);
    }
    recommendations.push('Take another quiz focusing on these topics.');
  } else {
    recommendations.push('Keep reviewing your strongest topics and try a slightly harder challenge next.');
    recommendations.push('Take a short recap quiz to stay sharp.');
  }

  return {
    score: `${correct}/${total}`,
    percentage: total ? Math.round((correct / total) * 100) : 0,
    strengths: strengthsList,
    weaknesses: weaknessesList,
    recommendations
  };
}

export function getFriendlyApiErrorMessage(error = {}) {
  const message = String(error.message || '').toLowerCase();

  if (error.name === 'AbortError' || message.includes('timeout')) {
    return 'The AI took too long to respond. Please try again.';
  }

  if (error.code === 'insufficient_quota' || message.includes('no credits remaining')) {
    return 'The AI service has no credits available right now. Add billing credits to your AI provider project, then restart StudyBuddy.';
  }

  if (error.status === 401 || message.includes('api key')) {
    return 'The AI service rejected the API key. Check that your key is valid, then restart StudyBuddy.';
  }

  if (error.status === 400 || message.includes('validation') || message.includes('unsupported')) {
    return 'The request could not be processed. Please check your input and try again.';
  }

  return 'StudyBuddy could not reach the AI service. Check your connection and try again.';
}

export function createFallbackQuiz(topic = 'your topic', difficulty = 'medium', focus = '') {
  const topicLabel = topic.trim() || 'your topic';
  const focusList = focus
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const difficultyMap = { easy: 2, medium: 3, hard: 4 };
  const challenge = difficultyMap[difficulty?.toLowerCase()] || 3;

  const baseConcepts = focusList.length ? focusList : ['Core concepts', 'Applications', 'Problem solving'];
  const concepts = [...baseConcepts.slice(0, 3), 'Key terminology'];

  return Array.from({ length: 5 }, (_, index) => ({
    id: `fallback-${index + 1}`,
    concept: concepts[index % concepts.length],
    question: `Which statement best matches ${topicLabel} at a ${difficulty} level?`,
    options: [
      `The best answer for ${topicLabel} is understanding the main idea and applying it correctly.`,
      `The best answer is to guess without checking the concept.`,
      `The best answer is to skip practice and rely on memory only.`,
      `The best answer is to copy the answer without explanation.`
    ],
    correctAnswerIndex: 0,
    explanation: `A strong answer for ${topicLabel} should focus on understanding, applying the concept, and checking your reasoning.`
  })).map((question, index) => ({
    ...question,
    question: index === 0
      ? `Which option best describes ${topicLabel} in a ${difficulty} challenge?`
      : question.question,
    options: question.options.map((option, optionIndex) => optionIndex === 0 ? option : option)
  }));
}

export function buildCodingPrompt(language, code, problem = '') {
  const safeLanguage = String(language || '').trim().toLowerCase();
  const supported = new Set(['python', 'java', 'javascript']);
  if (!supported.has(safeLanguage)) {
    throw new Error('Unsupported language. Choose Python, Java, or JavaScript.');
  }

  return `You are a helpful coding tutor for a student. Focus on teaching and explanation rather than giving a completed assignment.\n\nLanguage: ${safeLanguage}\nProblem or goal: ${problem || 'No extra context provided.'}\n\nCode:\n${code}\n\nRespond in a clear learning-focused structure with these sections:\n1. What the code is trying to do\n2. Problems/errors found\n3. Explanation of why the problem occurs\n4. How to fix it\n5. Corrected example where appropriate\n6. A short learning tip\n\nImportant: do not enable academic dishonesty. If this is assignment-related, explain the concept and guide the student through understanding rather than completing the full assignment for them.`;
}

export function buildCareerPrompt(career) {
  const cleanCareer = String(career || '').trim();
  if (!cleanCareer) {
    throw new Error('Please enter a career you are interested in.');
  }

  return `Provide general career guidance for: ${cleanCareer}.\n\nUse this structure:\n1. Career Overview\n- What the career involves\n- Typical responsibilities\n2. Skills Needed\n- Technical skills\n- Soft skills\n3. Recommended Subjects\n- Useful school subjects\n4. Beginner Projects\n- Simple projects to build experience\n5. Learning Path\n- Beginner\n- Intermediate\n- Advanced\n6. Related Careers\n- Similar careers\n\nImportant requirements:\n- Keep the guidance general and non-guaranteed.\n- Do not claim guaranteed employment or salaries.\n- If the user asks for job market or current requirements, clearly say that requirements can vary by company and location.\n- Keep the answer supportive, realistic and aimed at learning.`;
}

export function buildQuizPrompt(topic, difficulty = 'medium', focus = '') {
  const safeTopic = String(topic || '').trim();
  if (!safeTopic) {
    throw new Error('Please choose a topic for the quiz.');
  }

  const concepts = focus
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ') || 'core ideas';

  return `Create a short quiz for a student revising ${safeTopic}.\nDifficulty: ${difficulty}.\nFocus on: ${concepts}.\n\nReturn valid JSON only in this shape:\n{\n  "questions": [\n    {\n      "id": "q1",\n      "concept": "Concept name",\n      "question": "Question text",\n      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],\n      "correctAnswerIndex": 0,\n      "explanation": "Why the answer is correct"\n    }\n  ]\n}\n\nRequirements:\n- 4 or 5 questions\n- Each question should have 4 possible answers\n- Include a concept label for each question\n- Correct answer must be shown by a numeric index\n- Keep the wording clear and supportive for a student\n- Use a friendly learning tone and do not reveal the answers in the question text itself.`;
}

export function parseQuizResponse(rawResponse) {
  if (!rawResponse) return [];

  const cleaned = String(rawResponse)
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  } catch {
    // Ignore JSON parse errors and fall back to a safe default.
  }

  return [];
}
