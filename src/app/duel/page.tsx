'use client';

import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DuelPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function createLobby() {
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/api/lobby/create', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        if (data.matchId) {
          router.push(`/match/${data.matchId}`);
          return;
        }
        setError(data.error);
        return;
      }

      router.push(`/lobby/${data.code}`);
    } catch {
      setError('Failed to create lobby');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-4 animate-fade-in-up">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">BrainClash Duel</h1>
            <p className="text-gray-500 text-sm">Choose your battle mode</p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 ring-1 ring-red-500/20 rounded-xl text-red-400 text-sm animate-scale-in text-center">
              {error}
            </div>
          )}

          {/* Ranked Match */}
          <button
            onClick={() => router.push('/queue')}
            className="w-full p-5 glass rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white group-hover:text-blue-400 transition-colors">Ranked Match</div>
                <div className="text-xs text-gray-500 mt-0.5">Find a random opponent near your MMR</div>
              </div>
              <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          {/* Challenge a Friend */}
          <button
            onClick={createLobby}
            disabled={creating}
            className="w-full p-5 glass rounded-xl text-left hover:bg-white/5 active:bg-white/10 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white group-hover:text-purple-400 transition-colors">
                  {creating ? 'Creating...' : 'Challenge a Friend'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Create a lobby & share a link</div>
              </div>
              <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <p className="text-center text-[11px] text-gray-600 pt-2">
            Ranked matches affect your MMR. Friend challenges are casual.
          </p>
        </div>
      </main>
    </div>
  );
}
