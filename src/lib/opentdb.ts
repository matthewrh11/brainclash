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

// OpenTDB category IDs for a well-rounded trivia mix
const CATEGORIES = [
  9,   // General Knowledge
  10,  // Books
  11,  // Film
  12,  // Music
  14,  // Television
  15,  // Video Games
  17,  // Science & Nature
  18,  // Computers
  21,  // Sports
  22,  // Geography
  23,  // History
  25,  // Art
  26,  // Celebrities
  27,  // Animals
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchOne(
  category: number,
  difficulty: string,
  token?: string | null
): Promise<OpenTDBQuestion | null> {
  const params = new URLSearchParams({
    amount: '1',
    type: 'multiple',
    category: category.toString(),
    difficulty,
  });
  if (token) params.set('token', token);
  try {
    const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
    const data: OpenTDBResponse = await res.json();
    if (data.response_code === 0 && data.results.length > 0) {
      return decodeQuestion(data.results[0]);
    }
  } catch {}
  return null;
}


export async function fetchQuestions(
  amount: number = 10,
  token?: string | null,
  avgMMR?: number,
  options?: { ordered?: boolean }
): Promise<OpenTDBQuestion[]> {
  // Shuffle all categories. First `amount` get primary slots; remainder are per-category fallbacks.
  const shuffledCategories = shuffle(CATEGORIES);
  const primaryCats = shuffledCategories.slice(0, amount);
  const fallbackCats = shuffledCategories.slice(amount);

  // Build difficulty assignment for the primary slots
  const mix = avgMMR !== undefined
    ? getDifficultyMix(avgMMR)
    : { easy: 0, medium: amount, hard: 0 };
  const diffSlots = options?.ordered
    ? [...Array(mix.easy).fill('easy'), ...Array(mix.medium).fill('medium'), ...Array(mix.hard).fill('hard')]
    : shuffle([...Array(mix.easy).fill('easy'), ...Array(mix.medium).fill('medium'), ...Array(mix.hard).fill('hard')]);
  while (diffSlots.length < amount) diffSlots.push('medium');

  // Fetch primary slots in parallel (one request per category)
  const primaryResults = await Promise.all(
    primaryCats.map((cat, i) => fetchOne(cat, diffSlots[i], token))
  );

  const questions: OpenTDBQuestion[] = [];
  const failedSlots: number[] = []; // indices into diffSlots that need a replacement

  primaryResults.forEach((q, i) => {
    if (q) { questions.push(q); }
    else { failedSlots.push(i); }
  });

  // Replace failures with per-category fallbacks (preserving difficulty where possible)
  if (failedSlots.length > 0 && fallbackCats.length > 0) {
    const fallbackResults = await Promise.all(
      failedSlots.map((slotIdx, fi) => {
        const cat = fallbackCats[fi];
        return cat ? fetchOne(cat, diffSlots[slotIdx], token) : Promise.resolve(null);
      })
    );
    fallbackResults.forEach(q => { if (q) questions.push(q); });
  }

  // Last resort: unfiltered batch for anything still missing
  for (let attempt = 0; attempt < 3 && questions.length < amount; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    const needed = amount - questions.length;
    const params = new URLSearchParams({ amount: needed.toString(), type: 'multiple' });
    if (token) params.set('token', token);
    try {
      const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
      const data: OpenTDBResponse = await res.json();
      if (data.response_code === 0) {
        questions.push(...data.results.map(decodeQuestion));
      }
    } catch { /* try again */ }
  }

  if (questions.length < amount) {
    throw new Error(`Failed to fetch ${amount} questions from OpenTDB (got ${questions.length})`);
  }

  if (options?.ordered) {
    const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
    questions.sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1));
  }

  return questions.slice(0, amount);
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
