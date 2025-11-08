// src/components/VoiceWidget.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Participant,
} from "livekit-client";

type Props = {
  roomId: string | number;
  identity: string;                 // your app user id / username
  apiBase?: string;                 // defaults to VITE_API_BASE
  livekitUrl?: string;              // override if you want; else VITE_LIVEKIT_URL
  autoJoin?: boolean;               // join on mount
};

type Speaker = { identity: string; level: number };

export default function VoiceWidget({
  roomId,
  identity,
  apiBase = import.meta.env.VITE_API_BASE || "",
  livekitUrl = import.meta.env.VITE_LIVEKIT_URL || "",
  autoJoin = false,
}: Props) {
  const roomRef = useRef<Room | null>(null);

  // hidden bucket for remote <audio> elements
  const audioBucketRef = useRef<HTMLDivElement | null>(null);
  // map (participantIdentity:trackSid) -> <audio>
  const audioEls = useRef(new Map<string, HTMLAudioElement>());

  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);      // ⬅ mic (publish) mute
  const [speakerMuted, setSpeakerMuted] = useState(false); // ⬅ speaker (playback) mute
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const label = useMemo(() => `lk:${roomId}`, [roomId]);

  async function fetchToken() {
    const params = new URLSearchParams({ room: String(roomId), identity });
    const r = await fetch(`${apiBase}/api/livekit/token?${params.toString()}`);
    if (!r.ok) throw new Error(`Token error ${r.status}`);
    const { url, token } = (await r.json()) as { url: string; token: string };
    return { url: livekitUrl || url, token };
  }

  const refreshParticipants = () => {
    const room = roomRef.current;
    if (!room) return;
    const remotes = Array.from(room.remoteParticipants.values());
    const list = remotes.map((p: RemoteParticipant) => p.identity);
    setParticipants([room.localParticipant.identity, ...list]);
  };

  async function join() {
    if (joined || joining) return;
    setError(null);
    setJoining(true);
    try {
      const { url, token } = await fetchToken();

      // Connect per docs: new Room() then room.connect(wsUrl, token)
      const room = new Room();
      await room.connect(url, token);
      roomRef.current = room;

      // Ensure browser allows audio playback (must be in user gesture)
      await room.startAudio();

      // Enable + publish microphone (prompts permission on first use)
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicMuted(false);

      // --- Remote audio subscribe / unsubscribe ---

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind !== "audio") return;
          const el = track.attach() as HTMLAudioElement; // <audio autoplay>
          el.dataset.lkParticipant = participant.identity;
          el.dataset.lkTrackSid = pub.trackSid || "";
          el.autoplay = true;
          el.muted = speakerMuted; // reflect speaker state (not mic)
          audioEls.current.set(`${participant.identity}:${pub.trackSid}`, el);
          audioBucketRef.current?.appendChild(el);
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const key = `${participant.identity}:${pub.trackSid}`;
          const el = audioEls.current.get(key);
          if (el) {
            track.detach(el);
            el.remove();
            audioEls.current.delete(key);
          } else {
            track.detach().forEach((n) => n.remove());
          }
        }
      );

      // --- Presence & speakers ---

      room.on(RoomEvent.ParticipantConnected, refreshParticipants);
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        // cleanup any dangling audio elements for that participant
        [...audioEls.current.entries()]
          .filter(([key]) => key.startsWith(`${p.identity}:`))
          .forEach(([key, el]) => {
            el.remove();
            audioEls.current.delete(key);
          });
        refreshParticipants();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (active: Participant[]) => {
        setSpeakers(
          active.map((p) => ({
            identity: p.identity,
            level: p.audioLevel ?? 0,
          }))
        );
      });

      refreshParticipants();
      setJoined(true);
    } catch (e: any) {
      console.error(`[${label}] join failed`, e);
      setError(e?.message || "Failed to join voice");
      setJoined(false);
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    try {
      const room = roomRef.current;
      if (room) {
        // detach & remove any <audio> we created
        [...audioEls.current.values()].forEach((el) => el.remove());
        audioEls.current.clear();
        room.disconnect();
      }
    } catch {
      // ignore
    } finally {
      roomRef.current = null;
      setJoined(false);
      setMicMuted(false);
      setSpeakerMuted(false);
      setParticipants([]);
      setSpeakers([]);
    }
  }

  // Toggle MIC (publish) mute — should NOT affect remote playback
  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!next); // enabled=false => muted
      setMicMuted(next);
    } catch (e) {
      console.error("mic toggle failed", e);
    }
  }

  // Toggle SPEAKER (playback) mute — mutes all remote <audio> elements locally
  function toggleSpeaker() {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    for (const el of audioEls.current.values()) {
      el.muted = next;
    }
  }

  // auto-join on mount (optional)
  useEffect(() => {
    if (autoJoin) void join();
    return () => {
      void leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, roomId, identity]);

  // helpful env hint
  useEffect(() => {
    if (!livekitUrl && !import.meta.env.VITE_LIVEKIT_URL) {
      setError("VITE_LIVEKIT_URL not set and no livekitUrl prop supplied.");
    }
  }, [livekitUrl]);

  return (
    <div className="relative">
      {/* Hidden bucket for remote <audio> elements */}
      <div
        ref={audioBucketRef}
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        aria-hidden
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 bg-neutral-800/70 text-white rounded-md px-3 py-2">
        {!joined ? (
          <button
            onClick={join}
            disabled={joining}
            className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60"
            title="Join voice"
          >
            {joining ? "Joining…" : "Join Voice"}
          </button>
        ) : (
          <>
            <button
              onClick={toggleMic}
              className={`px-3 py-1.5 rounded ${
                micMuted ? "bg-amber-700 hover:bg-amber-600" : "bg-green-700 hover:bg-green-600"
              }`}
              title={micMuted ? "Unmute mic" : "Mute mic"}
            >
              {micMuted ? "Unmute Mic" : "Mute Mic"}
            </button>

            <button
              onClick={toggleSpeaker}
              className={`px-3 py-1.5 rounded ${
                speakerMuted ? "bg-sky-700 hover:bg-sky-600" : "bg-indigo-700 hover:bg-indigo-600"
              }`}
              title={speakerMuted ? "Unmute speakers" : "Mute speakers"}
            >
              {speakerMuted ? "Unmute Speakers" : "Mute Speakers"}
            </button>

            <button
              onClick={leave}
              className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600"
              title="Leave voice"
            >
              Leave
            </button>
          </>
        )}

        {/* Presence & speakers */}
        <div className="ml-2 text-xs text-neutral-300 space-y-0.5">
          <div>
            <span className="opacity-70">Participants:</span>{" "}
            {participants.length ? participants.join(", ") : "—"}
          </div>
          <div>
            <span className="opacity-70">Speaking:</span>{" "}
            {speakers.length ? speakers.map((s) => s.identity).join(", ") : "—"}
          </div>
        </div>

        {error && <div className="ml-2 text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
}
