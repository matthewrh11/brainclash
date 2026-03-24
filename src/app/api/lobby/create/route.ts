import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function generateInviteCode(): string {
  // 6 chars, no ambiguous characters (O/0/I/1/l)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

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

  const serviceSupabase = createServiceRoleClient();

  // Check if user already has an active match or lobby
  const { data: existing } = await serviceSupabase
    .from('matches')
    .select('id, invite_code')
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .in('status', ['waiting', 'active'])
    .limit(1)
    .single();

  if (existing) {
    // If they have a waiting lobby, return that code
    if (existing.invite_code) {
      return NextResponse.json({ code: existing.invite_code });
    }
    return NextResponse.json(
      { error: 'Already in an active match', matchId: existing.id },
      { status: 409 }
    );
  }

  // Get user's MMR for the match record
  const { data: profile } = await serviceSupabase
    .from('users')
    .select('mmr')
    .eq('id', user.id)
    .single();

  // Generate unique invite code (retry on collision)
  let code = generateInviteCode();
  let attempts = 0;

  while (attempts < 5) {
    const { error } = await serviceSupabase.from('matches').insert({
      player_one_id: user.id,
      status: 'waiting',
      match_type: 'casual',
      invite_code: code,
      questions: [], // Questions fetched when opponent joins (need avg MMR)
      p1_mmr_before: profile?.mmr ?? 500,
    });

    if (!error) {
      return NextResponse.json({ code });
    }

    if (error.code === '23505' && error.message.includes('invite_code')) {
      code = generateInviteCode();
      attempts++;
      continue;
    }

    console.error('Lobby create error:', error.message);
    return NextResponse.json({ error: 'Failed to create lobby' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 });
}
