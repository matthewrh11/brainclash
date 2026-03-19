'use client';

import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase-client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@/types/database';

export default function HomePage() {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [recentMatches, setRecentMatches] = useState<
    { id: string; p1_score: number; p2_score: number; winner_id: string | null; completed_at: string }[]
  >([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: prof } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(prof as unknown as User);

        const { data: matches } = await supabase
          .from('matches')
          .select('id, p1_score, p2_score, winner_id, completed_at')
          .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(5);
        setRecentMatches((matches ?? []) as typeof recentMatches);
      }
    }
    load();
  }, [supabase]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-12">
        {user && profile ? (
          <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 stagger-children">
              <StatCard label="MMR" value={profile.mmr} color="yellow" />
              <StatCard label="Wins" value={profile.wins} color="green" />
              <StatCard label="Losses" value={profile.losses} color="red" />
              <StatCard label="Played" value={profile.total_matches} color="blue" />
            </div>

            {/* Play CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/duel"
                className="inline-block w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 text-center"
              >
                BrainClash Duel
              </Link>
              <Link
                href="/daily"
                className="inline-block w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:from-purple-700 active:to-pink-700 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-purple-500/20 hover:-translate-y-0.5 active:translate-y-0 text-center"
              >
                BrainClash Daily
              </Link>
            </div>

            {/* Recent matches */}
            {recentMatches.length > 0 && (
              <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
                <h2 className="text-sm font-semibold mb-3 text-gray-500 uppercase tracking-wider">Recent Matches</h2>
                <div className="space-y-2">
                  {recentMatches.map((m) => {
                    const isWin = m.winner_id === user.id;
                    const isDraw = m.winner_id === null;
                    return (
                      <Link
                        key={m.id}
                        href={`/match/${m.id}`}
                        className="block p-3 sm:p-4 glass rounded-xl hover:bg-white/5 active:bg-white/10 transition-all group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              isWin ? 'bg-green-400' : isDraw ? 'bg-yellow-400' : 'bg-red-400'
                            }`} />
                            <span className="text-sm text-gray-300">
                              {m.p1_score} - {m.p2_score}
                            </span>
                          </div>
                          <span className={`text-xs font-bold uppercase tracking-wide ${
                            isWin ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 sm:py-24 px-4 animate-fade-in-up">
            <h1 className="text-4xl sm:text-6xl font-black mb-3 gradient-text">
              BrainClash
            </h1>
            <p className="text-base sm:text-lg text-gray-500 mb-10 max-w-md mx-auto">
              Compete in 1v1 trivia battles. Answer fast, climb the ranks, prove you&apos;re the smartest.
            </p>
            <Link
              href="/auth/login"
              className="inline-block w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

const colorMap = {
  yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/20' },
  green: { text: 'text-green-400', bg: 'bg-green-500/10', ring: 'ring-green-500/20' },
  red: { text: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/20' },
  blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
};

function StatCard({ label, value, color }: { label: string; value: number; color: keyof typeof colorMap }) {
  const c = colorMap[color];
  return (
    <div className={`p-4 sm:p-5 rounded-xl ${c.bg} ring-1 ${c.ring} text-center transition-all hover:scale-[1.02]`}>
      <div className={`text-2xl sm:text-3xl font-black font-mono ${c.text}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-medium">{label}</div>
    </div>
  );
}
