'use client';

import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SetupPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in'); setLoading(false); return; }

    const { data: existing } = await supabase
      .from('users').select('id').eq('username', username).single();
    if (existing) { setError('Username already taken'); setLoading(false); return; }

    const { error: insertError } = await supabase.from('users').insert({
      id: user.id,
      username,
    });

    if (insertError) { setError(insertError.message); setLoading(false); return; }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-1">Choose a Username</h1>
          <p className="text-gray-500 text-sm">This is how other players will see you</p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 ring-1 ring-red-500/20 rounded-xl text-red-400 text-sm animate-scale-in">
              {error}
            </div>
          )}

          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers, and underscores only"
              className="w-full px-4 py-3 bg-white/5 ring-1 ring-gray-800 focus:ring-blue-500/50 rounded-xl text-white text-base placeholder-gray-600 focus:outline-none transition-all"
              placeholder="Username"
              autoComplete="off"
              autoFocus
            />
            <p className="text-[11px] text-gray-600 mt-1.5 ml-1">3-20 characters · letters, numbers, underscores</p>
          </div>

          <button
            type="submit"
            disabled={loading || username.length < 3}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/20"
          >
            {loading ? 'Creating...' : 'Start Playing'}
          </button>
        </form>
      </div>
    </div>
  );
}
