import { createServiceRoleClient } from '@/lib/supabase-server';
import { fetchQuestions } from '@/lib/opentdb';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createServiceRoleClient();

  const { data: queue, error: queueError } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .order('queued_at', { ascending: true });

  if (queueError || !queue || queue.length < 2) {
    return NextResponse.json({ matched: false, reason: 'Not enough players' });
  }

  const matched: Set<string> = new Set();

  for (const player of queue) {
    if (matched.has(player.user_id)) continue;

    const waitSeconds =
      (Date.now() - new Date(player.queued_at).getTime()) / 1000;

    const mmrRange =
      waitSeconds < 30 ? 100
        : waitSeconds < 60 ? 200
          : waitSeconds < 120 ? 400
            : 9999;

    const opponent = queue.find(
      (p) =>
        p.user_id !== player.user_id &&
        !matched.has(p.user_id) &&
        Math.abs(p.mmr - player.mmr) <= mmrRange
    );

    if (opponent) {
      try {
        // Fetch questions for the match
        const questions = await fetchQuestions(10);

        // Get both players' MMR
        const { data: p1 } = await supabase
          .from('users')
          .select('mmr')
          .eq('id', player.user_id)
          .single();
        const { data: p2 } = await supabase
          .from('users')
          .select('mmr')
          .eq('id', opponent.user_id)
          .single();

        // Create match
        const { error: matchError } = await supabase.from('matches').insert({
          player_one_id: player.user_id,
          player_two_id: opponent.user_id,
          status: 'active',
          questions,
          p1_mmr_before: p1?.mmr ?? 1000,
          p2_mmr_before: p2?.mmr ?? 1000,
        });

        if (matchError) {
          console.error('Failed to create match:', matchError);
          continue;
        }

        // Remove both from queue
        await supabase
          .from('matchmaking_queue')
          .delete()
          .in('user_id', [player.user_id, opponent.user_id]);

        matched.add(player.user_id);
        matched.add(opponent.user_id);
      } catch (err) {
        console.error('Matchmaking error:', err);
      }
    }
  }

  return NextResponse.json({
    matched: matched.size > 0,
    matchedCount: matched.size / 2,
  });
}
