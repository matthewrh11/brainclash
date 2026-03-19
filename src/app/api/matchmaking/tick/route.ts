import { createServiceRoleClient } from '@/lib/supabase-server';
import { calculateElo, calculateEloDraw } from '@/lib/elo';
import { fetchQuestions } from '@/lib/opentdb';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createServiceRoleClient();

  // Purge ghost entries — no heartbeat in 15 seconds means the client is gone
  // (status poll runs every 2s, so 15s gives plenty of margin)
  const staleThreshold = new Date(Date.now() - 15 * 1000).toISOString();
  await supabase
    .from('matchmaking_queue')
    .delete()
    .lt('last_heartbeat', staleThreshold);

  // Auto-complete abandoned matches (active for more than 10 minutes)
  const abandonedThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: abandonedMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'active')
    .lt('created_at', abandonedThreshold);

  // Also clean up expired lobby matches (waiting for >15 minutes with no opponent)
  const lobbyThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase
    .from('matches')
    .delete()
    .eq('status', 'waiting')
    .lt('created_at', lobbyThreshold);

  if (abandonedMatches && abandonedMatches.length > 0) {
    for (const m of abandonedMatches) {
      try {
        const p1Score = m.p1_score ?? 0;
        const p2Score = m.p2_score ?? 0;
        const isRanked = m.match_type !== 'casual';

        let winnerId: string | null = null;
        if (p1Score > p2Score) winnerId = m.player_one_id;
        else if (p2Score > p1Score) winnerId = m.player_two_id;

        if (isRanked) {
          const p1Mmr = m.p1_mmr_before ?? 500;
          const p2Mmr = m.p2_mmr_before ?? 500;

          let p1MmrAfter: number;
          let p2MmrAfter: number;

          if (winnerId === m.player_one_id) {
            const elo = calculateElo(p1Mmr, p2Mmr);
            p1MmrAfter = elo.winnerNew;
            p2MmrAfter = elo.loserNew;
          } else if (winnerId === m.player_two_id) {
            const elo = calculateElo(p2Mmr, p1Mmr);
            p2MmrAfter = elo.winnerNew;
            p1MmrAfter = elo.loserNew;
          } else {
            const elo = calculateEloDraw(p1Mmr, p2Mmr);
            p1MmrAfter = elo.player1New;
            p2MmrAfter = elo.player2New;
          }

          await supabase.from('matches').update({
            status: 'completed',
            winner_id: winnerId,
            completed_at: new Date().toISOString(),
            p1_mmr_after: p1MmrAfter,
            p2_mmr_after: p2MmrAfter,
          }).eq('id', m.id);

          // Update player stats
          if (winnerId) {
            const loserId = winnerId === m.player_one_id ? m.player_two_id : m.player_one_id;
            const winnerMmr = winnerId === m.player_one_id ? p1MmrAfter : p2MmrAfter;
            const loserMmr = loserId === m.player_one_id ? p1MmrAfter : p2MmrAfter;

            const { data: winner } = await supabase
              .from('users').select('wins, total_matches').eq('id', winnerId).single();
            const { data: loser } = await supabase
              .from('users').select('losses, total_matches').eq('id', loserId).single();

            if (winner) {
              await supabase.from('users').update({
                mmr: winnerMmr,
                wins: ((winner as Record<string, unknown>).wins as number) + 1,
                total_matches: ((winner as Record<string, unknown>).total_matches as number) + 1,
              }).eq('id', winnerId);
            }
            if (loser) {
              await supabase.from('users').update({
                mmr: loserMmr,
                losses: ((loser as Record<string, unknown>).losses as number) + 1,
                total_matches: ((loser as Record<string, unknown>).total_matches as number) + 1,
              }).eq('id', loserId);
            }
          } else {
            // Draw
            for (const pid of [m.player_one_id, m.player_two_id]) {
              const { data: player } = await supabase
                .from('users').select('total_matches').eq('id', pid).single();
              if (player) {
                await supabase.from('users').update({
                  mmr: pid === m.player_one_id ? p1MmrAfter : p2MmrAfter,
                  total_matches: ((player as Record<string, unknown>).total_matches as number) + 1,
                }).eq('id', pid);
              }
            }
          }
        } else {
          // Casual abandoned match — just mark completed, no Elo changes
          await supabase.from('matches').update({
            status: 'completed',
            winner_id: winnerId,
            completed_at: new Date().toISOString(),
          }).eq('id', m.id);
        }

        console.log(`Auto-completed abandoned match ${m.id}`);
      } catch (err) {
        console.error(`Failed to auto-complete match ${m.id}:`, err);
      }
    }
  }

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
        // Atomically claim both players by deleting from queue first
        // This prevents duplicate matches when multiple ticks run concurrently
        const { data: claimed } = await supabase
          .from('matchmaking_queue')
          .delete()
          .in('user_id', [player.user_id, opponent.user_id])
          .select();

        // Only proceed if we claimed exactly 2 players
        if (!claimed || claimed.length !== 2) {
          // Another tick already claimed one/both players, skip
          continue;
        }

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

        // Fetch questions scaled to average MMR
        const avgMMR = Math.round(((p1?.mmr ?? 500) + (p2?.mmr ?? 500)) / 2);
        const questions = await fetchQuestions(10, null, avgMMR);

        // Create match
        const { error: matchError } = await supabase.from('matches').insert({
          player_one_id: player.user_id,
          player_two_id: opponent.user_id,
          status: 'active',
          questions,
          p1_mmr_before: p1?.mmr ?? 500,
          p2_mmr_before: p2?.mmr ?? 500,
        });

        if (matchError) {
          console.error('Failed to create match:', matchError);
          // Re-add players to queue since match creation failed
          await supabase.from('matchmaking_queue').insert([
            { user_id: player.user_id, mmr: player.mmr },
            { user_id: opponent.user_id, mmr: opponent.mmr },
          ]);
          continue;
        }

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
