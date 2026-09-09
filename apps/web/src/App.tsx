import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowUpRight,
  ArrowRight,
  Users,
  MessageCircle,
  Plus,
  Hash,
  Settings,
  X,
  Check,
  Copy,
  LogOut,
  CircleDot,
  Trophy,
  Gamepad2,
  Shield,
  Search,
  Send,
  SlidersHorizontal,
  Home,
  Volume2,
  CheckCircle2,
} from "lucide-react";
import { api, SERVER, wake } from "./api";
import {
  type Input,
  type Profile,
  type Snapshot,
} from "../../../packages/shared/src/index";
const Scene = lazy(() => import("./Scene"));
const Voice = lazy(() => import("./Voice"));
const defaultBindings = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  sprint: "ShiftLeft",
  shoot: "Space",
  pass: "KeyE",
  defend: "KeyF",
};
const defaults = {
  quality: "low",
  reduced: false,
  camera: "broadcast",
  sensitivity: 1,
  voice: 1,
  effects: 0.35,
  music: 0,
  ptt: false,
  bindings: defaultBindings,
};
type Prefs = typeof defaults;
function loadPrefs(): Prefs {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("jpspg.preferences") || "{}"),
    };
  } catch {
    return defaults;
  }
}
const profileName = (social: any, id: string) =>
  social?.profiles?.find((p: Profile) => p.id === id)?.handle || "Player";
const stamp = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const routeMap: Record<string,string> = {'/':'home','/play':'play','/friends':'friends','/messages':'messages','/party':'party','/rooms':'rooms','/settings':'settings','/profile':'profile','/privacy':'policy:privacy','/terms':'policy:terms','/community':'policy:community','/login':'home','/signup':'home'};
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("input,button,select");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = node?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Badge({
  profile,
  size = "normal",
}: {
  profile?: Pick<Profile, "handle" | "avatar">;
  size?: string;
}) {
  return (
    <span
      className={`player-badge ${size}`}
      style={{ background: profile?.avatar.shirt || "#b4ee4a" }}
    >
      {profile?.handle.slice(0, 1).toUpperCase() || "J"}
    </span>
  );
}
export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [view, setView] = useState(routeMap[location.pathname]||'not-found');
  const [modal, setModal] = useState(location.pathname==='/login'?'login':location.pathname==='/signup'?'register':'');
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [social, setSocial] = useState<any>({
    friends: [],
    profiles: [],
    requests: [],
    parties: [],
    conversations: [],
    blocks: [],
  });
  const [room, setRoom] = useState<Snapshot>();
  const [connection, setConnection] = useState("offline");
  const [startup, setStartup] = useState("");
  const [retry, setRetry] = useState(0);
  const [ticket, setTicket] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [game, setGame] = useState<"basketball" | "soccer">("basketball");
  const [fps, setFps] = useState(0);
  const [ping, setPing] = useState(0);
  const [charge, setCharge] = useState(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [conversation, setConversation] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [config, setConfig] = useState({
    minimumAge: 13,
    voice: false,
    local: true,
  });
  const [debug, setDebug] = useState(false);
  const sock = useRef<Socket | null>(null);
  const socialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newestEvent = useRef("");
  const notify = useCallback((s: string) => setNotice(s), []);
  const fail = useCallback((s: string) => setError(s), []);
  const close = useCallback(() => setModal(""), []);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      setSocial(await api("/social"));
    } catch {}
  }, []);
  useEffect(()=>{const path=Object.entries(routeMap).find(([,v])=>v===view)?.[0];if(path&&path!==location.pathname)history.replaceState({},'',path);document.title=view==='home'?'JPSPG — Your browser is the clubhouse':`${view.replace('policy:','')} · JPSPG`;},[view]);
  useEffect(()=>{const pop=()=>setView(routeMap[location.pathname]||'not-found');window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(() => {
    void api("/config")
      .then(setConfig)
      .catch(() => {});
    void api("/session")
      .then((data) => {
        setUser(data.profile);
        setTicket(data.ticket);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem("jpspg.preferences", JSON.stringify(prefs));
    document.documentElement.dataset.reduced = String(prefs.reduced);
  }, [prefs]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const controller = new AbortController();
    let socket: Socket;
    setConnection("starting");
    setStartup("Starting the JPSPG game server…");
    void wake(controller.signal, setStartup)
      .then(() => {
        if (controller.signal.aborted) return;
        socket = io(SERVER, {
          auth: { ticket },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionDelay: 1500,
        });
        sock.current = socket;
        socket.on("connect", () => {
          setConnection("connected");
          setStartup("");
        });
        socket.on("disconnect", (reason) => {
          setConnection("disconnected");
          if (reason === "io server disconnect")
            setStartup(
              "This session moved to another tab or expired. Reconnect to continue.",
            );
        });
        socket.on("connect_error", (e) => {
          setConnection("disconnected");
          setStartup(e.message);
        });
          socket.on("room", (r: Snapshot) => {
            setRoom(r);
            setRoomMessages([]);
            if(r.game!=='hub')setView('play');
        });
        socket.on("snapshot", setRoom);
        socket.on("social:changed", () => {
          if (socialTimer.current) clearTimeout(socialTimer.current);
          socialTimer.current = setTimeout(() => void refresh(), 250);
        });
        socket.on("room:chat", (m) =>
          setRoomMessages((old) => [...old, m].slice(-50)),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setConnection("failed");
          setStartup(e.message);
        }
      });
    return () => {
      controller.abort();
      socket?.disconnect();
      sock.current = null;
      if (socialTimer.current) clearTimeout(socialTimer.current);
    };
  }, [user?.id, ticket, retry, refresh]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const start = performance.now();
      sock.current?.timeout(5000).emit("ping:check", (err: unknown) => {
        if (!err) setPing(Math.round(performance.now() - start));
      });
    }, 5000);
    const renew = setInterval(
      () =>
        void api("/session")
          .then((d) => {
            if (sock.current) sock.current.auth = { ticket: d.ticket };
          })
          .catch(() => setConnection("disconnected")),
      5 * 60000,
    );
    return () => {
      clearInterval(t);
      clearInterval(renew);
    };
  }, [user]);
  useEffect(() => {
    if (!conversation || !user) return;
    void api(`/conversations/${conversation}/messages`)
      .then(setMessages)
      .catch((e) => fail(e.message));
  }, [conversation, social, user, fail]);
  useEffect(() => {
    if (!room?.event || room.event === newestEvent.current) return;
    newestEvent.current = room.event;
    if (
      prefs.effects <= 0 ||
      prefs.reduced ||
      !room.event.match(/POINTS|GOAL|wins/)
    )
      return;
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(),
        gain = ctx.createGain();
      o.connect(gain);
      gain.connect(ctx.destination);
      o.frequency.setValueAtTime(520, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(prefs.effects * 0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.36);
      o.onended = () => void ctx.close();
    } catch {}
  }, [room?.event, prefs.effects, prefs.reduced]);
  const sendInput = useCallback(
    (input: Input) => sock.current?.emit("input", input),
    [],
  );
  const measure = useCallback((f: number) => {
    setFps(Math.round(f));
    if (f < 25)
      setPrefs((old) =>
        old.quality !== "low" ? { ...old, quality: "low" } : old,
      );
  }, []);
  const command = useCallback(
    (data: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        if (!sock.current?.connected)
          return reject(new Error("The game server is not connected yet."));
        sock.current
          .timeout(7000)
          .emit("command", data, (err: unknown, result: any) =>
            err
              ? reject(new Error("Connection interrupted. Please retry."))
              : result?.error
                ? reject(new Error(result.error))
                : resolve(),
          );
      }),
    [],
  );
  const act = (data: Record<string, unknown>) => void run(() => command(data));
  const enter = (g: "basketball" | "soccer") => {
    setGame(g);
    setModal(user ? "create" : "register");
  };
  const reconnect = () =>
    void run(async () => {
      const d = await api("/session");
      setTicket(d.ticket);
      setRetry((r) => r + 1);
    });
  const logout = () =>
    void run(async () => {
      await api("/logout", {});
      setUser(null);
      setRoom(undefined);
      setTicket("");
      setView("home");
    });
  const socialAction = (path: string, body: unknown) =>
    void run(async () => {
      await api(path, body);
      await refresh();
    });
  const myParty = social.parties.find((p: any) => p.members.includes(user?.id));
  const me = room?.players.find((p) => p.id === user?.id);
  const activeGame = room && room.game !== "hub";
  const toView = (next: string) => {
    setView(next);
    if (next === "rooms")
      void api("/rooms")
        .then(setRooms)
        .catch((e) => fail(e.message));
  };
  const sceneProps = {
    quality: prefs.quality,
    reduced: prefs.reduced,
    cameraMode: prefs.camera,
    sensitivity: prefs.sensitivity,
    bindings: prefs.bindings,
  };
  async function authenticate(
    e: FormEvent<HTMLFormElement>,
    register: boolean,
  ) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      const d = await api(
        register ? "/register" : "/login",
        register
          ? {
              username: form.get("username"),
              password: form.get("password"),
              accepted: form.get("accepted") === "on",
            }
          : { handle: form.get("handle"), password: form.get("password") },
      );
      setUser(d.profile);
      setTicket(d.ticket);
      setRecovery(d.recoveryCode || "");
      setModal(d.recoveryCode ? "recovery" : "");
      setView("home");
      notify(`Welcome, ${d.profile.handle}`);
    });
  }
  async function openDM(id: string) {
    await run(async () => {
      const c = await api("/conversations", { members: [id], group: false });
      await refresh();
      setConversation(c.id);
      setView("messages");
      await api(`/conversations/${c.id}/read`, {});
    });
  }
  const time = (n: number) =>
    `${Math.floor(n / 60)}:${Math.floor(n % 60)
      .toString()
      .padStart(2, "0")}`;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => toView("home")}
          aria-label="JPSPG home"
        >
          <span className="brand-mark">J</span>
          <span>
            jpspg<span className="brand-dot">.</span>
          </span>
          <span className="beta">CLUBHOUSE / BETA</span>
        </button>
        <nav className="top-nav">
          <button
            className={view === "home" ? "selected" : ""}
            onClick={() => toView("home")}
          >
            Play
          </button>
          <button
            className={view === "rooms" ? "selected" : ""}
            onClick={() => (user ? toView("rooms") : setModal("register"))}
          >
            Find a room
          </button>
          <button
            className={view === "friends" ? "selected" : ""}
            onClick={() => (user ? toView("friends") : setModal("register"))}
          >
            Friends
          </button>
        </nav>
        <div className="top-actions">
          {user ? (
            <>
              <button
                className="icon-button"
                aria-label="Messages"
                onClick={() => toView("messages")}
              >
                <MessageCircle size={20} />
                {social.conversations.some((c: any) => c.unread > 0) && (
                  <i className="dot notification" />
                )}
              </button>
              <button
                className="profile-button"
                onClick={() => toView("profile")}
              >
                <Badge profile={user} />
                <span>
                  {user.handle.split("#")[0]}
                  <small>#{user.handle.split("#")[1]}</small>
                </span>
              </button>
            </>
          ) : (
            <>
              <button className="text-button" onClick={() => setModal("login")}>
                Log in
              </button>
              <button
                className="button lime small"
                onClick={() => setModal("register")}
              >
                Create account <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside className="rail">
          <button
            title="Clubhouse"
            className={view === "home" ? "active" : ""}
            onClick={() => toView("home")}
          >
            <Home />
          </button>
          <button
            title="Friends"
            className={view === "friends" ? "active" : ""}
            onClick={() => (user ? toView("friends") : setModal("register"))}
          >
            <Users />
          </button>
          <button
            title="Messages"
            className={view === "messages" ? "active" : ""}
            onClick={() => (user ? toView("messages") : setModal("register"))}
          >
            <MessageCircle />
          </button>
          <button
            title="Your party"
            className={view === "party" ? "active" : ""}
            onClick={() => (user ? toView("party") : setModal("register"))}
          >
            <Gamepad2 />
          </button>
          <span />
          <button
            title="Settings"
            className={view === "settings" ? "active" : ""}
            onClick={() => toView("settings")}
          >
            <Settings />
          </button>
        </aside>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {user && connection !== "connected" && (
            <div className="connection-banner">
              <span className="pulse" />
              {startup || "Reconnecting to your room…"}
              {connection !== "starting" && (
                <button className="text-button" onClick={reconnect}>
                  Reconnect
                </button>
              )}
            </div>
          )}
          {view === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <i className="dot" /> YOUR NEXT GOOD TIME STARTS HERE
                  </div>
                  <h1>
                    {user
                      ? `Hey, ${user.handle.split("#")[0]}.`
                      : "Good games. Great company."}
                  </h1>
                  <p>
                    {user
                      ? "The clubhouse is open. What are we playing?"
                      : "A little competition. A lot of hanging out. All in your browser."}
                  </p>
                </div>
                <button
                  className="button white"
                  onClick={() =>
                    user ? setModal("join") : setModal("register")
                  }
                >
                  <Hash size={18} /> Join with a code
                </button>
              </div>
              <section className="hero-club">
                <div className="hero-copy">
                  <span className="pill light">
                    NO DOWNLOADS. JUST FRIENDS.
                  </span>
                  <h2>
                    Your browser.
                    <br />
                    Your clubhouse.
                  </h2>
                  <p>
                    Pull up, pick a game, and make it a good one. Your crew is
                    one room code away.
                  </p>
                  <button
                    className="button ink"
                    onClick={() => {
                      if (!user) setModal("register");
                      else {
                        setView("play");
                        if (room?.game !== "hub") act({ action: "hub" });
                      }
                    }}
                  >
                    {" "}
                    {user ? "Enter clubhouse" : "Play now"}{" "}
                    <ArrowUpRight size={19} />
                  </button>
                  <div className="hero-note">
                    <span className="mini-avatars">
                      <b>J</b>
                      <b>P</b>
                      <b>G</b>
                    </span>
                    <span>
                      Bring your people.
                      <br />
                      <strong>We’ll bring the games.</strong>
                    </span>
                  </div>
                </div>
                <div className="hero-world">
                  <Suspense
                    fallback={
                      <div className="scene-fallback">
                        Building the clubhouse…
                      </div>
                    }
                  >
                    <Scene {...sceneProps} preview="hub" />
                  </Suspense>
                  <div className="world-caption">
                    <i className="dot" /> THE CLUBHOUSE{" "}
                    <span>01 / YOUR HOME TURF</span>
                  </div>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  Pick your playground <span>02 GAMES</span>
                </h2>
                <span>Easy to learn. Hard to leave.</span>
              </div>
              <div className="game-grid">
                {(["basketball", "soccer"] as const).map((g, i) => (
                  <button
                    key={g}
                    className={`game-card ${g}`}
                    onClick={() => enter(g)}
                  >
                    <div className="game-art">
                      <Suspense
                        fallback={
                          <div className="scene-fallback">Opening court…</div>
                        }
                      >
                        <Scene {...sceneProps} preview={g} />
                      </Suspense>
                      <span className="pill game-pill">
                        {i ? "1V1 — 4V4" : "1V1 — 3V3"}
                      </span>
                    </div>
                    <div className="game-card-body">
                      <div>
                        <span className="eyebrow">
                          {i
                            ? "SMALL FIELD. BIG ENERGY."
                            : "YOUR COURT. YOUR SHOT."}
                        </span>
                        <h3>{i ? "Pocket pitch" : "Rooftop hoops"}</h3>
                        <p>
                          {i
                            ? "Pass, sprint, score. Run it back."
                            : "Find your rhythm. Hit the perfect release."}
                        </p>
                      </div>
                      <span className="round-arrow">
                        <ArrowUpRight />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <section className="party-strip">
                <div className="party-icon">
                  <Users size={26} />
                </div>
                <div>
                  <h3>Better with your whole crew.</h3>
                  <p>Make a party, share a code, and play together.</p>
                </div>
                <button
                  className="button white"
                  onClick={() =>
                    user ? toView("party") : setModal("register")
                  }
                >
                  Get the party started <ArrowRight size={17} />
                </button>
              </section>
            </>
          )}
          {view === "play" && user && (
            <>
              <div className="play-heading">
                <div>
                  <div className="eyebrow">
                    {activeGame
                      ? "YOUR PRIVATE PLAYGROUND"
                      : "WELCOME TO THE CLUBHOUSE"}
                  </div>
                  <h1>
                    {room?.game === "basketball"
                      ? "Rooftop hoops"
                      : room?.game === "soccer"
                        ? "Pocket pitch"
                        : "The plaza"}
                  </h1>
                </div>
                <div className="inline">
                  <span className="status">
                    <i className="dot" />
                    {ping} ms
                  </span>
                  {activeGame && (
                    <button
                      className="button white"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(room.code)
                          .then(() => notify("Room code copied"));
                      }}
                    >
                      <Copy size={16} />
                      {room.code}
                    </button>
                  )}
                  <button
                    className="button white"
                    onClick={() => {
                      act({ action: "hub" });
                      setView("home");
                    }}
                  >
                    Leave court
                  </button>
                </div>
              </div>
              <div className="play-layout">
                <section className="arena">
                  <Suspense
                    fallback={
                      <div className="scene-fallback">Opening your court…</div>
                    }
                  >
                    <Scene
                      key={room?.code}
                      {...sceneProps}
                      room={room}
                      me={user.id}
                      onInput={sendInput}
                      onStats={measure}
                      onCharge={setCharge}
                      onPortal={(g) => g !== "hub" && enter(g)}
                    />
                  </Suspense>
                  {activeGame && (
                    <div className="scoreboard">
                      <span>
                        LIME <b>{room.score[0]}</b>
                      </span>
                      <div>
                        {time(room.clock)}
                        <small>
                          {room.phase === "lobby"
                            ? "LOBBY"
                            : room.game === "basketball"
                              ? `${Math.ceil(room.shotClock)}s SHOT CLOCK`
                              : room.mode.toUpperCase()}
                        </small>
                      </div>
                      <span>
                        <b>{room.score[1]}</b> CORAL
                      </span>
                    </div>
                  )}
                  {room?.phase === "countdown" && (
                    <div className="countdown">{Math.ceil(room.countdown)}</div>
                  )}
                  {room?.phase === "finished" && (
                    <div className="result-overlay">
                      <Trophy size={42} />
                      <h2>{room.event}</h2>
                      <p>
                        {room.score[0]} — {room.score[1]}
                      </p>
                      {room.host === user.id && (
                        <button
                          className="button lime"
                          onClick={() => act({ action: "rematch" })}
                        >
                          Run it back
                        </button>
                      )}
                    </div>
                  )}
                  {charge > 0 && (
                    <div className="shot-meter">
                      <span>RELEASE IN THE GREEN</span>
                      <div>
                        <i />
                        <b
                          style={{
                            left: `${Math.min(100, (charge / 1.6) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="arena-bottom">
                    <span className="pill light">
                      {room?.event || "Connecting…"}
                    </span>
                    <button
                      className="button white small"
                      onClick={() => act({ action: "emote", value: "wave" })}
                    >
                      Wave 👋
                    </button>
                  </div>
                  {debug && (
                    <div className="debug">
                      {fps} FPS · {ping} ms · server 30 Hz · snapshots 15 Hz ·{" "}
                      {JSON.stringify(room || {}).length} bytes
                      <br />
                      Rendering interpolation ≈ 55 ms · {connection}
                    </div>
                  )}
                </section>
                <aside className="room-panel">
                  <div className="panel-heading">
                    <h3>{activeGame ? "Match lobby" : "In the plaza"}</h3>
                    <span>{room?.players.length || 0} players</span>
                  </div>
                  {room?.players.map((p) => (
                    <div className="room-player" key={p.id}>
                      <Badge profile={p} />
                      <div>
                        <strong>{p.handle}</strong>
                        <small>
                          {p.connected
                            ? activeGame
                              ? p.team === 0
                                ? "Lime team"
                                : "Coral team"
                              : "Hanging out"
                            : "Reconnecting…"}
                        </small>
                      </div>
                      {p.ready ? (
                        <Check size={16} />
                      ) : (
                        <span className="tiny">Not ready</span>
                      )}
                    </div>
                  ))}
                  {activeGame && room.phase === "lobby" && (
                    <div className="lobby-controls">
                      <label>
                        Your team
                        <select
                          aria-label="Your team"
                          value={me?.team || 0}
                          onChange={(e) =>
                            act({
                              action: "team",
                              value: Number(e.target.value),
                            })
                          }
                        >
                          <option value="0">Lime</option>
                          <option value="1">Coral</option>
                        </select>
                      </label>
                      {room.host === user.id && (
                        <>
                          <label>
                            Match rules
                            <select
                              value={room.mode}
                              onChange={(e) =>
                                act({ action: "mode", value: e.target.value })
                              }
                            >
                              <option value="quick">
                                First to {room.game === "basketball" ? 11 : 5}
                              </option>
                              <option value="timed">3-minute match</option>
                            </select>
                          </label>
                          {room.game === "soccer" && (
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={room.walls}
                                onChange={(e) =>
                                  act({
                                    action: "walls",
                                    value: e.target.checked,
                                  })
                                }
                              />
                              Arcade walls
                            </label>
                          )}
                        </>
                      )}
                      <button
                        className={`button ${me?.ready ? "white" : "lime"}`}
                        onClick={() =>
                          act({ action: "ready", value: !me?.ready })
                        }
                      >
                        {me?.ready ? "Unready" : "Ready up"}
                      </button>
                      {room.host === user.id && (
                        <button
                          className="button ink"
                          onClick={() => act({ action: "start" })}
                        >
                          Start match <ArrowRight size={16} />
                        </button>
                      )}
                      {myParty && (
                        <button
                          className="text-button"
                          onClick={() =>
                            socialAction(`/parties/${myParty.id}/action`, {
                              action: "room",
                            })
                          }
                        >
                          Share room with party
                        </button>
                      )}
                    </div>
                  )}
                  <div className="room-chat">
                    <h4>Room chat</h4>
                    <div className="chat-history">
                      {roomMessages.length ? (
                        roomMessages.map((m) => (
                          <p key={m.id}>
                            <strong>{m.handle}</strong> {m.text}
                          </p>
                        ))
                      ) : (
                        <p className="muted">Say hello to the room.</p>
                      )}
                    </div>
                    <form
                      className="send-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        const text = new FormData(f).get("text");
                        sock.current?.emit("room:chat", text, (r: any) =>
                          r.error ? fail(r.error) : f.reset(),
                        );
                      }}
                    >
                      <input
                        name="text"
                        aria-label="Room message"
                        placeholder="Say something…"
                        maxLength={300}
                        required
                      />
                      <button
                        className="icon-button"
                        aria-label="Send room message"
                      >
                        <Send size={17} />
                      </button>
                    </form>
                  </div>
                  {room && (
                    <Suspense>
                      <Voice
                        key={room.code}
                        room={room}
                        me={user.id}
                        blocked={social.blocks}
                        volume={prefs.voice}
                        ptt={prefs.ptt}
                        onError={fail}
                      />
                    </Suspense>
                  )}
                </aside>
              </div>
              <div className="controls-strip">
                <span>
                  <kbd>W A S D</kbd> Move
                </span>
                <span>
                  <kbd>SHIFT</kbd> Sprint
                </span>
                <span>
                  <kbd>SPACE</kbd> Hold & release to shoot
                </span>
                <span>
                  <kbd>E</kbd> Pass
                </span>
                <span>
                  <kbd>F</kbd> Defend
                </span>
                <span>Drag to aim</span>
              </div>
            </>
          )}
          {view === "rooms" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FIND YOUR NEXT MATCH</div>
                  <h1>Open courts.</h1>
                  <p>Join a public room or bring a code from your friends.</p>
                </div>
                <button
                  className="button lime"
                  onClick={() => setModal("join")}
                >
                  <Hash size={18} /> Join with code
                </button>
              </div>
              <div className="section-heading">
                <h2>Public rooms</h2>
                <button
                  className="text-button"
                  onClick={() => void api("/rooms").then(setRooms)}
                >
                  Refresh
                </button>
              </div>
              {rooms.length ? (
                <div className="room-list">
                  {rooms.map((r) => (
                    <div className="panel room-list-card" key={r.code}>
                      <CircleDot />
                      <div>
                        <h3>
                          {r.game === "soccer"
                            ? "Pocket pitch"
                            : "Rooftop hoops"}
                        </h3>
                        <p>
                          {r.count} players · {r.code} · {r.mode}
                        </p>
                      </div>
                      <button
                        className="button lime"
                        onClick={() =>
                          void run(async () => {
                            await command({ action: "join", code: r.code });
                            setView("play");
                          })
                        }
                      >
                        Join room
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty panel">
                  <Gamepad2 size={40} />
                  <h2>The next game could be yours.</h2>
                  <p>
                    No public rooms are open yet. Create one and invite your
                    friends.
                  </p>
                  <button
                    className="button lime"
                    onClick={() => setModal("create")}
                  >
                    Create a room <Plus size={18} />
                  </button>
                </div>
              )}
            </>
          )}
          {view === "friends" && user && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR PEOPLE</div>
                  <h1>Good company.</h1>
                  <p>
                    Add a friend using their full username and four-digit tag.
                  </p>
                </div>
                <button
                  className="button lime"
                  onClick={() => setModal("friend")}
                >
                  <Plus size={18} /> Add friend
                </button>
              </div>
              <div className="social-grid">
                <section className="panel">
                  <h2>
                    Friends{" "}
                    <span className="count">{social.friends.length}</span>
                  </h2>
                  {social.friends.length ? (
                    social.friends.map((id: string) => {
                      const p = social.profiles.find(
                        (p: Profile) => p.id === id,
                      );
                      return (
                        <div className="friend-row" key={id}>
                          <Badge profile={p} />
                          <div>
                            <strong>{p?.handle}</strong>
                            <small>
                              <i
                                className={`dot ${p?.status === "offline" ? "gray" : ""}`}
                              />
                              {p?.status}
                            </small>
                          </div>
                          <button
                            className="button white small"
                            onClick={() => void openDM(id)}
                          >
                            <MessageCircle size={16} />
                            Message
                          </button>
                          <details>
                            <summary aria-label="Friend options">•••</summary>
                            <div className="menu-pop">
                              <button
                                onClick={() =>
                                  myParty
                                    ? socialAction(
                                        `/parties/${myParty.id}/action`,
                                        { action: "invite", user: id },
                                      )
                                    : notify(
                                        "Create a party first from Your party.",
                                      )
                                }
                              >
                                Invite to party
                              </button>
                              <button
                                onClick={() =>
                                  socialAction("/friends/remove", { user: id })
                                }
                              >
                                Remove friend
                              </button>
                              <button
                                onClick={() =>
                                  socialAction("/block", {
                                    user: id,
                                    blocked: true,
                                  })
                                }
                              >
                                Block
                              </button>
                              <button
                                onClick={() => {
                                  setModal(`report:${id}`);
                                }}
                              >
                                Report
                              </button>
                            </div>
                          </details>
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty">
                      <Users size={36} />
                      <h3>Your crew starts here.</h3>
                      <p>
                        Share your identity: <strong>{user.handle}</strong>
                      </p>
                      <button
                        className="button white"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(user.handle)
                            .then(() => notify("Identity copied"))
                        }
                      >
                        <Copy size={15} /> Copy identity
                      </button>
                    </div>
                  )}
                </section>
                <section className="panel">
                  <h2>Friend requests</h2>
                  {social.requests.length ? (
                    social.requests.map((r: any) => (
                      <div className="request" key={r.id}>
                        <strong>
                          {profileName(
                            social,
                            r.from === user.id ? r.to : r.from,
                          )}
                        </strong>
                        <small>
                          {r.to === user.id
                            ? "Wants to be friends"
                            : "Request sent"}
                        </small>
                        <div className="inline">
                          {r.to === user.id ? (
                            <>
                              <button
                                className="button lime small"
                                onClick={() =>
                                  socialAction("/friends/respond", {
                                    id: r.id,
                                    accept: true,
                                  })
                                }
                              >
                                Accept
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  socialAction("/friends/respond", {
                                    id: r.id,
                                    accept: false,
                                  })
                                }
                              >
                                Decline
                              </button>
                            </>
                          ) : (
                            <button
                              className="text-button"
                              onClick={() =>
                                socialAction("/friends/remove", { user: r.to })
                              }
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No pending requests. All caught up.</p>
                  )}
                </section>
              </div>
            </>
          )}
          {view === "messages" && user && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">KEEP THE CONVERSATION GOING</div>
                  <h1>Messages.</h1>
                </div>
                <button
                  className="button lime"
                  onClick={() => setModal("group")}
                >
                  <Plus size={17} /> New group
                </button>
              </div>
              <div className="messenger">
                <aside>
                  <h3>Your conversations</h3>
                  {social.conversations.map((c: any) => (
                    <button
                      className={`conversation ${conversation === c.id ? "active" : ""}`}
                      key={c.id}
                      onClick={() => {
                        setConversation(c.id);
                        void api(`/conversations/${c.id}/read`, {}).then(
                          refresh,
                        );
                      }}
                    >
                      <MessageCircle size={19} />
                      <span>
                        {c.group
                          ? c.name || "Group chat"
                          : profileName(
                              social,
                              c.members.find((id: string) => id !== user.id),
                            )}
                      </span>
                      {c.unread > 0 && <b>{c.unread}</b>}
                    </button>
                  ))}
                  {!social.conversations.length && (
                    <p className="muted">Message a friend to get started.</p>
                  )}
                </aside>
                <section>
                  {conversation ? (
                    <>
                      <div className="conversation-header">
                        <h3>
                          {social.conversations.find(
                            (c: any) => c.id === conversation,
                          )?.name || "Conversation"}
                        </h3>
                        <button
                          className="text-button"
                          onClick={() => setModal("group-settings")}
                        >
                          Members & options
                        </button>
                      </div>
                      <div className="message-history">
                        <button
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              if (messages.length) {
                                const older = await api(
                                  `/conversations/${conversation}/messages?before=${messages[0].at}`,
                                );
                                setMessages((m) => [...older, ...m]);
                              }
                            })
                          }
                        >
                          Load earlier messages
                        </button>
                        {messages.map((m) => (
                          <div
                            className={`message ${m.from === user.id ? "mine" : ""}`}
                            key={m.id}
                          >
                            <small>
                              {profileName(social, m.from)} · {stamp(m.at)}
                            </small>
                            <p>{m.text}</p>
                          </div>
                        ))}
                      </div>
                      <form
                        className="send-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = e.currentTarget;
                          void run(async () => {
                            await api(
                              `/conversations/${conversation}/messages`,
                              { text: new FormData(f).get("text") },
                            );
                            f.reset();
                            await refresh();
                          });
                        }}
                      >
                        <input
                          name="text"
                          placeholder="Message your crew…"
                          aria-label="Message"
                          maxLength={1000}
                          required
                        />
                        <button className="button lime" disabled={busy}>
                          <Send size={18} /> Send
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="empty">
                      <MessageCircle size={40} />
                      <h2>A good game starts with “you on?”</h2>
                      <p>
                        Choose a conversation or message someone from Friends.
                      </p>
                      <button
                        className="button white"
                        onClick={() => toView("friends")}
                      >
                        Find your friends
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {view === "party" && user && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ROLL TOGETHER</div>
                  <h1>Your party.</h1>
                  <p>A home base for your crew between games.</p>
                </div>
              </div>
              {myParty ? (
                <div className="social-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        The crew{" "}
                        <span className="count">
                          {myParty.members.length}/8
                        </span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() =>
                          socialAction(`/parties/${myParty.id}/action`, {
                            action: "leave",
                          })
                        }
                      >
                        Leave party
                      </button>
                    </div>
                    {myParty.members.map((id: string) => (
                      <div className="friend-row" key={id}>
                        <Badge
                          profile={social.profiles.find(
                            (p: Profile) => p.id === id,
                          )}
                        />
                        <div>
                          <strong>{profileName(social, id)}</strong>
                          <small>
                            {id === myParty.owner
                              ? "Party leader"
                              : "Ready for good games"}
                          </small>
                        </div>
                        {myParty.owner === user.id && id !== user.id && (
                          <details>
                            <summary>•••</summary>
                            <div className="menu-pop">
                              <button
                                onClick={() =>
                                  socialAction(
                                    `/parties/${myParty.id}/action`,
                                    { action: "transfer", user: id },
                                  )
                                }
                              >
                                Make leader
                              </button>
                              <button
                                onClick={() =>
                                  socialAction(
                                    `/parties/${myParty.id}/action`,
                                    { action: "kick", user: id },
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                    <div className="inline wrap">
                      <button
                        className="button lime"
                        onClick={() => setModal("create")}
                      >
                        Pick a game <ArrowRight size={17} />
                      </button>
                      {myParty.room && (
                        <button
                          className="button white"
                          onClick={() =>
                            void run(async () => {
                              await command({
                                action: "join",
                                code: myParty.room,
                              });
                              setView("play");
                            })
                          }
                        >
                          Join room {myParty.room}
                        </button>
                      )}
                    </div>
                    <h3>Invite friends</h3>
                    {social.friends
                      .filter((id: string) => !myParty.members.includes(id))
                      .map((id: string) => (
                        <button
                          key={id}
                          className="button white small"
                          onClick={() =>
                            socialAction(`/parties/${myParty.id}/action`, {
                              action: "invite",
                              user: id,
                            })
                          }
                        >
                          {profileName(social, id)} <Plus size={15} />
                        </button>
                      ))}
                    {myParty.owner === user.id && (
                      <p>
                        <button
                          className="text-button danger"
                          onClick={() =>
                            socialAction(`/parties/${myParty.id}/action`, {
                              action: "disband",
                            })
                          }
                        >
                          Disband party
                        </button>
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Party chat</h2>
                    <div className="party-chat">
                      {myParty.chat.map((m: any) => (
                        <p key={m.id}>
                          <strong>{profileName(social, m.from)}</strong>{" "}
                          {m.text}
                        </p>
                      ))}
                    </div>
                    <form
                      className="send-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        socialAction(`/parties/${myParty.id}/action`, {
                          action: "chat",
                          text: new FormData(f).get("text"),
                        });
                        f.reset();
                      }}
                    >
                      <input
                        name="text"
                        aria-label="Party message"
                        placeholder="What's the plan?"
                        required
                        maxLength={500}
                      />
                      <button
                        className="icon-button"
                        aria-label="Send party message"
                      >
                        <Send size={17} />
                      </button>
                    </form>
                  </section>
                </div>
              ) : (
                <div className="empty panel">
                  <Users size={45} />
                  <h2>Make room for your people.</h2>
                  <p>
                    Create a party, invite friends, and take the same crew into
                    every match.
                  </p>
                  <button
                    className="button lime"
                    onClick={() => socialAction("/parties", {})}
                  >
                    <Plus size={18} /> Create party
                  </button>
                </div>
              )}
              {social.parties
                .filter((p: any) => p.invites.includes(user.id))
                .map((p: any) => (
                  <div className="panel invitation" key={p.id}>
                    <strong>
                      {profileName(social, p.owner)} invited you to a party
                    </strong>
                    <button
                      className="button lime"
                      onClick={() =>
                        socialAction(`/parties/${p.id}/action`, {
                          action: "accept",
                        })
                      }
                    >
                      Accept
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        socialAction(`/parties/${p.id}/action`, {
                          action: "decline",
                        })
                      }
                    >
                      Decline
                    </button>
                  </div>
                ))}
            </>
          )}
          {view === "profile" && user && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">MAKE YOURSELF AT HOME</div>
                  <h1>Your player.</h1>
                  <p>{user.handle}</p>
                </div>
                <button className="button white" onClick={logout}>
                  <LogOut size={16} /> Log out
                </button>
              </div>
              <section className="panel profile-editor">
                <div className="profile-preview">
                  <Badge profile={user} size="large" />
                  <h2>{user.handle}</h2>
                  <p>Your look follows you into every room.</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api("/profile", user.avatar, "PATCH");
                      notify("Your look is saved.");
                    });
                  }}
                >
                  <h2>Fresh fit.</h2>
                  {(["shirt", "skin", "hair"] as const).map((k) => (
                    <label className="color-setting" key={k}>
                      {k === "shirt"
                        ? "Shirt color"
                        : k === "skin"
                          ? "Skin tone"
                          : "Hair color"}
                      <input
                        type="color"
                        value={user.avatar[k]}
                        onChange={(e) =>
                          setUser({
                            ...user,
                            avatar: { ...user.avatar, [k]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Accessory
                    <select
                      value={user.avatar.style}
                      onChange={(e) =>
                        setUser({
                          ...user,
                          avatar: {
                            ...user.avatar,
                            style: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value="0">Keep it simple</option>
                      <option value="1">Clubhouse cap</option>
                      <option value="2">Shades</option>
                    </select>
                  </label>
                  <button className="button lime" disabled={busy}>
                    Save your look <Check size={17} />
                  </button>
                </form>
              </section>
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PLAY YOUR WAY</div>
                  <h1>Settings.</h1>
                  <p>Saved on this device.</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <h2>
                    <SlidersHorizontal size={20} /> Display & controls
                  </h2>
                  <label>
                    Graphics quality
                    <select
                      value={prefs.quality}
                      onChange={(e) =>
                        setPrefs({ ...prefs, quality: e.target.value })
                      }
                    >
                      <option value="low">Low — school MacBook friendly</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Camera
                    <select
                      value={prefs.camera}
                      onChange={(e) =>
                        setPrefs({ ...prefs, camera: e.target.value })
                      }
                    >
                      <option value="broadcast">Broadcast</option>
                      <option value="close">Third person</option>
                    </select>
                  </label>
                  <label>
                    Camera sensitivity
                    <input
                      type="range"
                      min=".2"
                      max="2"
                      step=".1"
                      value={prefs.sensitivity}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          sensitivity: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={prefs.reduced}
                      onChange={(e) =>
                        setPrefs({ ...prefs, reduced: e.target.checked })
                      }
                    />
                    Reduce motion
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={debug}
                      onChange={(e) => setDebug(e.target.checked)}
                    />
                    Show performance information
                  </label>
                  <details>
                    <summary>Remap controls</summary>
                    {Object.entries(prefs.bindings).map(([action, key]) => (
                      <label className="binding" key={action}>
                        {action}
                        <input
                          aria-label={`${action} key`}
                          value={key}
                          readOnly
                          onKeyDown={(e) => {
                            e.preventDefault();
                            setPrefs({
                              ...prefs,
                              bindings: { ...prefs.bindings, [action]: e.code },
                            });
                          }}
                        />
                      </label>
                    ))}
                  </details>
                </section>
                <section className="panel">
                  <h2>
                    <Volume2 size={21} /> Audio & privacy
                  </h2>
                  <label>
                    Voice volume
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      value={prefs.voice}
                      onChange={(e) =>
                        setPrefs({ ...prefs, voice: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Game effects
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      value={prefs.effects}
                      onChange={(e) =>
                        setPrefs({ ...prefs, effects: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={prefs.ptt}
                      onChange={(e) =>
                        setPrefs({ ...prefs, ptt: e.target.checked })
                      }
                    />
                    Push to talk — hold V
                  </label>
                  <p className="muted">
                    Microphone access is requested only when you enable voice in
                    a room. Voice is never recorded.
                  </p>
                  <h3>Blocked players</h3>
                  {social.blocks.length ? (
                    social.blocks.map((id: string) => (
                      <p key={id}>
                        {profileName(social, id)}{" "}
                        <button
                          className="text-button"
                          onClick={() =>
                            socialAction("/block", { user: id, blocked: false })
                          }
                        >
                          Unblock
                        </button>
                      </p>
                    ))
                  ) : (
                    <p className="muted">No blocked players.</p>
                  )}
                  {user && (
                    <>
                      <h3>Account</h3>
                      <button
                        className="button white"
                        onClick={() => setModal("password")}
                      >
                        Change password
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => setModal("delete")}
                      >
                        Delete account
                      </button>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
          {view==='not-found'&&<div className="empty panel"><Search size={36}/><h1>This court doesn't exist.</h1><p>The link may have changed. Head back to the clubhouse.</p><button className="button lime" onClick={()=>setView('home')}>Back home</button></div>}
          {!user&&['play','friends','messages','party','profile','rooms'].includes(view)&&<div className="empty panel"><Users size={38}/><h2>Your clubhouse is waiting.</h2><p>Sign in to open your friends, conversations and courts.</p><button className="button lime" onClick={()=>setModal('login')}>Log in</button></div>}
          {view.startsWith("policy:") && (
            <section className="panel policy">
              <h1>
                {view === "policy:privacy"
                  ? "Privacy"
                  : view === "policy:terms"
                    ? "Terms"
                    : "Community guidelines"}
              </h1>
              <p className="pill">
                DRAFT — OWNER REVIEW REQUIRED BEFORE PUBLIC LAUNCH
              </p>
              <p>
                JPSPG is a personal multiplayer prototype. Be kind, play fairly,
                and do not share private personal information. Harassment,
                impersonation, cheating and abusive content are not allowed.
              </p>
              <p>
                Accounts store a username, password hash, avatar, messages,
                friendships and related game records. Passwords are never stored
                in plain text. Voice is transmitted only after you enable it and
                is not recorded. Messages are retained for the operator’s
                configured retention period, initially 90 days.
              </p>
              <p>
                Use block, mute and report controls when needed. Reports are
                stored for operator review; a staffed moderation service has not
                yet been established. The operator must supply their identity,
                contact details, final minimum-age policy, retention policy and
                applicable terms before public launch.
              </p>
              <button className="button lime" onClick={() => setView("home")}>
                Back to clubhouse
              </button>
            </section>
          )}
          <footer>
            <span className="footer-brand">jpspg.</span>
            <span>Good games are better together.</span>
            <div>
              <button onClick={() => toView("policy:community")}>
                Community
              </button>
              <button onClick={() => toView("policy:privacy")}>Privacy</button>
              <button onClick={() => toView("policy:terms")}>Terms</button>
              <span>© {new Date().getFullYear()} JPSPG</span>
            </div>
          </footer>
        </main>
        {view === "home" && (
          <aside className="friends-sidebar">
            <div className="panel-heading">
              <h3>Your crew</h3>
              <button
                className="icon-button"
                aria-label="Add friend"
                onClick={() => setModal(user ? "friend" : "register")}
              >
                <Plus size={17} />
              </button>
            </div>
            {user ? (
              <>
                {social.friends.length ? (
                  social.friends.slice(0, 6).map((id: string) => {
                    const p = social.profiles.find((p: Profile) => p.id === id);
                    return (
                      <button
                        className="crew-friend"
                        key={id}
                        onClick={() => void openDM(id)}
                      >
                        <Badge profile={p} />
                        <span>
                          {p?.handle.split("#")[0]}
                          <small>{p?.status}</small>
                        </span>
                        <i
                          className={`dot ${p?.status === "offline" ? "gray" : ""}`}
                        />
                      </button>
                    );
                  })
                ) : (
                  <div className="sidebar-empty">
                    <Users size={30} />
                    <h4>Save a spot for your friends.</h4>
                    <p>Add them by username and tag.</p>
                    <button
                      className="button white small"
                      onClick={() => setModal("friend")}
                    >
                      Add a friend
                    </button>
                  </div>
                )}
                <div className="sidebar-party">
                  <span className="eyebrow">PARTY UP</span>
                  <h3>
                    {myParty
                      ? `${myParty.members.length} in your crew`
                      : "Same crew. Next game."}
                  </h3>
                  <p>Stay together from the court to the pitch.</p>
                  <button
                    className="button ink"
                    onClick={() => toView("party")}
                  >
                    {myParty ? "Open party" : "Create a party"}
                    <Plus size={15} />
                  </button>
                </div>
              </>
            ) : (
              <div className="sidebar-empty">
                <Users size={34} />
                <h4>Your people belong here.</h4>
                <p>
                  Make an account to find friends, send messages, and party up.
                </p>
                <button
                  className="button lime small"
                  onClick={() => setModal("register")}
                >
                  Find your crew <ArrowRight size={15} />
                </button>
              </div>
            )}
            <div className="quick-guide">
              <span className="eyebrow">THE QUICK START</span>
              <p>
                <b>01</b> Make yourself a player.
              </p>
              <p>
                <b>02</b> Bring a friend or a few.
              </p>
              <p>
                <b>03</b> Let the good games begin.
              </p>
            </div>
            <div className="sidebar-foot">
              <Shield size={16} />
              <span>
                Good vibes. Fair play.
                <br />
                <button
                  className="text-button"
                  onClick={() => toView("policy:community")}
                >
                  Our community guidelines ↗
                </button>
              </span>
            </div>
          </aside>
        )}
      </div>
      <div className="mobile-note">
        Best played on a laptop with a keyboard. Friends and messages work here
        too.
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notice}
        </div>
      )}
      {(modal === "register" || modal === "login") && (
        <Modal
          title={
            modal === "register" ? "Your crew is waiting." : "Welcome back."
          }
          onClose={close}
        >
          <p>
            {modal === "register"
              ? "Pick a name. We’ll add your unique four-digit tag."
              : "Enter your full identity, including the # and four digits."}
          </p>
          <form onSubmit={(e) => void authenticate(e, modal === "register")}>
            {modal === "register" ? (
              <label>
                Username
                <input
                  autoComplete="username"
                  name="username"
                  aria-label="Username"
                  placeholder="yashvir"
                  minLength={5}
                  maxLength={20}
                  required
                />
                <small>
                  At least five letters. Numbers and underscores are welcome.
                </small>
              </label>
            ) : (
              <label>
                Your identity
                <input
                  autoComplete="username"
                  name="handle"
                  placeholder="yashvir#7232"
                  required
                />
              </label>
            )}
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  modal === "register" ? "new-password" : "current-password"
                }
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {modal === "register" && (
              <label className="check">
                <input type="checkbox" name="accepted" required />I am{" "}
                {config.minimumAge} or older and agree to the community
                guidelines.
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            <button className="button lime full" disabled={busy}>
              {busy
                ? "One moment…"
                : modal === "register"
                  ? "Create account"
                  : "Log in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setModal(modal === "register" ? "login" : "register");
            }}
          >
            {modal === "register"
              ? "Already a player? Log in"
              : "New here? Create an account"}
          </button>
          {modal === "login" && (
            <button className="text-button" onClick={() => setModal("recover")}>
              Use a recovery code
            </button>
          )}
        </Modal>
      )}
      {modal === "recovery" && (
        <Modal title="Save your recovery code." onClose={close}>
          <p>
            This code can reset your password. Save it somewhere private; it
            won’t be shown again.
          </p>
          <code className="recovery-code">{recovery}</code>
          <button
            className="button white"
            onClick={() =>
              void navigator.clipboard
                .writeText(recovery)
                .then(() => notify("Recovery code copied"))
            }
          >
            <Copy size={16} />
            Copy code
          </button>
          <button className="button lime" onClick={close}>
            I’ve saved it
          </button>
        </Modal>
      )}
      {modal === "recover" && (
        <Modal title="Recover your account" onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const d = await api("/account/recover", {
                  handle: f.get("handle"),
                  code: f.get("code"),
                  password: f.get("password"),
                });
                setRecovery(d.recoveryCode);
                setModal("recovery");
                notify("Password reset. Log in with your new password.");
              });
            }}
          >
            <label>
              Full identity
              <input name="handle" required />
            </label>
            <label>
              Recovery code
              <input name="code" required />
            </label>
            <label>
              New password
              <input name="password" type="password" required minLength={10} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button lime" disabled={busy}>
              Reset password
            </button>
          </form>
        </Modal>
      )}
      {modal === "create" && (
        <Modal title="Make it your game." onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await command({
                  action: "create",
                  game,
                  public: f.get("public") === "on",
                });
                setModal("");
                setView("play");
              });
            }}
          >
            <div className="game-selector">
              <button
                type="button"
                className={game === "basketball" ? "selected" : ""}
                onClick={() => setGame("basketball")}
              >
                <CircleDot />
                Rooftop hoops<small>1v1 – 3v3</small>
              </button>
              <button
                type="button"
                className={game === "soccer" ? "selected" : ""}
                onClick={() => setGame("soccer")}
              >
                <Gamepad2 />
                Pocket pitch<small>1v1 – 4v4</small>
              </button>
            </div>
            <label className="check">
              <input type="checkbox" name="public" />
              List this room publicly
            </label>
            <p className="muted">
              Private by default. Share the generated code with your crew.
            </p>
            {error && <p className="form-error">{error}</p>}
            <button
              className="button lime full"
              disabled={busy || connection !== "connected"}
            >
              Create room <Plus size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Got a room code?" onClose={close}>
          <p>Six characters. One good time.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code"))
                .trim()
                .toUpperCase();
              void run(async () => {
                await command({ action: "join", code });
                setModal("");
                setView("play");
              });
            }}
          >
            <label>
              Room code
              <input
                className="code-input"
                name="code"
                placeholder="ABC234"
                minLength={6}
                maxLength={6}
                required
                autoComplete="off"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button lime full" disabled={busy}>
              Join room <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "friend" && (
        <Modal title="Find your people." onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const handle = new FormData(e.currentTarget).get("handle");
              void run(async () => {
                await api("/friends/request", { handle });
                await refresh();
                setModal("");
                notify("Friend request sent");
              });
            }}
          >
            <label>
              Full username and tag
              <input name="handle" placeholder="yashvir#7232" required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button lime full" disabled={busy}>
              <Search size={17} />
              Send friend request
            </button>
          </form>
        </Modal>
      )}
      {modal === "group" && (
        <Modal title="Get a group going." onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const c = await api("/conversations", {
                  name: f.get("name"),
                  members: f.getAll("members"),
                  group: true,
                });
                await refresh();
                setConversation(c.id);
                setModal("");
              });
            }}
          >
            <label>
              Group name
              <input
                name="name"
                maxLength={40}
                placeholder="The after-school crew"
                required
              />
            </label>
            {social.friends.map((id: string) => (
              <label className="check" key={id}>
                <input type="checkbox" name="members" value={id} />
                {profileName(social, id)}
              </label>
            ))}
            {!social.friends.length && (
              <p>Add friends before making a group.</p>
            )}
            {error && <p className="form-error">{error}</p>}
            <button
              className="button lime"
              disabled={busy || !social.friends.length}
            >
              Create group
            </button>
          </form>
        </Modal>
      )}
      {modal === "group-settings" && (
        <Modal title="Conversation members" onClose={close}>
          {(() => {
            const c = social.conversations.find(
              (c: any) => c.id === conversation,
            );
            return c ? (
              <>
                <p>
                  {c.members
                    .map((id: string) => profileName(social, id))
                    .join(", ")}
                </p>
                {c.group && c.owner === user?.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget).get("name");
                      void run(async () => {
                        await api(`/conversations/${c.id}`, { name }, "PATCH");
                        await refresh();
                        close();
                      });
                    }}
                  >
                    <label>
                      Group name
                      <input name="name" defaultValue={c.name} maxLength={40} />
                    </label>
                    <button className="button lime">Save name</button>
                  </form>
                )}
                {c.group && c.owner === user?.id && (
                  <>
                    <h3>Add a friend</h3>
                    {social.friends
                      .filter((id: string) => !c.members.includes(id))
                      .map((id: string) => (
                        <button
                          className="button white small"
                          key={id}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/conversations/${c.id}`,
                                { add: id },
                                "PATCH",
                              );
                              await refresh();
                            })
                          }
                        >
                          {profileName(social, id)} +
                        </button>
                      ))}
                    <h3>Remove member</h3>
                    {c.members
                      .filter((id: string) => id !== user?.id)
                      .map((id: string) => (
                        <button
                          className="text-button"
                          key={id}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/conversations/${c.id}`,
                                { remove: id },
                                "PATCH",
                              );
                              await refresh();
                            })
                          }
                        >
                          Remove {profileName(social, id)}
                        </button>
                      ))}
                  </>
                )}
                {c.group && (
                  <button
                    className="text-button danger"
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `/conversations/${c.id}`,
                          { remove: user?.id },
                          "PATCH",
                        );
                        setConversation("");
                        close();
                        await refresh();
                      })
                    }
                  >
                    Leave group
                  </button>
                )}
              </>
            ) : null;
          })()}
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}
      {modal === "password" && (
        <Modal title="Change password" onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api("/account/password", {
                  old: f.get("old"),
                  password: f.get("password"),
                });
                setUser(null);
                setTicket("");
                setModal("login");
                notify("Password changed. Please log in again.");
              });
            }}
          >
            <label>
              Current password
              <input name="old" type="password" required />
            </label>
            <label>
              New password
              <input name="password" type="password" minLength={10} required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button lime" disabled={busy}>
              Change password
            </button>
          </form>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Delete your account?" onClose={close}>
          <p>
            This removes your account, friendships and your stored messages.
            This cannot be undone.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const password = new FormData(e.currentTarget).get("password");
              void run(async () => {
                await api("/account/delete", { password });
                setUser(null);
                setTicket("");
                setModal("");
                setView("home");
                notify("Your account was deleted.");
              });
            }}
          >
            <label>
              Confirm with your password
              <input name="password" type="password" required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button danger-button" disabled={busy}>
              Permanently delete account
            </button>
          </form>
        </Modal>
      )}
      {modal.startsWith("report:") && (
        <Modal title="Report a player" onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              void run(async () => {
                await api("/report", { user: modal.split(":")[1], reason });
                close();
                notify("Your report has been saved for review.");
              });
            }}
          >
            <label>
              What happened?
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button lime" disabled={busy}>
              Submit report
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
