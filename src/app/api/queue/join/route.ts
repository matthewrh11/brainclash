import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
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

  // Get user's MMR
  const { data: profile } = await supabase
    .from('users')
    .select('mmr')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  // Check if already in an active match
  const { data: activeMatch } = await supabase
    .from('matches')
    .select('id')
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .in('status', ['waiting', 'active'])
    .limit(1)
    .single();

  if (activeMatch) {
    return NextResponse.json(
      { error: 'Already in an active match', matchId: activeMatch.id },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('matchmaking_queue').insert({
    user_id: user.id,
    mmr: profile.mmr,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already in queue' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Joined queue' });
}
