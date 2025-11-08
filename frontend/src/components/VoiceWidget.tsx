// src/components/VoiceWidget.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Room,
    RoomEvent,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Participant,
    Track, // for kind comparisons if you prefer
} from "livekit-client";

type Props = {
    roomId: string | number;
    identity: string;                 // your app/supabase user id or username
    apiBase?: string;                 // defaults to VITE_API_BASE
    livekitUrl?: string;              // optional override (else VITE_LIVEKIT_URL)
    autoJoin?: boolean;               // join on mount
};

type Speaker = { identity: string; level: number };

export default function VoiceWidget({
    roomId,
    identity,
    apiBase = import.meta.env.VITE_BACKEND_URL || "",
    livekitUrl = import.meta.env.VITE_LIVEKIT_URL || "",
    autoJoin = false,
}: Props) {
    const roomRef = useRef<Room | null>(null);

    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false);
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [participants, setParticipants] = useState<string[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);

    const label = useMemo(() => `room:${roomId}`, [roomId]);

    async function fetchToken() {
        const params = new URLSearchParams({ room: String(roomId), identity });
        const r = await fetch(`${apiBase}/api/livekit/token?${params.toString()}`);
        if (!r.ok) throw new Error(`Token error ${r.status}`);
        const { url, token } = (await r.json()) as { url: string; token: string };
        return { url: livekitUrl || url, token };
    }

    async function join() {
        if (joined || joining) return;
        setError(null);
        setJoining(true);
        try {
            const { url, token } = await fetchToken();

            // ✔ correct pattern per docs
            const room = new Room();
            await room.connect(url, token);
            roomRef.current = room;

            // Enable & publish microphone (LiveKit creates + publishes a local audio track)
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);

            // Attach subscribed remote audio tracks
            room.on(
                RoomEvent.TrackSubscribed,
                (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
                    // either compare to string 'audio' or Track.Kind.Audio
                    if (track.kind === "audio") {
                        const el = track.attach();
                        el.dataset["lkParticipant"] = participant.identity;
                        document.body.appendChild(el); // mount in hidden area or dedicated node
                    }
                }
            );

            // Detach on unsubscribe
            room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                track.detach().forEach((el) => el.remove());
            });

            // Keep a simple participant list (include self)
            const refreshParticipants = () => {
                const room = roomRef.current!;
                const remotes = Array.from(room.remoteParticipants.values()); // <— FIX
                const list = remotes.map((p) => p.identity);
                setParticipants([room.localParticipant.identity, ...list]);
            };

            // and update the listeners to use the same refresher
            room.on(RoomEvent.ParticipantConnected, refreshParticipants);
            room.on(RoomEvent.ParticipantDisconnected, (_p) => {
                // (optional) clean up any attached elements for _p.identity if you added them
                refreshParticipants();
            });


            room.on(RoomEvent.ParticipantConnected, refreshParticipants);
            room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
                document
                    .querySelectorAll(`[data-lk-participant="${p.identity}"]`)
                    .forEach((el) => el.parentElement?.removeChild(el));
                refreshParticipants();
            });

            // Active speakers
            room.on(RoomEvent.ActiveSpeakersChanged, (active: Participant[]) => {
                setSpeakers(
                    active.map((p) => ({
                        identity: p.identity,
                        level: p.audioLevel ?? 0,
                    }))
                );
            });

            // Initial lists
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
                // detach any remaining audio els
                document
                    .querySelectorAll("[data-lk-participant]")
                    .forEach((el) => el.parentElement?.removeChild(el));
                // auto-unpublishes local tracks; disconnect signaling
                room.disconnect();
            }
        } catch {
            // ignore
        } finally {
            roomRef.current = null;
            setJoined(false);
            setMuted(false);
            setParticipants([]);
            setSpeakers([]);
        }
    }

    async function toggleMute() {
        const room = roomRef.current;
        if (!room) return;
        const next = !muted;
        try {
            // enabled=false => muted
            await room.localParticipant.setMicrophoneEnabled(!next);
            setMuted(next);
        } catch (e) {
            console.error("mute toggle failed", e);
        }
    }

    // Auto-join/cleanup
    useEffect(() => {
        if (autoJoin) void join();
        return () => {
            void leave();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoJoin, roomId, identity]);

    // Helpful error if URL missing
    useEffect(() => {
        if (!livekitUrl && !import.meta.env.VITE_LIVEKIT_URL) {
            setError("VITE_LIVEKIT_URL not set and no livekitUrl prop supplied.");
        }
    }, [livekitUrl]);

    return (
        <div className="flex items-center gap-2 bg-neutral-800/70 text-white rounded-md px-3 py-2">
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
                        onClick={toggleMute}
                        className={`px-3 py-1.5 rounded ${muted ? "bg-amber-700 hover:bg-amber-600" : "bg-green-700 hover:bg-green-600"}`}
                        title={muted ? "Unmute" : "Mute"}
                    >
                        {muted ? "Unmute" : "Mute"}
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
            <div className="ml-2 text-xs text-neutral-300">
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
    );
}

