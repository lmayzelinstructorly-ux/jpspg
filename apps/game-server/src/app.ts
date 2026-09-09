import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Server } from "socket.io";
import { randomInt, randomUUID } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import {
  DEFAULT_AVATAR,
  passwordSchema,
  registerSchema,
  type Profile,
} from "../../../packages/shared/src/index.js";
import { GameEngine } from "./engine.js";
import { Store, type Entity } from "./store.js";
import {
  hash,
  hashPassword,
  readTicket,
  ticket,
  token,
  verifyPassword,
} from "./security.js";

type Account = Profile &
  Entity & { passwordHash: string; recoveryHash: string };
export async function createApp(
  options: { store?: Store; test?: boolean } = {},
) {
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  )
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  const secret = process.env.SESSION_SECRET || token();
  const store =
    options.store ||
    new Store({
      remote: production || process.env.STORAGE_MODE === "supabase",
    });
  const engine = new GameEngine();
  const origins = (
    process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim());
  const app = Fastify({
    logger: !options.test,
    bodyLimit: 16384,
    trustProxy: production,
  });
  await app.register(cookie);
  await app.register(cors, { origin: origins, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  const io = new Server(app.server, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 16384,
  });
  const sockets = new Map<string, string>();
  const profile = (a: Account): Profile => ({
    id: a.id,
    handle: a.handle,
    avatar: a.avatar,
    createdAt: a.createdAt,
  });
  const clean = (s: string) => {
    const words = (process.env.BLOCKED_WORDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (words.some((w) => s.toLowerCase().includes(w.toLowerCase())))
      throw new Error("Please use different wording.");
    return s;
  };
  const sid = (req: any) => hash(req.cookies.jpspg_session || "");
  async function session(id: string) {
    const s = await store.get("sessions", id);
    if (!s || s.expires < Date.now()) return;
    return s;
  }
  async function current(req: any) {
    const s = await session(sid(req));
    const a = s && (await store.get<Account>("accounts", s.user));
    if (!a) {
      const e = new Error("Please sign in again.");
      (e as any).statusCode = 401;
      throw e;
    }
    return a;
  }
  async function blocked(a: string, b: string) {
    return !!(
      (await store.get("blocks", `${a}:${b}`)) ||
      (await store.get("blocks", `${b}:${a}`))
    );
  }
  async function friends(a: string, b: string) {
    return !!(await store.get("friends", [a, b].sort().join(":")));
  }
  async function requireFriend(a: string, b: string) {
    if ((await blocked(a, b)) || !(await friends(a, b)))
      throw new Error("Add this player as a friend first.");
  }
  async function signIn(a: Account, reply: any) {
    const raw = token(),
      id = hash(raw);
    await store.put("sessions", {
      id,
      user: a.id,
      expires: Date.now() + 7 * 86400000,
    });
    reply.setCookie("jpspg_session", raw, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });
    return { profile: profile(a), ticket: ticket(id, secret) };
  }
  async function revoke(user: string) {
    for (const s of await store.all("sessions"))
      if (s.user === user) await store.remove("sessions", s.id);
    for (const s of io.sockets.sockets.values())
      if (s.data.user === user) s.disconnect(true);
  }
  const changed = () => io.emit("social:changed");
  app.addHook("onRequest", async (req, reply) => {
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin))
        return reply.code(403).send({ error: "Origin not allowed" });
      if (production && !origin)
        return reply.code(403).send({ error: "Origin required" });
    }
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store");
    return payload;
  });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as any;
    const message = e instanceof z.ZodError ? e.issues[0]?.message : e.message;
    reply
      .code(e.statusCode || 400)
      .send({ error: message || "Something went wrong. Try again." });
  });
  app.get("/health", async () => ({ ok: true }));
  app.get("/ready", async () => {
    await store.get("settings", "health");
    return { ok: true };
  });
  app.get("/api/config", async () => ({
    minimumAge: Number(process.env.MINIMUM_AGE || 13),
    voice: process.env.VOICE_ENABLED === "true" && !!process.env.LIVEKIT_URL,
    local: !production,
  }));
  app.post(
    "/api/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const data = registerSchema.parse(req.body);
      clean(data.username);
      return store.transaction(async () => {
        const existing = await store.all<Account>("accounts");
        let handle = "";
        for (let i = 0; i < 10000; i++) {
          const candidate = `${data.username}#${randomInt(10000).toString().padStart(4, "0")}`;
          if (
            !existing.some(
              (a) => a.handle.toLowerCase() === candidate.toLowerCase(),
            )
          ) {
            handle = candidate;
            break;
          }
        }
        if (!handle)
          throw new Error("No tags available for this name. Choose another.");
        const recovery = token();
        const a: Account = {
          id: randomUUID(),
          handle,
          avatar: { ...DEFAULT_AVATAR },
          createdAt: Date.now(),
          passwordHash: await hashPassword(data.password),
          recoveryHash: hash(recovery),
        };
        await store.put("accounts", a);
        return { ...(await signIn(a, reply)), recoveryCode: recovery };
      });
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const data = z
        .object({ handle: z.string().max(30), password: z.string().max(128) })
        .parse(req.body);
      const a = (await store.all<Account>("accounts")).find(
        (a) => a.handle.toLowerCase() === data.handle.trim().toLowerCase(),
      );
      if (!a || !(await verifyPassword(data.password, a.passwordHash))) {
        if (!a) await hashPassword(data.password);
        throw new Error("Identity or password is incorrect.");
      }
      return signIn(a, reply);
    },
  );
  app.get("/api/session", async (req) => {
    const a = await current(req);
    return { profile: profile(a), ticket: ticket(sid(req), secret) };
  });
  app.post("/api/logout", async (req, reply) => {
    const s = await session(sid(req));
    await store.remove("sessions", sid(req));
    if (s) {
      for (const socket of io.sockets.sockets.values())
        if (socket.data.session === sid(req)) socket.disconnect(true);
    }
    reply.clearCookie("jpspg_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/account/password", async (req) => {
    const a = await current(req);
    const d = z
      .object({ old: z.string(), password: passwordSchema })
      .parse(req.body);
    if (!(await verifyPassword(d.old, a.passwordHash)))
      throw new Error("Current password is incorrect.");
    a.passwordHash = await hashPassword(d.password);
    await store.put("accounts", a);
    await revoke(a.id);
    return { ok: true };
  });
  app.post(
    "/api/account/recover",
    { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } },
    async (req) => {
      const d = z
        .object({
          handle: z.string().max(30),
          code: z.string().max(100),
          password: passwordSchema,
        })
        .parse(req.body);
      const a = (await store.all<Account>("accounts")).find(
        (a) => a.handle.toLowerCase() === d.handle.toLowerCase(),
      );
      if (!a || a.recoveryHash !== hash(d.code))
        throw new Error("Recovery details are incorrect.");
      const code = token();
      a.passwordHash = await hashPassword(d.password);
      a.recoveryHash = hash(code);
      await store.put("accounts", a);
      await revoke(a.id);
      return { recoveryCode: code };
    },
  );
  app.post("/api/account/delete", async (req) => {
    const a = await current(req);
    const d = z.object({ password: z.string() }).parse(req.body);
    if (!(await verifyPassword(d.password, a.passwordHash)))
      throw new Error("Password is incorrect.");
    await revoke(a.id);
    engine.leave(a.id);
    await store.transaction(async () => {
      for (const kind of [
        "friends",
        "requests",
        "blocks",
        "messages",
        "parties",
        "conversations",
        "reports",
      ])
        for (const row of await store.all(kind)) {
          if (kind === "conversations" || kind === "parties") {
            if (row.members?.includes(a.id)) {
              row.members = row.members.filter((id: string) => id !== a.id);
              if (!row.members.length) await store.remove(kind, row.id);
              else {
                if (row.owner === a.id) row.owner = row.members[0];
                await store.put(kind, row);
              }
            }
          } else if (
            row.from === a.id ||
            row.to === a.id ||
            row.user === a.id ||
            row.members?.includes(a.id)
          )
            await store.remove(kind, row.id);
        }
      await store.remove("accounts", a.id);
    });
    changed();
    return { ok: true };
  });
  app.patch("/api/profile", async (req) => {
    const a = await current(req);
    const avatar = z
      .object({
        skin: z.string().regex(/^#[0-9a-f]{6}$/i),
        shirt: z.string().regex(/^#[0-9a-f]{6}$/i),
        hair: z.string().regex(/^#[0-9a-f]{6}$/i),
        style: z.number().int().min(0).max(2),
      })
      .parse(req.body);
    a.avatar = avatar;
    await store.put("accounts", a);
    const p = engine.find(a.id)?.players.find((p) => p.id === a.id);
    if (p) p.avatar = avatar;
    changed();
    return profile(a);
  });
  app.get("/api/social", async (req) => {
    const a = await current(req);
    const accounts = await store.all<Account>("accounts");
    const fs = (await store.all("friends")).filter((f) =>
      f.members.includes(a.id),
    );
    const ids = fs.flatMap((f) => f.members).filter((id) => id !== a.id);
    const requests = (await store.all("requests")).filter(
      (r) => r.from === a.id || r.to === a.id,
    );
    const parties = (await store.all("parties")).filter(
      (p) => p.members.includes(a.id) || p.invites.includes(a.id),
    );
    const conversations = (await store.all("conversations")).filter((c) =>
      c.members.includes(a.id),
    );
    const messages = await store.all("messages");
    const relevant = new Set([
      ...ids,
      ...requests.flatMap((r) => [r.from, r.to]),
      ...parties.flatMap((p) => p.members),
      ...conversations.flatMap((c) => c.members),
    ]);
    return {
      friends: ids,
      profiles: accounts
        .filter((x) => relevant.has(x.id) || x.id === a.id)
        .map((x) => ({
          ...profile(x),
          status: sockets.has(x.id)
            ? engine.find(x.id)?.game === "hub"
              ? "online"
              : "in-game"
            : "offline",
        })),
      requests,
      parties,
      conversations: conversations.map((c) => ({
        ...c,
        unread: messages.filter(
          (m) =>
            m.conversation === c.id &&
            m.from !== a.id &&
            m.at > (c.read?.[a.id] || 0),
        ).length,
      })),
      blocks: (await store.all("blocks"))
        .filter((b) => b.from === a.id)
        .map((b) => b.to),
    };
  });
  app.post("/api/friends/request", async (req) => {
    const a = await current(req);
    const { handle } = z
      .object({ handle: z.string().min(7).max(30) })
      .parse(req.body);
    return store.transaction(async () => {
      const b = (await store.all<Account>("accounts")).find(
        (x) => x.handle.toLowerCase() === handle.trim().toLowerCase(),
      );
      if (!b || b.id === a.id || (await blocked(a.id, b.id)))
        throw new Error("Player not available.");
      if (await friends(a.id, b.id))
        throw new Error("You are already friends.");
      const id = [a.id, b.id].sort().join(":");
      if (await store.get("requests", id))
        throw new Error("A request is already pending.");
      await store.put("requests", { id, from: a.id, to: b.id, at: Date.now() });
      changed();
      return { ok: true };
    });
  });
  app.post("/api/friends/respond", async (req) => {
    const a = await current(req);
    const { id, accept } = z
      .object({ id: z.string(), accept: z.boolean() })
      .parse(req.body);
    return store.transaction(async () => {
      const r = await store.get("requests", id);
      if (!r || r.to !== a.id) throw new Error("Request unavailable.");
      if (accept && !(await blocked(r.from, r.to)))
        await store.put("friends", { id: r.id, members: [r.from, r.to] });
      await store.remove("requests", id);
      changed();
      return { ok: true };
    });
  });
  app.post("/api/friends/remove", async (req) => {
    const a = await current(req);
    const { user } = z.object({ user: z.string() }).parse(req.body);
    await store.remove("friends", [a.id, user].sort().join(":"));
    await store.remove("requests", [a.id, user].sort().join(":"));
    changed();
    return { ok: true };
  });
  app.post("/api/block", async (req) => {
    const a = await current(req);
    const { user, blocked: enabled } = z
      .object({ user: z.string(), blocked: z.boolean() })
      .parse(req.body);
    if (user === a.id) throw new Error("Choose another player.");
    if (enabled) {
      await store.put("blocks", {
        id: `${a.id}:${user}`,
        from: a.id,
        to: user,
      });
      await store.remove("friends", [a.id, user].sort().join(":"));
      await store.remove("requests", [a.id, user].sort().join(":"));
    } else await store.remove("blocks", `${a.id}:${user}`);
    changed();
    return { ok: true };
  });
  app.post("/api/conversations", async (req) => {
    const a = await current(req);
    const d = z
      .object({
        members: z.array(z.string()).min(1).max(7),
        name: z.string().trim().max(40).default(""),
        group: z.boolean().default(false),
      })
      .parse(req.body);
    return store.transaction(async () => {
      const members = [...new Set([a.id, ...d.members])];
      for (const id of members) if (id !== a.id) await requireFriend(a.id, id);
      for (const x of members)
        for (const y of members)
          if (x !== y && (await blocked(x, y)))
            throw new Error("Some members cannot share a conversation.");
      if (!d.group && members.length === 2) {
        const existing = (await store.all("conversations")).find(
          (c) =>
            !c.group &&
            c.members.length === 2 &&
            members.every((x) => c.members.includes(x)),
        );
        if (existing) return existing;
      }
      const c = {
        id: randomUUID(),
        owner: a.id,
        members,
        name: clean(d.name),
        group: d.group,
        read: {},
        at: Date.now(),
      };
      await store.put("conversations", c);
      changed();
      return c;
    });
  });
  app.patch("/api/conversations/:id", async (req) => {
    const a = await current(req);
    const { id } = req.params as any;
    const d = z
      .object({
        name: z.string().trim().max(40).optional(),
        add: z.string().optional(),
        remove: z.string().optional(),
      })
      .parse(req.body);
    return store.transaction(async () => {
      const c = await store.get("conversations", id);
      if (!c || !c.members.includes(a.id) || !c.group)
        throw new Error("Group unavailable.");
      if (c.owner !== a.id && d.remove !== a.id)
        throw new Error("Only the group owner can edit this.");
      if (d.name !== undefined) c.name = clean(d.name);
      if (d.add) {
        await requireFriend(a.id, d.add);
        if (c.members.length >= 8) throw new Error("Group is full.");
        for (const id of c.members)
          if (await blocked(id, d.add)) throw new Error("Player unavailable.");
        c.members = [...new Set([...c.members, d.add])];
      }
      if (d.remove) c.members = c.members.filter((x: string) => x !== d.remove);
      if (!c.members.length) await store.remove("conversations", id);
      else {
        if (!c.members.includes(c.owner)) c.owner = c.members[0];
        await store.put("conversations", c);
      }
      changed();
      return { ok: true };
    });
  });
  app.get("/api/conversations/:id/messages", async (req) => {
    const a = await current(req);
    const { id } = req.params as any;
    const c = await store.get("conversations", id);
    if (!c || !c.members.includes(a.id))
      throw new Error("Conversation unavailable.");
    const before = Number((req.query as any).before) || Infinity;
    const blocks = await store.all("blocks");
    const hidden = new Set(
      blocks
        .filter((b) => b.from === a.id || b.to === a.id)
        .flatMap((b) => [b.from, b.to])
        .filter((x) => x !== a.id),
    );
    return (await store.all("messages"))
      .filter(
        (m) => m.conversation === id && m.at < before && !hidden.has(m.from),
      )
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .reverse();
  });
  app.post("/api/conversations/:id/read", async (req) => {
    const a = await current(req);
    return store.transaction(async () => {
      const c = await store.get("conversations", (req.params as any).id);
      if (!c || !c.members.includes(a.id))
        throw new Error("Conversation unavailable.");
      c.read = { ...c.read, [a.id]: Date.now() };
      await store.put("conversations", c);
      return { ok: true };
    });
  });
  app.post(
    "/api/conversations/:id/messages",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const a = await current(req);
      const { text } = z
        .object({ text: z.string().trim().min(1).max(1000) })
        .parse(req.body);
      const id = (req.params as any).id;
      const c = await store.get("conversations", id);
      if (!c || !c.members.includes(a.id))
        throw new Error("Conversation unavailable.");
      for (const m of c.members)
        if (m !== a.id && (await blocked(a.id, m)))
          throw new Error("Messaging is unavailable with a blocked member.");
      const message = {
        id: randomUUID(),
        conversation: id,
        from: a.id,
        text: clean(text),
        at: Date.now(),
      };
      await store.put("messages", message);
      changed();
      return message;
    },
  );
  app.post("/api/parties", async (req) => {
    const a = await current(req);
    return store.transaction(async () => {
      if ((await store.all("parties")).some((p) => p.members.includes(a.id)))
        throw new Error("Leave your current party first.");
      const p = {
        id: randomUUID(),
        owner: a.id,
        members: [a.id],
        invites: [],
        room: null,
        at: Date.now(),
        chat: [],
      };
      await store.put("parties", p);
      changed();
      return p;
    });
  });
  app.post("/api/parties/:id/action", async (req) => {
    const a = await current(req);
    const d = z
      .object({
        action: z.enum([
          "invite",
          "accept",
          "decline",
          "leave",
          "kick",
          "transfer",
          "disband",
          "chat",
          "room",
        ]),
        user: z.string().optional(),
        text: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    return store.transaction(async () => {
      const p = await store.get("parties", (req.params as any).id);
      if (!p) throw new Error("Party unavailable.");
      const member = p.members.includes(a.id);
      const owner = p.owner === a.id;
      if (d.action === "accept") {
        if (!p.invites.includes(a.id))
          throw new Error("Invitation unavailable.");
        if (p.members.length >= 8) throw new Error("Party full.");
        if ((await store.all("parties")).some((x) => x.members.includes(a.id)))
          throw new Error("Leave your current party first.");
        for (const id of p.members)
          if (await blocked(id, a.id)) throw new Error("Party unavailable.");
        p.members.push(a.id);
        p.invites = p.invites.filter((x: string) => x !== a.id);
      } else if (d.action === "decline") {
        p.invites = p.invites.filter((x: string) => x !== a.id);
      } else {
        if (!member) throw new Error("Join this party first.");
        if (d.action === "invite") {
          if (!d.user) throw new Error("Choose a friend.");
          await requireFriend(a.id, d.user);
          p.invites = [...new Set([...p.invites, d.user])];
        } else if (d.action === "leave")
          p.members = p.members.filter((x: string) => x !== a.id);
        else if (d.action === "chat") {
          if (!d.text) throw new Error("Write a message.");
          p.chat = [
            ...p.chat,
            {
              id: randomUUID(),
              from: a.id,
              text: clean(d.text),
              at: Date.now(),
            },
          ].slice(-50);
        } else {
          if (!owner) throw new Error("Only the party leader can do that.");
          if (d.action === "kick")
            p.members = p.members.filter((x: string) => x !== d.user);
          if (d.action === "transfer") {
            if (!p.members.includes(d.user))
              throw new Error("Choose a party member.");
            p.owner = d.user;
          }
          if (d.action === "disband") p.members = [];
          if (d.action === "room") {
            const room = engine.find(a.id);
            if (!room || room.game === "hub")
              throw new Error("Create a game room first.");
            p.room = room.code;
          }
        }
      }
      if (!p.members.length) await store.remove("parties", p.id);
      else {
        if (!p.members.includes(p.owner)) p.owner = p.members[0];
        await store.put("parties", p);
      }
      changed();
      return { ok: true };
    });
  });
  app.post(
    "/api/report",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const a = await current(req);
      const d = z
        .object({
          user: z.string(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(req.body);
      await store.put("reports", {
        id: randomUUID(),
        from: a.id,
        to: d.user,
        reason: d.reason,
        at: Date.now(),
      });
      app.log.info(
        { event: "report_created", reporter: a.id },
        "Moderation report",
      );
      return { ok: true };
    },
  );
  app.get("/api/rooms", async (req) => {
    await current(req);
    return [...engine.rooms.values()]
      .filter((r) => r.public && r.game !== "hub" && r.phase === "lobby")
      .map((r) => ({
        code: r.code,
        game: r.game,
        count: r.players.length,
        mode: r.mode,
      }));
  });
  app.post("/api/voice/token", async (req) => {
    const a = await current(req);
    const room = engine.find(a.id);
    if (!room) throw new Error("Join a room before enabling voice.");
    if (
      process.env.VOICE_ENABLED !== "true" ||
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET ||
      !process.env.LIVEKIT_URL
    )
      throw new Error("Voice is unavailable. Text chat and games still work.");
    const t = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: a.id, name: a.handle, ttl: "10m" },
    );
    t.addGrant({
      room: room.code,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
    });
    return { url: process.env.LIVEKIT_URL, token: await t.toJwt() };
  });
  io.use(async (socket, next) => {
    try {
      const id = readTicket(socket.handshake.auth.ticket || "", secret);
      const s = id && (await session(id));
      if (!s) return next(new Error("Please sign in again."));
      socket.data.user = s.user;
      socket.data.session = id;
      next();
    } catch {
      next(new Error("Connection unavailable"));
    }
  });
  io.on("connection", async (socket) => {
    const id = socket.data.user;
    const previous = sockets.get(id);
    if (previous && previous !== socket.id)
      io.sockets.sockets.get(previous)?.disconnect(true);
    sockets.set(id, socket.id);
    const a = await store.get<Account>("accounts", id);
    if (!a) return socket.disconnect(true);
    const existing = engine.find(id);
    const r = engine.join(existing?.code || "PLAZA", profile(a));
    socket.join(r.code);
    socket.emit("room", engine.snapshot(r));
    changed();
    let budget = 0;
    let window = Date.now();
    const limited = () => {
      if (Date.now() - window > 1000) {
        budget = 0;
        window = Date.now();
      }
      return ++budget > 65;
    };
    socket.on("input", (raw) => {
      if (!limited()) engine.input(id, raw);
    });
    socket.on("ping:check", (cb) => {
      if (typeof cb === "function") cb();
    });
    socket.on("command", async (raw, ack) => {
      try {
        if (limited()) throw new Error("Too many actions.");
        if (!(await session(socket.data.session)))
          throw new Error("Please sign in again.");
        const d = z
          .object({
            action: z.enum([
              "create",
              "join",
              "hub",
              "ready",
              "team",
              "start",
              "rematch",
              "mode",
              "walls",
              "emote",
            ]),
            code: z.string().max(6).optional(),
            game: z.enum(["basketball", "soccer"]).optional(),
            public: z.boolean().optional(),
            value: z.union([z.boolean(), z.number(), z.string()]).optional(),
          })
          .parse(raw);
        const before = engine.find(id);
        if (d.action === "create") {
          if (!d.game) throw new Error("Choose a game.");
          const room = engine.create(d.game, id, d.public);
          engine.join(room.code, profile(a));
        } else if (d.action === "join" || d.action === "hub") {
          const code = d.action === "hub" ? "PLAZA" : d.code || "";
          const room = engine.rooms.get(code);
          if (room)
            for (const p of room.players)
              if (await blocked(id, p.id)) throw new Error("Room unavailable.");
          engine.join(code, profile(a));
        } else if (d.action === "ready")
          engine.configure(id, { ready: z.boolean().parse(d.value) });
        else if (d.action === "team")
          engine.configure(id, {
            team: z.union([z.literal(0), z.literal(1)]).parse(d.value),
          });
        else if (d.action === "start") engine.start(id);
        else if (d.action === "rematch") engine.rematch(id);
        else if (d.action === "mode")
          engine.configure(id, {
            mode: z.enum(["quick", "timed"]).parse(d.value),
          });
        else if (d.action === "walls")
          engine.configure(id, { walls: z.boolean().parse(d.value) });
        else if (d.action === "emote") {
          const p = engine.find(id)?.players.find((p) => p.id === id);
          if (p) p.emote = z.enum(["wave", "cheer", "dance"]).parse(d.value);
        }
        const room = engine.find(id)!;
        if (before?.code !== room.code) {
          if (before) socket.leave(before.code);
          socket.join(room.code);
        }
        socket.emit("room", engine.snapshot(room));
        changed();
        if (typeof ack === "function") ack({ ok: true });
      } catch (e) {
        if (typeof ack === "function") ack({ error: (e as Error).message });
      }
    });
    socket.on("room:chat", async (raw, ack) => {
      try {
        if (limited()) throw new Error("Slow down a little.");
        const text = z.string().trim().min(1).max(300).parse(raw);
        const room = engine.find(id);
        if (!room) throw new Error("Join a room first.");
        if (Date.now() - (socket.data.lastChat || 0) < 1000)
          throw new Error("Wait a moment before sending again.");
        socket.data.lastChat = Date.now();
        const m = {
          id: randomUUID(),
          from: id,
          handle: a.handle,
          text: clean(text),
          at: Date.now(),
        };
        for (const p of room.players)
          if (!(await blocked(id, p.id))) {
            const sid = sockets.get(p.id);
            if (sid) io.to(sid).emit("room:chat", m);
          }
        if (typeof ack === "function") ack({ ok: true });
      } catch (e) {
        if (typeof ack === "function") ack({ error: (e as Error).message });
      }
    });
    socket.on("disconnect", () => {
      if (sockets.get(id) === socket.id) {
        sockets.delete(id);
        engine.disconnect(id);
        changed();
      }
    });
  });
  let ticks = 0;
  const savedResults = new Set<string>();
  const loop = setInterval(() => {
    engine.tick();
    if (++ticks % 2 === 0)
      for (const r of engine.rooms.values()) {
        io.to(r.code).emit("snapshot", engine.snapshot(r));
        const key = `${r.code}:${r.createdAt}:${r.score.join("-")}`;
        if (r.phase === "finished" && !savedResults.has(key)) {
          savedResults.add(key);
          store
            .put("results", {
              id: randomUUID(),
              room: r.code,
              game: r.game,
              score: r.score,
              players: r.players.map((p) => p.id),
              at: Date.now(),
            })
            .catch((e) => app.log.error(e));
        }
      }
  }, 1000 / 30);
  const maintenance = setInterval(async () => {
    try {
      for (const s of await store.all("sessions"))
        if (s.expires < Date.now()) await store.remove("sessions", s.id);
      const cutoff =
        Date.now() - Number(process.env.CHAT_RETENTION_DAYS || 90) * 86400000;
      for (const m of await store.all("messages"))
        if (m.at < cutoff) await store.remove("messages", m.id);
      for (const s of io.sockets.sockets.values())
        if (!(await session(s.data.session))) s.disconnect(true);
    } catch (e) {
      app.log.error(e);
    }
  }, 60000);
  app.addHook("onClose", async () => {
    clearInterval(loop);
    clearInterval(maintenance);
    io.disconnectSockets();
    io.close();
    store.close();
  });
  return { app, io, engine, store };
}
