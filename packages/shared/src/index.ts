import { z } from "zod";
export const usernameSchema = z
  .string()
  .trim()
  .min(5)
  .max(20)
  .regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers and underscores")
  .refine(
    (s) => (s.match(/[A-Za-z]/g) || []).length >= 5,
    "Include at least five letters",
  );
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128);
export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  accepted: z.literal(true),
});
export const inputSchema = z
  .object({
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    x: z.number().finite().min(-1).max(1),
    z: z.number().finite().min(-1).max(1),
    aimX: z.number().finite().min(-1).max(1),
    aimZ: z.number().finite().min(-1).max(1),
    sprint: z.boolean(),
    shoot: z.boolean(),
    pass: z.boolean(),
    defend: z.boolean(),
    emote: z.enum(["", "wave", "cheer", "dance"]).default(""),
  })
  .strict();
export type Input = z.infer<typeof inputSchema>;
export type Game = "hub" | "basketball" | "soccer";
export type Team = 0 | 1;
export type Avatar = {
  skin: string;
  shirt: string;
  hair: string;
  style: number;
};
export type Profile = {
  id: string;
  handle: string;
  avatar: Avatar;
  createdAt: number;
};
export type Player = {
  id: string;
  handle: string;
  avatar: Avatar;
  x: number;
  z: number;
  y: number;
  angle: number;
  team: Team;
  ready: boolean;
  connected: boolean;
  emote: string;
  lastSeq: number;
  input: Input;
  actionAt: number;
  chargeAt: number;
  disconnectedAt: number;
};
export type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: string | null;
  lastTouch: string | null;
  lastTeam: Team;
  cooldown: number;
  shot?: {
    team: Team;
    points: number;
    made: boolean;
    end: number;
    startX: number;
    startZ: number;
  };
};
export type Room = {
  code: string;
  host: string;
  game: Game;
  public: boolean;
  mode: "quick" | "timed";
  walls: boolean;
  players: Player[];
  phase: "lobby" | "countdown" | "playing" | "finished";
  score: [number, number];
  clock: number;
  shotClock: number;
  countdown: number;
  ball: Ball;
  event: string;
  createdAt: number;
  updatedAt: number;
  tick: number;
  keepers: [number, number];
};
export type Snapshot = Omit<Room, "players"> & {
  players: Omit<Player, "input" | "actionAt" | "chargeAt" | "disconnectedAt">[];
};
export const DEFAULT_AVATAR: Avatar = {
  skin: "#e4ac82",
  shirt: "#afef43",
  hair: "#303549",
  style: 0,
};
export const EMPTY_INPUT: Input = {
  seq: 0,
  x: 0,
  z: 0,
  aimX: 0,
  aimZ: -1,
  sprint: false,
  shoot: false,
  pass: false,
  defend: false,
  emote: "",
};
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function roomCode(random: () => number = Math.random) {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join("");
}
export function discriminator(random: () => number = Math.random) {
  return Math.floor(random() * 10000)
    .toString()
    .padStart(4, "0");
}
export function uniqueCode(
  existing: Set<string>,
  random: () => number = Math.random,
) {
  for (let i = 0; i < 100; i++) {
    const c = roomCode(random);
    if (!existing.has(c)) return c;
  }
  throw new Error("Could not create a room code. Try again.");
}
export function voiceGain(distance: number) {
  return Math.pow(Math.max(0, 1 - distance / 18), 2);
}
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
