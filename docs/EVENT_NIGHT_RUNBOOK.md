# أُنس Live — Event Night Runbook

## Before the event

1. Apply the Supabase migration in `supabase/migrations/0001_anas_live.sql`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the deployment environment.
3. Open `/admin` on the operator laptop.
4. Open `/stage/alive` and `/stage/wamda` on the projector browsers.
5. Confirm both projector windows are fullscreen and readable from the back of the hall.
6. Scan the join QR from one phone and complete one test registration.
7. Confirm the participant phone reaches `/play`.
8. Enable sound only if the browser has been interacted with; the experience works without sound.

## Registration

1. In the admin control room choose **فتح التسجيل**.
2. Display the `/join` QR code.
3. Watch the registered and connected counts.
4. Close registration before starting the first game.

## Game 1 — باقي معنا؟

1. Choose **بدء باقي معنا؟**.
2. Use target counts such as 250, 100, 25, 10, and 3.
3. Pause if the presenter needs more time.
4. Select the final winner first, then reveal them when the presenter is ready.
5. Participants removed from this game remain eligible for وَمْضَة.

## Intermission

1. Return participants to the lobby.
2. Keep `/play` open; no second registration is needed.

## Game 2 — وَمْضَة

1. Choose **فتح وَمْضَة**.
2. Confirm the ready count.
3. Choose **تسليح**. The system waits for a server-triggered signal.
4. Close the round after responses settle.
5. Select the fastest valid result, then reveal it separately.
6. If there are no valid results, return to the lobby and repeat the round.

## Emergency fallback

If realtime temporarily fails, keep the stage screens open and refresh `/play` on participant devices. The current state is rehydrated from the server when the live adapter is enabled. Do not run an extra round while the admin action is still processing.

## Rehearsal reset

- Reset Stay Alive only: clears its round progression while keeping registration.
- Reset Wamda only: clears attempts while keeping registration.
- Full event reset: use only after a deliberate confirmation and before doors open.