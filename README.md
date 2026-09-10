# أُنس Live

أُنس Live is the Arabic-first audience, stage, and operator system for the College of Science Student Activities Group opening evening. A participant registers once at `/join`, remains at `/play`, and sees the experience selected by the organizer. The two games are **باقي معنا؟** (`stay_alive`) and **وَمْضَة** (`wamda`).

## Release status

**CODE READY FOR SUPABASE APPLY.** The repository contains the live implementation, but no remote Supabase project has been migrated and no Vercel production deployment has been performed from this release candidate.

## Routes

- `/join` — name and Oman phone registration only.
- `/play` — the participant’s one persistent route.
- `/admin/login` and `/admin` — Supabase Auth and allow-listed organizer control room.
- `/stage/alive` and `/stage/wamda` — dedicated 16:9 projector views.

Public pages intentionally contain no navigation to Play, Admin, or Stage. `/` redirects to `/join`.

## Architecture

- React 19, Vite, TypeScript, and Wouter in `artifacts/anas-live`.
- The backend adapter in `src/lib/backend.ts` has two explicit modes: `demo` and `supabase`.
- Supabase PostgreSQL is authoritative in event mode. `supabase/migrations/0001_anas_live.sql` creates normalized data, constraints, indexes, RLS, safe public projections, participant RPCs, admin RPCs, action logs, and atomic Stay Alive operations.
- `supabase/functions/wamda-signal` is the only timed Edge Function. It verifies the organizer JWT, asks PostgreSQL to choose a private 2–7 second delay, waits, then uses the server-only service role to fire the due signal.
- Supabase Realtime publishes only `event_state` and `wamda_public_signals`. The public signal projection does not contain `trigger_at`. Participant-private state is rehydrated through an opaque-token RPC and is never broadcast to other participants.
- A 15-second read fallback recovers after missed Realtime events. Supabase Presence provides an intentionally approximate connected count without database heartbeat writes.

The legacy Express package remains as a demo/reference API contract; the Vercel event build does not depend on it. Event mode never falls back to that server or to demo data.

## Modes and environment

Copy `.env.example`. The default is safe local demo mode.

```dotenv
VITE_APP_MODE=demo
VITE_DEMO_ADMIN_CODE=anas-demo
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_JOIN_URL=
```

For the event set `VITE_APP_MODE=supabase`. `VITE_JOIN_URL` is optional; when blank the QR uses the current production origin. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or frontend code. Supabase injects it into the Edge Function environment.

## Local development

```bash
pnpm install
pnpm --filter @workspace/anas-live run dev
```

No `REPL_ID`, `BASE_PATH`, or mandatory `PORT` is required. Vite defaults to port 5173. Demo admin login accepts any email plus `VITE_DEMO_ADMIN_CODE`. The control room can seed 20, 50, 100, or 500 isolated browser-local demo participants.

## Supabase setup

Do these steps in a non-production project first:

1. Install the Supabase CLI and link the intended project.
2. Review and apply `supabase/migrations/0001_anas_live.sql` (`supabase db push` after owner approval).
3. Deploy the timed function: `supabase functions deploy wamda-signal`.
4. In Supabase Authentication, create the first organizer as an email/password user.
5. Copy that user’s UUID from Authentication → Users, then run:

   ```sql
   insert into public.admin_profiles (user_id, display_name)
   values ('AUTH-USER-UUID', 'Event operator');
   ```

6. Put the project URL and public anon key in the Vercel environment, set `VITE_APP_MODE=supabase`, and redeploy a preview.
7. Verify `/admin/login`, one physical-phone registration, both stages, Realtime, and the full rehearsal before approving production.

Authenticated users not present in `admin_profiles`, disabled profiles, and anonymous users are denied by the database. Creating an Auth user alone does not grant organizer privileges.

## Security model

- Oman phones are canonicalized to `+968[79]XXXXXXX`, constrained unique, and never returned by public RPCs.
- The browser stores only a 256-bit opaque participant token. PostgreSQL stores its SHA-256 hash, validates expiry/revocation, and resolves all participant mutations from the token.
- Registration is create-only. A duplicate phone receives `already_registered`; it cannot change the participant, revoke the original session, or mint/reveal another token. The unique phone constraint is the concurrency authority, so one simultaneous insert wins and the other fails closed.
- Returning participants must use the original browser token. There is intentionally no phone-only recovery or OTP flow; an organizer must assist if that browser token is lost, and no admin screen exposes reusable participant tokens.
- RLS is enabled on every table. Public clients have direct read access only to the safe event state and public signal projection; all sensitive tables have no anon/authenticated policies.
- Admin mutations call `require_admin()` inside `security definer` RPCs. Advisory transaction locks, unique request IDs, and unique round/session constraints protect double-clicks and concurrent organizers.
- Stay Alive eligibility is snapshotted at start and survivor selection is a single server-side bulk transaction using PostgreSQL randomness. Selection and reveal are separate actions.
- Wamda requires the active server-created session and signal IDs, records false starts, accepts exactly one attempt per participant/session, validates positive values up to 10 seconds, and flags reactions under 120 ms or submissions over 15 seconds after green.
- Wamda results sort deterministically by reaction time, server receive time, then attempt UUID. Flags are reviewed rather than automatically disqualifying exceptional results. The organizer explicitly selects and later reveals a result.

Browser reaction timing is practical event-night timing, not cheat-proof: `performance.now()` removes wall-clock jumps, but a participant controls their browser. Use the integrity flags and physical observation for judgment.

## Tests and validation

```bash
pnpm run typecheck
pnpm --filter @workspace/anas-live test
pnpm run build
```

The unit tests cover Oman phone normalization and registration input normalization. `supabase/tests/security.sql` verifies public table/function privileges and RLS when run against a local Supabase stack:

```bash
supabase start
supabase db reset
supabase test db
```

## Vercel

The repository-level `vercel.json` provides the SPA rewrite so direct visits to all six routes resolve to `index.html`.

- Root directory: repository root
- Install command: `pnpm install`
- Build command: `pnpm --filter @workspace/anas-live run build`
- Output directory: `artifacts/anas-live/dist/public`
- Required event variables: `VITE_APP_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_JOIN_URL`

## Rehearsal and reset

Use [docs/EVENT_NIGHT_RUNBOOK.md](docs/EVENT_NIGHT_RUNBOOK.md). Game resets keep registrations. Full Event Reset revokes participant sessions and deletes participant records; it requires typing `RESET ANAS`. Treat it as destructive and use it only during an approved rehearsal reset.

## Visual system

The supplied official poster is rendered as an unchanged cropped SVG image window for the major أُنس wordmark. The text-free carpet background was derived from that owner-supplied identity reference with the built-in image editing tool, then web-optimized as JPEG. Qahwa and Thmanyah font files were not supplied, so the bundled open-source fallbacks are Aref Ruqaa for display and Noto Kufi Arabic for functional UI. Brand colors were sampled/approximated from the supplied burgundy, carpet, sand, cream, and copper artwork.

## Known limitations

- A remote Supabase project and Vercel production are not connected by this repository alone.
- The Wamda Edge Function keeps one invocation open for at most seven seconds. Test this on the chosen Supabase plan before the event.
- Presence is approximate and includes open stage/admin clients in the channel.
- Full database behavioral/concurrency tests require a local Supabase/Docker stack; frontend unit/build checks do not replace that rehearsal.
- The legacy OpenAPI/Express demo contract is retained for provenance but is not the event backend.
