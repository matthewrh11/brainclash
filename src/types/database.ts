export type MatchStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type MatchType = 'ranked' | 'casual';

export interface User {
  id: string;
  username: string;
  mmr: number;
  wins: number;
  losses: number;
  total_matches: number;
  opentdb_token: string | null;
  created_at: string;
}

export interface Match {
  id: string;
  player_one_id: string;
  player_two_id: string | null;
  status: MatchStatus;
  questions: OpenTDBQuestion[];
  current_question: number;
  winner_id: string | null;
  p1_mmr_before: number | null;
  p2_mmr_before: number | null;
  p1_mmr_after: number | null;
  p2_mmr_after: number | null;
  p1_score: number;
  p2_score: number;
  match_type: MatchType;
  invite_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MatchAnswer {
  id: string;
  match_id: string;
  user_id: string;
  question_index: number;
  answer: string;
  is_correct: boolean;
  answered_at: string;
}

export interface MatchmakingQueue {
  id: string;
  user_id: string;
  mmr: number;
  queued_at: string;
}

export interface DailyChallenge {
  id: string;
  challenge_date: string;
  questions: OpenTDBQuestion[];
  created_at: string;
}

export interface DailyAnswer {
  question_index: number;
  answer: string;
  is_correct: boolean;
  time_ms: number;
}

export interface DailyResult {
  id: string;
  challenge_id: string;
  user_id: string;
  score: number;
  total_time_ms: number;
  answers: DailyAnswer[];
  completed_at: string;
}

export interface OpenTDBQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface OpenTDBResponse {
  response_code: number;
  results: OpenTDBQuestion[];
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Partial<User> & { id: string; username: string };
        Update: Partial<User>;
      };
      matches: {
        Row: Match;
        Insert: Partial<Match> & { questions: OpenTDBQuestion[] };
        Update: Partial<Match>;
      };
      match_answers: {
        Row: MatchAnswer;
        Insert: Omit<MatchAnswer, 'id' | 'answered_at'>;
        Update: Partial<MatchAnswer>;
      };
      matchmaking_queue: {
        Row: MatchmakingQueue;
        Insert: Omit<MatchmakingQueue, 'id' | 'queued_at'>;
        Update: Partial<MatchmakingQueue>;
      };
      daily_challenges: {
        Row: DailyChallenge;
        Insert: Omit<DailyChallenge, 'id' | 'created_at'>;
        Update: Partial<DailyChallenge>;
      };
      daily_results: {
        Row: DailyResult;
        Insert: Omit<DailyResult, 'id' | 'completed_at'>;
        Update: Partial<DailyResult>;
      };
    };
  };
};
