'use client';

import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';

export default function QueuePage() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [waitTime, setWaitTime] = useState(0);
  const [error, setError] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const queuedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Auto-leave queue on tab close, navigation, or disconnect
  useEffect(() => {
    function handleBeforeUnload() {
      if (queuedRef.current) {
        // sendBeacon is fire-and-forget — works even as the page is closing
        navigator.sendBeacon('/api/queue/leave');
      }
    }

    function handleVisibilityChange() {
      // If user switches away on mobile (e.g. swipes home), leave queue
      // to avoid ghost entries. They can re-join when they come back.
      if (document.hidden && queuedRef.current) {
        navigator.sendBeacon('/api/queue/leave');
        cleanup();
        queuedRef.current = false;
        setStatus('idle');
        setWaitTime(0);
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Component unmount (navigation away) — leave queue
      if (queuedRef.current) {
        fetch('/api/queue/leave', { method: 'DELETE' }).catch(() => {});
        queuedRef.current = false;
      }
      cleanup();
    };
  }, [cleanup]);

  async function joinQueue() {
    setError('');
    const res = await fetch('/api/queue/join', { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      if (data.matchId) {
        router.push(`/match/${data.matchId}`);
        return;
      }
      setError(data.error);
      return;
    }

    setStatus('queued');
    setWaitTime(0);
    queuedRef.current = true;

    timerRef.current = setInterval(() => {
      setWaitTime((t) => t + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      // Trigger matchmaking tick while waiting
      fetch('/api/matchmaking/tick', { method: 'POST' }).catch(() => {});

      const statusRes = await fetch('/api/queue/status');
      const statusData = await statusRes.json();

      if (statusData.status === 'matched') {
        cleanup();
        queuedRef.current = false;
        setStatus('matched');
        router.push(`/match/${statusData.matchId}`);
      }
    }, 2000);
  }

  async function leaveQueue() {
    cleanup();
    queuedRef.current = false;
    await fetch('/api/queue/leave', { method: 'DELETE' });
    setStatus('idle');
    setWaitTime(0);
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
          {status === 'idle' && (
            <div className="space-y-8 animate-fade-in-up">
              <div>
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                  </svg>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">Ready to Play?</h1>
                <p className="text-gray-500 text-sm">
                  Find an opponent near your skill level
                </p>
              </div>
              {error && (
                <div className="p-3 bg-red-500/10 ring-1 ring-red-500/20 rounded-xl text-red-400 text-sm animate-scale-in">
                  {error}
                </div>
              )}
              <button
                onClick={joinQueue}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0"
              >
                Find Match
              </button>
            </div>
          )}

          {status === 'queued' && (
            <div className="space-y-8 animate-fade-in-up">
              {/* Animated rings */}
              <div className="relative w-28 h-28 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-2 rounded-full border-2 border-blue-500/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" style={{ animationDuration: '1.2s' }} />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-1">Searching...</h1>
                <p className="text-4xl font-mono text-white font-black tracking-tight">
                  {formatTime(waitTime)}
                </p>
              </div>

              <p className="text-xs text-gray-600">
                MMR range expands over time for faster matching
              </p>

              <button
                onClick={leaveQueue}
                className="w-full py-3 rounded-xl text-sm text-gray-400 hover:text-white ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
            </div>
          )}

          {status === 'matched' && (
            <div className="space-y-4 animate-scale-in">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 ring-1 ring-green-500/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-green-400">Match Found!</h1>
              <p className="text-gray-500 text-sm">Loading game...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
