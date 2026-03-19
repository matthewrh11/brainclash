-- Add match_type and invite_code to matches for casual lobby support
ALTER TABLE public.matches
  ADD COLUMN match_type TEXT NOT NULL DEFAULT 'ranked' CHECK (match_type IN ('ranked', 'casual')),
  ADD COLUMN invite_code TEXT UNIQUE;

-- Allow player_two_id to be null (lobby waiting for opponent)
-- It's already nullable from the original schema, so no change needed there.

-- Index for fast invite code lookups
CREATE INDEX idx_matches_invite_code ON public.matches(invite_code) WHERE invite_code IS NOT NULL;

-- Clean up expired lobbies (waiting + older than 15 min)
-- This is handled in application code via the matchmaking tick, no DB trigger needed.
