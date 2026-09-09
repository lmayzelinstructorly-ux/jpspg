# JPSPG architecture

Vercel serves a static React/Vite client. Same-origin `/api` requests are rewritten to the Render service, preserving HTTP-only session cookies. The browser connects directly to Render for Socket.IO with short-lived signed access tickets. Supabase stores server-owned records behind default-deny RLS; no database secret or password hash reaches the browser. LiveKit provides optional voice.

Username-first authentication uses Node scrypt (N=65536, r=8, p=1; 64 MiB) with per-account salts. It does not invent email addresses to accommodate email-only authentication. Sessions are random, hashed at rest and revocable. SQLite supplies the same record repository locally; production refuses SQLite. Persistent records have separate keys and entity kinds rather than a single whole-database JSON snapshot. A serialized mutation queue provides single-server consistency; multi-instance deployment requires database transactions/RPCs and a shared room coordinator before scaling.

The server simulates at 30 Hz and publishes at 15 Hz. Clients submit bounded directional inputs and discrete action edges; positions and points are never accepted from clients. Each room caps players at 6 for basketball or 8 for soccer. Rooms and parties have distinct lifecycle and permission rules. A hub room provides shared avatar movement.

Original low-poly courts and avatars are rendered procedurally. The primary visual direction is a sky-blue clubhouse, ink typography, electric-lime actions and coral basketball accents. No downloaded commercial-game art.

Host choice follows the user's explicit Vercel/Render/Supabase/LiveKit requirement rather than the Sites plugin's Cloudflare hosting workflow.
