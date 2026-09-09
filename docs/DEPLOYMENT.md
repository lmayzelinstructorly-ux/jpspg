# Free hosting deployment

This guide assumes a personal, non-commercial prototype. The account owner must select free plans and review the providers' current quotas. Never opt into a trial that auto-converts or enable paid usage without deciding to do so. A free tier is not an uptime or player-capacity guarantee.

## 1. Supabase database

1. Create a free Supabase project in a region near the Render server.
2. Open the SQL editor. Run `supabase/migrations/202609090001_records.sql`, then optionally `supabase/seed.sql`.
3. Obtain the project URL and server-only service-role key from project settings. Add them only to the Render server's secret environment values.
4. The schema denies all anonymous/authenticated Data API access. Test with the public key: it must not expose `jpspg_records`.
5. This implementation uses its own username/password authentication, so it does **not** configure Supabase email redirects or synthetic email accounts. Supabase stores the hashed accounts and sessions, protected behind the server's authorization layer.
6. A paused free project must be resumed from the Supabase dashboard. The app reports a temporary database failure; it does not erase accounts or silently switch production to SQLite.

## 2. Render game server

1. Push the repository to your own Git provider account. Do not commit `.env`, `.local`, test output or credentials.
2. In Render, create a Blueprint from `render.yaml`, or a Node web service using its build/start commands.
3. Confirm the service instance plan is **Free**. Use one instance only.
4. Add server environment variables below. Set `ALLOWED_ORIGINS` to the exact Vercel production origin once available. Comma-separate any additional explicitly trusted origins. Do not use `*`.
5. Keep `VOICE_ENABLED=false` initially. LiveKit values may remain unset when disabled.
6. Deploy and verify `/health` and `/ready`. `/ready` also checks the database path.
7. Save the actual `https://…onrender.com` address.

Production refuses missing Supabase credentials and a missing/short session secret. Render's ephemeral filesystem is never used for production persistence.

## 3. Vercel Hobby client

1. Replace `REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com` in `vercel.json` with your real Render hostname. It is an explicit configuration value, not an interpolated environment variable.
2. Import the repository into a personal Vercel Hobby project. Keep the **repository root** as the Root Directory because the Vite configuration lives there.
3. The checked-in configuration specifies `pnpm install --frozen-lockfile`, `pnpm exec vite build`, and output `dist/client`.
4. Set `VITE_GAME_SERVER_URL` to the exact Render HTTPS origin. Set `VITE_SITE_URL` to the Vercel production HTTPS origin.
5. Deploy. A project name such as `jpspg` may be unavailable; use the actual generated `.vercel.app` URL.
6. Add that exact origin to Render's `ALLOWED_ORIGINS` and redeploy the server if needed.
7. Confirm registration/session cookies through the same-origin `/api` rewrite. The browser never receives the HTTP-only session token. Socket.IO receives a short-lived signed ticket through the authenticated session endpoint and connects directly to Render.
8. Verify two independent browsers can become friends, message, join one room and finish both games.

The browser requires HTTPS for microphone access. Vercel supplies TLS for supported project domains. Game traffic is direct to Render; Vercel is not the persistent simulation server.

## 4. Optional LiveKit voice

1. Create a free LiveKit Cloud project, not an AI agent deployment. This app uses WebRTC audio transport only.
2. Put `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in Render's secret variables; set `VOICE_ENABLED=true`.
3. The app issues microphone-only, room-scoped, short-lived grants after session validation and actual game-room membership checks.
4. Test microphone permission denial and a disconnected provider. Text and games must continue.
5. Test two users at different distances. Check mute, deafen, push-to-talk, volume, blocking and room exit.
6. Watch the provider's participant-minute and transfer dashboards. Disable `VOICE_ENABLED` if allowances become unavailable. Do not enable automatic paid overages.

Current prototype audio uses distance attenuation rather than guaranteed server-enforced inaudibility or stereo panning. A modified client might hear subscribed audio beyond the UI radius; proximity is a game effect, not a private conversation guarantee. No recording/egress is requested.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_GAME_SERVER_URL` | Vercel | Public Render HTTPS URL |
| `VITE_SITE_URL` | Vercel | Canonical website origin |
| `PORT` | Render | Provided by host; local default 3001 |
| `NODE_ENV` | Render | `production` |
| `STORAGE_MODE` | Render | `supabase` |
| `SESSION_SECRET` | Render secret | At least 32 random characters |
| `SUPABASE_URL` | Render | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Render secret | Server database credentials |
| `ALLOWED_ORIGINS` | Render | Exact comma-separated trusted website origins |
| `VOICE_ENABLED` | Render | `false` initially |
| `LIVEKIT_URL` | Render | Optional `wss://…livekit.cloud` origin |
| `LIVEKIT_API_KEY` | Render secret | Optional voice key |
| `LIVEKIT_API_SECRET` | Render secret | Optional voice secret |
| `MINIMUM_AGE` | Render | Operator-reviewed minimum; initial 13 |
| `CHAT_RETENTION_DAYS` | Render | Message retention; initial 90 |
| `BLOCKED_WORDS` | Render | Optional comma-separated moderation terms |
| `LOCAL_DB_PATH` | Local only | SQLite path; default `.local/jpspg.sqlite` |

Never use a `VITE_` prefix for a secret. Vite exposes those values to users.

## 5. Connect jpspg.net later

1. Acquire the domain only after checking ownership/availability and intentionally approving the cost.
2. Add `jpspg.net` and `www.jpspg.net` under Vercel project Settings → Domains.
3. Copy the **exact current DNS record values shown by Vercel** into the registrar's DNS editor. Use the apex A/ALIAS instructions for `@`, and the CNAME instructions for `www`. Do not assume a fixed IP from an old tutorial.
4. Preserve unrelated mail and verification records.
5. Wait for Vercel to verify DNS and issue HTTPS certificates.
6. Choose `jpspg.net` as primary and redirect `www` to it.
7. Update `VITE_SITE_URL`, Render allowed origins, and the generated sitemap/canonical URL. Supabase Auth redirect URLs are not used by this implementation. Review any explicit LiveKit origin restrictions you configured in its dashboard.
8. Redeploy and test sign-in, WebSockets and microphone access again.

Search-engine indexing is neither immediate nor guaranteed. User profiles and messages are not public crawlable content.

## Staging and rollback

Use a separate Vercel project and database for staging when free quotas permit. Do not connect arbitrary preview origins to the production API or database. Restore a previous tested Vercel deployment or Render commit for rollback; a rollback does not roll back the database. Keep migrations additive and back up before schema changes.

## Backups and restores

Free database tiers may lack automatic backups. Export `jpspg_records` with a secure Postgres backup tool or Supabase-supported export before important releases. Keep dumps encrypted with restricted access; they contain password hashes and messages. Restore into a separate test database first, verify row counts and sign-in, then intentionally change production credentials. SQLite local backups can be made while the local server is stopped, including its WAL state if it was not cleanly shut down.

## Quotas to check before launch

- [Vercel Hobby](https://vercel.com/docs/plans/hobby): personal/non-commercial restrictions, requests, transfer and build quotas.
- [Render free services](https://render.com/docs/free): idle sleep, cold start, restart behavior, shared compute, monthly hours and transfer. Do not use Render's expiring free Postgres as the permanent account database.
- [Supabase pricing](https://supabase.com/pricing): database size, egress, inactivity pause and backups.
- [LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/): voice minutes, participants and data transfer.

This prototype does not measure cloud-wide usage from provider billing APIs. Hard service limits and provider dashboards are the cost boundary. Never assume one small-room cap limits aggregate traffic across many rooms.
