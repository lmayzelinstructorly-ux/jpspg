import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Entity = { id: string; [key: string]: any };
export class Store {
  private db?: DatabaseSync;
  private remote?: SupabaseClient;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(options: { memory?: boolean; remote?: boolean } = {}) {
    if (options.remote) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw new Error("Supabase credentials are required in production.");
      this.remote = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
    } else {
      const path = options.memory
        ? ":memory:"
        : process.env.LOCAL_DB_PATH || ".local/jpspg.sqlite";
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      this.db = new DatabaseSync(path);
      this.db.exec(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(kind,id));",
      );
    }
  }
  async all<T extends Entity = Entity>(kind: string): Promise<T[]> {
    if (this.remote) {
      const { data, error } = await this.remote
        .from("jpspg_records")
        .select("payload")
        .eq("kind", kind)
        .limit(10000);
      if (error) throw new Error("Database temporarily unavailable");
      return (data || []).map((x) => x.payload as T);
    }
    return this.db!.prepare("SELECT payload FROM records WHERE kind=?")
      .all(kind)
      .map((x) => JSON.parse(x.payload as string));
  }
  async get<T extends Entity = Entity>(
    kind: string,
    id: string,
  ): Promise<T | undefined> {
    if (this.remote) {
      const { data, error } = await this.remote
        .from("jpspg_records")
        .select("payload")
        .eq("kind", kind)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("Database temporarily unavailable");
      return data?.payload;
    }
    const r = this.db!.prepare(
      "SELECT payload FROM records WHERE kind=? AND id=?",
    ).get(kind, id);
    return r ? JSON.parse(r.payload as string) : undefined;
  }
  async put(kind: string, value: Entity) {
    if (this.remote) {
      const { error } = await this.remote
        .from("jpspg_records")
        .upsert(
          { kind, id: value.id, payload: value },
          { onConflict: "kind,id" },
        );
      if (error) throw new Error("Could not save data");
    } else
      this.db!.prepare(
        "INSERT INTO records(kind,id,payload) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload",
      ).run(kind, value.id, JSON.stringify(value));
  }
  async remove(kind: string, id: string) {
    if (this.remote) {
      const { error } = await this.remote
        .from("jpspg_records")
        .delete()
        .eq("kind", kind)
        .eq("id", id);
      if (error) throw new Error("Could not remove data");
    } else
      this.db!.prepare("DELETE FROM records WHERE kind=? AND id=?").run(
        kind,
        id,
      );
  }
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }
  close() {
    this.db?.close();
  }
}
