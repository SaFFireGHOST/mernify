// src/components/RoomVideoPlayer.tsx
import React, { useRef, useCallback, useEffect } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import useRoomPlayback from "@/hooks/useRoomPlayback";


const SEEK_THRESHOLD = 1.25; // seconds
const UPDATE_THROTTLE_MS = 1500; // ms

type Props = {
    roomId: number | string;
    // accept both names (prefer youtubeUrl if parent passes it)
    youtubeUrl?: string | null;
    initialYoutubeUrl?: string | null;
    userId?: string | null;
    // optional forwarded callbacks (keeps compatibility with StudyRoom usage)
    onMenuToggle?: () => void;
    onTimeUpdate?: (t: number) => void;
    seekToTime?: number | null;
    onSeekComplete?: () => void;
};

export default function RoomVideoPlayer({
    roomId,
    youtubeUrl = undefined,
    initialYoutubeUrl = null,
    userId = null,
    onMenuToggle,
    onTimeUpdate,
    seekToTime = null,
    onSeekComplete,
}: Props) {
    const lastSentRef = useRef<number>(0);
    const pendingSeekRef = useRef<number | null>(null);
    const playerControlRef = useRef<any | null>(null);
    const isPlayingRef = useRef(false);

    const didInitRef = useRef(false);
    const suppressEchoRef = useRef(false);


    // subscribe to room_playback updates (your hook) so we can sync play/pause/time
    const { latest, sendLocalUpdate } = useRoomPlayback(roomId, (row: any) => {
        if (!row) return;

        // OPTIONAL: ignore our own very-recent updates to avoid echo loops
        // if (row.updated_by && userId && row.updated_by === userId) return;

        const player = playerControlRef.current;
        const getCurrentTime = player?.getCurrentTime;
        const seekTo = player?.seekTo;
        const setPlaying = player?.setPlaying;

        // Initial hydrate: seek to saved time and keep paused, once
        if (!didInitRef.current) {
            didInitRef.current = true;

            const initialTime = Number(row.playback_time) || 0;
            if (typeof seekTo === "function") {
                suppressEchoRef.current = true;
                seekTo(initialTime);
                if (typeof setPlaying === "function") setPlaying(false); // stay paused on first load
                isPlayingRef.current = false;
                setTimeout(() => { suppressEchoRef.current = false; }, 250);
            } else {
                // player not ready yet → remember to seek once it is
                pendingSeekRef.current = initialTime;
            }
            return; // don't run normal sync logic on the first hydrate
        }

        if (suppressEchoRef.current) return;

        // Compute expected time:
        // - if paused, it's exactly the stored playback_time
        // - if playing, add elapsed since updated_at
        let expectedTime = Number(row.playback_time) || 0;
        if (row.is_playing) {
            const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
            const elapsedSec = (Date.now() - updatedAtMs) / 1000;
            expectedTime += elapsedSec;
        }

        const localTime = typeof getCurrentTime === "function" ? Number(getCurrentTime()) : null;

        // Seek only if drift is significant
        if (localTime !== null) {
            const diff = Math.abs(localTime - expectedTime);
            if (diff > SEEK_THRESHOLD && typeof seekTo === "function") {
                suppressEchoRef.current = true;
                seekTo(expectedTime);
                setTimeout(() => { suppressEchoRef.current = false; }, 200);
            }
        } else {
            // player not ready → stash the target time
            pendingSeekRef.current = expectedTime;
        }

        // Sync playing state last (no-op if already matching)
        if (typeof setPlaying === "function") {
            setPlaying(Boolean(row.is_playing));
        }
        isPlayingRef.current = Boolean(row.is_playing);
    });

    console.log({
        propFromStudyRoom: youtubeUrl,
        fromPlaybackHook: latest?.video_url,
    });

    // Determine the effective URL to give to VideoPlayer:
    // priority: explicit youtubeUrl prop > initialYoutubeUrl prop > latest.room_playback.video_url
    // TO:
    const effectiveUrl = (youtubeUrl || initialYoutubeUrl || latest?.video_url) ?? undefined;

    // debug log to help you see why iframe shows / doesn't show
    useEffect(() => {
        console.log(`[RoomVideoPlayer] room=${roomId} effectiveUrl=`, effectiveUrl);
    }, [roomId, effectiveUrl]);

    // Periodic time update from VideoPlayer
    const handleLocalTimeUpdate = useCallback(
        async (time: number) => {
            onTimeUpdate?.(time);
            const now = Date.now();
            if (now - lastSentRef.current < UPDATE_THROTTLE_MS) return;
            lastSentRef.current = now;

            try {
                await sendLocalUpdate({
                    video_url: effectiveUrl ?? null,
                    is_playing: isPlayingRef.current, // <-- respect real state
                    playback_time: time,
                    client_ts: Date.now(),
                    updated_by: userId,
                });
            } catch (e) {
                console.error("sendLocalUpdate error", e);
            }
        },
        [onTimeUpdate, sendLocalUpdate, effectiveUrl, userId]
    );

    // When local play/pause happens, update the ref and post it once.
    const handleLocalPlayPause = useCallback(async (isPlaying: boolean, currentTime: number) => {
        isPlayingRef.current = isPlaying;
        try {
            await sendLocalUpdate({
                video_url: effectiveUrl ?? null,
                is_playing: isPlaying,
                playback_time: currentTime,
                client_ts: Date.now(),
                updated_by: userId,
            });
        } catch (e) {
            console.error("sendLocalUpdate play/pause error", e);
        }
    }, [sendLocalUpdate, effectiveUrl, userId]);

    const handleLocalSeek = useCallback(
        async (seekTo: number) => {
            onTimeUpdate?.(seekTo);
            try {
                await sendLocalUpdate({
                    video_url: effectiveUrl ?? null,
                    is_playing: isPlayingRef.current,
                    playback_time: seekTo,
                    client_ts: Date.now(),
                    updated_by: userId,
                });
            } catch (e) {
                console.error("sendLocalUpdate seek error", e);
            }
        },
        [sendLocalUpdate, effectiveUrl, userId, onTimeUpdate]
    );

    const setPlayerControls = useCallback((controls: any) => {
        playerControlRef.current = controls;
        if (pendingSeekRef.current != null && controls?.seekTo) {
            controls.seekTo(pendingSeekRef.current);
            pendingSeekRef.current = null;
        }
    }, []);

    // if parent asks to seek externally (e.g., CollaborationPanel), forward it to player controls
    useEffect(() => {
        if (seekToTime == null) return;
        const controls = playerControlRef.current;
        if (controls?.seekTo) {
            controls.seekTo(seekToTime);
            onSeekComplete?.();
        } else {
            // store pending seek if controls not ready yet
            pendingSeekRef.current = seekToTime;
        }
    }, [seekToTime, onSeekComplete]);

    return (
        <VideoPlayer
            youtubeUrl={effectiveUrl}
            onTimeUpdate={handleLocalTimeUpdate}
            registerControls={setPlayerControls}
            onLocalPlay={(t: number) => handleLocalPlayPause(true, t)}
            onLocalPause={(t: number) => handleLocalPlayPause(false, t)}
            onLocalSeek={(t: number) => handleLocalSeek(t)}
            onMenuToggle={onMenuToggle}
            seekToTime={seekToTime ?? null}
            onSeekComplete={onSeekComplete}
        />
    );
}
