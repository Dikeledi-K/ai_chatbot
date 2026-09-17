// Calculates how many quiz answers are correct and how well the learner performed overall.
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

// Converts a completed quiz into encouraging coaching feedback with strengths, weak areas, and next steps.
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

// Turns backend API failures into user-friendly messages that are easy for students to understand.
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

// Builds a backup quiz when the AI provider is unavailable or returns an unusable result.
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
  const hash = (value) => [...String(value)].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
  const shuffle = (items, seed) => {
    const result = [...items];
    let value = seed || 1;
    for (let index = result.length - 1; index > 0; index -= 1) {
      value = (value * 1664525 + 1013904223) >>> 0;
      const swapIndex = value % (index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  };
  const subjectText = `${topicLabel} ${sourceText}`.toLowerCase();
  const isPythonDataStructures = subjectText.includes('python') && ((subjectText.includes('data') && subjectText.includes('struc')) || subjectText.includes('list') || subjectText.includes('tuple') || subjectText.includes('dictionary') || subjectText.includes('set'));
  const isHealthTopic = /health|biology|nutrition|anatomy|physiology|medicine|disease|wellness|fitness/.test(subjectText);
  const isAgricultureTopic = /agriculture|farming|crop|soil|irrigation|livestock|horticulture|agribusiness/.test(subjectText);
  const pythonDataStructureQuestions = [
    {
      concept: 'Lists and indexing',
      question: 'What is printed by this Python code?\n\nvalues = [10, 20, 30, 40]\nprint(values[1:3])',
      correct: '[20, 30]',
      wrongs: ['[10, 20, 30]', '[20, 30, 40]', '20, 30'],
      explanation: 'A slice includes the start index and stops before the end index, so indexes 1 and 2 are selected.'
    },
    {
      concept: 'Dictionaries',
      question: 'Which data structure is the clearest choice for storing a student ID and looking up the student name by that ID?',
      correct: 'A dictionary, using the student ID as the key and the name as the value.',
      wrongs: [
        'A list, because list positions are designed for named key lookups.',
        'A tuple, because tuples automatically map keys to values.',
        'A set, because sets preserve a key-value relationship.'
      ],
      explanation: 'Dictionaries are designed for key-value lookups, making the ID-to-name relationship explicit.'
    },
    {
      concept: 'Sets',
      question: 'What is the most direct Python approach for removing duplicate values from a list when the original order is not important?',
      correct: 'Convert the list to a set, such as set(values).',
      wrongs: [
        'Convert the list to a tuple, because tuples remove repeated values.',
        'Sort the list, because sorting always removes duplicates.',
        'Use values[0], because the first value represents all duplicates.'
      ],
      explanation: 'A set stores unique values. Its order should not be relied on when the original ordering matters.'
    },
    {
      concept: 'Mutability',
      question: 'Which statement correctly compares a Python list and tuple?',
      correct: 'A list can be changed after creation, while a tuple cannot be changed in place.',
      wrongs: [
        'A tuple can be changed, while a list is permanently fixed after creation.',
        'Both are immutable, so neither can have an item replaced.',
        'Both are mutable, but tuples are only mutable inside functions.'
      ],
      explanation: 'Lists are mutable sequences. Tuples are immutable, which makes them useful for fixed collections of values.'
    },
    {
      concept: 'Stacks',
      question: 'Which operation sequence uses a Python list as a last-in, first-out stack?',
      correct: 'stack.append(item) followed by stack.pop()',
      wrongs: [
        'stack.add(item) followed by stack.remove_first()',
        'stack.insert(0, item) followed by stack.delete_last()',
        'stack[key] = item followed by stack.lookup_last()'
      ],
      explanation: 'append adds to the end and pop removes the last item, which gives last-in, first-out behavior.'
    },
    {
      concept: 'Comprehensions',
      question: 'Which expression creates a list containing the squares of only the even numbers from values?',
      correct: '[number ** 2 for number in values if number % 2 == 0]',
      wrongs: [
        '[number * 2 for number in values if number % 2 == 1]',
        '[number ** 2 if number % 2 for number in values]',
        '{number ** 2 for number in values if number / 2 == 0}'
      ],
      explanation: 'The condition filters even numbers, and the expression before the loop squares each selected number.'
    }
  ];
  const hardPythonDataStructureQuestions = [
    {
      concept: 'Aliasing and mutation',
      question: 'What is printed by this Python code?\n\noriginal = [[1, 2], [3, 4]]\ncopy = original.copy()\ncopy[0].append(9)\nprint(original[0])',
      correct: '[1, 2, 9]',
      wrongs: ['[1, 2]', '[3, 4, 9]', '[[1, 2], [3, 4]]'],
      explanation: 'copy() creates a shallow copy, so both lists still reference the same nested list at index 0.'
    },
    {
      concept: 'Complexity and lookup',
      question: 'A program repeatedly checks whether values are present in a large collection. Which change usually gives the fastest average membership checks?',
      correct: 'Use a set for membership testing instead of scanning a list each time.',
      wrongs: [
        'Use a tuple, because tuples always use constant-time membership checks.',
        'Sort the list once and keep using a linear scan for every check.',
        'Convert the collection to a dictionary with every item stored under the same key.'
      ],
      explanation: 'Set membership is usually average O(1), while checking each item in a list is O(n).'
    },
    {
      concept: 'Nested comprehensions',
      question: 'Which expression flattens rows = [[1, 2], [3, 4]] into [1, 2, 3, 4]?',
      correct: '[value for row in rows for value in row]',
      wrongs: [
        '[row for value in rows for row in value]',
        '[value for row in rows if value in row]',
        '[rows[value] for value in range(len(rows))]'
      ],
      explanation: 'The outer loop selects each row and the inner loop selects each value within that row.'
    }
  ];
  const easyPythonDataStructureQuestions = [
    {
      concept: 'List basics',
      question: 'Which Python data structure keeps items in order and allows duplicate values?',
      correct: 'A list, such as ["apple", "banana", "apple"].',
      wrongs: [
        'A set, because sets keep every repeated value in order.',
        'A dictionary, because dictionaries store values without keys.',
        'A tuple, because tuples automatically remove duplicates.'
      ],
      explanation: 'Lists are ordered collections and can contain repeated values.'
    },
    {
      concept: 'Dictionary basics',
      question: 'In a Python dictionary, what is used to retrieve a value?',
      correct: 'Its key, for example student["name"].',
      wrongs: [
        'The position number only, as with every Python collection.',
        'The length of the dictionary, because length identifies each value.',
        'A set operation, because dictionaries are unordered sets.'
      ],
      explanation: 'A dictionary maps keys to values, so the key is used for lookup.'
    },
    {
      concept: 'Tuples',
      question: 'Which statement best describes a Python tuple?',
      correct: 'It is an ordered collection that cannot be changed in place after creation.',
      wrongs: [
        'It is an unordered collection that automatically removes duplicates.',
        'It is a key-value collection where every item needs a label.',
        'It is an ordered collection whose items can always be replaced.'
      ],
      explanation: 'Tuples preserve order but are immutable, so their items cannot be changed in place.'
    },
    {
      concept: 'Indexing',
      question: 'What value does values[0] return when values = ["red", "green", "blue"]?',
      correct: '"red", because Python uses zero-based indexing.',
      wrongs: [
        '"green", because the first position is numbered one.',
        '"blue", because index zero means the last item.',
        'The full list, because zero selects every item.'
      ],
      explanation: 'Python sequences start at index zero, so values[0] refers to the first item.'
    },
    {
      concept: 'Membership testing',
      question: 'Which expression checks whether "math" appears in subjects?',
      correct: '"math" in subjects',
      wrongs: [
        'subjects contains "math"',
        'subjects["math"]',
        'find("math", subjects)'
      ],
      explanation: 'The in operator tests whether a value is present in a sequence or collection.'
    },
    {
      concept: 'Nested data',
      question: 'If scores = [[80, 90], [70, 85]], what does scores[1][0] return?',
      correct: '70, the first value in the second inner list.',
      wrongs: [
        '80, the first value in the first inner list.',
        '85, the last value in the second inner list.',
        'The complete second inner list, [70, 85].'
      ],
      explanation: 'The first index selects the second inner list and the second index selects its first value.'
    }
  ];
  const difficultPythonDataStructureQuestions = [
    {
      concept: 'Reference graphs',
      question: 'A = [[1], [2]]; B = A[:]; B[0] += [3]. What is A after this code runs, and why?',
      correct: 'A is [[1, 3], [2]] because the outer slice is shallow and A[0] is shared.',
      wrongs: [
        'A is [[1], [2]] because slicing always deep-copies nested lists.',
        'A is [[3], [2]] because the original value is replaced before the append.',
        'A is [[1, 2, 3]] because slicing flattens nested lists.'
      ],
      explanation: 'The outer list is copied, but its nested list objects remain shared references.'
    },
    {
      concept: 'Algorithmic trade-offs',
      question: 'A program performs 100,000 membership checks and the collection changes rarely. Which design best balances speed and update cost?',
      correct: 'Build a set once, then rebuild it only when the underlying collection changes.',
      wrongs: [
        'Scan the list from the beginning for every membership check.',
        'Use a tuple and assume it provides constant-time membership checks.',
        'Create a new dictionary with one shared key for every lookup.'
      ],
      explanation: 'A set provides fast average membership checks while avoiding repeated conversion work.'
    },
    {
      concept: 'Nested data transformation',
      question: 'Given records = [{"scores": [4, 5]}, {"scores": [7]}], which expression returns [4, 5, 7] without changing records?',
      correct: '[score for record in records for score in record["scores"]]',
      wrongs: [
        '[record["scores"] for score in records for record in score]',
        '[score for score in records["scores"] for record in records]',
        '[records[score] for score in range(len(records))]'
      ],
      explanation: 'The outer loop visits each record and the inner loop visits its scores.'
    }
  ];
  const healthQuestions = [
    {
      concept: 'Evidence and health claims',
      question: 'A social media post claims that one food can prevent every illness. What is the most reliable way to evaluate the claim?',
      correct: 'Check whether it is supported by several reputable health sources and evidence from well-designed research.',
      wrongs: [
        'Share it because many people in the comments say it worked for them.',
        'Accept it if the post uses scientific-sounding words and has a confident tone.',
        'Reject every health claim because research can never provide useful evidence.'
      ],
      explanation: 'Health claims should be checked against reputable sources and the quality of the evidence, not popularity or confidence.'
    },
    {
      concept: 'Nutrition',
      question: 'Which meal-planning approach best supports a balanced diet for a healthy person?',
      correct: 'Include a variety of foods that provide different nutrients, while considering portion needs and individual circumstances.',
      wrongs: [
        'Eat only one nutrient group because it is the most important one.',
        'Remove an entire food group automatically, regardless of the person or context.',
        'Choose a plan based only on a celebrity testimonial rather than nutritional evidence.'
      ],
      explanation: 'A balanced pattern includes variety and should be considered alongside a person\'s needs and reliable guidance.'
    },
    {
      concept: 'Public health',
      question: 'Why do public-health measures often focus on prevention rather than waiting until more people become ill?',
      correct: 'Preventive actions can reduce risk early and protect individuals and communities before harm becomes widespread.',
      wrongs: [
        'Prevention guarantees that no one will ever become ill.',
        'Prevention means treatment is never needed for any condition.',
        'Prevention works only when every person has exactly the same risk factors.'
      ],
      explanation: 'Prevention reduces risk but does not eliminate every illness or replace appropriate care.'
    },
    {
      concept: 'Human body systems',
      question: 'A student wants to explain how two body systems work together. Which explanation is strongest?',
      correct: 'Describe each system\'s role, then show how materials or signals move between them to support a function.',
      wrongs: [
        'List the system names without describing their functions or connection.',
        'Assume one system does all the work because body systems are independent.',
        'Use a single symptom as proof of exactly which system is responsible.'
      ],
      explanation: 'Strong explanations connect structure and function and show how systems interact rather than treating them as isolated parts.'
    }
  ];
  const agricultureQuestions = [
    {
      concept: 'Crop rotation',
      question: 'A farmer grows the same crop in the same field every season and soil fertility declines. Which change could help?',
      correct: 'Rotate crops with different nutrient demands, including a legume where appropriate, and monitor the soil.',
      wrongs: [
        'Plant the same crop more densely so the soil is used more efficiently.',
        'Remove all organic matter so the field stays easy to cultivate.',
        'Ignore the soil because crop choice cannot affect nutrient levels.'
      ],
      explanation: 'Rotation can vary nutrient demand and some legumes can contribute nitrogen, but soil conditions should still be monitored.'
    },
    {
      concept: 'Water management',
      question: 'A vegetable field loses much of its irrigation water to evaporation. Which adjustment is most likely to improve efficiency?',
      correct: 'Use targeted delivery such as drip irrigation and schedule watering around crop needs and weather.',
      wrongs: [
        'Water at the hottest time of day so evaporation happens faster.',
        'Flood every field equally regardless of soil and crop requirements.',
        'Increase water pressure until runoff appears across the whole field.'
      ],
      explanation: 'Targeted irrigation and timing reduce waste while matching water delivery to the crop and conditions.'
    },
    {
      concept: 'Integrated pest management',
      question: 'A farmer notices a small pest population below the level likely to damage the crop. What is a sensible first response?',
      correct: 'Monitor the population, identify the pest accurately, and consider non-chemical controls before deciding on treatment.',
      wrongs: [
        'Spray the strongest available pesticide immediately without identifying the pest.',
        'Do nothing forever because pests can never affect crop yield.',
        'Remove every plant in the field even when the damage is limited.'
      ],
      explanation: 'Integrated pest management uses monitoring, accurate identification, prevention, and proportionate controls.'
    },
    {
      concept: 'Soil health',
      question: 'Which observation would give the strongest evidence that a field-management practice is improving soil health?',
      correct: 'Repeated tests show improving organic matter, suitable nutrient levels, stable structure, and less erosion over time.',
      wrongs: [
        'One crop looks healthy for a week, without any soil measurements.',
        'The field is bare and compacted, but it is easy to drive machinery across.',
        'A single fertilizer application produces a short-term increase in plant height.'
      ],
      explanation: 'Soil health is a longer-term pattern involving physical, chemical, and biological indicators, not one short-term result.'
    }
  ];
  const questionTemplates = [
    (concept) => ({
      question: `You are applying ${topicLabel} to a new situation involving ${concept.toLowerCase()}. Which approach shows the strongest understanding?`,
      correct: `Identify the relevant idea, explain why it fits the situation, and use evidence or an example to support the conclusion.`,
      wrongs: [
        `Choose the most familiar answer without checking whether its assumptions fit the situation.`,
        `Repeat a definition but avoid applying it because examples can be misleading.`,
        `Treat one unusual example as proof that the general idea is always wrong.`
      ]
    }),
    (concept) => ({
      question: `A result in ${topicLabel} conflicts with your prediction about ${concept.toLowerCase()}. What should you do next?`,
      correct: `Check the evidence, assumptions, and method before revising the explanation or drawing a conclusion.`,
      wrongs: [
        `Change the result until it matches your original prediction.`,
        `Accept the first explanation you find without checking its evidence.`,
        `Discard the topic because one unexpected result cannot be useful.`
      ]
    }),
    (concept) => ({
      question: `Which piece of evidence would most strongly show that you understand ${concept.toLowerCase()} in ${topicLabel}?`,
      correct: `You can explain the idea, apply it to an unfamiliar case, and justify your conclusion using relevant evidence.`,
      wrongs: [
        `You can recognise the term when it appears in a list of vocabulary.`,
        `You can repeat one worked example without explaining why it works.`,
        `You remember the final answer but cannot connect it to evidence.`
      ]
    }),
    (concept) => ({
      question: `A first attempt involving ${concept.toLowerCase()} gives an unexpected result. What is the most useful next step?`,
      correct: `Check the assumptions, the method, and the quality of the evidence before revising the conclusion.`,
      wrongs: [
        `Change the answer until it resembles an example from memory.`,
        `Assume the result must be right because the method was completed quickly.`,
        `Discard the whole topic because one attempt produced an unexpected result.`
      ]
    })
  ];
  const easyQuestionTemplates = [
    (concept) => ({
      question: `Which statement best describes ${concept.toLowerCase()} in ${topicLabel}?`,
      correct: `${concept} is an important idea that can be explained clearly and supported with a simple example.`,
      wrongs: [
        `${concept} is only a word to memorise without understanding.`,
        `${concept} means every answer is correct regardless of evidence.`,
        `${concept} should be ignored until after the assessment.`
      ]
    }),
    (concept) => ({
      question: `What is a sensible first step when learning ${concept.toLowerCase()}?`,
      correct: `Define the idea in your own words, then practise it with a familiar example.`,
      wrongs: [
        `Skip examples and try to memorise a final answer immediately.`,
        `Choose an answer at random before reading the question carefully.`,
        `Copy a solution without checking what each step means.`
      ]
    })
  ];
  const difficultQuestionTemplates = [
    (concept) => ({
      question: `A new scenario in ${topicLabel} produces an unexpected result involving ${concept.toLowerCase()}. Which analysis is strongest?`,
      correct: `Separate the assumptions, evidence, and possible alternative explanations before deciding which conclusion is justified.`,
      wrongs: [
        `Treat the first plausible explanation as correct without testing its assumptions.`,
        `Ignore the result because unexpected evidence cannot improve a model.`,
        `Choose the most confident explanation even when the evidence is incomplete.`
      ]
    }),
    (concept) => ({
      question: `Which response best demonstrates transfer of ${concept.toLowerCase()} to an unfamiliar ${topicLabel} problem?`,
      correct: `Apply the underlying principle, explain each decision, and evaluate whether the evidence supports the result.`,
      wrongs: [
        `Repeat a memorised example even though the new problem has different conditions.`,
        `Use a formula without checking whether its assumptions fit the situation.`,
        `Give a result without connecting it to the principle or evidence.`
      ]
    })
  ];

  return Array.from({ length: count }, (_, index) => {
    if (isPythonDataStructures) {
      const questionPool = difficulty === 'difficult'
        ? difficultPythonDataStructureQuestions
        : difficulty === 'hard'
          ? hardPythonDataStructureQuestions
          : difficulty === 'easy' ? easyPythonDataStructureQuestions : pythonDataStructureQuestions;
      const content = questionPool[index % questionPool.length];
      const options = shuffle([content.correct, ...content.wrongs], hash(`${topicLabel}:${content.concept}:${index}`));
      return {
        id: `fallback-${index + 1}`,
        concept: content.concept,
        question: content.question,
        options,
        correctAnswerIndex: options.indexOf(content.correct),
        explanation: content.explanation,
        difficulty
      };
    }

    if (isHealthTopic || isAgricultureTopic) {
      const subjectQuestions = isHealthTopic ? healthQuestions : agricultureQuestions;
      const difficultyOffset = difficulty === 'difficult' ? 2 : difficulty === 'hard' ? 1 : 0;
      const content = subjectQuestions[(index + difficultyOffset) % subjectQuestions.length];
      const options = shuffle([content.correct, ...content.wrongs], hash(`${topicLabel}:${content.concept}:${index}`));
      return {
        id: `fallback-${index + 1}`,
        concept: content.concept,
        question: content.question,
        options,
        correctAnswerIndex: options.indexOf(content.correct),
        explanation: content.explanation,
        difficulty
      };
    }

    const concept = conceptPool[index % conceptPool.length];
    const templates = difficulty === 'difficult' ? difficultQuestionTemplates : difficulty === 'easy' ? easyQuestionTemplates : questionTemplates;
    const template = templates[index % templates.length](concept);
    const options = shuffle([template.correct, ...template.wrongs], hash(`${topicLabel}:${concept}:${index}`));

    return {
      id: `fallback-${index + 1}`,
      concept,
      question: template.question,
      options,
      correctAnswerIndex: options.indexOf(template.correct),
      explanation: `The strongest answer connects ${concept.toLowerCase()} to reasoning, evidence, and a new example rather than relying on recall alone.`,
      difficulty
    };
  });
}

// Builds a teaching-focused prompt for code explanation and debugging without completing the student’s work for them.
export function buildCodingPrompt(language, code, problem = '') {
  const safeLanguage = String(language || '').trim().toLowerCase();
  const supported = new Set(['python', 'java', 'javascript']);
  if (!supported.has(safeLanguage)) {
    throw new Error('Unsupported language. Choose Python, Java, or JavaScript.');
  }

  return `You are a helpful coding tutor for a student. Focus on teaching and explanation rather than giving a completed assignment.\n\nLanguage: ${safeLanguage}\nProblem or goal: ${problem || 'No extra context provided.'}\n\nCode:\n${code}\n\nRespond in a clear learning-focused structure with these sections:\n1. What the code is trying to do\n2. Problems/errors found\n3. Explanation of why the problem occurs\n4. How to fix it\n5. Corrected example where appropriate\n6. A short learning tip\n\nImportant: do not enable academic dishonesty. If this is assignment-related, explain the concept and guide the student through understanding rather than completing the full assignment for them.`;
}

// Builds a general-purpose career guidance prompt with a structured learning path and advice boundaries.
export function buildCareerPrompt(career) {
  const cleanCareer = String(career || '').trim();
  if (!cleanCareer) {
    throw new Error('Please enter a career you are interested in.');
  }

  return `Provide general career guidance for: ${cleanCareer}.\n\nUse this structure:\n1. Career Overview\n- What the career involves\n- Typical responsibilities\n2. Skills Needed\n- Technical skills\n- Soft skills\n3. Recommended Subjects\n- Useful school subjects\n4. Beginner Projects\n- Simple projects to build experience\n5. Learning Path\n- Beginner\n- Intermediate\n- Advanced\n6. Related Careers\n- Similar careers\n\nImportant requirements:\n- Keep the guidance general and non-guaranteed.\n- Do not claim guaranteed employment or salaries.\n- If the user asks for job market or current requirements, clearly say that requirements can vary by company and location.\n- Keep the answer supportive, realistic and aimed at learning.`;
}

// Creates the AI prompt used to generate a subject-specific quiz with realistic answers and distractors.
export function buildQuizPrompt(topic, difficulty = 'easy', focus = '') {
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

  return `Create a realistic, subject-specific quiz for a student revising ${safeTopic}.\nDifficulty: ${difficulty}.\nFocus on: ${concepts}.\n\nUse actual subject knowledge and, when study material is supplied, use it as the primary source. Avoid generic questions about memorising definitions. Prefer realistic scenarios, worked examples, code traces, data interpretation, decisions, or applications appropriate to the subject. Make distractors plausible misconceptions, not obviously silly answers.\n\nReturn valid JSON only in this shape:\n{\n  "questions": [\n    {\n      "id": "q1",\n      "concept": "Concept name",\n      "question": "Question text",\n      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],\n      "correctAnswerIndex": 0,\n      "explanation": "Why the answer is correct"\n    }\n  ]\n}\n\nRequirements:\n- 4 or 5 questions\n- Each question should have 4 possible answers\n- Include a concept label for each question\n- Correct answer must be shown by a numeric index\n- Make each question materially different and specific to the subject\n- Keep all answer options similar in length and plausibility\n- Keep the wording clear and supportive for a student\n- Use a friendly learning tone and do not reveal the answers in the question text itself.`;
}

// Parses the AI's JSON quiz reply and safely falls back to an empty result when the response is malformed.
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

// Normalises and deduplicates a quiz response so each question is clean, valid, and within the requested count.
export function normalizeQuizQuestions(questions = [], questionCount = 5) {
  const seenQuestions = new Set();
  const seenOptionSets = new Set();

  return questions
    .filter((question) => question && typeof question.question === 'string' && Array.isArray(question.options))
    .map((question) => ({
      ...question,
      question: question.question.trim(),
      options: question.options.map((option) => String(option).trim())
    }))
    .filter((question) => {
      const questionKey = question.question.toLowerCase().replace(/\s+/g, ' ');
      const optionKey = question.options.map((option) => option.toLowerCase()).sort().join('|');
      if (!questionKey || seenQuestions.has(questionKey) || seenOptionSets.has(optionKey)) return false;
      seenQuestions.add(questionKey);
      seenOptionSets.add(optionKey);
      return true;
    })
    .slice(0, Number(questionCount));
}
