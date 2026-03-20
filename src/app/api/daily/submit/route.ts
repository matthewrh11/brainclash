import { createServiceRoleClient } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchQuestions } from '@/lib/opentdb';
import { NextResponse } from 'next/server';

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

  if (!challengeId || !answers || !Array.isArray(answers) || answers.length !== 10) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pre-generate tomorrow's challenge in the background so the first
  // player of the next day doesn't have to wait for the OpenTDB fetch.
  const tomorrow = getTomorrowET();
  Promise.resolve(
    serviceSupabase
      .from('daily_challenges')
      .select('id')
      .eq('challenge_date', tomorrow)
      .single()
  ).then(async ({ data: existing }) => {
    if (!existing) {
      const questions = await fetchQuestions(10, null, 800, { ordered: true });
      await serviceSupabase
        .from('daily_challenges')
        .insert({ challenge_date: tomorrow, questions })
        .select()
        .single();
    }
  }).catch(() => {
    // Silent fail — tomorrow's challenge will be generated on-demand if this fails
  });

  return NextResponse.json({
    result,
    questions: challenge.questions,
  });
}
