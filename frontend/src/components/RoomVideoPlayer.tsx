// src/components/RoomVideoPlayer.tsx
import React, { useRef, useCallback, useEffect } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import useRoomPlayback from "@/hooks/useRoomPlayback";
import type { RoomRow } from "@/hooks/useRoomRealtime";

const SEEK_THRESHOLD = 0.6; // seconds
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

  // subscribe to room_playback updates (your hook) so we can sync play/pause/time
  const { latest, sendLocalUpdate } = useRoomPlayback(roomId, (row: any) => {
    // remote update handler (same as your previous code)
    if (!row) return;
    const updatedAtMs = new Date(row.updated_at).getTime();
    const nowMs = Date.now();
    const elapsedSec = row.is_playing ? (nowMs - updatedAtMs) / 1000 : 0;
    const expectedTime = row.playback_time + elapsedSec;

    const getCurrentTime = playerControlRef.current?.getCurrentTime;
    const seekTo = playerControlRef.current?.seekTo;
    const setPlaying = playerControlRef.current?.setPlaying;

    const localTime = typeof getCurrentTime === "function" ? getCurrentTime() : null;
    if (localTime !== null) {
      const diff = Math.abs(localTime - expectedTime);
      if (diff > SEEK_THRESHOLD && typeof seekTo === "function") {
        seekTo(expectedTime);
      }
    } else {
      pendingSeekRef.current = expectedTime;
    }

    if (typeof setPlaying === "function") setPlaying(Boolean(row.is_playing));
  });

  // Determine the effective URL to give to VideoPlayer:
  // priority: explicit youtubeUrl prop > initialYoutubeUrl prop > latest.room_playback.video_url
  const effectiveUrl = (youtubeUrl ?? initialYoutubeUrl ?? (latest?.video_url ?? undefined)) ?? undefined;

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
          is_playing: true,
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

  const handleLocalPlayPause = useCallback(
    async (isPlaying: boolean, currentTime: number) => {
      try {
        await sendLocalUpdate({
          video_url: effectiveUrl ?? null,
          is_playing: Boolean(isPlaying),
          playback_time: currentTime,
          client_ts: Date.now(),
          updated_by: userId,
        });
      } catch (e) {
        console.error("sendLocalUpdate play/pause error", e);
      }
    },
    [sendLocalUpdate, effectiveUrl, userId]
  );

  const handleLocalSeek = useCallback(
    async (seekTo: number) => {
      onTimeUpdate?.(seekTo);
      try {
        await sendLocalUpdate({
          video_url: effectiveUrl ?? null,
          is_playing: true,
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
