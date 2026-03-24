-- Tighten RLS policies: restrict SELECT to participants/owners only
-- Service role bypasses RLS, so API routes using service role are unaffected.

-- matches: only participants can view their own matches
DROP POLICY "Anyone can view matches" ON public.matches;
CREATE POLICY "Participants can view their matches" ON public.matches
  FOR SELECT USING (
    auth.uid() = player_one_id
    OR auth.uid() = player_two_id
  );

-- match_answers: only participants of the match can view answers
DROP POLICY "Players can view answers for their matches" ON public.match_answers;
CREATE POLICY "Players can view answers for their matches" ON public.match_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (auth.uid() = m.player_one_id OR auth.uid() = m.player_two_id)
    )
  );

-- matchmaking_queue: users can only see their own queue entry
DROP POLICY "Users can view queue" ON public.matchmaking_queue;
CREATE POLICY "Users can view own queue entry" ON public.matchmaking_queue
  FOR SELECT USING (auth.uid() = user_id);

-- daily_results: users can view all results (public leaderboard) — keep as is
-- daily_challenges: anyone can view — keep as is (questions are public once the day starts)
-- users: anyone can view profiles — keep as is (public leaderboard)
