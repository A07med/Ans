# أُنس Live — Event Night Runbook

This is the operator checklist. Keep one technical contact and one presenter on the same voice channel. Do not apply migrations, redeploy production, or use Full Event Reset during the live program.

## Before the event

1. Confirm the Vercel production deployment is green and uses `VITE_APP_MODE=supabase`.
2. Open the Supabase dashboard. Check Database, Auth, Realtime, and Edge Functions are healthy.
3. Open `/admin/login`, sign in, and confirm the top cards say `SUPABASE BACKEND`, `DATABASE AVAILABLE`, and `Realtime CONNECTED`.
4. Open `/stage/alive` and `/stage/wamda` in separate full-screen projector tabs. Keep both URLs bookmarked.
5. In Admin, inspect the QR. Confirm it resolves to the production `/join`, never a Replit or preview address.
6. On one real iPhone Safari and one Android Chrome device: register, reach `/play`, refresh, and confirm the same participant returns.
7. Run a full rehearsal with test registrations. Verify Stay Alive rounds, private selection, reveal, Wamda red/green, false start, valid response, result review, selection, and reveal.
8. Only after the rehearsal, perform the approved data reset. Re-register the two operator test phones and leave everyone in Lobby.

## Registration

1. Press **فتح التسجيل**.
2. Put the QR on the projector using the Admin QR card or a prepared holding slide.
3. Watch **المسجلون** and the approximate connected count.
4. Ask one attendee to confirm `/play` shows “تم تسجيلك”.
5. At the presenter’s cue press **إغلاق التسجيل**. Existing validated participants remain in `/play`; new registrations see the closed message.

## Run باقي معنا؟

1. Confirm the registered count is greater than zero and `/stage/alive` is on the projector.
2. Press **بدء اللعبة** once. Do not double-click.
3. Verify participant phones show “أنت معنا” and the stage shows the total.
4. Enter the next exact survivor target or use 75%, 50%, or 25%; read the before/after numbers aloud.
5. Press **الجولة التالية** once and wait for the count to settle before continuing.
6. Continue to 3. Give the presenter time to speak. Then run one final round from 3 to 1.
7. Press **اختيار الفائز**. This remains private; the stage and participant do not reveal the name.
8. On the presenter countdown press **كشف الفائز**.
9. If the selected winner is present, celebrate and confirm identity privately. Then press **إعادة الجميع للردهة**.

## Run وَمْضَة

1. Put `/stage/wamda` on the projector and press **فتح وَمْضَة**. Every registered participant is eligible, including people eliminated from Stay Alive.
2. Confirm phones show the large RED/idle reaction lamp and the stage says to wait.
3. Explain: tapping before green is a false start and allows no retry this round.
4. Press **تسليح الإشارة** once. The database chooses a hidden random 2–7 second delay. Do not count down.
5. GREEN appears immediately when the safe Realtime signal arrives. Allow 15 seconds for responses.
6. Press **إغلاق الاستجابات**.
7. Review valid results. Results are sorted by reaction time, server receipt time, then attempt ID. Inspect every amber integrity flag (under 120 ms or late submission).
8. If the fastest result is credible, press **اختيار** beside it and confirm. A flagged result is not automatically disqualified; use observation and operator judgment consistently.
9. At the presenter’s cue press **كشف الفائز**.
10. Press **إعادة الجميع للردهة** or end on the reveal as directed.

## End event

1. Close registration.
2. Leave the final approved scene on the projector.
3. Export or screenshot the Admin event log if the organizing team needs a record.
4. Do not delete participant data until the owner approves the retention plan.
5. Sign out of Admin on shared computers.

## Emergency procedures

### Admin refreshes or signs out

Refresh `/admin`; Supabase Auth restores the session and the dashboard fetches current database truth. If signed out, use `/admin/login`. Never repeat a round merely because the browser refreshed—check the displayed round and remaining count first.

### Stage refreshes or projector loses browser state

Reopen the exact bookmarked stage URL and enter full screen. It rehydrates authoritative state. Do not change game state just to repair the projector.

### Participant refreshes

Their opaque session token restores `/play`. If it is genuinely invalid or expired, they return to `/join`. If registration is closed, contact the technical operator; do not reopen registration casually during a game.

### Realtime shows DISCONNECTED

Pause presenter actions. The app performs a 15-second read recovery, but Wamda should not be armed without confirmed Realtime. Refresh the affected Admin/Stage tab. If Supabase Realtime status is degraded, continue with non-reaction program content and wait for recovery.

### Supabase temporarily fails

Do not switch production to Demo Mode; that would create a separate fake event. Stop game actions, keep the presenter on a holding segment, and watch Supabase status. When service returns, refresh Admin and both stages, confirm the authoritative round/session, then continue.

### Wamda green has a problem

If RED remains longer than 10 seconds, press **إلغاء التسليح** once. Do not accept responses from that signal. Check the `wamda-signal` Edge Function logs and Realtime. When healthy, use **إعادة ضبط وَمْضَة**, reopen it, explain that the prior signal was void, and run a new session.

### Winner phone disconnects

The selected result/state remains in PostgreSQL. The stage reveal still works. Ask the winner to refresh `/play`; the authoritative state rehydrates.

### Selected winner is physically absent

Do not reveal. For Wamda, review and select the next valid, physically present result. For Stay Alive, selection is restricted to the sole survivor, so the presenter should announce the verified winner even if their phone is offline; changing the winner requires an explicit organizer policy decision, not a technical workaround.

### Accidental action or double click

Wait and inspect the event log before doing anything else. Round request IDs and database locks prevent duplicate execution, but a second distinct deliberate action is still a new action. Use game reset only if the presenter and lead operator agree.

### Full Event Reset

This revokes sessions and deletes participant records. It requires typing `RESET ANAS`. Use it only during an owner-approved rehearsal reset, never as a live troubleshooting step.
