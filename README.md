# أُنس Live

أُنس Live is an Arabic-first live event experience for the College of Science Student Activities Group opening evening. It gives the audience one fast registration, keeps their phones synchronized to the event, and gives the operator two independent projector-ready games:

- **باقي معنا؟** — a suspenseful server-controlled survivor draw.
- **وَمْضَة** — a reaction-speed round where every registered participant is eligible again.

## Current preview

The Replit preview includes a lightweight in-memory development adapter so the complete participant, admin, and stage surfaces can be exercised before Supabase credentials are connected. It is intentionally not a production data store.

## Routes

- `/join` — one-time registration.
- `/play` — persistent participant experience.
- `/admin` — operator control room.
- `/admin/login` — admin access entry point.
- `/stage/alive` — 16:9 Stay Alive projector view.
- `/stage/wamda` — 16:9 Wamda projector view.

## Architecture

- React + Vite + TypeScript frontend.
- Express API contract defined in `lib/api-spec/openapi.yaml`.
- Generated client hooks live in `lib/api-client-react`.
- The current API server uses an in-memory adapter for preview behavior.
- The portable production data model is in `supabase/migrations/0001_anas_live.sql`.
- Supabase Realtime and protected RPC/Edge Functions are the intended production adapter.

Privileged raffle selection must run on the server or in a protected Supabase function. The browser must never choose winners with `Math.random()`. Wamda reaction timing uses the local monotonic clock for response measurement and server-side validation for eligibility, duplicate attempts, and integrity flags.

## Environment

Copy `.env.example` and set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never expose a Supabase service-role key in browser code.

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/anas-live run dev
```

The Replit workflows provide the correct `PORT` and `BASE_PATH` values for preview. For a portable Vite deployment, run the normal Vite commands from the `artifacts/anas-live` package.

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_anas_live.sql`.
3. Add the two public Vite environment variables.
4. Add a protected admin profile/allow-list and Supabase Auth.
5. Implement the game mutations as protected RPCs or Edge Functions.
6. Subscribe clients to the single event state and the current game session; rehydrate after reconnect.

## Admin access

The preview uses the admin route as a development control room. Production admin actions must be behind Supabase Auth and server-side authorization. A simple allow-listed admin profile is sufficient for the event.

## Demo mode and reset

The preview starts with representative event counts so stage compositions are visible immediately. Reset controls change only the in-memory preview state. For rehearsal, use the runbook and keep participant registration separate from game resets.

## Testing and build

```bash
pnpm run typecheck
pnpm --filter @workspace/anas-live run typecheck
pnpm --filter @workspace/anas-live run build
```

The project is a normal Vite app and can be downloaded, connected to Supabase, and deployed to Vercel without a Replit runtime dependency.