import { randomInt } from "node:crypto";
import {
  clamp,
  DEFAULT_AVATAR,
  distance,
  EMPTY_INPUT,
  inputSchema,
  uniqueCode,
  type Game,
  type Player,
  type Profile,
  type Room,
  type Snapshot,
  type Team,
} from "../../../packages/shared/src/index.js";

export class GameEngine {
  rooms = new Map<string, Room>();
  constructor() {
    this.rooms.set("PLAZA", this.create("hub", "system", true, "PLAZA"));
  }
  create(
    game: Game,
    host: string,
    isPublic = false,
    code = uniqueCode(
      new Set(this.rooms.keys()),
      () => randomInt(0, 1000000) / 1000000,
    ),
    mode: "quick" | "timed" = "quick",
    walls = true,
  ): Room {
    const room: Room = {
      code,
      host,
      game,
      public: isPublic,
      mode,
      walls,
      players: [],
      phase: game === "hub" ? "playing" : "lobby",
      score: [0, 0],
      clock: 180,
      shotClock: 24,
      countdown: 3,
      ball: {
        x: 0,
        y: 0.35,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        owner: null,
        lastTouch: null,
        lastTeam: 0,
        cooldown: 0,
      },
      event: "Welcome to the clubhouse",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tick: 0,
      keepers: [0, 0],
    };
    this.rooms.set(code, room);
    return room;
  }
  find(id: string) {
    return [...this.rooms.values()].find((r) =>
      r.players.some((p) => p.id === id),
    );
  }
  join(code: string, profile: Profile) {
    const r = this.rooms.get(code.toUpperCase());
    if (!r) throw new Error("That room has expired or does not exist.");
    const old = r.players.find((p) => p.id === profile.id);
    if (old) {
      old.connected = true;
      old.disconnectedAt = 0;
      old.lastSeq = -1;
      old.input = { ...EMPTY_INPUT };
      return r;
    }
    if (r.game !== "hub" && r.phase !== "lobby")
      throw new Error("This match has already started.");
    if (
      r.players.length >=
      (r.game === "basketball" ? 6 : r.game === "hub" ? 24 : 8)
    )
      throw new Error("This room is full.");
    this.leave(profile.id);
    const team: Team =
      r.players.filter((p) => p.team === 0).length <=
      r.players.filter((p) => p.team === 1).length
        ? 0
        : 1;
    const p: Player = {
      id: profile.id,
      handle: profile.handle,
      avatar: profile.avatar || DEFAULT_AVATAR,
      x: ((r.players.length % 3) - 1) * 3,
      z: r.game === "soccer" ? (team === 0 ? 7 : -7) : 4 + r.players.length,
      y: 0,
      angle: Math.PI,
      team,
      ready: r.game === "hub",
      connected: true,
      emote: "",
      lastSeq: -1,
      input: { ...EMPTY_INPUT },
      actionAt: 0,
      chargeAt: 0,
      disconnectedAt: 0,
    };
    r.players.push(p);
    if (r.host === "system" && r.game !== "hub") r.host = p.id;
    r.updatedAt = Date.now();
    return r;
  }
  leave(id: string) {
    const r = this.find(id);
    if (!r) return;
    r.players = r.players.filter((p) => p.id !== id);
    if (r.ball.owner === id) {
      r.ball.owner = null;
      r.ball.cooldown = 0.3;
    }
    if (r.host === id) r.host = r.players[0]?.id || "system";
    r.updatedAt = Date.now();
    if (
      r.phase === "playing" &&
      r.game !== "hub" &&
      !r.players.some((p) => p.team === 0) !==
        !r.players.some((p) => p.team === 1)
    ) {
      r.phase = "finished";
      r.event = "A team left the match";
    }
  }
  disconnect(id: string) {
    const p = this.find(id)?.players.find((p) => p.id === id);
    if (p) {
      p.connected = false;
      p.input = { ...EMPTY_INPUT };
      p.disconnectedAt = Date.now();
      p.chargeAt = 0;
    }
  }
  input(id: string, raw: unknown) {
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) return false;
    const r = this.find(id);
    const p = r?.players.find((p) => p.id === id);
    if (!r || !p || !p.connected || parsed.data.seq <= p.lastSeq) return false;
    p.lastSeq = parsed.data.seq;
    const prev = p.input;
    p.input = parsed.data;
    if (parsed.data.emote) p.emote = parsed.data.emote;
    if (r.phase === "playing" && r.game !== "hub") {
      if (p.input.shoot && !prev.shoot) p.chargeAt = Date.now();
      if (!p.input.shoot && prev.shoot && p.chargeAt) {
        this.action(
          r,
          p,
          "shoot",
          clamp((Date.now() - p.chargeAt) / 1000, 0.1, 1.6),
        );
        p.chargeAt = 0;
      }
      if (p.input.pass && !prev.pass) this.action(r, p, "pass", 0);
      if (p.input.defend && !prev.defend) this.action(r, p, "defend", 0);
    }
    return true;
  }
  configure(
    id: string,
    options: {
      team?: Team;
      ready?: boolean;
      mode?: "quick" | "timed";
      walls?: boolean;
    },
  ) {
    const r = this.find(id);
    const p = r?.players.find((p) => p.id === id);
    if (!r || !p || r.phase !== "lobby")
      throw new Error("Return to the lobby first.");
    if (options.team !== undefined) {
      if (
        r.players.filter((x) => x.team === options.team && x.id !== id)
          .length >= (r.game === "basketball" ? 3 : 4)
      )
        throw new Error("That team is full.");
      p.team = options.team;
    }
    if (options.ready !== undefined) p.ready = options.ready;
    if (r.host === id) {
      if (options.mode) r.mode = options.mode;
      if (options.walls !== undefined) r.walls = options.walls;
    }
  }
  start(id: string) {
    const r = this.find(id);
    if (!r || r.host !== id) throw new Error("Only the room leader can start.");
    if (r.phase !== "lobby") throw new Error("Return to the lobby first.");
    if (
      r.players.length < 2 ||
      !r.players.some((p) => p.team === 0) ||
      !r.players.some((p) => p.team === 1)
    )
      throw new Error("At least one player on each team is needed.");
    if (r.players.some((p) => !p.ready || !p.connected))
      throw new Error("Every player must be connected and ready.");
    r.phase = "countdown";
    r.countdown = 3;
    r.score = [0, 0];
    r.clock = 180;
    r.shotClock = 24;
    r.event = "Get ready";
    this.resetBall(r, 0);
  }
  rematch(id: string) {
    const r = this.find(id);
    if (!r || r.host !== id || r.phase !== "finished")
      throw new Error("Only the leader can reopen a finished match.");
    r.phase = "lobby";
    r.players.forEach((p) => (p.ready = false));
    r.event = "Ready for a rematch?";
  }
  action(
    r: Room,
    p: Player,
    kind: "shoot" | "pass" | "defend",
    charge: number,
  ) {
    const now = Date.now();
    if (now - p.actionAt < 350) return;
    p.actionAt = now;
    if (kind === "defend") {
      const owner = r.players.find((x) => x.id === r.ball.owner);
      if (
        owner &&
        owner.team !== p.team &&
        distance(owner, p) < 2.2 &&
        !r.ball.shot
      ) {
        r.ball.owner = p.id;
        r.ball.lastTeam = p.team;
        r.ball.lastTouch = p.id;
        r.shotClock = 24;
        r.event = `${p.handle} steals possession`;
      }
      return;
    }
    if (r.ball.owner !== p.id) return;
    r.ball.owner = null;
    r.ball.lastTouch = p.id;
    r.ball.lastTeam = p.team;
    r.ball.cooldown = 0.45;
    const aim = { x: p.input.aimX, z: p.input.aimZ };
    const len = Math.hypot(aim.x, aim.z) || 1;
    aim.x /= len;
    aim.z /= len;
    if (kind === "pass") {
      const mates = r.players
        .filter((x) => x.team === p.team && x.id !== p.id && x.connected)
        .sort((a, b) => distance(a, p) - distance(b, p));
      const target = mates[0];
      const dx = target ? target.x - p.x : aim.x * 8;
      const dz = target ? target.z - p.z : aim.z * 8;
      const d = Math.hypot(dx, dz) || 1;
      r.ball.vx = (dx / d) * 12;
      r.ball.vz = (dz / d) * 12;
      r.ball.vy = r.game === "basketball" ? 2 : 0;
      r.event = `${p.handle} passes`;
      return;
    }
    if (r.game === "basketball") {
      const hoop = { x: 0, z: -10 };
      const d = distance(p, hoop);
      const contested = r.players.some(
        (x) => x.team !== p.team && distance(x, p) < 2.4,
      );
      const ideal = 0.65;
      const timing = Math.abs(charge - ideal);
      const facing = (aim.x * -p.x + aim.z * (-10 - p.z)) / (d || 1);
      const made =
        d < 3.2
          ? !contested || timing < 0.4
          : timing < (contested ? 0.11 : 0.23) && d < 19 && facing > 0.1;
      r.ball.shot = {
        team: p.team,
        points: d > 7.5 ? 3 : 2,
        made,
        end: 1.1,
        startX: p.x,
        startZ: p.z,
      };
      r.ball.y = 1.5;
      r.event = made ? "Nice release!" : "Shot away";
    } else {
      const speed = 14 + Math.min(1, charge) * 10;
      r.ball.vx = aim.x * speed;
      r.ball.vz = aim.z * speed;
      r.ball.vy = 0;
      r.event = `${p.handle} shoots`;
    }
  }
  resetBall(r: Room, team: Team) {
    r.ball = {
      x: 0,
      y: 0.35,
      z: r.game === "basketball" ? 3 : 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: null,
      lastTouch: null,
      lastTeam: team,
      cooldown: 0.8,
    };
    r.shotClock = 24;
    const p = r.players.find((x) => x.team === team && x.connected);
    if (p) {
      p.x = 0;
      p.z = r.game === "basketball" ? 3 : 0;
      r.ball.owner = p.id;
      r.ball.lastTouch = p.id;
    }
    r.players.forEach((p, i) => {
      if (p.id !== r.ball.owner) {
        p.x = ((i % 3) - 1) * 4;
        p.z = r.game === "soccer" ? (p.team === 0 ? 7 : -7) : 6 + i;
      }
    });
  }
  point(r: Room, team: Team, points: number) {
    r.score[team] += points;
    r.event = r.game === "soccer" ? "GOAL!" : `${points} POINTS!`;
    const target = r.game === "soccer" ? 5 : 11;
    if (r.mode === "quick" && r.score[team] >= target) {
      r.phase = "finished";
      r.event = `${team === 0 ? "Lime" : "Coral"} wins!`;
    }
    this.resetBall(r, (1 - team) as Team);
  }
  tick(dt = 1 / 30) {
    for (const [code, r] of this.rooms) {
      r.tick++;
      for (const p of [...r.players]) {
        if (!p.connected && Date.now() - p.disconnectedAt > 30000)
          this.leave(p.id);
      }
      if (
        r.game !== "hub" &&
        !r.players.length &&
        Date.now() - r.updatedAt > 60000
      ) {
        this.rooms.delete(code);
        continue;
      }
      if (r.phase === "countdown") {
        r.countdown -= dt;
        if (r.countdown <= 0) {
          r.phase = "playing";
          r.event = "Play!";
        }
        continue;
      }
      if (r.phase !== "playing") continue;
      for (const p of r.players) {
        if (!p.connected) continue;
        const len = Math.hypot(p.input.x, p.input.z) || 1;
        const speed = p.input.sprint ? 7 : 4.6;
        const x = p.input.x / Math.max(1, len),
          z = p.input.z / Math.max(1, len);
        p.x = clamp(
          p.x + x * speed * dt,
          -(r.game === "soccer" ? 12 : 13),
          r.game === "soccer" ? 12 : 13,
        );
        p.z = clamp(
          p.z + z * speed * dt,
          r.game === "soccer" ? -18 : -11,
          r.game === "soccer" ? 18 : 13,
        );
        if (x || z) {
          p.angle = Math.atan2(x, z);
          p.emote = "";
        }
      }
      if (r.game === "hub") continue;
      r.clock = Math.max(0, r.clock - dt);
      if (r.clock <= 0) {
        r.phase = "finished";
        r.event =
          r.score[0] === r.score[1]
            ? "A draw!"
            : `${r.score[0] > r.score[1] ? "Lime" : "Coral"} wins!`;
        continue;
      }
      if (r.game === "basketball") {
        r.shotClock -= dt;
        if (r.shotClock <= 0) {
          r.event = "Shot clock — turnover";
          this.resetBall(r, (1 - r.ball.lastTeam) as Team);
        }
      }
      const b = r.ball;
      b.cooldown = Math.max(0, b.cooldown - dt);
      const owner = r.players.find((p) => p.id === b.owner);
      if (owner) {
        b.x = owner.x;
        b.z = owner.z - 0.6;
        b.y =
          r.game === "basketball"
            ? 0.45 + Math.abs(Math.sin(r.tick * 0.4)) * 0.65
            : 0.35;
        continue;
      }
      if (b.shot) {
        b.shot.end -= dt;
        const t = clamp(1 - b.shot.end / 1.1, 0, 1);
        b.x = b.shot.startX * (1 - t);
        b.z = b.shot.startZ + (-10 - b.shot.startZ) * t;
        b.y = 1.5 + 1.6 * t + Math.sin(Math.PI * t) * 4;
        if (b.shot.end <= 0) {
          const shot = b.shot;
          b.shot = undefined;
          if (shot.made) {
            this.point(r, shot.team, shot.points);
            continue;
          }
          b.vx = 3;
          b.vz = 5;
          b.vy = -1;
          b.cooldown = 0.3;
          r.event = "Rebound!";
        }
        continue;
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y = Math.max(0.35, b.y + b.vy * dt);
      b.vy = b.y > 0.35 ? b.vy - 9.8 * dt : 0;
      const drag = r.game === "soccer" ? 0.992 : 0.982;
      b.vx *= drag;
      b.vz *= drag;
      if (r.game === "soccer") {
        for (const team of [0, 1] as const) {
          const gz = team === 0 ? 17 : -17;
          r.keepers[team] += clamp(b.x - r.keepers[team], -3 * dt, 3 * dt);
          r.keepers[team] = clamp(r.keepers[team], -3.8, 3.8);
          if (
            Math.abs(b.z - gz) < 0.7 &&
            Math.abs(b.x - r.keepers[team]) < 0.85 &&
            Math.sign(b.vz) === Math.sign(gz)
          ) {
            b.vz *= -0.65;
            b.vx += (b.x - r.keepers[team]) * 6;
            r.event = "Saved!";
          }
        }
        if (Math.abs(b.z) > 19 && Math.abs(b.x) < 4) {
          this.point(r, b.z < 0 ? 0 : 1, 1);
          continue;
        }
      }
      const width = r.game === "soccer" ? 12.5 : 13.5;
      const end = r.game === "soccer" ? 19.5 : 12.5;
      if (Math.abs(b.x) > width) {
        if (!r.walls && r.game === "soccer") {
          r.event = "Throw-in";
          this.resetBall(r, (1 - b.lastTeam) as Team);
        } else {
          b.x = clamp(b.x, -width, width);
          b.vx *= -0.7;
        }
      }
      if (Math.abs(b.z) > end) {
        b.z = clamp(b.z, -end, end);
        b.vz *= -0.7;
      }
      if (!b.cooldown && b.y < 1.5) {
        const p = r.players.find((p) => p.connected && distance(p, b) < 1.2);
        if (p) {
          b.owner = p.id;
          if (b.lastTeam !== p.team) r.shotClock = 24;
          b.lastTeam = p.team;
          b.lastTouch = p.id;
        }
      }
    }
  }
  snapshot(r: Room): Snapshot {
    return {
      ...r,
      players: r.players.map(
        ({
          input: _input,
          actionAt: _a,
          chargeAt: _c,
          disconnectedAt: _d,
          ...p
        }) => p,
      ),
    };
  }
}
