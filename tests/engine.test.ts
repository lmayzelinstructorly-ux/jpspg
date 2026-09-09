import { describe, it, expect } from "vitest";
import { GameEngine } from "../apps/game-server/src/engine";
import {
  DEFAULT_AVATAR,
  EMPTY_INPUT,
  discriminator,
  uniqueCode,
  usernameSchema,
  voiceGain,
  type Game,
  type Profile,
} from "../packages/shared/src/index";
const player = (id: string): Profile => ({
  id,
  handle: `player${id}#1234`,
  avatar: DEFAULT_AVATAR,
  createdAt: 0,
});
function fixture(game: Game = "basketball") {
  const e = new GameEngine();
  const r = e.create(game, "a");
  e.join(r.code, player("a"));
  e.join(r.code, player("b"));
  e.configure("a", { ready: true });
  e.configure("b", { ready: true });
  e.start("a");
  for (let i = 0; i < 91; i++) e.tick();
  return { e, r };
}
describe("identity and room codes", () => {
  it("requires at least five letters, not five characters", () => {
    expect(usernameSchema.safeParse("ab123").success).toBe(false);
    expect(usernameSchema.safeParse("yashvir_23").success).toBe(true);
    expect(usernameSchema.safeParse("<script>").success).toBe(false);
  });
  it("pads tags and retries room-code collisions", () => {
    expect(discriminator(() => 0)).toBe("0000");
    expect(discriminator(() => 0.99999)).toBe("9999");
    let i = 0;
    expect(uniqueCode(new Set(["AAAAAA"]), () => (i++ < 6 ? 0 : 0.5))).not.toBe(
      "AAAAAA",
    );
    expect(() => uniqueCode(new Set(["AAAAAA"]), () => 0)).toThrow();
  });
  it("silences voice outside its radius", () => {
    expect(voiceGain(0)).toBe(1);
    expect(voiceGain(9)).toBe(0.25);
    expect(voiceGain(18)).toBe(0);
    expect(voiceGain(100)).toBe(0);
  });
});
describe("authoritative rooms", () => {
  it("requires both teams ready and host authority", () => {
    const e = new GameEngine();
    const r = e.create("soccer", "a");
    e.join(r.code, player("a"));
    expect(() => e.start("a")).toThrow();
    e.join(r.code, player("b"));
    expect(() => e.start("b")).toThrow();
    expect(() => e.start("a")).toThrow();
    e.configure("a", { ready: true });
    e.configure("b", { ready: true });
    e.start("a");
    expect(r.phase).toBe("countdown");
    expect(() => e.join(r.code, player("c"))).toThrow();
  });
  it("enforces capacity and does not eject a player on invalid join", () => {
    const e = new GameEngine();
    const r = e.create("basketball", "a");
    for (let i = 0; i < 6; i++) e.join(r.code, player(String(i)));
    expect(() => e.join(r.code, player("7"))).toThrow("full");
    expect(() => e.join("WRONG!", player("0"))).toThrow();
    expect(e.find("0")?.code).toBe(r.code);
  });
  it("rejects teleportation, forged scores, nonfinite inputs and replay", () => {
    const { e, r } = fixture();
    expect(e.input("a", { ...EMPTY_INPUT, seq: 1, x: 999 })).toBe(false);
    expect(e.input("a", { ...EMPTY_INPUT, seq: 1, score: [99, 0] })).toBe(
      false,
    );
    expect(e.input("a", { ...EMPTY_INPUT, seq: 1, x: NaN })).toBe(false);
    expect(e.input("a", { ...EMPTY_INPUT, seq: 1, x: 1, z: 1 })).toBe(true);
    expect(e.input("a", { ...EMPTY_INPUT, seq: 1 })).toBe(false);
    const p = r.players[0],
      x = p.x,
      z = p.z;
    for (let i = 0; i < 30; i++) e.tick();
    expect(Math.hypot(p.x - x, p.z - z)).toBeCloseTo(4.6, 1);
    expect(r.score).toEqual([0, 0]);
  });
  it("reconnects without duplicate player and cleans expired empty rooms", () => {
    const { e, r } = fixture();
    e.disconnect("a");
    e.join(r.code, player("a"));
    expect(r.players.filter((p) => p.id === "a")).toHaveLength(1);
    expect(r.players[0].connected).toBe(true);
    e.leave("a");
    e.leave("b");
    r.updatedAt = Date.now() - 70000;
    e.tick();
    expect(e.rooms.has(r.code)).toBe(false);
  });
});
describe("basketball simulation", () => {
  it("scores two-point layups and completes a quick match", () => {
    const { e, r } = fixture();
    const p = r.players[0];
    for (let shot = 0; shot < 6; shot++) {
      p.x = 0;
      p.z = -8;
      p.input = { ...EMPTY_INPUT, aimZ: -1 };
      p.actionAt = 0;
      r.players[1].x = 10;
      r.ball.owner = p.id;
      e.action(r, p, "shoot", 0.65);
      for (let t = 0; t < 40; t++) e.tick();
    }
    expect(r.score[0]).toBe(12);
    expect(r.phase).toBe("finished");
    expect(r.event).toBe("Lime wins!");
    e.rematch("a");
    expect(r.phase).toBe("lobby");
  });
  it("scores a three and produces a rebound for bad timing", () => {
    const { e, r } = fixture();
    const p = r.players[0];
    p.x = 0;
    p.z = 0;
    p.input = { ...EMPTY_INPUT };
    r.players[1].x = 10;
    r.ball.owner = p.id;
    e.action(r, p, "shoot", 0.65);
    for (let i = 0; i < 40; i++) e.tick();
    expect(r.score[0]).toBe(3);
    p.actionAt = 0;
    r.ball.owner = p.id;
    p.z = 0;
    e.action(r, p, "shoot", 1.4);
    for (let i = 0; i < 40; i++) e.tick();
    expect(r.score[0]).toBe(3);
    expect(r.event).toBe("Rebound!");
  });
  it("passes and steals only when possession/range permit", () => {
    const { e, r } = fixture();
    const a = r.players[0],
      b = r.players[1];
    r.ball.owner = a.id;
    a.x = 0;
    a.z = 0;
    b.x = 8;
    b.z = 0;
    e.action(r, b, "defend", 0);
    expect(r.ball.owner).toBe(a.id);
    b.actionAt = 0;
    b.x = 1;
    e.action(r, b, "defend", 0);
    expect(r.ball.owner).toBe(b.id);
    b.actionAt = 0;
    e.action(r, b, "pass", 0);
    expect(r.ball.owner).toBeNull();
    expect(Math.hypot(r.ball.vx, r.ball.vz)).toBeGreaterThan(0);
  });
  it("turns possession over on shot clock expiration", () => {
    const { e, r } = fixture();
    r.ball.owner = "a";
    r.ball.lastTeam = 0;
    r.shotClock = 0.01;
    e.tick();
    expect(r.ball.lastTeam).toBe(1);
    expect(r.shotClock).toBe(24);
  });
});
describe("soccer simulation", () => {
  it("scores goals from ball physics and finishes first-to-five", () => {
    const { e, r } = fixture("soccer");
    for (let i = 0; i < 5; i++) {
      Object.assign(r.ball, {
        owner: null,
        x: 3.6,
        z: -18.9,
        vz: -15,
        vx: 0,
        vy: 0,
        y: 0.35,
        cooldown: 1,
      });
      e.tick();
    }
    expect(r.score[0]).toBe(5);
    expect(r.phase).toBe("finished");
  });
  it("goalkeeper saves central shots and time expires", () => {
    const { e, r } = fixture("soccer");
    Object.assign(r.ball, {
      owner: null,
      x: 0,
      z: -16.9,
      vz: -15,
      vx: 0,
      cooldown: 1,
    });
    e.tick();
    expect(r.ball.vz).toBeGreaterThan(0);
    r.mode = "timed";
    r.clock = 0.01;
    e.tick();
    expect(r.phase).toBe("finished");
    expect(r.event).toBe("A draw!");
  });
});
