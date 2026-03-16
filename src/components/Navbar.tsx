'use client';

import { createClient } from '@/lib/supabase-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { User } from '@/types/database';

export default function Navbar() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(data as unknown as User);
      }
    }
    getUser();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-50 glass border-b border-gray-800/50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-lg font-bold gradient-text hover:opacity-80 transition-opacity"
          onClick={() => setMenuOpen(false)}
        >
          BrainClash
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-2">
          <Link href="/leaderboard" className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            Leaderboard
          </Link>
          {user ? (
            <>
              <Link href="/queue" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20">
                Play
              </Link>
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-800">
                <span className="text-sm text-gray-300">{profile?.username ?? '...'}</span>
                <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full font-mono font-bold">
                  {profile?.mmr ?? '...'}
                </span>
                <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-300 ml-1 transition-colors">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <Link href="/auth/login" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20">
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile */}
        <div className="flex sm:hidden items-center gap-2">
          {profile && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full font-mono font-bold">
              {profile.mmr}
            </span>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-xl animate-fade-in">
          <div className="px-4 py-3 space-y-2">
            {user && profile && (
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 mb-3">
                <span className="text-sm text-gray-300 font-medium">{profile.username}</span>
                <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full font-mono font-bold">
                  {profile.mmr} MMR
                </span>
              </div>
            )}
            <Link
              href="/leaderboard"
              onClick={() => setMenuOpen(false)}
              className="block py-2.5 px-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              Leaderboard
            </Link>
            {user ? (
              <>
                <Link
                  href="/queue"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-center font-medium transition-all"
                >
                  Find Match
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full py-2 text-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setMenuOpen(false)}
                className="block w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-center font-medium transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
