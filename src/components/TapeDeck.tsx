import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Repeat,
  Bookmark,
  ExternalLink,
  Download,
  CircleDot,
  Upload,
  Share2,
  Check,
  Volume2,
  VolumeX,
  Film,
  Loader2,
} from 'lucide-react';
import { AudioFXState, LoopState, QuoteItem } from '../types';
import { audioEngine } from '../utils/audioEngine';
import { VolumeFader } from './VolumeFader';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YTGlobal {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayerInstance }) => void;
        onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState?: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobal> | null = null;

const loadYouTubeIframeAPI = (): Promise<YTGlobal> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const existingReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (existingReady) existingReady();
      if (window.YT) resolve(window.YT);
    };

    const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
};

const snapYouTubeRate = (speed: number): number => {
  const rates = [0.25, 0.5, 1, 1.25, 1.5, 2];
  return rates.reduce((prev, curr) =>
    Math.abs(curr - speed) < Math.abs(prev - speed) ? curr : prev
  );
};

interface TapeDeckProps {
  quote: QuoteItem;
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onTapeStop: () => void;
  fx: AudioFXState;
  onChangeFX: (fx: AudioFXState) => void;
  loop: LoopState;
  onChangeLoop: (loop: LoopState) => void;
  isSaved: boolean;
  onToggleSave: () => void;
  isRecording: boolean;
  onToggleRecord: () => void;
  onOpenImport: () => void;
  volume: number;
  onChangeVolume: (vol: number) => void;
}

const formatTime = (sec: number): string => {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const hundredths = Math.floor((safe % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

export const TapeDeck: React.FC<TapeDeckProps> = ({
  quote,
  audioBuffer,
  isPlaying,
  onTogglePlay,
  onStop,
  onTapeStop,
  fx,
  onChangeFX,
  loop,
  onChangeLoop,
  isSaved,
  onToggleSave,
  isRecording,
  onToggleRecord,
  onOpenImport,
  volume,
  onChangeVolume,
}) => {
  const tapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef<boolean>(false);

  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);

  const [displayTime, setDisplayTime] = useState<number>(0);
  const [displayVel, setDisplayVel] = useState<number>(0);
  const [isScratching, setIsScratching] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [videoAudioEnabled, setVideoAudioEnabled] = useState<boolean>(true);
  const [videoBuffering, setVideoBuffering] = useState<boolean>(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState<boolean>(false);
  const [videoNaturalDuration, setVideoNaturalDuration] = useState<number>(0);

  const dragStateRef = useRef<{
    active: boolean;
    lastX: number;
    lastTimeMs: number;
  }>({ active: false, lastX: 0, lastTimeMs: 0 });

  const WINDOW_SECONDS = 8;

  const hasYouTube = Boolean(quote.youtubeId);
  const hasDirectVideo = Boolean(quote.videoUrl) && !videoLoadFailed;
  const hasArchiveEmbed = Boolean(quote.archiveId) && (!quote.videoUrl || videoLoadFailed);
  const hasAnyVideo = hasYouTube || hasDirectVideo || hasArchiveEmbed;

  // Reset per-quote video state when switching quote
  useEffect(() => {
    setVideoLoadFailed(false);
    setVideoBuffering(Boolean(quote.youtubeId || quote.videoUrl));
    setVideoNaturalDuration(0);
    ytReadyRef.current = false;
  }, [quote.id, quote.youtubeId, quote.videoUrl]);

  // Coordinate whether Video Player carries forward dialogue or Tape FX buffer runs solo
  useEffect(() => {
    const shouldVideoCarryAudio =
      hasAnyVideo && !quote.isLocalAudio && videoAudioEnabled && !hasArchiveEmbed;
    audioEngine.setVideoAudioActive(shouldVideoCarryAudio);
  }, [hasAnyVideo, hasArchiveEmbed, quote.isLocalAudio, videoAudioEnabled]);

  // Mount & manage YouTube IFrame Player whenever quote.youtubeId changes
  useEffect(() => {
    if (!quote.youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const container = ytContainerRef.current;
    if (!container) return;

    // Create fresh mount node inside container so YT.Player replacement never breaks React DOM
    container.innerHTML = '';
    const playerMount = document.createElement('div');
    playerMount.className = 'w-full h-full';
    container.appendChild(playerMount);

    loadYouTubeIframeAPI()
      .then((YT) => {
        if (cancelled || !playerMount.isConnected) return;
        const player = new YT.Player(playerMount, {
          videoId: quote.youtubeId!,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              setVideoBuffering(false);
              try {
                const dur = event.target.getDuration();
                if (dur > 1) setVideoNaturalDuration(dur);
                event.target.setVolume(Math.round(volume * 100));
                if (!videoAudioEnabled || volume === 0) event.target.mute();
                else event.target.unMute();
                event.target.setPlaybackRate(snapYouTubeRate(fx.speed));
                if (isPlaying && !fx.reverse) {
                  event.target.seekTo(audioEngine.getCurrentTime(), true);
                  event.target.playVideo();
                }
              } catch {
                // Ignore
              }
            },
          },
        });
        ytPlayerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setVideoBuffering(false);
      });

    return () => {
      cancelled = true;
      ytReadyRef.current = false;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
    };
    // Intentionally re-init YT player only when quote.youtubeId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.youtubeId]);

  // Sync Play/Pause, Speed, Volume, Mute, and Reverse with YouTube & HTML5 <video>
  useEffect(() => {
    const shouldPlayVideo = isPlaying && !isScratching && !fx.reverse;

    // 1. YouTube Player sync
    const yt = ytPlayerRef.current;
    if (yt && ytReadyRef.current) {
      try {
        yt.setVolume(Math.round(volume * 100));
        if (videoAudioEnabled && volume > 0) yt.unMute();
        else yt.mute();
        yt.setPlaybackRate(snapYouTubeRate(fx.speed));
        if (shouldPlayVideo) {
          yt.playVideo();
        } else {
          yt.pauseVideo();
        }
      } catch {
        // Ignore YT transient errors
      }
    }

    // 2. HTML5 Video (<video>) sync for Internet Archive MP4 streams
    const vid = htmlVideoRef.current;
    if (vid) {
      vid.volume = Math.max(0, Math.min(1, volume));
      vid.muted = !videoAudioEnabled || volume === 0;
      vid.playbackRate = Math.max(0.25, Math.min(2.0, fx.speed));
      if (shouldPlayVideo) {
        vid.play().catch(() => {
          // Browser autoplay policies handled gracefully
        });
      } else {
        vid.pause();
      }
    }
  }, [isPlaying, isScratching, fx.reverse, fx.speed, videoAudioEnabled, volume, quote.videoUrl]);

  // Seek active video element cleanly to a target timestamp
  const seekVideoTo = (seconds: number) => {
    const target = Math.max(0, seconds);
    const yt = ytPlayerRef.current;
    if (yt && ytReadyRef.current) {
      try {
        const ytDur = yt.getDuration();
        const safeSec = ytDur > 0 ? Math.min(ytDur - 0.1, target) : target;
        yt.seekTo(safeSec, true);
      } catch {
        // Ignore
      }
    }

    const vid = htmlVideoRef.current;
    if (vid && Number.isFinite(vid.duration) && vid.duration > 0) {
      vid.currentTime = Math.min(vid.duration - 0.05, target);
    } else if (vid) {
      vid.currentTime = target;
    }
  };

  // High-resolution waveform peaks (1200 buckets for crisp scrolling waveform)
  const peaks = useMemo(() => {
    if (!audioBuffer) return [];
    const ch = audioBuffer.getChannelData(0);
    const numBuckets = 1200;
    const bucketSize = Math.max(1, Math.floor(ch.length / numBuckets));
    const result: number[] = new Array(numBuckets);
    for (let i = 0; i < numBuckets; i++) {
      let max = 0;
      const start = i * bucketSize;
      const end = Math.min(ch.length, start + bucketSize);
      for (let j = start; j < end; j += 4) {
        const a = Math.abs(ch[j]);
        if (a > max) max = a;
      }
      result[i] = max;
    }
    return result;
  }, [audioBuffer]);

  // Animation loop: renders scrolling tape waveform + syncs A/B loop wrapping with video
  useEffect(() => {
    let rafId: number;
    let lastLoopSyncAt = 0;

    const renderFrame = () => {
      rafId = requestAnimationFrame(renderFrame);

      // Keep video and tape engine locked on A/B loop boundaries
      if (isPlaying && !isScratching && !fx.reverse) {
        const nowMs = performance.now();
        const vid = htmlVideoRef.current;
        if (vid && !vid.paused && vid.readyState >= 2) {
          if (loop.enabled && vid.currentTime >= loop.end) {
            vid.currentTime = loop.start;
            audioEngine.seek(loop.start);
          } else {
            // Keep tape waveform synced within tape buffer duration (wrapping cleanly modulo buffer length for longer videos)
            const tapeDur = audioEngine.getDuration() || 22;
            audioEngine.syncTimeFromVideo(vid.currentTime % tapeDur);
          }
        } else if (ytPlayerRef.current && ytReadyRef.current && nowMs - lastLoopSyncAt > 180) {
          lastLoopSyncAt = nowMs;
          try {
            const ytCur = ytPlayerRef.current.getCurrentTime();
            if (loop.enabled && ytCur >= loop.end) {
              ytPlayerRef.current.seekTo(loop.start, true);
              audioEngine.seek(loop.start);
            }
          } catch {
            // Ignore
          }
        }
      }

      const curTime = audioEngine.getCurrentTime();
      const duration = audioEngine.getDuration() || quote.duration || 22;
      const vel = audioEngine.getActiveVelocity();

      setDisplayTime(curTime);
      setDisplayVel(vel);

      // 1. Draw Scrolling Tape Canvas (waveform glides under stationary center playhead)
      const canvas = tapeCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const centerX = w / 2;
          const pxPerSec = w / WINDOW_SECONDS;

          ctx.fillStyle = '#0c0e13';
          ctx.fillRect(0, 0, w, h);

          const startSec = curTime - WINDOW_SECONDS / 2;
          const endSec = curTime + WINDOW_SECONDS / 2;
          const firstTick = Math.floor(startSec);

          ctx.strokeStyle = '#1d212d';
          ctx.lineWidth = 1;
          ctx.fillStyle = '#52525b';
          ctx.font = '10px "JetBrains Mono", monospace';

          for (let s = firstTick; s <= Math.ceil(endSec); s++) {
            if (s < 0 || s > duration) continue;
            const x = centerX + (s - curTime) * pxPerSec;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();

            if (s % 2 === 0) {
              ctx.fillText(`${s}s`, x + 4, 13);
            }
          }

          ctx.strokeStyle = '#1a1d27';
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          if (loop.enabled) {
            const loopX1 = centerX + (loop.start - curTime) * pxPerSec;
            const loopX2 = centerX + (loop.end - curTime) * pxPerSec;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
            ctx.fillRect(loopX1, 0, loopX2 - loopX1, h);

            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(loopX1, 0);
            ctx.lineTo(loopX1, h);
            ctx.moveTo(loopX2, 0);
            ctx.lineTo(loopX2, h);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillText('IN', loopX1 + 4, h - 8);
            ctx.fillText('OUT', Math.max(loopX1 + 22, loopX2 - 24), h - 8);
          }

          if (peaks.length > 0) {
            const bucketDur = duration / peaks.length;
            const barPxWidth = Math.max(2, bucketDur * pxPerSec - 1);

            for (let i = 0; i < peaks.length; i++) {
              const tBucket = (i + 0.5) * bucketDur;
              if (tBucket < startSec - 0.1 || tBucket > endSec + 0.1) continue;

              const x = centerX + (tBucket - curTime) * pxPerSec;
              const amp = peaks[i];
              const barH = Math.max(3, amp * (h * 0.72));
              const y = (h - barH) / 2;

              const inLoop = loop.enabled && tBucket >= loop.start && tBucket <= loop.end;
              const isPast = tBucket <= curTime;

              if (Math.abs(x - centerX) < 3) {
                ctx.fillStyle = '#ffffff';
              } else if (inLoop) {
                ctx.fillStyle = isPast ? '#f59e0b' : 'rgba(245, 158, 11, 0.55)';
              } else {
                ctx.fillStyle = isPast ? '#e4e4e7' : '#52525b';
              }

              ctx.fillRect(x - barPxWidth / 2, y, barPxWidth, barH);
            }
          }

          ctx.strokeStyle = isScratching ? '#ffffff' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(centerX, 0);
          ctx.lineTo(centerX, h);
          ctx.stroke();

          ctx.fillStyle = isScratching ? '#ffffff' : '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(centerX - 6, 0);
          ctx.lineTo(centerX + 6, 0);
          ctx.lineTo(centerX, 7);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 2. Draw Overview Scrub Bar
      const ov = overviewCanvasRef.current;
      if (ov) {
        const ctx = ov.getContext('2d');
        if (ctx) {
          const w = ov.width;
          const h = ov.height;
          ctx.fillStyle = '#0a0c10';
          ctx.fillRect(0, 0, w, h);

          if (loop.enabled) {
            const lx1 = (loop.start / duration) * w;
            const lx2 = (loop.end / duration) * w;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
            ctx.fillRect(lx1, 0, lx2 - lx1, h);
          }

          if (peaks.length > 0) {
            const step = Math.max(1, Math.floor(peaks.length / 260));
            const count = Math.floor(peaks.length / step);
            const bw = w / count;
            for (let i = 0; i < count; i++) {
              const p = peaks[i * step];
              const bh = Math.max(2, p * (h * 0.8));
              const x = i * bw;
              ctx.fillStyle = x / w <= curTime / duration ? '#a1a1aa' : '#3f3f46';
              ctx.fillRect(x, (h - bh) / 2, Math.max(1, bw - 1), bh);
            }
          }

          const px = (curTime / duration) * w;
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(px - 1, 0, 2, h);
        }
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [peaks, quote.duration, loop, isScratching, isPlaying, fx.reverse]);

  // --- HOLD & SCRATCH HANDLERS ON SCROLLING TAPE ---
  const handleTapePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer errors
    }
    dragStateRef.current = {
      active: true,
      lastX: e.clientX,
      lastTimeMs: performance.now(),
    };
    setIsScratching(true);
    audioEngine.beginScratch();
    void audioEngine.resume();
  };

  const handleTapePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.active) return;
    const canvas = tapeCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    const dx = e.clientX - dragStateRef.current.lastX;
    const dtMs = Math.max(8, now - dragStateRef.current.lastTimeMs);

    dragStateRef.current.lastX = e.clientX;
    dragStateRef.current.lastTimeMs = now;

    const deltaSeconds = -(dx / rect.width) * WINDOW_SECONDS;
    const nextTime = audioEngine.getCurrentTime() + deltaSeconds;
    audioEngine.seek(nextTime);
    audioEngine.scratchBySeconds(deltaSeconds, dtMs);
  };

  const handleTapePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    try {
      e.currentTarget?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    setIsScratching(false);
    audioEngine.endScratch();
    seekVideoTo(audioEngine.getCurrentTime());
  };

  // --- OVERVIEW SCRUB CLICK ---
  const handleOverviewSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = audioEngine.getDuration() || quote.duration;
    const targetTime = ratio * dur;
    audioEngine.seek(targetTime);
    seekVideoTo(targetTime);
    void audioEngine.resume();
  };

  const handleStopAll = () => {
    onStop();
    seekVideoTo(loop.enabled ? loop.start : 0);
  };

  // --- LOOP CONTROLS ---
  const duration = audioBuffer?.duration || quote.duration || 22;

  const handleSetLoopIn = () => {
    const t = audioEngine.getCurrentTime();
    const newStart = Math.min(t, loop.end - 0.25);
    onChangeLoop({ ...loop, enabled: true, start: Math.max(0, Number(newStart.toFixed(2))) });
  };

  const handleSetLoopOut = () => {
    const t = audioEngine.getCurrentTime();
    const newEnd = Math.max(t, loop.start + 0.25);
    onChangeLoop({ ...loop, enabled: true, end: Math.min(duration, Number(newEnd.toFixed(2))) });
  };

  const handleScaleLoop = (factor: number) => {
    const len = loop.end - loop.start;
    const nextLen = Math.max(0.25, Math.min(duration - loop.start, len * factor));
    onChangeLoop({ ...loop, enabled: true, end: Number((loop.start + nextLen).toFixed(2)) });
  };

  const handleExportLoopWav = () => {
    const start = loop.enabled ? loop.start : 0;
    const end = loop.enabled ? loop.end : duration;
    const blob = audioEngine.exportLoopToWav(start, end);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.slug}-${loop.enabled ? 'loop' : 'full'}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#quote/${quote.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const speedLabel = isScratching
    ? `${displayVel >= 0 ? '+' : ''}${displayVel.toFixed(2)}x SCRATCH`
    : fx.reverse
      ? `-${fx.speed.toFixed(2)}x REV`
      : `${fx.speed.toFixed(2)}x`;

  return (
    <section className="w-full bg-[#13161e] border border-zinc-800/90 rounded-xl overflow-hidden">
      {/* Top Instrument Header */}
      <div className="px-5 py-4 border-b border-zinc-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="text-amber-400 font-medium">{quote.category}</span>
            <span aria-hidden="true">·</span>
            <span>{quote.year}</span>
            <span aria-hidden="true">·</span>
            <span>{quote.sourceName}</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
            {quote.title}
          </h1>
          <p className="text-sm text-zinc-400">{quote.speaker}</p>
        </div>

        {/* Workspace Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={quote.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#1a1e29] text-zinc-300 border border-zinc-700/70 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{quote.sourcePlatform}</span>
          </a>

          <button
            onClick={onOpenImport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#1a1e29] text-zinc-300 border border-zinc-700/70 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <button
            onClick={onToggleRecord}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isRecording
                ? 'bg-red-500/20 border-red-500 text-red-400'
                : 'bg-[#1a1e29] border-zinc-700/70 text-zinc-300 hover:text-white'
            }`}
          >
            <CircleDot className={`w-3.5 h-3.5 ${isRecording ? 'text-red-500' : 'text-zinc-400'}`} />
            <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
          </button>

          <button
            onClick={onToggleSave}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              isSaved
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-400'
                : 'bg-[#1a1e29] border-zinc-700/70 text-zinc-400 hover:text-white'
            }`}
            title={isSaved ? 'Remove from Saved' : 'Save Quote'}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={handleCopyShareLink}
            className="p-2 rounded-lg bg-[#1a1e29] border border-zinc-700/70 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Copy direct quote link"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Deck Body + Side Master Volume Fader */}
      <div className="flex flex-col lg:flex-row items-stretch">
        <div className="flex-1 min-w-0">
          {/* Balanced 2-Column Video Monitor & Quote Stage (Always Visible) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch border-b border-zinc-800/80">
            {/* Left: Actual Video Monitor */}
            <div className="lg:col-span-7 bg-[#090b0f] border-b lg:border-b-0 lg:border-r border-zinc-800/80 flex flex-col justify-between">
              <div className="relative w-full aspect-video bg-black overflow-hidden">
                {hasYouTube && (
                  <div ref={ytContainerRef} className="w-full h-full" />
                )}

                {!hasYouTube && hasDirectVideo && quote.videoUrl && (
                  <video
                    ref={htmlVideoRef}
                    key={quote.videoUrl}
                    src={quote.videoUrl}
                    playsInline
                    preload="metadata"
                    onClick={onTogglePlay}
                    onLoadedMetadata={(e) => {
                      setVideoBuffering(false);
                      e.currentTarget.volume = Math.max(0, Math.min(1, volume));
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 1) setVideoNaturalDuration(d);
                    }}
                onCanPlay={() => setVideoBuffering(false)}
                onWaiting={() => setVideoBuffering(true)}
                onPlaying={() => setVideoBuffering(false)}
                onError={() => {
                  setVideoBuffering(false);
                  setVideoLoadFailed(true);
                }}
                className="w-full h-full object-contain bg-black cursor-pointer"
              />
            )}

            {!hasYouTube && hasArchiveEmbed && quote.archiveId && (
              <iframe
                key={quote.archiveId}
                src={`https://archive.org/embed/${encodeURIComponent(quote.archiveId)}`}
                title={quote.title}
                className="w-full h-full border-0"
                allowFullScreen
                onLoad={() => setVideoBuffering(false)}
              />
            )}

            {!hasAnyVideo && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 p-6 text-center">
                <Film className="w-7 h-7 text-zinc-600" />
                <p className="text-xs font-mono text-zinc-400">
                  Local Audio Tape Loaded — Ready for Waveform Scrubbing & DSP
                </p>
              </div>
            )}

            {videoBuffering && hasAnyVideo && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/35">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#13161e]/90 border border-zinc-800 text-xs font-mono text-zinc-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Loading video stream...</span>
                </div>
              </div>
            )}
          </div>

          {/* Slim Video Audio Mode Strip */}
          <div className="px-4 py-2.5 bg-[#0e1017] border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-mono text-zinc-400">
              <Film className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {hasYouTube
                  ? 'YouTube Video Synced'
                  : hasDirectVideo
                    ? 'Internet Archive Video Stream'
                    : hasArchiveEmbed
                      ? 'Internet Archive Embed'
                      : 'Local Tape Audio'}
              </span>
              {videoNaturalDuration > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatTime(videoNaturalDuration)} clip</span>
                </>
              )}
            </div>

            {hasAnyVideo && !hasArchiveEmbed && (
              <button
                onClick={() => setVideoAudioEnabled(!videoAudioEnabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  videoAudioEnabled
                    ? 'bg-[#1a1e29] border-zinc-700/70 text-zinc-200 hover:text-white'
                    : 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                }`}
                title="Switch between original video audio and FM-1 Tape FX solo layer"
              >
                {videoAudioEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{videoAudioEnabled ? 'Video Audio' : 'Tape FX Solo'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Editorial Quote Transcript, Context & Tape Telemetry */}
        <div className="lg:col-span-5 p-5 flex flex-col justify-between gap-5 bg-[#13161e]">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>QUOTE TRANSCRIPT</span>
              <span>{quote.tags.slice(0, 3).join(' · ')}</span>
            </div>

            <blockquote className="font-quote italic text-base sm:text-lg text-zinc-100 leading-relaxed">
              “{quote.quoteText}”
            </blockquote>

            <p className="text-xs text-zinc-400 leading-relaxed">{quote.context}</p>
          </div>

          {/* Tape Telemetry & Dual Reels */}
          <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {[0, 1].map((reelIdx) => (
                  <div
                    key={reelIdx}
                    className={`w-7 h-7 rounded-full border border-zinc-700 bg-[#161922] flex items-center justify-center ${
                      isPlaying || isScratching
                        ? displayVel < 0
                          ? 'animate-reel-reverse'
                          : 'animate-reel'
                        : 'paused'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-zinc-400" />
                  </div>
                ))}
              </div>
              <div className="font-mono text-xs text-zinc-200">
                <span>{formatTime(displayTime)}</span>
                <span className="text-zinc-600 mx-1">/</span>
                <span className="text-zinc-400">{formatTime(duration)}</span>
              </div>
            </div>

            <div className="text-right font-mono text-xs">
              <div className={isScratching ? 'text-white font-semibold' : 'text-zinc-400'}>
                {speedLabel}
              </div>
              {loop.enabled && (
                <div className="text-[11px] text-amber-400">
                  LOOP {formatTime(loop.start)} – {formatTime(loop.end)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrolling Tape Waveform (Audio Passes Underneath + Hold & Scratch) */}
      <div className="relative bg-[#0c0e13] select-none">
        <canvas
          ref={tapeCanvasRef}
          width={1120}
          height={156}
          onPointerDown={handleTapePointerDown}
          onPointerMove={handleTapePointerMove}
          onPointerUp={handleTapePointerUp}
          onPointerCancel={handleTapePointerUp}
          className={`w-full h-36 sm:h-40 block touch-none ${isScratching ? 'cursor-grabbing' : 'cursor-grab'}`}
        />
        <div className="absolute top-2.5 right-3 pointer-events-none text-[11px] font-mono text-zinc-500">
          {isScratching ? 'Scratching Tape' : 'Hold & drag waveform to scratch'}
        </div>
      </div>

      {/* Full-Track Overview Scrub Bar */}
      <div className="border-t border-b border-zinc-800/80 bg-[#0a0c10]">
        <canvas
          ref={overviewCanvasRef}
          width={1120}
          height={28}
          onClick={handleOverviewSeek}
          className="w-full h-7 block cursor-pointer"
          title="Click anywhere to jump in the quote & video"
        />
      </div>

      {/* Transport & Looping Control Strip */}
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 bg-[#11141c]">
        {/* Left: Tape & Video Transport */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={handleStopAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#1a1e29] hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>

          <button
            onClick={() => onChangeFX({ ...fx, reverse: !fx.reverse })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              fx.reverse
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-[#1a1e29] border-zinc-700/70 text-zinc-300 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reverse</span>
          </button>

          <button
            onClick={onTapeStop}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Smooth tape motor brake"
          >
            Tape Brake
          </button>
        </div>

        {/* Right: A/B Looping & Export */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <button
            onClick={() => onChangeLoop({ ...loop, enabled: !loop.enabled })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              loop.enabled
                ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                : 'bg-[#1a1e29] text-zinc-300 border-zinc-700/70 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop</span>
          </button>

          <button
            onClick={handleSetLoopIn}
            className="px-2.5 py-2 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Set In
          </button>

          <button
            onClick={handleSetLoopOut}
            className="px-2.5 py-2 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Set Out
          </button>

          <button
            onClick={() => handleScaleLoop(0.5)}
            className="px-2.5 py-2 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Halve loop length"
          >
            1/2x
          </button>

          <button
            onClick={() => handleScaleLoop(2)}
            className="px-2.5 py-2 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Double loop length"
          >
            2x
          </button>

          <button
            onClick={handleExportLoopWav}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-1"
            title="Download active loop or full quote as WAV"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>WAV</span>
          </button>
        </div>
      </div>
        </div>

        {/* Big Side Master Volume Fader */}
        <VolumeFader
          volume={volume}
          onChangeVolume={onChangeVolume}
          isPlaying={isPlaying}
        />
      </div>
    </section>
  );
};
