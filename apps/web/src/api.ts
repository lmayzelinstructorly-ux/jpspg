export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api${path}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response
      .json()
      .catch(() => ({
        error: "The clubhouse is starting up. Please try again.",
      }));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error(
        "The clubhouse is taking a moment to start. Please retry.",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export const SERVER =
  import.meta.env.VITE_GAME_SERVER_URL || "http://127.0.0.1:3001";
export async function wake(
  signal: AbortSignal,
  onProgress: (s: string) => void,
) {
  for (let n = 0; n < 9; n++) {
    if (signal.aborted) throw new Error("Cancelled");
    try {
      const r = await fetch(`${SERVER}/health`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
      });
      if (r.ok) return;
    } catch {}
    onProgress(
      n > 2
        ? "Still starting the clubhouse. Your place is saved…"
        : "Starting the JPSPG game server…",
    );
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, Math.min(1000 * 2 ** n, 8000));
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }
  throw new Error(
    "The game server could not start. Text chat is still available when the account service is online.",
  );
}
