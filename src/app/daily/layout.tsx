import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Daily Trivia Challenge',
  description: 'Play the BrainClash daily trivia challenge. 10 questions, one chance per day. Compare your score and time with other players.',
  openGraph: {
    title: 'BrainClash Daily Trivia Challenge',
    description: 'Play the BrainClash daily trivia challenge. 10 questions, one chance per day. Compare your score and time with other players.',
  },
};

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
