# Prototype status and roadmap

The implementation is a playable starting release, not a production-scale sports simulator. Deployment and live-provider verification require the owner's accounts/credentials.

## Implemented

- Original 3D clubhouse, basketball half court, compact soccer pitch, rounded procedural avatars and simple accessories.
- Server-controlled movement, ball possession, passing, shooting, steals/tackles, score and clocks; client snapshot interpolation.
- Basketball timing meter, layups, two/three-point shots, missed-shot rebounds, shot-clock turnovers and first-to-11/timed rules.
- Soccer directional charged shots, passes, elementary goalkeepers, goal/kickoff logic, wall/throw-in setting and first-to-five/timed rules.
- Registration, unique name tags, secure password hashing, HTTP-only cookie sessions, short-lived socket tickets, password change, single-use recovery codes and account deletion.
- Friend requests, acceptance/decline/cancel/removal, DMs, group creation/rename/membership, unread counts, message history, blocking and reports.
- Parties, invitations, leader transfer, kick/leave/disband, party chat and shared room code.
- Public/private coded rooms, team selection, readiness, leader-only starts, rematch and reconnect grace period.
- Optional LiveKit microphone audio, distance gain, mute/deafen/push-to-talk and player volume controls. Voice-disabled behavior is functional without credentials.
- Graphics settings, reduced motion, key remapping, camera modes, effect/voice volume, lightweight generated assets and accessible forms.
- Local persistent repository and Supabase server-only repository, RLS migration, Vercel/Render configurations and CI.

## Material limitations

- No public deployment or cloud database/voice test is implied by local test success. DNS, provider quotas, TLS cookie proxying and real-device audio must be checked after provisioning.
- The Supabase repository reads entity collections up to 10,000 records. This is deliberately a small-prototype design. Replace scans with indexed pagination/RPCs and transactional multi-record writes before growth. Its serialized mutation queue is single-process only; multi-instance hosting is unsupported.
- DMs/social depend on the same Render API and therefore can also wait during a cold start. Text remains an alternative when **voice** fails, not when the entire API/database is unreachable.
- Match rooms are memory-only. A process restart loses in-progress matches and returns players to the hub after reconnect. Completed results are persisted separately on a best-effort basis.
- Physics and sports rules are intentionally arcade-level: no fouls, advanced blocking animations, competitive lag compensation, collision avoidance, offside or complex throw-ins. A throw-in resets possession rather than animating a formal throw.
- Avatar running and gestures are basic procedural motion; dedicated pass/kick/shoot/celebration animation clips are not all implemented. Jump, call-for-pass, teammate switch, custom shoes/pants, FOV slider, FPS cap, background music and typing indicators are follow-up work.
- Camera input is keyboard/drag based; mobile gameplay and actual VR headset support are not provided.
- Audio attenuation is client-side and is not a privacy boundary. Stereo positional panning and server subscription controls need follow-up. Blocking affects application chat/invites and sets local voice gain to zero; it cannot prevent malicious modified clients from listening to an already subscribed voice track.
- An operator must actively review reports. Moderation filtering is configurable but has no curated production word list, automated sanction service or staffed review queue. Policy pages are drafts.
- A minimum-age checkbox is a basic gate, not age verification or a compliance determination.
- Registration has no email verification. Recovery depends on saving the single-use recovery code; lost passwords plus lost codes cannot currently be recovered by email.
- Real MacBook/Safari performance has not been measured on this Windows machine. Browser tests use Chromium software rendering, which does not establish actual laptop FPS.

## Launch checklist

- Configure actual provider URLs and secrets; remove the Vercel rewrite placeholder.
- Verify Supabase migration and anonymous-read denial.
- Test cookie security, logout, password change/recovery and unauthorized room/social access on the deployed domains.
- Run a two-device session for each sport; check latency, refresh, cold start and server restart.
- Verify actual microphone consent, denial, mute, distance, leaving and exhausted-provider behavior.
- Review age policy, privacy terms, retention, operator contact details and moderation handling before broad public access.
- Test a real school MacBook with its normal browser and network policy.
- Confirm all selected plans are free and that paid overages are disabled where supported.
- Schedule operator-owned backups and monitor provider usage dashboards.

## Next three releases

1. **Play feel:** stronger possession/ball collision, passing aim assist, shot feedback, goalie tuning, movement animation, configurable camera/FPS settings and real MacBook/Safari profiling.
2. **Social reliability:** indexed database queries, transactional social writes, recovery email, typing indicators, activity-driven realtime updates, refreshed room invitations and an operator moderation console.
3. **Public beta:** room subscription privacy, secure voice blocking/revocation, load tests, cross-region latency measurements, match recovery, stronger abuse controls and a consciously selected hosting budget if free limits are insufficient.
