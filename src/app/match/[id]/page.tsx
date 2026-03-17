'use client';

import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase-client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Match, OpenTDBQuestion, User } from '@/types/database';

export default function MatchPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [forfeited, setForfeited] = useState(false);
  const [tabWarnings, setTabWarnings] = useState(0);
  const [betweenQuestions, setBetweenQuestions] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [pendingMatch, setPendingMatch] = useState<Match | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const forfeitedRef = useRef(false);
  const submittedRef = useRef(false);
  const lastQuestionRef = useRef(-1);
  const consecutiveTimeoutsRef = useRef(0);
  const betweenQuestionsRef = useRef(false);
  const INACTIVITY_LIMIT = 2;

  useEffect(() => { forfeitedRef.current = forfeited; }, [forfeited]);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  // Load match and user data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setCurrentUser(user);

      const { data: matchData } = await supabase
        .from('matches').select('*').eq('id', matchId).single();

      if (matchData) {
        const m = matchData as unknown as Match;
        lastQuestionRef.current = m.current_question;
        setMatch(m);
        const opponentId = m.player_one_id === user.id ? m.player_two_id : m.player_one_id;
        if (opponentId) {
          const { data: opp } = await supabase.from('users').select('*').eq('id', opponentId).single();
          setOpponent(opp as unknown as User);
        }
      }
    }
    load();
  }, [matchId, supabase, router]);

  // Anti-cheat
  useEffect(() => {
    if (!match || match.status !== 'active') return;
    const MAX_WARNINGS = 2;

    function handleVisibilityChange() {
      if (document.hidden && !forfeitedRef.current && match?.status === 'active') {
        setTabWarnings((prev) => { const n = prev + 1; if (n > MAX_WARNINGS) forfeitMatch(); return n; });
      }
    }
    function handleBlur() {
      if (!forfeitedRef.current && match?.status === 'active') {
        setTabWarnings((prev) => { const n = prev + 1; if (n > MAX_WARNINGS) forfeitMatch(); return n; });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [match?.status, match?.id]);

  const forfeitMatch = useCallback(async () => {
    if (forfeitedRef.current || !match || !currentUser) return;
    forfeitedRef.current = true;
    setForfeited(true);
    for (let i = match.current_question; i < 10; i++) {
      try {
        await fetch(`/api/match/${matchId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer: '__forfeit__', questionIndex: i }),
        });
      } catch { /* continue */ }
    }
  }, [match, currentUser, matchId]);

  // Shared handler for processing match updates (realtime or poll)
  const handleMatchUpdate = useCallback((newMatch: Match) => {
    if (!forfeitedRef.current && newMatch.current_question !== lastQuestionRef.current) {
      // Don't reset the countdown if we're already in the between-questions period
      if (betweenQuestionsRef.current) return;

      if (!submittedRef.current) {
        setSubmitted(true);
        submittedRef.current = true;
        setLastResult(false);
        setSelectedAnswer('__timeout__');
      }
      betweenQuestionsRef.current = true;
      setPendingMatch(newMatch);
      setBetweenQuestions(true);
      setCountdown(3);
    } else {
      setMatch(newMatch);
    }
  }, []);

  // Realtime with resilient connection
  useEffect(() => {
    let destroyed = false;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    function subscribe() {
      if (destroyed) return;

      const channel = supabase
        .channel(`match:${matchId}:${Date.now()}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}`,
        }, (payload) => {
          handleMatchUpdate(payload.new as unknown as Match);
        })
        .subscribe((status) => {
          if (destroyed) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Clean up failed channel and retry
            supabase.removeChannel(channel);
            activeChannel = null;
            reconnectTimer = setTimeout(subscribe, 2000);
          }
          if (status === 'SUBSCRIBED') {
            activeChannel = channel;
          }
        });
    }

    subscribe();

    // Fallback poll every 3 seconds to catch silent disconnects
    refreshTimer = setInterval(async () => {
      const { data } = await supabase
        .from('matches').select('*').eq('id', matchId).single();
      if (data) {
        handleMatchUpdate(data as unknown as Match);
      }
    }, 3000);

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      if (activeChannel) supabase.removeChannel(activeChannel);
    };
  }, [matchId, supabase, handleMatchUpdate]);

  // Between-questions countdown
  useEffect(() => {
    if (!betweenQuestions || !pendingMatch) return;

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          // Apply the pending match state and reset for next question
          lastQuestionRef.current = pendingMatch.current_question;
          betweenQuestionsRef.current = false;
          setMatch(pendingMatch);
          setPendingMatch(null);
          setBetweenQuestions(false);
          setSelectedAnswer(null);
          setSubmitted(false);
          submittedRef.current = false;
          setLastResult(null);
          setTimeLeft(15);
          return 3;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [betweenQuestions, pendingMatch]);

  // Timer
  useEffect(() => {
    if (!match || match.status !== 'active' || submitted || forfeited || betweenQuestions) return;
    setTimeLeft(15);
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timer); handleSubmit('__timeout__'); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [match?.current_question, match?.status, submitted, forfeited]);

  const handleSubmit = useCallback(async (answer: string) => {
    if (submittedRef.current || !match || !currentUser || forfeitedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    setSelectedAnswer(answer);

    // Track consecutive timeouts for inactivity forfeit
    if (answer === '__timeout__') {
      consecutiveTimeoutsRef.current += 1;
      if (consecutiveTimeoutsRef.current >= INACTIVITY_LIMIT) {
        forfeitMatch();
        return;
      }
    } else {
      consecutiveTimeoutsRef.current = 0;
    }

    const res = await fetch(`/api/match/${matchId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, questionIndex: match.current_question }),
    });
    const data = await res.json();
    if (res.ok) setLastResult(data.isCorrect);
  }, [match, currentUser, matchId, forfeitMatch]);

  // Loading
  if (!match || !currentUser) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const isP1 = currentUser.id === match.player_one_id;
  const myScore = isP1 ? match.p1_score : match.p2_score;
  const oppScore = isP1 ? match.p2_score : match.p1_score;
  const questions = match.questions as OpenTDBQuestion[];
  const currentQ = questions[match.current_question];

  // Forfeited
  if (forfeited && match.status !== 'completed') {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-sm mx-auto px-4 py-16 text-center space-y-6 animate-scale-in">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 ring-1 ring-red-500/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-400">Forfeited</h1>
          <p className="text-gray-500 text-sm">
            {consecutiveTimeoutsRef.current >= INACTIVITY_LIMIT
              ? 'You were forfeited for inactivity (missed 2 consecutive questions).'
              : 'Switching tabs or apps during a match is not allowed.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl text-sm ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
          >
            Back to Home
          </button>
        </main>
      </div>
    );
  }

  // Completed
  if (match.status === 'completed') {
    const isWinner = match.winner_id === currentUser.id;
    const isDraw = match.winner_id === null;
    const myMmrBefore = isP1 ? match.p1_mmr_before : match.p2_mmr_before;
    const myMmrAfter = isP1 ? match.p1_mmr_after : match.p2_mmr_after;
    const mmrChange = (myMmrAfter ?? 0) - (myMmrBefore ?? 0);

    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-sm mx-auto px-4 py-12 text-center space-y-6 animate-scale-in">
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center ${
            isWinner ? 'bg-green-500/10 ring-1 ring-green-500/30' : isDraw ? 'bg-yellow-500/10 ring-1 ring-yellow-500/30' : 'bg-red-500/10 ring-1 ring-red-500/30'
          }`}>
            {isWinner ? (
              <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 0 1-2.021 1.604 6.021 6.021 0 0 1-2.021-1.604" />
              </svg>
            ) : (
              <span className={`text-4xl font-black ${isDraw ? 'text-yellow-400' : 'text-red-400'}`}>
                {isDraw ? '=' : 'GG'}
              </span>
            )}
          </div>

          <h1 className={`text-3xl font-black ${
            isWinner ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {isWinner ? 'Victory!' : isDraw ? 'Draw!' : 'Defeat'}
          </h1>

          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-400">{myScore}</div>
              <div className="text-xs text-gray-500 mt-0.5">You</div>
            </div>
            <div className="text-gray-700 text-xl">vs</div>
            <div className="text-center">
              <div className="text-3xl font-black text-red-400">{oppScore}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opponent?.username ?? 'Opponent'}</div>
            </div>
          </div>

          {myMmrAfter !== null && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">MMR Change</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-400 font-mono">{myMmrBefore}</span>
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
                <span className="text-white font-mono font-bold">{myMmrAfter}</span>
                <span className={`text-sm font-bold ${mmrChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {mmrChange >= 0 ? '+' : ''}{mmrChange}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={() => router.push('/queue')}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 rounded-xl text-sm text-gray-400 ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-white/5 transition-all"
            >
              Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Active match
  const allAnswers = currentQ
    ? [...currentQ.incorrect_answers, currentQ.correct_answer].sort()
    : [];
  const timerPercent = (timeLeft / 15) * 100;

  return (
    <div className="min-h-screen flex flex-col no-select">
      <Navbar />

      {/* Anti-cheat warning */}
      {tabWarnings > 0 && tabWarnings <= 2 && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center text-yellow-400 text-xs font-medium animate-fade-in">
          Warning {tabWarnings}/2 — Leave again and you forfeit
        </div>
      )}

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-5 gap-3 sm:gap-4">
        {/* Score header */}
        <div className="glass rounded-xl p-3 sm:p-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <div className="text-center min-w-[56px]">
              <div className="text-2xl sm:text-3xl font-black text-blue-400">{myScore}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">You</div>
            </div>

            <div className="text-center flex-1 px-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                Question {match.current_question + 1} of 10
              </div>
              <div className={`text-2xl font-mono font-black tabular-nums ${
                timeLeft <= 5 ? 'text-red-400' : timeLeft <= 10 ? 'text-yellow-400' : 'text-white'
              }`}>
                {timeLeft}
              </div>
            </div>

            <div className="text-center min-w-[56px]">
              <div className="text-2xl sm:text-3xl font-black text-red-400">{oppScore}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider truncate max-w-[72px]">
                {opponent?.username ?? 'Opp'}
              </div>
            </div>
          </div>

          {/* Timer bar */}
          <div className="w-full h-1 bg-gray-800 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 linear ${
                timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        {/* Question area */}
        {currentQ && (
          <div className="flex-1 flex flex-col gap-3 sm:gap-4 animate-fade-in-up" key={match.current_question}>
            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 text-[11px] bg-white/5 text-gray-400 rounded-md">
                {currentQ.category}
              </span>
              <span className={`px-2 py-0.5 text-[11px] rounded-md font-medium ${
                currentQ.difficulty === 'easy'
                  ? 'bg-green-500/10 text-green-400'
                  : currentQ.difficulty === 'medium'
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {currentQ.difficulty}
              </span>
            </div>

            {/* Question text */}
            <h2 className="text-base sm:text-lg font-semibold leading-relaxed text-gray-100">
              {currentQ.question}
            </h2>

            {/* Answer buttons */}
            <div className="grid grid-cols-1 gap-2 sm:gap-2.5 stagger-children">
              {allAnswers.map((answer) => {
                const isCorrectAnswer = answer === currentQ.correct_answer;
                const isSelected = answer === selectedAnswer;
                const showResults = submitted && lastResult !== null;

                let btnClass = 'relative p-3.5 sm:p-4 rounded-xl text-left transition-all text-sm sm:text-base font-medium ';

                if (showResults) {
                  if (isCorrectAnswer) {
                    btnClass += 'bg-green-500/15 ring-1 ring-green-500/40 text-green-300';
                  } else if (isSelected && !lastResult) {
                    btnClass += 'bg-red-500/15 ring-1 ring-red-500/40 text-red-300';
                  } else {
                    btnClass += 'bg-white/[0.02] ring-1 ring-gray-800/50 text-gray-600';
                  }
                } else if (submitted) {
                  // Waiting for API response
                  if (isSelected) {
                    btnClass += 'bg-blue-500/15 ring-1 ring-blue-500/40 text-blue-300 animate-pulse';
                  } else {
                    btnClass += 'bg-white/[0.02] ring-1 ring-gray-800/50 text-gray-600';
                  }
                } else {
                  btnClass += 'bg-white/[0.03] ring-1 ring-gray-800 text-white hover:bg-white/[0.07] hover:ring-gray-700 active:bg-white/10 active:scale-[0.98] cursor-pointer';
                }

                return (
                  <button
                    key={answer}
                    onClick={() => !submitted && handleSubmit(answer)}
                    disabled={submitted}
                    className={btnClass}
                  >
                    {answer}
                    {showResults && isCorrectAnswer && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    )}
                    {showResults && isSelected && !lastResult && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Result feedback */}
            {submitted && (
              <div className="text-center py-2 animate-fade-in">
                {lastResult === null ? (
                  <p className="text-sm text-gray-500">Submitting...</p>
                ) : lastResult ? (
                  <p className="text-green-400 font-bold">Correct!</p>
                ) : (
                  <p className="text-red-400 font-bold">Wrong!</p>
                )}
                {lastResult !== null && !betweenQuestions && (
                  <p className="text-xs text-gray-600 mt-1">Waiting for opponent...</p>
                )}
                {betweenQuestions && (
                  <p className="text-xs text-gray-500 mt-1">Next question in {countdown}...</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Question progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i < match.current_question
                  ? 'bg-blue-500'
                  : i === match.current_question
                  ? 'bg-white scale-125'
                  : 'bg-gray-800'
              }`}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
