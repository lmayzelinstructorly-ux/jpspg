import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones } from "lucide-react";
import type { Room as VoiceRoom } from "livekit-client";
import type { Snapshot } from "../../../packages/shared/src/index";
import { distance, voiceGain } from "../../../packages/shared/src/index";
import { api } from "./api";
export default function Voice({
  room,
  me,
  blocked = [],
  volume = 1,
  ptt = false,
  onError,
}: {
  room: Snapshot;
  me: string;
  blocked?: string[];
  volume?: number;
  ptt?: boolean;
  onError: (e: string) => void;
}) {
  const ref = useRef<VoiceRoom | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const generation = useRef(0);
  useEffect(() => {
    return () => {
      generation.current++;
      ref.current?.disconnect();
      ref.current = null;
    };
  }, [room.code]);
  useEffect(() => {
    const local = room.players.find((p) => p.id === me);
    if (!local) return;
    ref.current?.remoteParticipants.forEach((participant) => {
      const other = room.players.find((p) => p.id === participant.identity);
      const gain =
        deaf || blocked.includes(participant.identity) || !other
          ? 0
          : voiceGain(distance(local, other)) *
            volume *
            (levels[participant.identity] ?? 1);
      participant.setVolume(gain);
    });
  }, [room, me, blocked, volume, deaf, levels]);
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea")) return;
      if (e.code === "KeyM" && !e.repeat) setMuted((m) => !m);
      if (e.code === "KeyV" && ptt && !muted)
        void ref.current?.localParticipant.setMicrophoneEnabled(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && ptt)
        void ref.current?.localParticipant.setMicrophoneEnabled(false);
    };
    const blur = () => {
      if (ptt) void ref.current?.localParticipant.setMicrophoneEnabled(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled, ptt, muted]);
  useEffect(() => {
    if (enabled)
      void ref.current?.localParticipant
        .setMicrophoneEnabled(!muted && !ptt)
        .catch((e) => onError(e.message));
  }, [enabled, muted, ptt, onError]);
  async function enable() {
    setBusy(true);
    const current = ++generation.current;
    try {
      const credentials = await api("/voice/token", {});
      const { Room, RoomEvent, Track } = await import("livekit-client");
      if (current !== generation.current) return;
      const voice = new Room({ adaptiveStream: true, dynacast: true });
      ref.current = voice;
      voice.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.dataset.jpspgVoice = "true";
          document.body.appendChild(element);
        }
      });
      voice.on(RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((el) => el.remove()),
      );
      voice.on(RoomEvent.ActiveSpeakersChanged, (p) =>
        setSpeakers(p.map((p) => p.identity)),
      );
      voice.on(RoomEvent.Disconnected, () => {
        document
          .querySelectorAll("[data-jpspg-voice]")
          .forEach((el) => el.remove());
        setEnabled(false);
      });
      await voice.connect(credentials.url, credentials.token);
      if (current !== generation.current) {
        await voice.disconnect();
        return;
      }
      await voice.startAudio();
      await voice.localParticipant.setMicrophoneEnabled(true);
      if (ptt) await voice.localParticipant.setMicrophoneEnabled(false);
      setEnabled(true);
    } catch (e) {
      await ref.current?.disconnect();
      onError(
        (e as Error).message ||
          "Microphone unavailable. Keep playing with text chat.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return (
      <div className="voice-off">
        <button
          className="button ghost"
          onClick={() => void enable()}
          disabled={busy}
        >
          <Mic size={17} />
          {busy ? "Connecting…" : "Enable voice chat"}
        </button>
        <small>Optional mic access · never recorded</small>
      </div>
    );
  return (
    <div className="voice-controls">
      <button className="button ghost" onClick={() => setMuted(!muted)}>
        {muted ? <MicOff size={16} /> : <Mic size={16} />}{" "}
        {muted ? "Unmute" : "Mute"}
      </button>
      <button
        className="button ghost"
        aria-pressed={deaf}
        onClick={() => setDeaf(!deaf)}
      >
        <Headphones size={16} />
        {deaf ? "Undeafen" : "Deafen"}
      </button>
      <button
        className="text-button"
        onClick={() => void ref.current?.disconnect()}
      >
        Leave voice
      </button>
      <span className="tiny">
        {ptt
          ? "Hold V to talk"
          : speakers.length
            ? "Someone nearby is speaking"
            : "Proximity voice on"}
      </span>
      <details>
        <summary>Player volumes</summary>
        {room.players
          .filter((p) => p.id !== me)
          .map((p) => (
            <label key={p.id}>
              {p.handle}
              <input
                type="range"
                min="0"
                max="1"
                step=".05"
                value={levels[p.id] ?? 1}
                onChange={(e) =>
                  setLevels({ ...levels, [p.id]: Number(e.target.value) })
                }
              />
            </label>
          ))}
      </details>
    </div>
  );
}
