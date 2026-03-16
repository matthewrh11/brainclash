import { OpenTDBQuestion, OpenTDBResponse } from '@/types/database';

export function decodeHTML(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&laquo;': '«',
    '&raquo;': '»',
    '&nbsp;': ' ',
    '&eacute;': 'é',
    '&Eacute;': 'É',
    '&ouml;': 'ö',
    '&uuml;': 'ü',
    '&szlig;': 'ß',
  };
  return str.replace(/&[^;]+;/g, (match) => entities[match] || match);
}

export function decodeQuestion(q: OpenTDBQuestion): OpenTDBQuestion {
  return {
    ...q,
    question: decodeHTML(q.question),
    correct_answer: decodeHTML(q.correct_answer),
    incorrect_answers: q.incorrect_answers.map(decodeHTML),
    category: decodeHTML(q.category),
  };
}

/**
 * Returns a difficulty distribution based on average MMR of the two players.
 * Lower MMR = more easy questions, higher MMR = more hard questions.
 */
export function getDifficultyMix(avgMMR: number): { easy: number; medium: number; hard: number } {
  if (avgMMR < 600)  return { easy: 8, medium: 2, hard: 0 };
  if (avgMMR < 900)  return { easy: 6, medium: 3, hard: 1 };
  if (avgMMR < 1100) return { easy: 4, medium: 4, hard: 2 };
  if (avgMMR < 1300) return { easy: 2, medium: 5, hard: 3 };
  if (avgMMR < 1500) return { easy: 1, medium: 4, hard: 5 };
  return { easy: 0, medium: 3, hard: 7 };
}

async function fetchByDifficulty(
  amount: number,
  difficulty: string,
  token?: string | null
): Promise<OpenTDBQuestion[]> {
  if (amount <= 0) return [];
  const params = new URLSearchParams({
    amount: amount.toString(),
    type: 'multiple',
    difficulty,
  });
  if (token) params.set('token', token);

  const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
  const data: OpenTDBResponse = await res.json();

  if (data.response_code !== 0) return [];
  return data.results.map(decodeQuestion);
}

export async function fetchQuestions(
  amount: number = 10,
  token?: string | null,
  avgMMR?: number
): Promise<OpenTDBQuestion[]> {
  // If MMR provided, fetch a difficulty mix
  if (avgMMR !== undefined) {
    const mix = getDifficultyMix(avgMMR);
    const [easy, medium, hard] = await Promise.all([
      fetchByDifficulty(mix.easy, 'easy', token),
      fetchByDifficulty(mix.medium, 'medium', token),
      fetchByDifficulty(mix.hard, 'hard', token),
    ]);

    const questions = [...easy, ...medium, ...hard];

    // Shuffle so difficulties aren't grouped together
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    // If we got enough, return them; otherwise fall back to unfiltered
    if (questions.length >= amount) return questions.slice(0, amount);
  }

  // Fallback: fetch without difficulty filter
  const params = new URLSearchParams({
    amount: amount.toString(),
    type: 'multiple',
  });
  if (token) params.set('token', token);

  const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
  const data: OpenTDBResponse = await res.json();

  if (data.response_code !== 0) {
    throw new Error(`OpenTDB error: response_code ${data.response_code}`);
  }

  return data.results.map(decodeQuestion);
}

export async function requestSessionToken(): Promise<string> {
  const res = await fetch(
    'https://opentdb.com/api_token.php?command=request'
  );
  const data = await res.json();
  if (data.response_code !== 0) {
    throw new Error('Failed to get OpenTDB session token');
  }
  return data.token;
}
