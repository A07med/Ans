# Implementation audit

Audit performed against commit `9131bdd` before implementation.

## Working and preserved

- Required React routes existed: `/join`, `/play`, `/admin`, `/admin/login`, `/stage/alive`, `/stage/wamda`.
- `/play` already switched its displayed experience from one event-state object.
- Public navigation no longer exposed manual Admin/Play destinations.
- Winner selection and reveal were represented as separate organizer actions.
- Supabase mode intentionally refused a silent UI fallback to the static demo state.
- Initial carpet-based palette, Arabic RTL support, stage compositions, generated API contract, and error boundary were useful foundations.

## Partially implemented

- Registration redirected to `/play`, but treated any local-storage JSON as valid.
- Oman phone input existed without canonical normalization or uniqueness enforcement in the running backend.
- Stage and participant views refreshed aggregate state, but did not use Supabase Realtime or safe private rehydration.
- The initial migration had tables and RLS enabled, but no policies or protected RPCs.
- The admin dashboard had useful controls and metrics, but no server authorization, destructive confirmations, result review, presence, or reliable status.
- The visual direction had a carpet derivative, but the background crop contained poster lettering and the major brand name was recreated as text.

## Demo only / unsafe for a live event

- Express state, participants, rounds, logs, and attempts lived only in one server process.
- Admin access accepted any four-character value and stored a boolean in local storage.
- Participant identity relied on local storage without backend validation.
- Wamda session and signal IDs were generated with `Date.now()` in the participant browser.
- Stay Alive changed only aggregate counts; it did not persist per-participant eligibility or select survivors.
- Demo winners were hardcoded names.
- Wamda accepted duplicate, negative, wrong-session, wrong-signal, stale, and replayed submissions.
- No RLS policy protected phone numbers, attempts, logs, or event mutations.

## Missing

- Supabase JS client, Auth allow-list, participant session table, protected RPCs, Realtime, Presence, signal scheduler, integrity flags, deterministic tie-break, admin result review, security tests, QR, Vercel SPA rewrite, complete runbook, and event-mode setup documentation.

## Replit-specific

- Root `@replit/connectors-sdk`, three Replit Vite plugins, `REPL_ID` branches, mandatory `BASE_PATH`/`PORT`, platform-specific pnpm overrides, and Replit metadata in page descriptions.

## Resolution

The release-candidate branch replaces each unsafe/missing live path with the Supabase implementation documented in the repository, while retaining the route structure, the useful demo mode, and the original supplied identity sources. The legacy Express/OpenAPI packages remain only as non-production provenance and continue to typecheck/build without Replit variables.
