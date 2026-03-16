'use client';

import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase-client';
import { useEffect, useState } from 'react';
import type { User } from '@/types/database';

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('users')
        .select('*')
        .order('mmr', { ascending: false })
        .limit(50);
      setPlayers((data ?? []) as unknown as User[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const rankColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
  const rankBgs = ['bg-yellow-500/10 ring-yellow-500/20', 'bg-gray-500/10 ring-gray-500/20', 'bg-amber-500/10 ring-amber-500/20'];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-black mb-5 gradient-text">Leaderboard</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No players yet</div>
        ) : (
          <div className="space-y-2 stagger-children">
            {players.map((player, i) => (
              <div
                key={player.id}
                className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl transition-all ${
                  i < 3
                    ? `${rankBgs[i]} ring-1`
                    : 'glass hover:bg-white/5'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
                  i < 3 ? rankColors[i] : 'text-gray-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{player.username}</div>
                  <div className="text-xs text-gray-500">
                    {player.wins}W · {player.losses}L · {player.total_matches} played
                  </div>
                </div>
                <div className="text-lg font-black text-yellow-400 font-mono tabular-nums">
                  {player.mmr.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
