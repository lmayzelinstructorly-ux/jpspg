import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../apps/game-server/src/app";
import { Store } from "../apps/game-server/src/store";
import { io, type Socket } from "socket.io-client";
let server: Awaited<ReturnType<typeof createApp>>;
let a: any, b: any, c: any;
let ca = "",
  cb = "",
  cc = "";
let conversation = "",
  party = "";
let origin = "";
const sockets: Socket[] = [];
const request = async (
  path: string,
  body?: any,
  cookie = "",
  method?: "GET" | "POST" | "PATCH",
) =>
  server.app.inject({
    method: method || (body === undefined ? "GET" : "POST"),
    url: `/api${path}`,
    payload: body,
    headers: { cookie },
  });
const register = async (username: string) => {
  const r = await request("/register", {
    username,
    password: "correct horse staple",
    accepted: true,
  });
  expect(r.statusCode).toBe(200);
  return {
    data: r.json(),
    cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
};
beforeAll(async () => {
  server = await createApp({ store: new Store({ memory: true }), test: true });
  await server.app.listen({ port: 0, host: "127.0.0.1" });
  origin = `http://127.0.0.1:${(server.app.server.address() as any).port}`;
  ({ data: a, cookie: ca } = await register("alphaplayer"));
  ({ data: b, cookie: cb } = await register("betaplayer"));
  ({ data: c, cookie: cc } = await register("gammaplayer"));
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.app.close();
});
describe("accounts and authorization", () => {
  it("uses hashed passwords and HTTP-only sessions", async () => {
    expect(a.profile.handle).toMatch(/^alphaplayer#\d{4}$/);
    expect(a).not.toHaveProperty("passwordHash");
    const stored = await server.store.get("accounts", a.profile.id);
    expect(stored?.passwordHash).not.toContain("correct horse");
    expect((await request("/session")).statusCode).toBe(401);
    const session = await request("/session", undefined, ca);
    expect(session.json().profile.id).toBe(a.profile.id);
  });
  it("logs in with full identity and rejects invalid credentials", async () => {
    expect(
      (await request("/login", { handle: a.profile.handle, password: "wrong" }))
        .statusCode,
    ).toBe(400);
    const r = await request("/login", {
      handle: a.profile.handle,
      password: "correct horse staple",
    });
    expect(r.statusCode).toBe(200);
    expect(r.cookies[0].httpOnly).toBe(true);
  });
  it("rejects cross-origin mutations", async () => {
    const r = await server.app.inject({
      method: "POST",
      url: "/api/friends/request",
      headers: { cookie: ca, origin: "https://evil.example" },
      payload: { handle: b.profile.handle },
    });
    expect(r.statusCode).toBe(403);
  });
});
describe("social and parties", () => {
  it("requires accepted friends before messaging, and protects requests", async () => {
    expect(
      (await request("/conversations", { members: [b.profile.id] }, ca))
        .statusCode,
    ).toBe(400);
    expect(
      (await request("/friends/request", { handle: b.profile.handle }, ca))
        .statusCode,
    ).toBe(200);
    const r = (await request("/social", undefined, cb)).json().requests[0];
    expect(
      (await request("/friends/respond", { id: r.id, accept: true }, cc))
        .statusCode,
    ).toBe(400);
    expect(
      (await request("/friends/respond", { id: r.id, accept: true }, cb))
        .statusCode,
    ).toBe(200);
    expect((await request("/social", undefined, ca)).json().friends).toContain(
      b.profile.id,
    );
  });
  it("persists private messages and denies outsiders", async () => {
    const r = await request("/conversations", { members: [b.profile.id] }, ca);
    conversation = r.json().id;
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          { text: "You on? Hoops time!" },
          ca,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(`/conversations/${conversation}/messages`, undefined, cb)
      ).json()[0].text,
    ).toBe("You on? Hoops time!");
    expect(
      (await request(`/conversations/${conversation}/messages`, undefined, cc))
        .statusCode,
    ).toBe(400);
  });
  it("supports group rename and owner-only edits", async () => {
    const group = (
      await request(
        "/conversations",
        { members: [b.profile.id], group: true, name: "Crew" },
        ca,
      )
    ).json();
    expect(
      (
        await request(
          `/conversations/${group.id}`,
          { name: "Renamed" },
          cb,
          "PATCH",
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          `/conversations/${group.id}`,
          { name: "After school" },
          ca,
          "PATCH",
        )
      ).statusCode,
    ).toBe(200);
  });
  it("requires invitations and transfers party leadership on departure", async () => {
    party = (await request("/parties", {}, ca)).json().id;
    expect(
      (await request(`/parties/${party}/action`, { action: "accept" }, cb))
        .statusCode,
    ).toBe(400);
    await request(
      `/parties/${party}/action`,
      { action: "invite", user: b.profile.id },
      ca,
    );
    expect(
      (await request(`/parties/${party}/action`, { action: "accept" }, cb))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(`/parties/${party}/action`, { action: "disband" }, cb))
        .statusCode,
    ).toBe(400);
    await request(`/parties/${party}/action`, { action: "leave" }, ca);
    expect(
      (await request("/social", undefined, cb)).json().parties[0].owner,
    ).toBe(b.profile.id);
  });
  it("blocking prevents requests, messages and party invitations", async () => {
    await request("/block", { user: a.profile.id, blocked: true }, cb);
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          { text: "blocked?" },
          ca,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await request("/friends/request", { handle: b.profile.handle }, ca))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          `/parties/${party}/action`,
          { action: "invite", user: a.profile.id },
          cb,
        )
      ).statusCode,
    ).toBe(400);
    await request("/block", { user: a.profile.id, blocked: false }, cb);
  });
});
describe("realtime multiplayer integration", () => {
  async function connect(ticket: string) {
    const s = io(origin, { auth: { ticket }, transports: ["websocket"] });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.on("room", () => resolve());
      s.on("connect_error", reject);
    });
    return s;
  }
  const command = (s: Socket, d: any) =>
    new Promise<any>((resolve) => s.emit("command", d, resolve));
  it("synchronizes two users, host controls, input and reconnect", async () => {
    const sa = await connect(a.ticket),
      sb = await connect(b.ticket);
    expect(
      (await command(sa, { action: "create", game: "basketball" })).ok,
    ).toBe(true);
    const r = server.engine.find(a.profile.id)!;
    expect((await command(sb, { action: "join", code: r.code })).ok).toBe(true);
    expect((await command(sb, { action: "start" })).error).toContain("leader");
    await command(sa, { action: "ready", value: true });
    await command(sb, { action: "ready", value: true });
    await command(sa, { action: "start" });
    expect(r.phase).toBe("countdown");
    sb.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reconnect = await connect(b.ticket);
    expect(server.engine.find(b.profile.id)?.code).toBe(r.code);
    expect(r.players.filter((p) => p.id === b.profile.id)).toHaveLength(1);
    reconnect.disconnect();
    sa.disconnect();
  });
  it("keeps text services available when voice is not configured", async () => {
    const r = await request("/voice/token", {}, ca);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain("Voice");
    expect((await request("/social", undefined, ca)).statusCode).toBe(200);
  });
  it("logout invalidates the session and its socket ticket", async () => {
    await request("/logout", {}, cc);
    expect((await request("/session", undefined, cc)).statusCode).toBe(401);
    const s = io(origin, {
      auth: { ticket: c.ticket },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(s);
    const error = await new Promise<string>((resolve) =>
      s.on("connect_error", (e) => resolve(e.message)),
    );
    expect(error).toContain("sign in");
  });
});
