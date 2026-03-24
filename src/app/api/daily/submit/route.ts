import { createServiceRoleClient } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchQuestions } from '@/lib/opentdb';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';

function getTomorrowET(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { challengeId, answers } = await request.json();
  // answers: Array<{ question_index: number, answer: string, time_ms: number }>

  if (!challengeId || !answers || !Array.isArray(answers) || answers.length < 1 || answers.length > 10) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate each answer entry
  for (const a of answers) {
    if (typeof a.question_index !== 'number' || a.question_index < 0 || a.question_index >= answers.length) {
      return NextResponse.json({ error: 'Invalid question index' }, { status: 400 });
    }
    if (typeof a.answer !== 'string' || a.answer.length > 500) {
      return NextResponse.json({ error: 'Invalid answer' }, { status: 400 });
    }
    if (typeof a.time_ms !== 'number' || a.time_ms <= 0 || a.time_ms > 30000) {
      return NextResponse.json({ error: 'Invalid time value' }, { status: 400 });
    }
  }

  const serviceSupabase = createServiceRoleClient();

  // Get the challenge to verify answers
  const { data: challenge } = await serviceSupabase
    .from('daily_challenges')
    .select('*')
    .eq('id', challengeId)
    .single();

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const questionCount = (challenge.questions as unknown[]).length;
  if (answers.length !== questionCount) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Check if user already submitted
  const { data: existing } = await serviceSupabase
    .from('daily_results')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Already completed today\'s daily' }, { status: 409 });
  }

  // Grade the answers
  const questions = challenge.questions as { correct_answer: string }[];
  let score = 0;
  let totalTimeMs = 0;

  const gradedAnswers = answers.map((a: { question_index: number; answer: string; time_ms: number }) => {
    const isCorrect = questions[a.question_index]?.correct_answer === a.answer;
    if (isCorrect) {
      score += 1;
      totalTimeMs += a.time_ms;
    }
    return {
      question_index: a.question_index,
      answer: a.answer,
      is_correct: isCorrect,
      time_ms: a.time_ms,
    };
  });

  // Insert result
  const { data: result, error } = await serviceSupabase
    .from('daily_results')
    .insert({
      challenge_id: challengeId,
      user_id: user.id,
      score,
      total_time_ms: totalTimeMs,
      answers: gradedAnswers,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already completed today\'s daily' }, { status: 409 });
    }
    console.error('Daily submit error:', error.message);
    return NextResponse.json({ error: 'Failed to submit result' }, { status: 400 });
  }

  // Pre-generate tomorrow's challenge in the background so the first
  // player of the next day doesn't have to wait for the OpenTDB fetch.
  // Uses next/server `after` to keep the function alive after the response is sent.
  const tomorrow = getTomorrowET();
  waitUntil((async () => {
    try {
      const svc = createServiceRoleClient();
      const { data: exists } = await svc
        .from('daily_challenges')
        .select('id')
        .eq('challenge_date', tomorrow)
        .single();

      if (!exists) {
        const questions = await fetchQuestions(10, null, 800, { ordered: true });
        await svc
          .from('daily_challenges')
          .insert({ challenge_date: tomorrow, questions })
          .select()
          .single();
      }
    } catch {
      // Silent fail — tomorrow's challenge will be generated on-demand if this fails
    }
  })());

  return NextResponse.json({
    result,
    questions: challenge.questions,
  });
}
