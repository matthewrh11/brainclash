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

export async function fetchQuestions(
  amount: number = 10,
  token?: string | null
): Promise<OpenTDBQuestion[]> {
  const params = new URLSearchParams({
    amount: amount.toString(),
    type: 'multiple',
  });

  if (token) {
    params.set('token', token);
  }

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
