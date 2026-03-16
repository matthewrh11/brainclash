import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Registration is handled via Google OAuth. Use /auth/login instead.' },
    { status: 410 }
  );
}
