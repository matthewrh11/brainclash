import { createServiceRoleClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET() {
  const serviceSupabase = createServiceRoleClient();
  const today = getTodayUTC();

  // Get today's challenge
  const { data: challenge } = await serviceSupabase
    .from('daily_challenges')
    .select('id')
    .eq('challenge_date', today)
    .single();

  if (!challenge) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Get all results for today, sorted by score DESC then time ASC
  const { data: results } = await serviceSupabase
    .from('daily_results')
    .select('user_id, score, total_time_ms, completed_at')
    .eq('challenge_id', challenge.id)
    .order('score', { ascending: false })
    .order('total_time_ms', { ascending: true })
    .limit(50);

  if (!results || results.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Fetch usernames
  const userIds = results.map((r) => r.user_id);
  const { data: users } = await serviceSupabase
    .from('users')
    .select('id, username')
    .in('id', userIds);

  const usernameMap = new Map((users ?? []).map((u) => [u.id, u.username]));

  const leaderboard = results.map((r, i) => ({
    rank: i + 1,
    username: usernameMap.get(r.user_id) ?? 'Unknown',
    user_id: r.user_id,
    score: r.score,
    total_time_ms: r.total_time_ms,
  }));

  return NextResponse.json({ leaderboard });
}
