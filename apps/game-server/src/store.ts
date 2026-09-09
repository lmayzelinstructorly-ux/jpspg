Skip to content
lmayzelinstructorly-ux
jpspg
Repository navigation
Code
Issues
Pull requests
Actions
Projects
Wiki
Security and quality
Insights
Settings
Files
Go to file
t
T
apps
game-server/src
app.ts
engine.ts
index.ts
security.ts
store.ts
web
docs
packages
supabase
tests
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
render.yaml
tsconfig.json
vercel.json
vite.config.ts
vitest.config.ts
jpspg/apps/game-server/src
/
store.ts
in
main

Edit

Preview
Indent mode

Spaces
Indent size

2
Line wrap mode

No wrap
Editing store.ts file contents
  1
  2
  3
  4
  5
  6
  7
  8
  9
 10
 11
 12
 13
 14
 15
 16
 17
 18
 19
 20
 21
 22
 23
 24
 25
 26
 27
 28
 29
 30
 31
 32
 33
 34
 35
 36
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
Use Control + Shift + m to toggle the tab key moving focus. Alternatively, use esc then tab to move to the next interactive element on the page.
