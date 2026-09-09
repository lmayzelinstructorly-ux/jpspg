import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  DEFAULT_AVATAR,
  EMPTY_INPUT,
  type Input,
  type Snapshot,
  type Avatar as AvatarType,
  type Game,
} from "../../../packages/shared/src/index";

type Props = {
  room?: Snapshot;
  me?: string;
  preview?: Game;
  quality: string;
  reduced: boolean;
  cameraMode: string;
  sensitivity: number;
  bindings: Record<string, string>;
  onInput?: (i: Input) => void;
  onStats?: (fps: number) => void;
  onCharge?: (v: number) => void;
  onPortal?: (game: Game) => void;
};
const teamColors = ["#b4ee4a", "#ff846b"];
function Box({
  at,
  size,
  color,
  ...rest
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={at} {...rest} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Stripe({
  at,
  size,
  color = "#f7faf4",
}: {
  at: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return <Box at={at} size={size} color={color} />;
}
function Circle({
  at,
  r,
  color = "#f7faf4",
}: {
  at: [number, number, number];
  r: number;
  color?: string;
}) {
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r - 0.04, r + 0.04, 64]} />
      <meshBasicMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  );
}
function Label({
  text,
  at,
  size = 3,
  color = "#203742",
  bg = "transparent",
}: {
  text: string;
  at: [number, number, number];
  size?: number;
  color?: string;
  bg?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 128);
    }
    ctx.fillStyle = color;
    ctx.font = "bold 44px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color, bg]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={at} scale={[size, size / 4, 1]}>
      <spriteMaterial map={texture} depthWrite={false} />
    </sprite>
  );
}
function Avatar({
  data,
  at = [0, 0, 0],
  angle = 0,
  name = "",
  moving = false,
  emote = "",
  local = false,
  team,
  reduced = false,
}: {
  data?: AvatarType;
  at?: [number, number, number];
  angle?: number;
  name?: string;
  moving?: boolean;
  emote?: string;
  local?: boolean;
  team?: number;
  reduced?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const avatar = data || DEFAULT_AVATAR;
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    ref.current.position.lerp(new THREE.Vector3(...at), 1 - Math.exp(-18 * dt));
    let delta = angle - ref.current.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    ref.current.rotation.y += delta * Math.min(1, dt * 12);
    const t = clock.elapsedTime;
    if (left.current && right.current && !reduced) {
      left.current.rotation.x = moving ? Math.sin(t * 12) * 0.5 : 0;
      right.current.rotation.x = moving ? -Math.sin(t * 12) * 0.5 : 0;
      right.current.rotation.z =
        emote === "wave"
          ? Math.sin(t * 9) * 0.4 - 2
          : emote === "cheer"
            ? -2
            : 0;
      left.current.rotation.z = emote === "cheer" ? 2 : 0;
    }
    if (body.current)
      body.current.position.y =
        !reduced && emote === "dance" ? Math.abs(Math.sin(t * 6)) * 0.3 : 0;
  });
  return (
    <>
      <group ref={ref} position={at}>
        <group ref={body}>
          <mesh position={[0, 1.55, 0]} castShadow>
            <sphereGeometry args={[0.39, 12, 10]} />
            <meshStandardMaterial color={avatar.skin} />
          </mesh>
          <mesh position={[0, 1.78, -0.04]}>
            <sphereGeometry
              args={[0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial color={avatar.hair} />
          </mesh>
          <Box
            at={[0, 1.01, 0]}
            size={[0.65, 0.64, 0.4]}
            color={team !== undefined ? teamColors[team] : avatar.shirt}
          />
          <Box
            at={[-0.18, 0.38, 0]}
            size={[0.24, 0.52, 0.26]}
            color="#324453"
          />
          <Box at={[0.18, 0.38, 0]} size={[0.24, 0.52, 0.26]} color="#324453" />
          <Box
            at={[-0.18, 0.1, 0.1]}
            size={[0.29, 0.16, 0.42]}
            color="#fbfcf9"
          />
          <Box
            at={[0.18, 0.1, 0.1]}
            size={[0.29, 0.16, 0.42]}
            color="#fbfcf9"
          />
          <group ref={left} position={[-0.46, 1.18, 0]}>
            <Box
              at={[0, -0.23, 0]}
              size={[0.2, 0.54, 0.22]}
              color={avatar.skin}
            />
          </group>
          <group ref={right} position={[0.46, 1.18, 0]}>
            <Box
              at={[0, -0.23, 0]}
              size={[0.2, 0.54, 0.22]}
              color={avatar.skin}
            />
          </group>
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} position={[x, 1.59, 0.345]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshBasicMaterial color="#162935" />
            </mesh>
          ))}
          {avatar.style === 1 && (
            <Box
              at={[0, 1.96, 0]}
              size={[0.76, 0.12, 0.7]}
              color={avatar.shirt}
            />
          )}{" "}
          {avatar.style === 2 && (
            <Box
              at={[0, 1.58, 0.38]}
              size={[0.55, 0.13, 0.04]}
              color="#1c3038"
            />
          )}
        </group>
        {local && <Circle at={[0, 0.025, 0]} r={0.65} color="#fff" />}
      </group>
      {name && (
        <Label
          text={name}
          at={[at[0], at[1] + 2.35, at[2]]}
          size={3}
          color={local ? "#214432" : "#294258"}
        />
      )}
    </>
  );
}
function Hoop() {
  return (
    <group>
      <Box at={[0, 2, -11.3]} size={[0.16, 4, 0.16]} color="#36515d" />
      <Box at={[0, 3.7, -10.8]} size={[3, 1.7, 0.12]} color="#e8f2f1" />
      <Box at={[0, 3.55, -10.7]} size={[0.85, 0.08, 0.03]} color="#e9805c" />
      <mesh position={[0, 3.1, -10]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.065, 8, 28]} />
        <meshStandardMaterial color="#f16445" />
      </mesh>
      <mesh position={[0, 2.78, -10]}>
        <cylinderGeometry args={[0.53, 0.32, 0.65, 12, 1, true]} />
        <meshStandardMaterial
          color="#fff"
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
}
function Court({ game }: { game: Game }) {
  const soccer = game === "soccer";
  return (
    <group>
      <Box
        at={[0, -0.22, 0]}
        size={[soccer ? 28 : 30, 0.4, soccer ? 43 : 29]}
        color={soccer ? "#72af7e" : "#ea9873"}
      />
      <Box
        at={[0, 0.005, 0]}
        size={[soccer ? 25 : 27, 0.04, soccer ? 39 : 25]}
        color={soccer ? "#518f64" : "#4b87a0"}
      />
      {soccer ? (
        Array.from({ length: 8 }, (_, i) => (
          <Stripe
            key={i}
            at={[0, 0.04, -17 + i * 5]}
            size={[25, 0.01, 2.5]}
            color="#59986a"
          />
        ))
      ) : (
        <Box at={[0, 0.04, -6.7]} size={[6, 0.02, 8]} color="#a8d2d0" />
      )}
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <Stripe
            at={[sign * (soccer ? 12.1 : 13), 0.08, 0]}
            size={[0.1, 0.03, soccer ? 38 : 24]}
          />
          <Stripe
            at={[0, 0.08, sign * (soccer ? 19 : 12)]}
            size={[soccer ? 24.3 : 26, 0.03, 0.1]}
          />
        </group>
      ))}
      <Circle at={[0, 0.09, soccer ? 0 : -2.6]} r={soccer ? 4 : 3} />
      {soccer ? (
        <>
          <Stripe at={[0, 0.09, 0]} size={[24, 0.02, 0.08]} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <Stripe at={[0, 0.09, s * 13]} size={[12, 0.02, 0.1]} />
              {[-6, 6].map((x) => (
                <Stripe key={x} at={[x, 0.09, s * 16]} size={[0.1, 0.02, 6]} />
              ))}
              <Box
                at={[-4, 1.1, s * 19]}
                size={[0.15, 2.2, 0.15]}
                color="#fff"
              />
              <Box
                at={[4, 1.1, s * 19]}
                size={[0.15, 2.2, 0.15]}
                color="#fff"
              />
              <Box at={[0, 2.2, s * 19]} size={[8, 0.15, 0.15]} color="#fff" />
              <Box
                at={[0, 1.1, s * 20.1]}
                size={[8, 2.2, 0.06]}
                color="#b0c6bb"
              />
              {Array.from({ length: 15 }, (_, i) => (
                <Box
                  key={i}
                  at={[-3.8 + i * 0.54, 1.1, s * 20.15]}
                  size={[0.015, 2.2, 0.04]}
                  color="#fff"
                />
              ))}
            </group>
          ))}
        </>
      ) : (
        <>
          <Hoop />
          <Circle at={[0, 0.08, -10]} r={7.5} />
          <Stripe at={[-3, 0.08, -6.5]} size={[0.1, 0.02, 8]} />
          <Stripe at={[3, 0.08, -6.5]} size={[0.1, 0.02, 8]} />
        </>
      )}
    </group>
  );
}
function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box at={[0, 1.1, 0]} size={[0.32, 2.2, 0.32]} color="#9c8365" />
      <mesh position={[0, 2.9, 0]} castShadow>
        <icosahedronGeometry args={[1.35, 0]} />
        <meshStandardMaterial color="#81bba0" />
      </mesh>
    </group>
  );
}
function World({
  game,
  onPortal,
}: {
  game: Game;
  onPortal?: Props["onPortal"];
}) {
  return (
    <>
      <color attach="background" args={["#c6e3ef"]} />
      <fog attach="fog" args={["#c6e3ef", 48, 115]} />
      <ambientLight intensity={1.5} />
      <directionalLight
        position={[12, 25, 15]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
      />
      <Box at={[0, -0.6, 0]} size={[150, 0.5, 150]} color="#bed9d1" />
      {game === "hub" ? (
        <>
          <Box at={[0, -0.1, 0]} size={[28, 0.2, 28]} color="#e1e8dd" />
          <Circle at={[0, 0.03, 0]} r={5.7} color="#a9bcac" />
          <Circle at={[0, 0.03, 0]} r={6.1} color="#a9bcac" />
          <Label text="THE CLUBHOUSE" at={[0, 5, -10]} size={13} />
          {(["basketball", "soccer"] as Game[]).map((g, i) => (
            <group
              key={g}
              position={[i ? 10 : -10, 0, -7]}
              onClick={() => onPortal?.(g)}
            >
              <Box
                at={[0, 1.8, 0]}
                size={[4, 3.6, 0.7]}
                color={i ? "#b4ee4a" : "#ff9275"}
              />
              <Box at={[0, 1.7, 0.4]} size={[3.1, 2.8, 0.05]} color="#233942" />
              <Label
                text={i ? "SOCCER →" : "HOOPS →"}
                at={[0, 2, 0.55]}
                size={3.2}
                color="#ffffff"
              />
            </group>
          ))}
          <group position={[-24, 0, -13]} scale={0.52}>
            <Court game="basketball" />
          </group>
          <group position={[25, 0, -15]} scale={0.43}>
            <Court game="soccer" />
          </group>
          {[-9, 9].map((x) => (
            <group key={x}>
              <Box at={[x, 0.4, 7]} size={[4, 0.25, 1]} color="#b48c60" />
              <Box at={[x, 0.2, 7]} size={[3.5, 0.4, 0.5]} color="#5f7e72" />
            </group>
          ))}
        </>
      ) : (
        <Court game={game} />
      )}
      {[-25, -18, 18, 25].map((x, i) => (
        <Tree key={x} x={x} z={i % 2 ? 18 : -25} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Box
          key={i}
          at={[-45 + i * 11, 3 + (i % 3) * 2, -40]}
          size={[7, 6 + (i % 3) * 4, 7]}
          color={i % 2 ? "#b0cfdd" : "#adc9ce"}
        />
      ))}
    </>
  );
}
function Experience(props: Props) {
  const {
    room,
    me,
    preview,
    quality,
    reduced,
    cameraMode,
    sensitivity,
    bindings,
    onInput,
    onStats,
    onCharge,
    onPortal,
  } = props;
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const seq = useRef(0);
  const last = useRef(0);
  const frames = useRef({ t: 0, n: 0 });
  const charge = useRef(0);
  const game = room?.game || preview || "hub";
  const player = room?.players.find((p) => p.id === me);
  const target = useRef(new THREE.Vector3());
  const cameraGoal = useRef(new THREE.Vector3());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,textarea,select") ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const k = e.code;
      if (Object.values(bindings).includes(k)) {
        e.preventDefault();
        keys.current.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => {
      keys.current.clear();
      charge.current = 0;
      onCharge?.(0);
    };
    let dragging = false,
      px = 0;
    const pointer = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (dragging) {
        yaw.current -= (e.clientX - px) * 0.004 * sensitivity;
        px = e.clientX;
      }
    };
    const release = () => (dragging = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    gl.domElement.addEventListener("pointerdown", pointer);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      gl.domElement.removeEventListener("pointerdown", pointer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
    };
  }, [bindings, gl, onCharge, sensitivity]);
  useFrame((state, dt) => {
    const p = player;
    const t = state.clock.elapsedTime;
    frames.current.n++;
    frames.current.t += dt;
    if (frames.current.t > 2) {
      const fps = frames.current.n / frames.current.t;
      onStats?.(fps);
      frames.current = { n: 0, t: 0 };
    }
    const focus = new THREE.Vector3(p?.x || 0, 0, p?.z || 0);
    if (preview && !room) {
      cameraGoal.current.set(
        game === "soccer" ? 29 : 25,
        game === "soccer" ? 29 : 22,
        game === "soccer" ? 32 : 28,
      );
      target.current.set(0, 0, -2);
    } else if (cameraMode === "close") {
      cameraGoal.current.set(
        focus.x + Math.sin(yaw.current) * 13,
        12,
        focus.z + Math.cos(yaw.current) * 13,
      );
      target.current.copy(focus);
    } else {
      cameraGoal.current.set(
        focus.x * 0.45 + Math.sin(yaw.current) * 5,
        game === "soccer" ? 29 : 24,
        focus.z * 0.35 + 22,
      );
      target.current.set(focus.x * 0.45, 0, focus.z * 0.35 - 2);
    }
    camera.position.lerp(
      cameraGoal.current,
      reduced ? 1 : 1 - Math.exp(-dt * 5),
    );
    camera.lookAt(target.current);
    if (onInput && p && t - last.current > 1 / 30) {
      last.current = t;
      const pressed = (name: string) => keys.current.has(bindings[name]);
      const x = Number(pressed("right")) - Number(pressed("left")),
        z = Number(pressed("back")) - Number(pressed("forward"));
      const ax = x * Math.cos(yaw.current) + z * Math.sin(yaw.current),
        az = z * Math.cos(yaw.current) - x * Math.sin(yaw.current);
      const shoot = pressed("shoot");
      if (shoot && !charge.current) charge.current = t;
      if (shoot) onCharge?.(Math.min(1.6, t - charge.current));
      else {
        if (charge.current) onCharge?.(0);
        charge.current = 0;
      }
      const len = Math.hypot(ax, az) || 1;
      onInput({
        ...EMPTY_INPUT,
        seq: ++seq.current,
        x: ax,
        z: az,
        aimX: x || z ? ax / len : -Math.sin(yaw.current),
        aimZ: x || z ? az / len : -Math.cos(yaw.current),
        sprint: pressed("sprint"),
        shoot,
        pass: pressed("pass"),
        defend: pressed("defend"),
      });
    }
  });
  return (
    <>
      <World game={game} onPortal={onPortal} />
      {room ? (
        room.players.map((p) => (
          <Avatar
            key={p.id}
            data={p.avatar}
            at={[p.x, p.y, p.z]}
            angle={p.angle}
            name={p.handle}
            moving={p.id === me ? keys.current.size > 0 : false}
            emote={p.emote}
            local={p.id === me}
            team={game === "hub" ? undefined : p.team}
            reduced={reduced}
          />
        ))
      ) : (
        <>
          <Avatar at={[-2, 0, 3]} angle={-0.6} local />
          <Avatar
            at={[3, 0, -3]}
            data={{ ...DEFAULT_AVATAR, shirt: "#ff846b", style: 1 }}
            angle={1.5}
          />
          <Avatar
            at={[-5, 0, -5]}
            data={{ ...DEFAULT_AVATAR, shirt: "#829ceb", skin: "#946344" }}
          />
        </>
      )}
      {game !== "hub" && (
        <mesh
          position={[room?.ball.x || 0, room?.ball.y || 0.4, room?.ball.z || 2]}
          castShadow
        >
          <sphereGeometry
            args={[
              game === "soccer" ? 0.36 : 0.3,
              quality === "low" ? 10 : 16,
              12,
            ]}
          />
          <meshStandardMaterial
            color={game === "soccer" ? "#fff7e9" : "#ed8439"}
            roughness={0.8}
          />
          {game === "basketball" && (
            <mesh>
              <torusGeometry args={[0.3, 0.012, 6, 24]} />
              <meshBasicMaterial color="#613d28" />
            </mesh>
          )}
        </mesh>
      )}
      {game === "soccer" &&
        [-1, 1].map((s, i) => (
          <Avatar
            key={s}
            at={[room?.keepers[i] || 0, 0, s * 17]}
            angle={s === 1 ? Math.PI : 0}
            data={{ ...DEFAULT_AVATAR, shirt: "#f3d16f" }}
          />
        ))}
    </>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <strong>3D graphics are unavailable</strong>
        <p>
          Try enabling hardware acceleration in Chrome or Safari. Your friends
          and messages still work.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Scene(props: Props) {
  return (
    <SceneBoundary>
      <Suspense
        fallback={<div className="scene-fallback">Opening the clubhouse…</div>}
      >
        <Canvas
          frameloop={props.preview && !props.room ? 'demand' : 'always'}
          shadows={props.quality === "high"}
          dpr={props.quality === "low" ? 1 : [1, 1.5]}
          camera={{ position: [25, 22, 28], fov: 48, near: 0.1, far: 160 }}
          gl={{
            antialias: props.quality !== "low",
            powerPreference: "low-power",
          }}
        >
          <Experience {...props} />
        </Canvas>
      </Suspense>
    </SceneBoundary>
  );
}
