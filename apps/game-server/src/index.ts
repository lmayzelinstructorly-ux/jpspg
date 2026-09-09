import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const { createApp } = await import("./app.js");
const { app } = await createApp();
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
