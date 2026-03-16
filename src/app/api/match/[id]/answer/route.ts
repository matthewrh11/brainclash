import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { calculateElo, calculateEloDraw } from '@/lib/elo';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const matchId = params.id;
  const { answer, questionIndex } = await request.json();

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

  // Get match to check the correct answer
  const { data: match } = await serviceSupabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const questions = (match as Record<string, unknown>).questions as { correct_answer: string }[];
  const isCorrect = questions[questionIndex]?.correct_answer === answer;

  // Use atomic RPC to submit answer (prevents race conditions)
  const { data: result, error } = await serviceSupabase.rpc('submit_answer', {
    p_match_id: matchId,
    p_user_id: user.id,
    p_question_index: questionIndex,
    p_answer: answer,
    p_is_correct: isCorrect,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Already answered this question' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Check if match just completed
  const updatedMatch = result as Record<string, unknown>;

  if (updatedMatch.status === 'completed') {
    const p1Score = updatedMatch.p1_score as number;
    const p2Score = updatedMatch.p2_score as number;
    const playerOneId = updatedMatch.player_one_id as string;
    const playerTwoId = updatedMatch.player_two_id as string;
    const p1MmrBefore = updatedMatch.p1_mmr_before as number;
    const p2MmrBefore = updatedMatch.p2_mmr_before as number;

    let winnerId: string | null = null;
    let p1MmrAfter: number;
    let p2MmrAfter: number;

    if (p1Score > p2Score) {
      winnerId = playerOneId;
      const elo = calculateElo(p1MmrBefore, p2MmrBefore);
      p1MmrAfter = elo.winnerNew;
      p2MmrAfter = elo.loserNew;
    } else if (p2Score > p1Score) {
      winnerId = playerTwoId;
      const elo = calculateElo(p2MmrBefore, p1MmrBefore);
      p1MmrAfter = elo.loserNew;
      p2MmrAfter = elo.winnerNew;
    } else {
      const elo = calculateEloDraw(p1MmrBefore, p2MmrBefore);
      p1MmrAfter = elo.player1New;
      p2MmrAfter = elo.player2New;
    }

    // Update match with final results
    await serviceSupabase
      .from('matches')
      .update({
        winner_id: winnerId,
        p1_mmr_after: p1MmrAfter,
        p2_mmr_after: p2MmrAfter,
      })
      .eq('id', matchId);

    // Update player stats
    if (winnerId) {
      const loserId = winnerId === playerOneId ? playerTwoId : playerOneId;
      const winnerNewMmr = winnerId === playerOneId ? p1MmrAfter : p2MmrAfter;
      const loserNewMmr = loserId === playerOneId ? p1MmrAfter : p2MmrAfter;

      const { data: winner } = await serviceSupabase
        .from('users').select('wins, total_matches').eq('id', winnerId).single();
      const { data: loser } = await serviceSupabase
        .from('users').select('losses, total_matches').eq('id', loserId).single();

      if (winner) {
        await serviceSupabase.from('users').update({
          mmr: winnerNewMmr,
          wins: (winner as Record<string, unknown>).wins as number + 1,
          total_matches: (winner as Record<string, unknown>).total_matches as number + 1,
        }).eq('id', winnerId);
      }
      if (loser) {
        await serviceSupabase.from('users').update({
          mmr: loserNewMmr,
          losses: (loser as Record<string, unknown>).losses as number + 1,
          total_matches: (loser as Record<string, unknown>).total_matches as number + 1,
        }).eq('id', loserId);
      }
    } else {
      // Draw
      for (const playerId of [playerOneId, playerTwoId]) {
        const { data: player } = await serviceSupabase
          .from('users').select('total_matches').eq('id', playerId).single();
        if (player) {
          await serviceSupabase.from('users').update({
            mmr: playerId === playerOneId ? p1MmrAfter : p2MmrAfter,
            total_matches: (player as Record<string, unknown>).total_matches as number + 1,
          }).eq('id', playerId);
        }
      }
    }
  }

  return NextResponse.json({
    isCorrect,
    matchState: result,
  });
}
