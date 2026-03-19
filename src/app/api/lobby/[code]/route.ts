import { createServiceRoleClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const serviceSupabase = createServiceRoleClient();

  const { data: match } = await serviceSupabase
    .from('matches')
    .select('id, status, player_one_id, player_two_id, match_type')
    .eq('invite_code', params.code.toUpperCase())
    .single();

  if (!match) {
    return NextResponse.json({ error: 'Lobby not found or expired' }, { status: 404 });
  }

  // Get host username
  const { data: host } = await serviceSupabase
    .from('users')
    .select('username')
    .eq('id', match.player_one_id)
    .single();

  return NextResponse.json({
    matchId: match.id,
    status: match.status,
    hostUsername: host?.username ?? 'Unknown',
    hasOpponent: !!match.player_two_id,
  });
}

// DELETE: host cancels the lobby
export async function DELETE(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const { createServerClient } = await import('@supabase/ssr');
  const { cookies } = await import('next/headers');

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceSupabase = createServiceRoleClient();

  // Only the host can cancel, and only if still waiting
  const { error } = await serviceSupabase
    .from('matches')
    .delete()
    .eq('invite_code', params.code.toUpperCase())
    .eq('player_one_id', user.id)
    .eq('status', 'waiting');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Lobby cancelled' });
}
