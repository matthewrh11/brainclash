# BrainClash — CLAUDE.md

## Project Overview

BrainClash is a real-time 1v1 trivia game with Elo-based MMR matchmaking. Players can play ranked matches, challenge friends via casual lobbies, compete in daily challenges, and climb a global leaderboard.

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript 5
- **Auth & Database:** Supabase (PostgreSQL with Row-Level Security)
- **Styling:** Tailwind CSS 3.4 with custom utility classes (`.glass`, `.gradient-text`, `.animate-*`)
- **External API:** OpenTDB (Open Trivia Database) for question sourcing
- **Deployment:** Vercel

## Architecture

```
src/
├── app/              # Next.js App Router (pages + API routes)
├── components/       # Shared React components
├── lib/              # Utility modules (elo, opentdb, supabase clients)
├── types/            # TypeScript interfaces and types
└── middleware.ts      # Auth guard for protected routes
supabase/
└── migrations/       # Numbered SQL migration files (001–005)
```

### Key Patterns

- **Supabase SSR:** Two client patterns — `createClient()` (browser, from `supabase-client.ts`) and `createServerSupabaseClient()` / `createServiceRoleClient()` (server, from `supabase-server.ts`). The service role client bypasses RLS for backend operations.
- **Auth flow:** Supabase Auth → middleware protects routes (`/queue`, `/match`, `/daily`, `/duel`, `/lobby`) → redirects to `/auth/login` if unauthenticated.
- **Supabase query builder returns `PromiseLike`, NOT `Promise`.** You cannot chain `.catch()` directly. Wrap with `Promise.resolve()` if you need `.then().catch()`.
- **Match lifecycle:** `waiting` → `active` → `completed` / `abandoned`. Lobbies are matches in `waiting` state with a null `player_two_id`.
- **Match types:** `ranked` (affects MMR/stats) and `casual` (lobby matches, no MMR impact). Always check `match_type` before updating Elo or stats.
- **Matchmaking:** Queue with heartbeat mechanism (15s stale threshold). `sendBeacon` used for reliable cleanup on page unload.
- **Daily challenges:** One per calendar day (Eastern Time rollover). Pre-generated for tomorrow when any player submits today's result. Uses `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` for consistent YYYY-MM-DD dates.
- **Answer submission:** Atomic via PL/pgSQL function `submit_answer()` with row-level locking to prevent race conditions.

### Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only, secret)

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build (runs type checking)
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Player profiles (username, mmr, wins, losses, total_matches) |
| `matches` | All match data (ranked + casual), questions, scores, MMR deltas |
| `match_answers` | Individual answer submissions per match |
| `matchmaking_queue` | Active queue entries with heartbeat |
| `daily_challenges` | One row per day with 10 questions |
| `daily_results` | Player results for daily challenges |

---

## Writing Code: Engineering Standards

### Think Before You Write

- Read the existing code in full before modifying it. Understand the patterns already in use.
- Trace the data flow end-to-end before making changes — from the UI through the API route to the database and back.
- Consider edge cases: What happens if the user is unauthenticated? If the database call fails? If the request races with another?

### Type Safety

- **Always run `npm run build` before considering any change complete.** The build runs TypeScript's type checker. If it doesn't build, it doesn't ship.
- Know the types you're working with. Supabase's query builder returns `PromiseLike`, not `Promise`. Next.js `cookies()` returns `ReadonlyRequestCookies`. Don't assume — check.
- Don't use `any` unless there is genuinely no alternative. Use `unknown` + type narrowing instead.
- When working with JSONB columns (e.g., `questions`, `answers`), cast them to their known TypeScript types explicitly.

### API Routes

- Always validate request input at the boundary. Check for missing fields, wrong types, and array lengths.
- Use the service role client (`createServiceRoleClient()`) for operations that need to bypass RLS (e.g., cross-user queries, admin operations).
- Use the user-scoped client (via `createServerClient` with cookies) for auth checks (`getUser()`).
- Never call `getUser()` more than once per request — it's a network round-trip to Supabase Auth.
- Return appropriate HTTP status codes: 400 (bad input), 401 (not authenticated), 404 (not found), 409 (conflict/duplicate).

### Client Components

- Initialize Supabase client with `useMemo` to avoid recreating on every render.
- Add loading states to prevent UI flash (e.g., auth check completes after initial render shows unauthenticated view).
- Clean up intervals, timeouts, and subscriptions in `useEffect` return functions.
- Use `navigator.sendBeacon()` for fire-and-forget HTTP on page unload — `fetch()` gets cancelled during navigation.

### Keep It Simple

- Don't add features, abstractions, or error handling beyond what's needed for the current task.
- Don't add comments explaining obvious code. Only comment non-obvious decisions.
- Don't refactor adjacent code unless asked.
- Prefer editing existing files over creating new ones.

---

## Reviewing Code: Peer Review Standards

When asked to review code, act as a senior engineer conducting a thorough peer review. Apply these checks systematically.

### 1. Correctness

- Does the code actually do what it claims to do? Trace the logic manually.
- Are there off-by-one errors, missing null checks, or unhandled edge cases?
- Do database queries filter correctly? Could they return unexpected rows?
- Are race conditions possible? (e.g., two users joining the same lobby simultaneously)

### 2. Type Safety & Build Verification

- Will this pass `npm run build`? Think through the types.
- Are there implicit `any` types, unsafe casts, or mismatched return types?
- Does the code respect library-specific types? (e.g., Supabase `PromiseLike`, Next.js cookie types)

### 3. Security

- Is user input validated before use?
- Can a user access or modify another user's data?
- Are service role operations appropriately scoped?
- Is RLS being relied on correctly, or are there bypass paths?
- Are there SQL injection, XSS, or other OWASP top 10 risks?

### 4. Data Integrity

- Are database operations atomic where they need to be?
- Could concurrent requests create duplicate entries? (Check unique constraints)
- Are there dangling references if a related row is deleted?
- Is the casual/ranked guard applied everywhere that updates MMR or stats?

### 5. Performance

- Are there unnecessary database round-trips? Can queries be batched or parallelized?
- Are there N+1 query patterns?
- Is the client doing work that should happen on the server, or vice versa?
- Are expensive operations (API calls, large queries) cached or pre-computed where appropriate?

### 6. Reliability

- What happens if an external API (OpenTDB) is down or slow?
- Are errors handled gracefully? Do they surface useful messages?
- Is there a fallback path if a background/async operation fails?

### 7. Review Output Format

When presenting review findings:
- Categorize issues by severity: **Critical** (bugs, security), **Important** (correctness, data integrity), **Minor** (performance, style)
- For each issue: state the problem, explain why it matters, and suggest a specific fix
- Don't flag style preferences or nitpicks unless they affect readability meaningfully
- Call out what's done well — good patterns should be reinforced
