import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { fetchQuestions } from '@/lib/opentdb';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: { code: string } }
) {
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

  // Find the lobby
  const { data: match } = await serviceSupabase
    .from('matches')
    .select('*')
    .eq('invite_code', params.code.toUpperCase())
    .eq('status', 'waiting')
    .single();

  if (!match) {
    return NextResponse.json({ error: 'Lobby not found, already started, or expired' }, { status: 404 });
  }

  // Can't join your own lobby
  if (match.player_one_id === user.id) {
    return NextResponse.json({ error: 'Cannot join your own lobby' }, { status: 400 });
  }

  // Check if joiner already has an active match
  const { data: existingMatch } = await serviceSupabase
    .from('matches')
    .select('id')
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .in('status', ['waiting', 'active'])
    .neq('id', match.id)
    .limit(1)
    .single();

  if (existingMatch) {
    return NextResponse.json(
      { error: 'You are already in an active match' },
      { status: 409 }
    );
  }

  // Get joiner's MMR
  const { data: joinerProfile } = await serviceSupabase
    .from('users')
    .select('mmr')
    .eq('id', user.id)
    .single();

  const p2Mmr = joinerProfile?.mmr ?? 500;
  const avgMMR = Math.round(((match.p1_mmr_before ?? 500) + p2Mmr) / 2);

  // Fetch questions scaled to average MMR
  const questions = await fetchQuestions(10, null, avgMMR);

  // Atomically join: set player_two, questions, and activate
  const { error } = await serviceSupabase
    .from('matches')
    .update({
      player_two_id: user.id,
      p2_mmr_before: p2Mmr,
      questions,
      status: 'active',
      invite_code: null, // Clear code once match starts
    })
    .eq('id', match.id)
    .eq('status', 'waiting'); // Only if still waiting (prevents race)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matchId: match.id });
}
