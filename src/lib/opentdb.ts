import { OpenTDBQuestion, OpenTDBResponse } from '@/types/database';

export function decodeHTML(str: string): string {
  // Handle numeric entities (&#039; &#x27; etc.)
  let result = str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Handle named entities
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&nbsp;': ' ', '&laquo;': '«', '&raquo;': '»',
    '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä', '&aring;': 'å',
    '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã', '&Auml;': 'Ä', '&Aring;': 'Å',
    '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
    '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
    '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
    '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
    '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö',
    '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ', '&Ouml;': 'Ö',
    '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
    '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
    '&ntilde;': 'ñ', '&Ntilde;': 'Ñ', '&ccedil;': 'ç', '&Ccedil;': 'Ç',
    '&szlig;': 'ß', '&eth;': 'ð', '&thorn;': 'þ',
    '&ldquo;': '\u201C', '&rdquo;': '\u201D', '&lsquo;': '\u2018', '&rsquo;': '\u2019',
    '&mdash;': '\u2014', '&ndash;': '\u2013', '&hellip;': '\u2026',
    '&deg;': '°', '&micro;': 'µ', '&cent;': '¢', '&pound;': '£', '&euro;': '\u20AC',
    '&shy;': '\u00AD', '&trade;': '\u2122', '&copy;': '©', '&reg;': '®',
  };
  return result.replace(/&[a-zA-Z]+;/g, (match) => entities[match] || match);
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
  avgMMR?: number,
  options?: { ordered?: boolean }
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

    // Shuffle so difficulties aren't grouped together (unless ordered requested)
    if (!options?.ordered) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
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
