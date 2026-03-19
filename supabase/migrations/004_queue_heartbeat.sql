-- Add heartbeat column to matchmaking_queue for detecting ghost entries
ALTER TABLE public.matchmaking_queue
  ADD COLUMN last_heartbeat TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient stale entry cleanup
CREATE INDEX idx_matchmaking_queue_heartbeat ON public.matchmaking_queue(last_heartbeat);
