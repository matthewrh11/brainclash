-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  mmr           INTEGER NOT NULL DEFAULT 1000,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  total_matches INTEGER NOT NULL DEFAULT 0,
  opentdb_token TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Match status enum
CREATE TYPE match_status AS ENUM ('waiting', 'active', 'completed', 'abandoned');

-- Matches table
CREATE TABLE public.matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_one_id   UUID REFERENCES public.users(id),
  player_two_id   UUID REFERENCES public.users(id),
  status          match_status DEFAULT 'waiting',
  questions       JSONB NOT NULL,
  current_question INTEGER DEFAULT 0,
  winner_id       UUID REFERENCES public.users(id),
  p1_mmr_before   INTEGER,
  p2_mmr_before   INTEGER,
  p1_mmr_after    INTEGER,
  p2_mmr_after    INTEGER,
  p1_score        INTEGER DEFAULT 0,
  p2_score        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- Match answers table
CREATE TABLE public.match_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id),
  question_index INTEGER NOT NULL,
  answer      TEXT NOT NULL,
  is_correct  BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id, question_index)
);

-- Matchmaking queue table
CREATE TABLE public.matchmaking_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  mmr        INTEGER NOT NULL,
  queued_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_player_one ON public.matches(player_one_id);
CREATE INDEX idx_matches_player_two ON public.matches(player_two_id);
CREATE INDEX idx_match_answers_match ON public.match_answers(match_id);
CREATE INDEX idx_matchmaking_queue_mmr ON public.matchmaking_queue(mmr);
CREATE INDEX idx_users_mmr ON public.users(mmr DESC);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users
CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies: matches
CREATE POLICY "Anyone can view matches" ON public.matches
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert matches" ON public.matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update matches" ON public.matches
  FOR UPDATE USING (true);

-- RLS Policies: match_answers
CREATE POLICY "Players can view answers for their matches" ON public.match_answers
  FOR SELECT USING (true);

CREATE POLICY "Players can insert their own answers" ON public.match_answers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies: matchmaking_queue
CREATE POLICY "Users can view queue" ON public.matchmaking_queue
  FOR SELECT USING (true);

CREATE POLICY "Users can join queue" ON public.matchmaking_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave queue" ON public.matchmaking_queue
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for matches table
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
