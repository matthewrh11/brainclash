'use client';

import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { OpenTDBQuestion, DailyAnswer } from '@/types/database';

interface DailyQuestion extends OpenTDBQuestion {
  all_answers?: string[];
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  user_id: string;
  score: number;
  total_time_ms: number;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function DailyPage() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'playing' | 'results' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<DailyQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const answersRef = useRef<DailyAnswer[]>([]);
  const [result, setResult] = useState<{ score: number; total_time_ms: number; answers: DailyAnswer[] } | null>(null);
  const [fullQuestions, setFullQuestions] = useState<OpenTDBQuestion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shuffledAnswers, setShuffledAnswers] = useState<string[]>([]);
  const [betweenQuestions, setBetweenQuestions] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [showCopied, setShowCopied] = useState(false);
  const [lastResult, setLastResult] = useState<boolean | null>(null);

  const questionStartRef = useRef(Date.now());
  const submittedRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // Load daily challenge
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setCurrentUserId(user.id);

      const res = await fetch('/api/daily/today');
      const data = await res.json();

      if (!res.ok || data.error) {
        console.error('Daily challenge error:', data.error);
        setErrorMsg(data.error || 'Failed to load daily challenge');
        setPhase('error');
        return;
      }

      setChallengeId(data.challenge.id);
      setQuestions(data.challenge.questions);

      if (data.alreadyPlayed) {
        setResult(data.result);
        setFullQuestions(data.challenge.questions);
        setPhase('results');
        // Fetch leaderboard
        const lbRes = await fetch('/api/daily/leaderboard');
        const lbData = await lbRes.json();
        setLeaderboard(lbData.leaderboard ?? []);
      } else {
        setPhase('ready');
      }
    }
    load();
  }, [supabase, router]);

  // Shuffle answers when question changes
  useEffect(() => {
    if (phase !== 'playing' || !questions[currentQuestion]) return;
    const q = questions[currentQuestion];
    if (q.all_answers) {
      setShuffledAnswers(q.all_answers);
    } else {
      const allAnswers = [...q.incorrect_answers, q.correct_answer];
      setShuffledAnswers(allAnswers.sort(() => Math.random() - 0.5));
    }
  }, [currentQuestion, phase, questions]);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing' || submitted || betweenQuestions) return;
    if (timeLeft <= 0) {
      handleSubmit('__timeout__');
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, submitted, betweenQuestions]);

  // Between-questions countdown
  useEffect(() => {
    if (!betweenQuestions) return;
    if (countdown <= 0) {
      setBetweenQuestions(false);
      setCurrentQuestion((q) => q + 1);
      setSelectedAnswer(null);
      setSubmitted(false);
      setLastResult(null);
      submittedRef.current = false;
      setTimeLeft(20);
      questionStartRef.current = Date.now();
      setCountdown(3);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [betweenQuestions, countdown]);

  const handleSubmit = useCallback((answer: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    setSelectedAnswer(answer === '__timeout__' ? null : answer);

    const timeMs = Date.now() - questionStartRef.current;
    const isTimeout = answer === '__timeout__';
    const isCorrect = !isTimeout && answer === question?.correct_answer;
    setLastResult(isTimeout ? false : isCorrect);

    const newAnswer: DailyAnswer = {
      question_index: currentQuestion,
      answer: isTimeout ? '' : answer,
      is_correct: false, // Will be graded server-side
      time_ms: timeMs,
    };

    answersRef.current = [...answersRef.current, newAnswer];

    // If this was the last question, submit everything
    if (currentQuestion >= questions.length - 1) {
      submitAll(answersRef.current);
    }

    // If not last question, transition to next
    if (currentQuestion < questions.length - 1) {
      setTimeout(() => {
        setBetweenQuestions(true);
      }, 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, questions.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submitAll = useCallback(async (allAnswers: DailyAnswer[]) => {
    const res = await fetch('/api/daily/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
        answers: allAnswers,
      }),
    });

    const data = await res.json();
    if (data.result) {
      setResult(data.result);
      setFullQuestions(data.questions);
      // Small delay before showing results
      setTimeout(() => {
        setPhase('results');
        // Fetch leaderboard
        fetch('/api/daily/leaderboard')
          .then((r) => r.json())
          .then((d) => setLeaderboard(d.leaderboard ?? []));
      }, 1500);
    }
  }, [challengeId]);

  const startPlaying = () => {
    setPhase('playing');
    questionStartRef.current = Date.now();
  };

  const shareResults = () => {
    if (!result) return;

    const grid = result.answers.map((a: DailyAnswer) =>
      a.is_correct ? '\u{1F7E9}' : '\u{1F7E5}'
    ).join('');

    const today = new Date().toISOString().split('T')[0];
    const text = `BrainClash Daily ${today}\n${result.score}/10 | ${formatTime(result.total_time_ms)}\n${grid}`;

    navigator.clipboard.writeText(text).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  };

  const question = questions[currentQuestion];
  const timerPercent = (timeLeft / 20) * 100;

  // Loading state
  if (phase === 'loading') {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="animate-pulse text-gray-400">Loading daily challenge...</div>
        </main>
      </div>
    );
  }

  // Error state
  if (phase === 'error') {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 glass rounded-xl font-semibold hover:bg-white/10 transition-all"
          >
            Try Again
          </button>
        </main>
      </div>
    );
  }

  // Ready to play
  if (phase === 'ready') {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center animate-fade-in-up">
          <div className="mb-2 text-sm text-gray-500 uppercase tracking-wider font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-4 gradient-text">
            BrainClash Daily
          </h1>
          <p className="text-gray-400 mb-2">
            10 questions. 20 seconds each.
          </p>
          <p className="text-gray-500 text-sm mb-8">
            Everyone gets the same questions. Score by correctness, then speed.
          </p>
          <button
            onClick={startPlaying}
            className="px-10 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:from-purple-700 active:to-pink-700 rounded-xl text-lg font-bold transition-all hover:shadow-xl hover:shadow-purple-500/20 hover:-translate-y-0.5 active:translate-y-0"
          >
            Start Daily
          </button>
        </main>
      </div>
    );
  }

  // Results
  if (phase === 'results' && result) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12 pb-16 animate-fade-in-up">
          <div className="text-center mb-8">
            <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-2">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mb-4 gradient-text">
              BrainClash Daily
            </h1>

            {/* Score display */}
            <div className="glass rounded-2xl p-6 mb-6 inline-block">
              <div className="text-4xl font-black font-mono text-white mb-1">
                {result.score}/10
              </div>
              <div className="text-lg text-gray-400 font-mono">
                {formatTime(result.total_time_ms)}
              </div>
            </div>

            {/* Answer grid */}
            <div className="flex justify-center gap-1.5 mb-6">
              {result.answers.map((a: DailyAnswer, i: number) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${
                    a.is_correct
                      ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                      : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Share button */}
            <button
              onClick={shareResults}
              className="px-6 py-3 glass rounded-xl font-semibold hover:bg-white/10 active:bg-white/5 transition-all relative"
            >
              {showCopied ? 'Copied!' : 'Share Results'}
            </button>
          </div>

          {/* Question review */}
          <div className="space-y-3 mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Question Review</h2>
            {fullQuestions.map((q, i) => {
              const userAnswer = result.answers[i];
              return (
                <div key={i} className="glass rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
                      userAnswer?.is_correct
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 mb-1">{q.question}</p>
                      <p className="text-xs text-green-400">
                        {q.correct_answer}
                      </p>
                      {!userAnswer?.is_correct && userAnswer?.answer && (
                        <p className="text-xs text-red-400">
                          Your answer: {userAnswer.answer}
                        </p>
                      )}
                      {!userAnswer?.answer && (
                        <p className="text-xs text-gray-500">Timed out</p>
                      )}
                    </div>
                    {userAnswer && (
                      <div className="text-xs text-gray-500 flex-shrink-0">
                        {(userAnswer.time_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Today&apos;s Leaderboard</h2>
              <div className="glass rounded-xl overflow-hidden">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.user_id}
                    className={`flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0 ${
                      entry.user_id === currentUserId ? 'bg-purple-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-mono w-6 text-center ${
                        entry.rank <= 3 ? 'text-yellow-400 font-bold' : 'text-gray-500'
                      }`}>
                        {entry.rank}
                      </span>
                      <span className={`text-sm ${entry.user_id === currentUserId ? 'text-purple-300 font-semibold' : 'text-gray-300'}`}>
                        {entry.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-white">{entry.score}/10</span>
                      <span className="text-xs font-mono text-gray-500">{formatTime(entry.total_time_ms)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Back button */}
          <div className="text-center mt-8">
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Playing
  if (!question) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
        {betweenQuestions ? (
          <div className="text-center py-20 animate-scale-in">
            <div className="text-6xl font-black text-gray-400 mb-4">{countdown}</div>
            <p className="text-gray-500">Next question...</p>
          </div>
        ) : (
          <div className="animate-fade-in-up">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="text-sm text-gray-500 font-medium">
                Question {currentQuestion + 1}/{questions.length}
              </div>
              <div className="flex items-center gap-2">
                <div className={`text-lg font-mono font-bold ${
                  timeLeft <= 5 ? 'text-red-400' : timeLeft <= 10 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {timeLeft}s
                </div>
              </div>
            </div>

            {/* Timer bar */}
            <div className="w-full h-1.5 bg-gray-800 rounded-full mb-6 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 linear ${
                  timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>

            {/* Category & difficulty */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">{question.category}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${
                question.difficulty === 'easy' ? 'bg-green-500/10 text-green-400' :
                question.difficulty === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {question.difficulty}
              </span>
            </div>

            {/* Question */}
            <h2 className="text-lg sm:text-xl font-semibold mb-6 text-white leading-relaxed">
              {question.question}
            </h2>

            {/* Answers */}
            <div className="grid grid-cols-1 gap-2 sm:gap-2.5">
              {shuffledAnswers.map((answer, i) => {
                const isSelected = selectedAnswer === answer;
                const isCorrectAnswer = answer === question.correct_answer;
                const showResults = submitted && lastResult !== null;

                let btnClass = 'relative w-full text-left p-3.5 sm:p-4 rounded-xl transition-all text-sm sm:text-base font-medium ';

                if (showResults) {
                  if (isCorrectAnswer) {
                    btnClass += 'bg-green-500/15 ring-1 ring-green-500/40 text-green-300';
                  } else if (isSelected && !lastResult) {
                    btnClass += 'bg-red-500/15 ring-1 ring-red-500/40 text-red-300';
                  } else {
                    btnClass += 'bg-white/[0.02] ring-1 ring-gray-800/50 text-gray-600';
                  }
                } else if (submitted) {
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
                    key={i}
                    onClick={() => !submitted && handleSubmit(answer)}
                    disabled={submitted}
                    className={btnClass}
                  >
                    <span className="text-gray-400 mr-3 font-mono text-sm">{String.fromCharCode(65 + i)}</span>
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

            {/* Timeout indicator */}
            {submitted && !selectedAnswer && (
              <div className="text-center mt-4 text-sm text-red-400">
                Time&apos;s up!
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
