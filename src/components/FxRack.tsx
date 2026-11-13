import React from 'react';
import { AudioFXState } from '../types';
import { audioEngine } from '../utils/audioEngine';

interface FxRackProps {
  fx: AudioFXState;
  onChangeFX: (newFX: AudioFXState) => void;
  onResetFX: () => void;
}

interface ParamSliderProps {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}

const ParamSlider: React.FC<ParamSliderProps> = ({
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono text-zinc-200">{valueText}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="fm-slider"
    />
  </div>
);

export const FxRack: React.FC<FxRackProps> = ({
  fx,
  onChangeFX,
  onResetFX,
}) => {
  const update = (patch: Partial<AudioFXState>) => {
    const next = { ...fx, ...patch };
    onChangeFX(next);
    audioEngine.updateFX(next);
  };

  return (
    <section className="w-full bg-[#13161e] border border-zinc-800/90 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Effects & Tape Processing</h2>
          <span className="text-xs text-zinc-500">Tape · Granular · Filter · LFO · Sends</span>
        </div>
        <button
          onClick={onResetFX}
          className="text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
        >
          Reset All
        </button>
      </div>

      {/* 4-column flat hardware parameter grid separated by hairline borders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
        {/* Module 1: Tape & Granular */}
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold text-amber-400 tracking-wide">Tape & Grain</h3>
          <ParamSlider
            label="Tape Speed"
            valueText={`${fx.speed.toFixed(2)}x`}
            min={0.25}
            max={2.0}
            step={0.05}
            value={fx.speed}
            onChange={(v) => update({ speed: v })}
          />
          <ParamSlider
            label="Granular Smear"
            valueText={`${Math.round(fx.grainSmear * 100)}%`}
            min={0}
            max={1}
            step={0.02}
            value={fx.grainSmear}
            onChange={(v) => update({ grainSmear: v })}
          />
          <ParamSlider
            label="Tape Dust"
            valueText={`${Math.round(fx.tapeDust * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={fx.tapeDust}
            onChange={(v) => update({ tapeDust: v })}
          />
          <ParamSlider
            label="Bit Grit"
            valueText={fx.bitDepth === 16 ? '16-bit' : `${fx.bitDepth}-bit`}
            min={6}
            max={16}
            step={1}
            value={fx.bitDepth}
            onChange={(v) => update({ bitDepth: Math.round(v) })}
          />
        </div>

        {/* Module 2: Filter */}
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold text-amber-400 tracking-wide">Filter</h3>
          <ParamSlider
            label="Low-Pass Cutoff"
            valueText={
              fx.lpfCutoff >= 1000
                ? `${(fx.lpfCutoff / 1000).toFixed(1)} kHz`
                : `${Math.round(fx.lpfCutoff)} Hz`
            }
            min={250}
            max={20000}
            step={50}
            value={fx.lpfCutoff}
            onChange={(v) => update({ lpfCutoff: v })}
          />
          <ParamSlider
            label="Resonance"
            valueText={fx.lpfResonance.toFixed(1)}
            min={0.5}
            max={15}
            step={0.2}
            value={fx.lpfResonance}
            onChange={(v) => update({ lpfResonance: v })}
          />
          <ParamSlider
            label="High-Pass Cutoff"
            valueText={`${Math.round(fx.hpfCutoff)} Hz`}
            min={20}
            max={2500}
            step={10}
            value={fx.hpfCutoff}
            onChange={(v) => update({ hpfCutoff: v })}
          />
        </div>

        {/* Module 3: LFO */}
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold text-amber-400 tracking-wide">LFO Modulation</h3>
          <ParamSlider
            label="LFO Rate"
            valueText={`${fx.lfoRate.toFixed(1)} Hz`}
            min={0.1}
            max={10}
            step={0.1}
            value={fx.lfoRate}
            onChange={(v) => update({ lfoRate: v })}
          />
          <ParamSlider
            label="Filter Sweep Depth"
            valueText={`${Math.round(fx.lfoDepth * 100)}%`}
            min={0}
            max={1}
            step={0.02}
            value={fx.lfoDepth}
            onChange={(v) => update({ lfoDepth: v })}
          />
          <div className="pt-1 text-[11px] text-zinc-500 leading-relaxed">
            Modulates low-pass cutoff continuously for rhythmic filter movement and tape wobble.
          </div>
        </div>

        {/* Module 4: Delay & Reverb Sends */}
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold text-amber-400 tracking-wide">Delay & Reverb</h3>
          <ParamSlider
            label="Delay Time"
            valueText={`${Math.round(fx.delayTime * 1000)} ms`}
            min={0.05}
            max={0.75}
            step={0.01}
            value={fx.delayTime}
            onChange={(v) => update({ delayTime: v })}
          />
          <ParamSlider
            label="Delay Feedback"
            valueText={`${Math.round(fx.delayFeedback * 100)}%`}
            min={0}
            max={0.85}
            step={0.02}
            value={fx.delayFeedback}
            onChange={(v) => update({ delayFeedback: v })}
          />
          <ParamSlider
            label="Delay Mix"
            valueText={`${Math.round(fx.delayMix * 100)}%`}
            min={0}
            max={1}
            step={0.02}
            value={fx.delayMix}
            onChange={(v) => update({ delayMix: v })}
          />
          <ParamSlider
            label="Reverb Mix"
            valueText={`${Math.round(fx.reverbMix * 100)}%`}
            min={0}
            max={1}
            step={0.02}
            value={fx.reverbMix}
            onChange={(v) => update({ reverbMix: v })}
          />
        </div>
      </div>
    </section>
  );
};
