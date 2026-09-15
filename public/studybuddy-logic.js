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
  const getConceptName = (question, index) => question.concept || `Topic ${index + 1}`;
  const correctConcepts = [];
  const incorrectConcepts = [];

  questions.forEach((question, index) => {
    const selected = Number(answers[question.id ?? index] ?? -1);
    const isCorrect = Number(question.correctAnswerIndex) === selected;
    const concept = getConceptName(question, index);

    if (isCorrect) {
      correctConcepts.push(concept);
    } else {
      incorrectConcepts.push(concept);
    }
  });

  const strengthsList = [...new Set(correctConcepts)].filter((item) => !incorrectConcepts.includes(item));
  const weaknessesList = [...new Set(incorrectConcepts)].filter((item) => !correctConcepts.includes(item));
  const { correct, total } = calculateQuizScore(questions, answers);

  const recommendations = [];

  if (weaknessesList.length > 0) {
    recommendations.push(`Review ${weaknessesList[0].toLowerCase()}.`);
    if (weaknessesList.length > 1) {
      recommendations.push(`Practise ${weaknessesList.slice(1).map((item) => item.toLowerCase()).join(' and ')}.`);
    }
    recommendations.push('Take another quiz focusing on these topics.');
  } else if (strengthsList.length > 0) {
    recommendations.push('Keep building on your strengths and try a slightly harder challenge next.');
    recommendations.push('Take a brief recap quiz to stay sharp.');
  } else {
    recommendations.push('Keep going — even small, consistent revision is helping you improve.');
    recommendations.push('Review the key ideas from the questions and try a shorter follow-up quiz.');
  }

  const positivity = strengthsList.length > 0
    ? 'You are doing well with:'
    : 'You are building confidence with:';

  return {
    score: `${correct}/${total}`,
    percentage: total ? Math.round((correct / total) * 100) : 0,
    strengths: strengthsList,
    weaknesses: weaknessesList,
    recommendations,
    positivity
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

export function createFallbackQuiz(topic = 'your topic', difficulty = 'medium', focus = '', questionCount = 5, sourceText = '') {
  const topicLabel = topic.trim() || 'your topic';
  const count = Math.min(20, Math.max(1, Number(questionCount) || 5));
  const focusList = focus
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const sourceConcepts = String(sourceText || '')
    .split(/[\n.!?]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 3 && item.length <= 80)
    .slice(0, 8);

  const baseConcepts = focusList.length ? focusList : sourceConcepts.length ? sourceConcepts : ['Core concepts', 'Applications', 'Problem solving', 'Key terminology', 'Examples'];
  const conceptPool = [...baseConcepts];
  const questionTemplates = [
    {
      prompt: `Which option best explains ${topicLabel} in a ${difficulty} challenge?`,
      generator: (concept) => ({
        correct: `The best answer for ${topicLabel} is to understand the idea and apply it in a clear, accurate way.`,
        wrongs: [
          `The best answer is to guess without checking the concept.`,
          `The best answer is to memorise a rule without understanding why it works.`,
          `The best answer is to copy an answer without checking the logic.`
        ]
      })
    },
    {
      prompt: `Which statement best matches ${topicLabel} when you are revising ${difficulty} work?`,
      generator: (concept) => ({
        correct: `A strong understanding of ${concept.toLowerCase()} helps you explain ${topicLabel} correctly and apply it in practice.`,
        wrongs: [
          `A good strategy is to skip examples and rely on luck.`,
          `A good strategy is to memorise the answer without understanding the reason.`,
          `A good strategy is to ignore the topic and hope it does not matter.`
        ]
      })
    },
    {
      prompt: `Which answer shows the best way to approach ${topicLabel}?`,
      generator: (concept) => ({
        correct: `The best approach is to build understanding, check your reasoning, and apply the idea to a real example.`,
        wrongs: [
          `The best approach is to guess and move on.`,
          `The best approach is to avoid practice and rely only on memory.`,
          `The best approach is to copy someone else's answer without understanding it.`
        ]
      })
    },
    {
      prompt: `What is the strongest response when working on ${topicLabel}?`,
      generator: (concept) => ({
        correct: `The strongest response is to understand the ${concept.toLowerCase()} and apply it carefully.`,
        wrongs: [
          `The strongest response is to guess randomly.`,
          `The strongest response is to skip checking the logic.`,
          `The strongest response is to copy the answer without effort.`
        ]
      })
    }
  ];

  return Array.from({ length: count }, (_, index) => {
    const concept = conceptPool[index % conceptPool.length];
    const template = questionTemplates[index % questionTemplates.length];
    const content = template.generator(concept);
    const options = [content.correct, ...content.wrongs];

    return {
      id: `fallback-${index + 1}`,
      concept,
      question: template.prompt,
      options,
      correctAnswerIndex: 0,
      explanation: `A strong answer for ${topicLabel} is to understand the concept, test your thinking, and practise with examples.`,
      difficulty
    };
  });
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
