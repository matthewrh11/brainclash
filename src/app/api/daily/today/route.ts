import { createServiceRoleClient } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchQuestions } from '@/lib/opentdb';
import { NextResponse } from 'next/server';

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET() {
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

  const serviceSupabase = createServiceRoleClient();
  const today = getTodayUTC();

  // Try to get today's challenge
  let { data: challenge } = await serviceSupabase
    .from('daily_challenges')
    .select('*')
    .eq('challenge_date', today)
    .single();

  // If no challenge exists for today, generate one
  if (!challenge) {
    // Daily mix: 6 easy, 3 medium, 1 hard — ordered easy→medium→hard
    const questions = await fetchQuestions(10, null, 800, { ordered: true });

    const { data: newChallenge, error } = await serviceSupabase
      .from('daily_challenges')
      .insert({ challenge_date: today, questions })
      .select()
      .single();

    if (error) {
      // Another request may have created it concurrently
      const { data: existing } = await serviceSupabase
        .from('daily_challenges')
        .select('*')
        .eq('challenge_date', today)
        .single();
      challenge = existing;
    } else {
      challenge = newChallenge;
    }
  }

  if (!challenge) {
    return NextResponse.json({ error: 'Failed to load daily challenge' }, { status: 500 });
  }

  // Check if user already completed today's daily
  const { data: existingResult } = await serviceSupabase
    .from('daily_results')
    .select('*')
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .single();

  // Pre-shuffle answers for display
  const questions = existingResult
    ? challenge.questions
    : (challenge.questions as { correct_answer: string; incorrect_answers: string[]; question: string; category: string; type: string; difficulty: string }[]).map((q) => ({
        ...q,
        all_answers: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5),
      }));

  return NextResponse.json({
    challenge: {
      id: challenge.id,
      challenge_date: challenge.challenge_date,
      questions,
    },
    alreadyPlayed: !!existingResult,
    result: existingResult ?? null,
  });
}
