import { createServiceRoleClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const serviceSupabase = createServiceRoleClient();
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');
  const userId = searchParams.get('userId');

  if (!challengeId) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Get all results for this challenge, sorted by score DESC then time ASC
  const { data: results } = await serviceSupabase
    .from('daily_results')
    .select('user_id, score, total_time_ms, completed_at')
    .eq('challenge_id', challengeId)
    .order('score', { ascending: false })
    .order('total_time_ms', { ascending: true })
    .limit(10);

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
    isCurrentUser: userId ? r.user_id === userId : false,
    score: r.score,
    total_time_ms: r.total_time_ms,
  }));

  return NextResponse.json({ leaderboard });
}
