import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { MediaItem, StreamTicketResponse } from '../types';

interface VideoPlayerModalProps {
  item: MediaItem;
  onClose: () => void;
  onProgressUpdated: (mediaId: string, positionSeconds: number) => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function VideoPlayerModal({ item, onClose, onProgressUpdated }: VideoPlayerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [streamUrl, setStreamUrl] = useState('');
  const [watermark, setWatermark] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(item.progressSeconds || 0);
  const [duration, setDuration] = useState(item.durationSeconds || 24);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [streamError, setStreamError] = useState('');

  // Obtain short-lived HMAC-signed, session-bound stream ticket
  useEffect(() => {
    let active = true;
    setStreamError('');
    setStreamUrl('');
    apiRequest<StreamTicketResponse>(`/api/stream/${encodeURIComponent(item.id)}/ticket`, {
      method: 'POST',
    })
      .then((res) => {
        if (!active) return;
        setStreamUrl(res.streamUrl);
        setWatermark(res.watermark);
      })
      .catch((err) => {
        if (!active) return;
        setStreamError(err instanceof ApiError ? err.message : 'Unable to authorize stream license.');
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  const persistProgress = useCallback(
    async (pos: number) => {
      try {
        const rounded = Math.max(0, Math.round(pos));
        await apiRequest(`/api/progress/${item.id}`, {
          method: 'PUT',
          body: { positionSeconds: rounded },
        });
        onProgressUpdated(item.id, rounded >= duration - 1 ? 0 : rounded);
      } catch {
        // Ignore transient network errors on background progress sync
      }
    },
    [duration, item.id, onProgressUpdated]
  );

  const handleClose = useCallback(() => {
    const vid = videoRef.current;
    if (vid && streamUrl) {
      void persistProgress(vid.currentTime);
    }
    onClose();
  }, [onClose, persistProgress, streamUrl]);

  const scheduleHideControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2600);
  }, []);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play();
    } else {
      vid.pause();
      void persistProgress(vid.currentTime);
    }
    scheduleHideControls();
  }, [persistProgress, scheduleHideControls]);

  const seekBy = useCallback(
    (delta: number) => {
      const vid = videoRef.current;
      if (!vid) return;
      vid.currentTime = Math.max(0, Math.min(vid.duration || duration, vid.currentTime + delta));
      setCurrentTime(vid.currentTime);
      scheduleHideControls();
    },
    [duration, scheduleHideControls]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be blocked by sandbox policy
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(5);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMuted((m) => {
          const next = !m;
          if (videoRef.current) videoRef.current.muted = next;
          return next;
        });
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, seekBy, toggleFullscreen, togglePlay]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const vid = videoRef.current;
      if (vid && !vid.paused) {
        void persistProgress(vid.currentTime);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [persistProgress]);

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHideControls}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-center select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${item.title}`}
    >
      {/* Top Overlay Header */}
      <div
        className={`absolute top-0 inset-x-0 z-20 px-6 py-5 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center gap-2.5 text-sm font-medium text-white hover:text-[#E5E7EB] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to KinoVault
        </button>

        <div className="text-right">
          <div className="font-display text-sm sm:text-base font-semibold text-white">{item.title}</div>
          <div className="text-xs text-[#9CA3AF] inline-flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>Signed License · {item.quality} · {item.audio}</span>
          </div>
        </div>
      </div>

      {/* Video Surface */}
      <div className="relative w-full h-full flex items-center justify-center" onClick={togglePlay}>
        {streamUrl ? (
          <video
            ref={videoRef}
            src={streamUrl}
            poster={item.backdropUrl}
            playsInline
            autoPlay
            disablePictureInPicture
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full max-h-screen object-contain"
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              if (vid.duration && Number.isFinite(vid.duration)) {
                setDuration(vid.duration);
              }
              if (item.progressSeconds > 0 && item.progressSeconds < (vid.duration || duration) - 1) {
                vid.currentTime = item.progressSeconds;
              }
              vid.volume = volume;
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => {
              setPlaying(true);
              scheduleHideControls();
            }}
            onPause={() => {
              setPlaying(false);
              setControlsVisible(true);
            }}
            onEnded={() => {
              setPlaying(false);
              setControlsVisible(true);
              void persistProgress(duration);
            }}
            onError={() => {
              setStreamError('Stream license expired or unauthorized for this profile.');
            }}
          />
        ) : !streamError ? (
          <div className="text-xs text-[#9CA3AF]">Verifying stream license...</div>
        ) : null}

        {/* Subtle Forensic Anti-Sharing Session Watermark */}
        {watermark && !streamError && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-20 right-6 z-10 font-mono-code text-[11px] text-white/20 tracking-wider"
          >
            {watermark}
          </div>
        )}

        {streamError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-6">
            <div className="max-w-md bg-[#12141A] border border-[#E50914]/40 rounded-xl p-6 text-center">
              <p className="text-sm text-[#FCA5A5] mb-4">{streamError}</p>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-[#E50914] text-white text-xs font-semibold rounded-lg"
              >
                Return to Library
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Transport Controls */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 px-6 pb-6 pt-12 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 24}
            step={0.1}
            value={currentTime}
            aria-label="Seek timeline"
            onChange={(e) => {
              const next = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = next;
              setCurrentTime(next);
            }}
            className="w-full h-1.5 accent-[#E50914] cursor-pointer bg-white/25 rounded-lg"
            style={{
              background: `linear-gradient(to right, #E50914 ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%)`,
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="p-2 rounded-lg bg-white text-[#08090B] hover:bg-[#E5E7EB] transition-colors"
            >
              {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <button
              type="button"
              onClick={() => seekBy(-5)}
              aria-label="Rewind 5 seconds"
              className="p-2 text-[#D1D5DB] hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => seekBy(5)}
              aria-label="Forward 5 seconds"
              className="p-2 text-[#D1D5DB] hover:text-white transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (videoRef.current) videoRef.current.muted = next;
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="p-2 text-[#D1D5DB] hover:text-white transition-colors"
              >
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  setMuted(v === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                  }
                }}
                className="hidden sm:block w-20 h-1 accent-white cursor-pointer"
              />
            </div>

            <span className="font-mono-code text-xs text-[#D1D5DB] whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const rates = [0.75, 1, 1.25, 1.5];
                const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
                setPlaybackRate(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-mono-code text-white whitespace-nowrap"
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-2 text-[#D1D5DB] hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
