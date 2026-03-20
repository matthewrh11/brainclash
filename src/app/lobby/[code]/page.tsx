'use client';

import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase-client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<'loading' | 'host-waiting' | 'guest-join' | 'joining' | 'error'>('loading');
  const [hostUsername, setHostUsername] = useState('');
  const [showCopied, setShowCopied] = useState(false);
  const [error, setError] = useState('');
  const [waitTime, setWaitTime] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Load lobby state
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      const res = await fetch(`/api/lobby/${code}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Lobby not found');
        setPhase('error');
        return;
      }

      if (data.status === 'active') {
        // Match already started, redirect
        router.push(`/match/${data.matchId}`);
        return;
      }

      if (data.status !== 'waiting') {
        setError('This lobby is no longer available');
        setPhase('error');
        return;
      }

      setHostUsername(data.hostUsername);

      // Determine if current user is host or guest
      const { data: match } = await supabase
        .from('matches')
        .select('player_one_id')
        .eq('id', data.matchId)
        .single();

      if (match && match.player_one_id === user.id) {
        setPhase('host-waiting');
        startHostPolling(data.matchId);
      } else {
        setPhase('guest-join');
      }
    }
    load();

    return () => cleanup();
  }, [code, supabase, router, cleanup]);

  function startHostPolling(matchId: string) {
    timerRef.current = setInterval(() => {
      setWaitTime((t) => t + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data: match } = await supabase
        .from('matches')
        .select('status, player_two_id')
        .eq('id', matchId)
        .single();

      if (match?.status === 'active' && match.player_two_id) {
        cleanup();
        router.push(`/match/${matchId}`);
      }
    }, 2000);
  }

  async function joinLobby() {
    setPhase('joining');
    try {
      const res = await fetch(`/api/lobby/${code}/join`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join');
        setPhase('error');
        return;
      }

      router.push(`/match/${data.matchId}`);
    } catch {
      setError('Failed to join lobby');
      setPhase('error');
    }
  }

  async function cancelLobby() {
    cleanup();
    await fetch(`/api/lobby/${code}`, { method: 'DELETE' });
    router.push('/duel');
  }

  function copyLink() {
    const url = `${window.location.origin}/lobby/${code}`;
    const text = `Play me in BrainClash \u{1F9E0}\n${url}`;
    navigator.clipboard.writeText(text).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="animate-fade-in">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-gray-500 text-sm mt-4">Loading lobby...</p>
            </div>
          )}

          {/* Host waiting */}
          {phase === 'host-waiting' && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Animated rings */}
              <div className="relative w-28 h-28 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-2 rounded-full border-2 border-purple-500/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-3 border-purple-500 border-t-transparent animate-spin" style={{ animationDuration: '1.2s' }} />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-1">Waiting for opponent...</h1>
                <p className="text-4xl font-mono text-white font-black tracking-tight">
                  {formatTime(waitTime)}
                </p>
              </div>

              {/* Invite code display */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Lobby Code</div>
                <div className="text-3xl font-mono font-black tracking-[0.3em] text-purple-400">
                  {code.toUpperCase()}
                </div>
                <button
                  onClick={copyLink}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-purple-500/10 ring-1 ring-purple-500/20 text-purple-400 hover:bg-purple-500/20 active:bg-purple-500/10 transition-all"
                >
                  {showCopied ? 'Copied!' : 'Copy Invite Link'}
                </button>
              </div>

              <p className="text-xs text-gray-600">
                Share the link or code with a friend to start
              </p>

              <button
                onClick={cancelLobby}
                className="w-full py-3 rounded-xl text-sm text-gray-400 hover:text-white ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Guest join */}
          {phase === 'guest-join' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-purple-500/10 ring-1 ring-purple-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                </svg>
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-2">Challenge from {hostUsername}</h1>
                <p className="text-gray-500 text-sm">Casual match — no MMR impact</p>
              </div>

              <button
                onClick={joinLobby}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:from-purple-700 active:to-pink-700 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-purple-500/20 hover:-translate-y-0.5 active:translate-y-0"
              >
                Accept Challenge
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full py-3 rounded-xl text-sm text-gray-400 hover:text-white ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
              >
                Decline
              </button>
            </div>
          )}

          {/* Joining */}
          {phase === 'joining' && (
            <div className="space-y-4 animate-scale-in">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-gray-500 text-sm">Joining match...</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-red-500/10 ring-1 ring-red-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold mb-2 text-red-400">{error}</h1>
              </div>
              <button
                onClick={() => router.push('/duel')}
                className="w-full py-3 rounded-xl text-sm ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
              >
                Back to Duel
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
