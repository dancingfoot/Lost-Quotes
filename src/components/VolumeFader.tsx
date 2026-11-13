import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

interface VolumeFaderProps {
  volume: number; // 0 to 1
  onChangeVolume: (vol: number) => void;
  isPlaying: boolean;
}

const TRACK_TOP = 18;
const TRACK_BOTTOM = 322;
const TRACK_HEIGHT = TRACK_BOTTOM - TRACK_TOP;

const DB_MARKS: Array<{ label: string; ratio: number }> = [
  { label: '0', ratio: 1.0 },
  { label: '-3', ratio: 0.85 },
  { label: '-6', ratio: 0.7 },
  { label: '-12', ratio: 0.5 },
  { label: '-24', ratio: 0.28 },
  { label: '-∞', ratio: 0.0 },
];

export const VolumeFader: React.FC<VolumeFaderProps> = ({
  volume,
  onChangeVolume,
  isPlaying,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const lastNonZeroVolRef = useRef<number>(0.85);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [meterLevel, setMeterLevel] = useState<number>(0);

  useEffect(() => {
    if (volume > 0.02) {
      lastNonZeroVolRef.current = volume;
    }
  }, [volume]);

  // Subtle live output meter from Web Audio analyser
  useEffect(() => {
    let rafId: number;
    const dataArray = new Uint8Array(128);

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const analyser = audioEngine.analyserNode;
      if (analyser && isPlaying && volume > 0) {
        analyser.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        // Also show subtle signal pulse scaled by volume when video carries audio
        const boosted = Math.min(1, Math.max(rms * 3.8, volume * 0.28));
        setMeterLevel((prev) => prev * 0.65 + boosted * 0.35);
      } else {
        setMeterLevel((prev) => (prev < 0.01 ? 0 : prev * 0.8));
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, volume]);

  const updateVolumeFromClientY = (clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.height <= 0) return;

    // Map screen Y into SVG coordinate space (0..340)
    const svgY = ((clientY - rect.top) / rect.height) * 340;
    const ratio = (TRACK_BOTTOM - svgY) / TRACK_HEIGHT;
    const clamped = Math.max(0, Math.min(1, Number(ratio.toFixed(2))));
    onChangeVolume(clamped);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer errors
    }
    draggingRef.current = true;
    setIsDragging(true);
    updateVolumeFromClientY(e.clientY);
    void audioEngine.resume();
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    updateVolumeFromClientY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    let next = volume;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = Math.min(1, volume + 0.05);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = Math.max(0, volume - 0.05);
    else if (e.key === 'PageUp') next = Math.min(1, volume + 0.15);
    else if (e.key === 'PageDown') next = Math.max(0, volume - 0.15);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    else return;

    e.preventDefault();
    onChangeVolume(Number(next.toFixed(2)));
  };

  const handleToggleMute = () => {
    if (volume > 0) {
      onChangeVolume(0);
    } else {
      onChangeVolume(lastNonZeroVolRef.current || 0.85);
    }
  };

  const capY = TRACK_BOTTOM - volume * TRACK_HEIGHT;
  const fillHeight = volume * TRACK_HEIGHT;
  const meterHeight = Math.min(TRACK_HEIGHT, meterLevel * TRACK_HEIGHT);
  const percent = Math.round(volume * 100);
  const dbText =
    volume <= 0.005 ? '-∞ dB' : `${(20 * Math.log10(volume)).toFixed(1)} dB`;

  return (
    <aside
      aria-label="Master Volume Channel"
      className="w-full lg:w-28 shrink-0 bg-[#10131b] border-t lg:border-t-0 lg:border-l border-zinc-800/80 px-4 py-4 flex flex-col items-center justify-between gap-3 select-none"
    >
      {/* Top Label + Mute Button */}
      <div className="w-full flex lg:flex-col items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-semibold tracking-wider text-zinc-400">
          MASTER
        </span>

        <button
          type="button"
          onClick={handleToggleMute}
          className={`p-2 rounded-lg border transition-colors cursor-pointer ${
            volume === 0
              ? 'bg-red-500/15 border-red-500/50 text-red-400'
              : 'bg-[#1a1e29] border-zinc-700/70 text-zinc-300 hover:text-white'
          }`}
          title={volume === 0 ? 'Unmute Master Volume' : 'Mute Master Volume'}
        >
          {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
        </button>
      </div>

      {/* Big Vertical Console Fader */}
      <div className="w-full flex-1 flex items-center justify-center py-1">
        <svg
          ref={svgRef}
          viewBox="0 0 88 340"
          role="slider"
          tabIndex={0}
          aria-label="Master Volume Fader"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={() => onChangeVolume(0.85)}
          className={`w-24 h-60 sm:h-64 lg:h-full lg:max-h-[420px] touch-none focus:outline-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-ns-resize'
          }`}
        >
          <title>Drag to adjust volume · Double-click to reset to 85%</title>

          {/* dB Scale Ticks (Left) */}
          {DB_MARKS.map((mark) => {
            const y = TRACK_BOTTOM - mark.ratio * TRACK_HEIGHT;
            return (
              <g key={mark.label}>
                <line
                  x1={24}
                  y1={y}
                  x2={31}
                  y2={y}
                  stroke={mark.ratio === 0.85 ? '#f59e0b' : '#3f3f46'}
                  strokeWidth={mark.ratio === 0.85 ? 1.5 : 1}
                />
                <text
                  x={20}
                  y={y + 3}
                  textAnchor="end"
                  fill={mark.ratio === 0.85 ? '#f59e0b' : '#71717a'}
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {mark.label}
                </text>
              </g>
            );
          })}

          {/* Subtle Intermediate Ticks */}
          {Array.from({ length: 17 }).map((_, idx) => {
            const y = TRACK_TOP + (idx / 16) * TRACK_HEIGHT;
            return (
              <line
                key={idx}
                x1={55}
                y1={y}
                x2={60}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
              />
            );
          })}

          {/* Recessed Fader Slot */}
          <rect
            x={39}
            y={TRACK_TOP - 2}
            width={10}
            height={TRACK_HEIGHT + 4}
            rx={3}
            fill="#07090d"
            stroke="#27272a"
            strokeWidth={1}
          />

          {/* Active Amber Volume Track Fill */}
          {fillHeight > 0 && (
            <rect
              x={41}
              y={capY}
              width={6}
              height={fillHeight}
              rx={2}
              fill={volume === 0 ? '#3f3f46' : '#f59e0b'}
              opacity={0.9}
            />
          )}

          {/* Live Output VU Meter Bar (Right Side) */}
          <rect
            x={68}
            y={TRACK_TOP}
            width={6}
            height={TRACK_HEIGHT}
            rx={2}
            fill="#090b10"
            stroke="#1f232e"
            strokeWidth={1}
          />
          {meterHeight > 1 && (
            <rect
              x={69}
              y={TRACK_BOTTOM - meterHeight}
              width={4}
              height={meterHeight}
              rx={1}
              fill={meterLevel > 0.85 ? '#ef4444' : meterLevel > 0.55 ? '#f59e0b' : '#10b981'}
            />
          )}

          {/* Big Machined Hardware Fader Cap */}
          <g transform={`translate(0, ${capY})`}>
            {/* Subtle drop shadow */}
            <rect
              x={21}
              y={-15}
              width={46}
              height={32}
              rx={4}
              fill="#000000"
              opacity={0.45}
            />
            {/* Main aluminum cap body */}
            <rect
              x={21}
              y={-17}
              width={46}
              height={34}
              rx={4}
              fill={isDragging ? '#2e3444' : '#232836'}
              stroke={isDragging ? '#fbbf24' : '#52525b'}
              strokeWidth={1.25}
            />
            {/* Top & bottom bevel highlights */}
            <line x1={23} y1={-15} x2={65} y2={-15} stroke="#3f4659" strokeWidth={1} />
            <line x1={23} y1={15} x2={65} y2={15} stroke="#141720" strokeWidth={1} />
            {/* Tactile grip grooves */}
            <line x1={26} y1={-9} x2={62} y2={-9} stroke="#141720" strokeWidth={1.5} />
            <line x1={26} y1={-5} x2={62} y2={-5} stroke="#141720" strokeWidth={1.5} />
            <line x1={26} y1={5} x2={62} y2={5} stroke="#141720" strokeWidth={1.5} />
            <line x1={26} y1={9} x2={62} y2={9} stroke="#141720" strokeWidth={1.5} />
            {/* Center amber indicator hairline */}
            <rect x={23} y={-1.5} width={42} height={3} rx={1} fill="#f59e0b" />
          </g>
        </svg>
      </div>

      {/* Numeric Output Readout */}
      <div className="w-full text-center font-mono space-y-0.5 pt-1 border-t border-zinc-800/70">
        <div className="text-sm font-semibold text-white">{percent}%</div>
        <div className="text-[11px] text-zinc-500">{dbText}</div>
      </div>
    </aside>
  );
};
