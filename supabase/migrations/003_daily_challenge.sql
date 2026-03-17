-- Daily challenges table: one row per day
CREATE TABLE public.daily_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  questions   JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Daily results table: one row per user per day
CREATE TABLE public.daily_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  score           INTEGER NOT NULL DEFAULT 0,
  total_time_ms   INTEGER NOT NULL DEFAULT 0,
  answers         JSONB NOT NULL DEFAULT '[]',
  completed_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(challenge_id, user_id)
);

-- Indexes
CREATE INDEX idx_daily_challenges_date ON public.daily_challenges(challenge_date DESC);
CREATE INDEX idx_daily_results_challenge ON public.daily_results(challenge_id);
CREATE INDEX idx_daily_results_user ON public.daily_results(user_id);
CREATE INDEX idx_daily_results_score ON public.daily_results(score DESC, total_time_ms ASC);

-- Enable RLS
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies: daily_challenges
CREATE POLICY "Anyone can view daily challenges" ON public.daily_challenges
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert daily challenges" ON public.daily_challenges
  FOR INSERT WITH CHECK (true);

-- RLS Policies: daily_results
CREATE POLICY "Anyone can view daily results" ON public.daily_results
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own results" ON public.daily_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can insert daily results" ON public.daily_results
  FOR INSERT WITH CHECK (true);
