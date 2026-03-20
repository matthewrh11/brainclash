import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard — Top Trivia Players',
  description: 'See the top-ranked BrainClash trivia players. Climb the Elo leaderboard by winning 1v1 trivia battles.',
  openGraph: {
    title: 'BrainClash Leaderboard — Top Trivia Players',
    description: 'See the top-ranked BrainClash trivia players. Climb the Elo leaderboard by winning 1v1 trivia battles.',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
