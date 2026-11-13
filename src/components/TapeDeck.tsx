import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Repeat,
  Bookmark,
  Youtube,
  ExternalLink,
  Download,
  CircleDot,
  Upload,
  Share2,
  Check,
} from 'lucide-react';
import { AudioFXState, LoopState, QuoteItem } from '../types';
import { audioEngine } from '../utils/audioEngine';

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
}) => {
  const tapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [displayTime, setDisplayTime] = useState<number>(0);
  const [displayVel, setDisplayVel] = useState<number>(0);
  const [isScratching, setIsScratching] = useState<boolean>(false);
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const dragStateRef = useRef<{
    active: boolean;
    lastX: number;
    lastTimeMs: number;
  }>({ active: false, lastX: 0, lastTimeMs: 0 });

  const WINDOW_SECONDS = 8; // 8 seconds visible across scrolling tape window (4s behind, 4s ahead)

  // Reset video view when changing quote
  useEffect(() => {
    setShowVideo(false);
  }, [quote.id]);

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

  // Animation loop: renders scrolling tape waveform underneath center playhead + overview bar
  useEffect(() => {
    let rafId: number;

    const renderFrame = () => {
      rafId = requestAnimationFrame(renderFrame);

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

          // Subtle 1-second ruler ticks scrolling with tape
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

          // Center horizon line
          ctx.strokeStyle = '#1a1d27';
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          // Loop region highlight scrolling with tape
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

          // Draw waveform bars passing underneath center playhead
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

          // Stationary Center Tape Head Needle
          ctx.strokeStyle = isScratching ? '#ffffff' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(centerX, 0);
          ctx.lineTo(centerX, h);
          ctx.stroke();

          // Needle cap triangle
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

          // Overview playhead
          const px = (curTime / duration) * w;
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(px - 1, 0, 2, h);
        }
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [peaks, quote.duration, loop, isScratching]);

  // --- HOLD & SCRATCH HANDLERS ON SCROLLING TAPE ---
  const handleTapePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic pointerId cannot be captured
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

    // Pulling tape left (dx < 0) advances audio forward; pulling right (dx > 0) scratches backward
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
  };

  // --- OVERVIEW SCRUB CLICK ---
  const handleOverviewSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = audioEngine.getDuration() || quote.duration;
    audioEngine.seek(ratio * dur);
    void audioEngine.resume();
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
          {/* Unboxed typographic metadata */}
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
          {quote.youtubeId && (
            <button
              onClick={() => setShowVideo(!showVideo)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showVideo
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                  : 'bg-[#1a1e29] text-zinc-300 border-zinc-700/70 hover:text-white'
              }`}
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>{showVideo ? 'Hide Video' : 'Watch Video'}</span>
            </button>
          )}

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

      {/* Optional Embedded YouTube Source Frame */}
      {showVideo && quote.youtubeId && (
        <div className="border-b border-zinc-800/80 bg-black p-4 flex justify-center">
          <div className="w-full max-w-2xl aspect-video rounded-lg overflow-hidden border border-zinc-800">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${quote.youtubeId}?rel=0`}
              title={quote.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* FM-1 Tape Reels & Timecode Readout Bar */}
      <div className="px-5 py-3 bg-[#0f1118] border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
        {/* Dual Tape Reels */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
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

          <div className="font-mono text-xs sm:text-sm text-zinc-200 tracking-tight">
            <span>{formatTime(displayTime)}</span>
            <span className="text-zinc-600 mx-1.5">/</span>
            <span className="text-zinc-400">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Speed / Scratch Mode Indicator */}
        <div className="flex items-center gap-4 font-mono text-xs">
          {loop.enabled && (
            <span className="text-amber-400">
              LOOP {formatTime(loop.start)} – {formatTime(loop.end)}
            </span>
          )}
          <span className={isScratching ? 'text-white font-semibold' : 'text-zinc-400'}>
            {speedLabel}
          </span>
        </div>
      </div>

      {/* Scrolling Tape Waveform (Audio Passes Underneath + Hold & Scratch) */}
      <div className="relative bg-[#0c0e13] select-none">
        <canvas
          ref={tapeCanvasRef}
          width={1120}
          height={164}
          onPointerDown={handleTapePointerDown}
          onPointerMove={handleTapePointerMove}
          onPointerUp={handleTapePointerUp}
          onPointerCancel={handleTapePointerUp}
          className={`w-full h-40 block touch-none ${isScratching ? 'cursor-grabbing' : 'cursor-grab'}`}
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
          title="Click anywhere to jump in the quote"
        />
      </div>

      {/* Transport & Looping Control Strip */}
      <div className="px-5 py-3.5 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 bg-[#11141c]">
        {/* Left: Tape Transport */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={onStop}
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

      {/* Quote Transcript & Context (spacious editorial presentation, no thick left border) */}
      <div className="px-5 py-5 space-y-3">
        <blockquote className="font-quote italic text-base sm:text-lg text-zinc-100 leading-relaxed max-w-4xl">
          “{quote.quoteText}”
        </blockquote>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-zinc-400">
          <p className="max-w-3xl leading-relaxed">{quote.context}</p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
            {quote.tags.map((tag, idx) => (
              <React.Fragment key={tag}>
                <span>{tag}</span>
                {idx < quote.tags.length - 1 && <span aria-hidden="true">·</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
