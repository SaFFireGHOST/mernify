import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface VideoPlayerControls {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  setPlaying: (play: boolean) => void;
  isReady?: () => boolean;
}

interface VideoPlayerProps {
  onMenuToggle: () => void;
  youtubeUrl?: string;
  onTimeUpdate?: (time: number) => void;         // already present
  seekToTime?: number | null;                    // already present
  onSeekComplete?: () => void;                   // already present

  /* NEW: register controls so parent can call seek/getTime/setPlaying */
  registerControls?: (controls: VideoPlayerControls) => void;

  /* NEW: notify parent about local user interactions (immediate events) */
  onLocalPlay?: (currentTime: number) => void;
  onLocalPause?: (currentTime: number) => void;
  onLocalSeek?: (seekToTime: number) => void;
}


declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const VideoPlayer = ({ onMenuToggle, youtubeUrl, onTimeUpdate, seekToTime, onSeekComplete, registerControls, onLocalPlay, onLocalPause,
  onLocalSeek }: VideoPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState([70]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        onLocalPause?.(videoRef.current.currentTime);
      } else {
        videoRef.current.play();
        onLocalPlay?.(videoRef.current.currentTime);
      }
      setIsPlaying(!isPlaying);
    } else if (playerRef.current) {
      // YouTube: use API
      const state = playerRef.current.getPlayerState?.(); // optional
      if (isPlaying) {
        playerRef.current.pauseVideo?.();
        onLocalPause?.(playerRef.current.getCurrentTime());
      } else {
        playerRef.current.playVideo?.();
        onLocalPlay?.(playerRef.current.getCurrentTime());
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // When user drags the slider to seek (HTML5)
  const handleProgressChange = (value: number[]) => {
    setProgress(value[0]);
    if (videoRef.current) {
      const newTime = (value[0] / 100) * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      onLocalSeek?.(newTime);
    } else if (playerRef.current && playerRef.current.seekTo) {
      const newTime = (value[0] / 100) * (playerRef.current.getDuration?.() || 0);
      playerRef.current.seekTo(newTime, true);
      onLocalSeek?.(newTime);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value);
    if (videoRef.current) {
      videoRef.current.volume = value[0] / 100;
    }
  };

  const getYoutubeVideoId = (url: string) => {
    return url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
  };

  const videoId = youtubeUrl ? getYoutubeVideoId(youtubeUrl) : null;


  // expose control API to parent
  useEffect(() => {
    const controls: VideoPlayerControls = {
      seekTo: (t: number) => {
        if (playerRef.current && playerRef.current.seekTo) {
          // YouTube
          playerRef.current.seekTo(t, true);
        } else if (videoRef.current) {
          // HTML5
          videoRef.current.currentTime = t;
        }
      },
      getCurrentTime: () => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          return playerRef.current.getCurrentTime();
        }
        if (videoRef.current) return videoRef.current.currentTime || 0;
        return 0;
      },
      setPlaying: (play: boolean) => {
        if (playerRef.current) {
          // YouTube Player API uses playVideo / pauseVideo
          if (play) playerRef.current.playVideo?.() || playerRef.current.play?.();
          else playerRef.current.pauseVideo?.() || playerRef.current.pause?.();
          setIsPlaying(Boolean(play));
        } else if (videoRef.current) {
          if (play) videoRef.current.play();
          else videoRef.current.pause();
          setIsPlaying(Boolean(play));
        }
      },
      isReady: () => Boolean(playerRef.current || videoRef.current),
    };

    // call once when available
    registerControls?.(controls);
    // no cleanup necessary here, parent can re-register if needed
  }, [playerRef.current, videoRef.current, registerControls]);


  // Load YouTube IFrame API
  useEffect(() => {
    if (!videoId) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: videoId,
        events: {
          onReady: () => {
            // Start tracking time as before...
            intervalRef.current = setInterval(() => {
              if (playerRef.current && onTimeUpdate) {
                const currentTime = playerRef.current.getCurrentTime();
                onTimeUpdate(currentTime);
              }
            }, 1000);
            // Notify controls ready (registerControls effect will also run)
          },
          onStateChange: (e: any) => {
            // YouTube states: 1 = playing, 2 = paused, 0 = ended
            const state = e.data;
            const currentTime = playerRef.current.getCurrentTime?.() ?? 0;
            if (state === 1) onLocalPlay?.(currentTime);
            if (state === 2) onLocalPause?.(currentTime);
            // no direct seek event from state change; YouTube has onSeek? not directly — parent uses registerControls.seekTo to issue seeks
          }
        },
      });
    };


    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [videoId, onTimeUpdate]);

  // Handle seek to time
  useEffect(() => {
    if (seekToTime !== null && playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(seekToTime, true);
      onSeekComplete?.();
    } else if (seekToTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekToTime;
      onSeekComplete?.();
    }
  }, [seekToTime, onSeekComplete]);


  return (
    <div className="glass-card overflow-hidden">
      <div className="relative bg-gradient-to-br from-primary/5 to-secondary/5 aspect-video">

        {videoId ? (
          <div id="youtube-player" className="w-full h-full" />
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            onTimeUpdate={(e) => {
              const video = e.currentTarget;
              setProgress((video.currentTime / video.duration) * 100);
            }}
          >
            {/* Add video source when available */}
          </video>
        )}

        {/* Play overlay when paused - only for non-YouTube videos */}
        {!isPlaying && !videoId && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center hover:scale-110 transition-transform">
              <Play className="w-10 h-10 text-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Controls - only show for non-YouTube videos */}
      {!videoId && (
        <div className="p-4 space-y-3">
          {/* Progress Bar */}
          <Slider
            value={[progress]}
            onValueChange={handleProgressChange}
            max={100}
            step={0.1}
            className="cursor-pointer"
          />

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className="hover:bg-primary/10"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="hover:bg-primary/10"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                <Slider
                  value={volume}
                  onValueChange={handleVolumeChange}
                  max={100}
                  className="w-24"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">0:00 / 0:00</span>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-primary/10"
              >
                <Maximize className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
