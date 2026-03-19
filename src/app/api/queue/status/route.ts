import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

  // Check if in queue and update heartbeat
  const { data: queueEntry } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Touch heartbeat so the matchmaking tick knows this session is alive
  if (queueEntry) {
    await supabase
      .from('matchmaking_queue')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  // Check if matched into an active game
  const { data: activeMatch } = await supabase
    .from('matches')
    .select('id, status')
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .in('status', ['waiting', 'active'])
    .limit(1)
    .single();

  if (activeMatch) {
    return NextResponse.json({
      status: 'matched',
      matchId: activeMatch.id,
    });
  }

  if (queueEntry) {
    return NextResponse.json({
      status: 'queued',
      queuedAt: queueEntry.queued_at,
    });
  }

  return NextResponse.json({ status: 'idle' });
}
