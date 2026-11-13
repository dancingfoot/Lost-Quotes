import { AudioFXState, LoopState, QuoteItem } from '../types';

const DEFAULT_FX: AudioFXState = {
  speed: 1.0,
  reverse: false,
  grainSmear: 0.0,
  lpfCutoff: 18000,
  lpfResonance: 1.2,
  hpfCutoff: 30,
  lfoRate: 1.2,
  lfoDepth: 0.0,
  bitDepth: 16,
  tapeDust: 0.25,
  delayTime: 0.26,
  delayFeedback: 0.28,
  delayMix: 0.12,
  reverbMix: 0.18,
};

class TapeAudioEngine {
  private ctx: AudioContext | null = null;
  private tapeNode: ScriptProcessorNode | null = null;
  private lpfFilter: BiquadFilterNode | null = null;
  private hpfFilter: BiquadFilterNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  private dryGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayMixGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbMixGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  private dustGain: GainNode | null = null;
  private dustSource: AudioBufferSourceNode | null = null;

  public analyserNode: AnalyserNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;

  // Tape transport state
  private currentBuffer: AudioBuffer | null = null;
  private trackBufferCache: Map<string, AudioBuffer> = new Map();

  private isPlaying: boolean = false;
  private tapePos: number = 0; // current position in samples (float)
  private currentVelocity: number = 0; // smoothed playback velocity
  private isScratching: boolean = false;
  private scratchVelocity: number = 0;
  private lastScratchInputTime: number = 0;
  private isBraking: boolean = false;
  private brakeGain: number = 1.0;

  // Granular smear state
  private grainPhase: number = 0;
  private grainOffsetA: number = 0;
  private grainOffsetB: number = 0;

  // Bitcrusher & FX parameters
  private fx: AudioFXState = { ...DEFAULT_FX };
  private loop: LoopState = { enabled: false, start: 0, end: 8 };
  private crushLastL: number = 0;
  private crushLastR: number = 0;
  private crushStep: number = 0;

  // Listener for UI timecode updates
  private onEndedCallback: (() => void) | null = null;

  public init() {
    if (this.ctx) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master bus & analyser
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;

    // HPF -> LPF
    this.hpfFilter = this.ctx.createBiquadFilter();
    this.hpfFilter.type = 'highpass';
    this.hpfFilter.frequency.setValueAtTime(this.fx.hpfCutoff, this.ctx.currentTime);

    this.lpfFilter = this.ctx.createBiquadFilter();
    this.lpfFilter.type = 'lowpass';
    this.lpfFilter.frequency.setValueAtTime(this.fx.lpfCutoff, this.ctx.currentTime);
    this.lpfFilter.Q.setValueAtTime(this.fx.lpfResonance, this.ctx.currentTime);

    // LFO modulating LPF frequency
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.setValueAtTime(this.fx.lfoRate, this.ctx.currentTime);
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.lfoOsc.connect(this.lfoGain);
    this.lfoGain.connect(this.lpfFilter.frequency);
    this.lfoOsc.start();

    // Dry + Delay Send + Reverb Send
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(this.fx.delayTime, this.ctx.currentTime);
    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.setValueAtTime(this.fx.delayFeedback, this.ctx.currentTime);
    this.delayMixGain = this.ctx.createGain();
    this.delayMixGain.gain.setValueAtTime(this.fx.delayMix, this.ctx.currentTime);

    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayMixGain);

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this.createImpulseResponse(2.0, 2.4);
    this.reverbMixGain = this.ctx.createGain();
    this.reverbMixGain.gain.setValueAtTime(this.fx.reverbMix, this.ctx.currentTime);
    this.reverbConvolver.connect(this.reverbMixGain);

    // Media stream for live recording
    this.mediaStreamDest = this.ctx.createMediaStreamDestination();

    // Real-time Variable-Speed Tape & Scratch Processor (1024 frames = ~21ms responsive touch)
    this.tapeNode = this.ctx.createScriptProcessor(1024, 0, 2);
    this.tapeNode.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      this.processTapeBlock(outL, outR);
    };

    // Routing: TapeNode -> HPF -> LPF -> [Dry, Delay, Reverb] -> Master -> Analyser -> Dest + Rec
    this.tapeNode.connect(this.hpfFilter);
    this.hpfFilter.connect(this.lpfFilter);

    this.lpfFilter.connect(this.dryGain);
    this.lpfFilter.connect(this.delayNode);
    this.lpfFilter.connect(this.reverbConvolver);

    this.dryGain.connect(this.masterGain);
    this.delayMixGain.connect(this.masterGain);
    this.reverbMixGain.connect(this.masterGain);

    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    this.masterGain.connect(this.mediaStreamDest);

    this.initTapeDust();
  }

  private processTapeBlock(outL: Float32Array, outR: Float32Array) {
    const buf = this.currentBuffer;
    const len = outL.length;

    if (!buf || buf.length === 0) {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    const totalSamples = buf.length;
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
    const sampleRate = buf.sampleRate;

    // Loop boundaries in samples
    const loopStartSamp = Math.max(0, Math.min(totalSamples - 1024, this.loop.start * sampleRate));
    const loopEndSamp = Math.max(
      loopStartSamp + 1024,
      Math.min(totalSamples - 1, this.loop.end * sampleRate)
    );

    // Decay scratch velocity smoothly if pointer held stationary
    const now = performance.now();
    if (this.isScratching && now - this.lastScratchInputTime > 45) {
      this.scratchVelocity *= 0.65;
      if (Math.abs(this.scratchVelocity) < 0.01) {
        this.scratchVelocity = 0;
      }
    }

    // Target playback velocity
    let targetVel = 0;
    if (this.isScratching) {
      targetVel = this.scratchVelocity;
    } else if (this.isBraking) {
      targetVel = 0;
    } else if (this.isPlaying) {
      targetVel = this.fx.speed * (this.fx.reverse ? -1 : 1);
    }

    const velSmoothing = this.isScratching ? 0.35 : this.isBraking ? 0.03 : 0.14;
    const bits = this.fx.bitDepth;
    const normFactor = Math.pow(2, bits - 1);
    const downsample = bits <= 9 ? 3 : bits <= 13 ? 2 : 1;
    const grainMix = this.fx.grainSmear;

    for (let i = 0; i < len; i++) {
      this.currentVelocity += (targetVel - this.currentVelocity) * velSmoothing;

      if (this.isBraking) {
        this.brakeGain *= 0.9996;
        if (Math.abs(this.currentVelocity) < 0.02) {
          this.isBraking = false;
          this.isPlaying = false;
          this.currentVelocity = 0;
          this.brakeGain = 1.0;
          if (this.onEndedCallback) this.onEndedCallback();
        }
      }

      // Silence if stopped and not scratching
      if (!this.isPlaying && !this.isScratching && !this.isBraking && Math.abs(this.currentVelocity) < 0.002) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }

      // Advance tape position
      this.tapePos += this.currentVelocity;

      // Handle loop wrapping or track boundaries
      if (this.loop.enabled && !this.isScratching) {
        if (this.tapePos >= loopEndSamp && this.currentVelocity >= 0) {
          this.tapePos = loopStartSamp + (this.tapePos - loopEndSamp);
        } else if (this.tapePos <= loopStartSamp && this.currentVelocity < 0) {
          this.tapePos = loopEndSamp - (loopStartSamp - this.tapePos);
        }
      } else {
        if (this.tapePos >= totalSamples - 1) {
          if (this.isScratching) {
            this.tapePos = totalSamples - 1;
            this.currentVelocity = 0;
          } else {
            // Wrap or stop at end
            this.tapePos = 0;
          }
        } else if (this.tapePos < 0) {
          if (this.isScratching) {
            this.tapePos = 0;
            this.currentVelocity = 0;
          } else {
            this.tapePos = totalSamples - 2;
          }
        }
      }

      // Linear sample interpolation
      const idx0 = Math.floor(this.tapePos);
      const frac = this.tapePos - idx0;
      const idx1 = Math.min(totalSamples - 1, idx0 + 1);

      let sL = ch0[idx0] + (ch0[idx1] - ch0[idx0]) * frac;
      let sR = ch1[idx0] + (ch1[idx1] - ch1[idx0]) * frac;

      // Granular / Paulstretch vocal smear (FM-1 style)
      if (grainMix > 0.01) {
        this.grainPhase += 1 / 2400; // ~50ms grain window
        if (this.grainPhase >= 1) {
          this.grainPhase = 0;
          this.grainOffsetA = (Math.random() - 0.5) * sampleRate * 0.28;
          this.grainOffsetB = (Math.random() - 0.5) * sampleRate * 0.28;
        }
        const winA = Math.sin(Math.PI * this.grainPhase);
        const winB = Math.sin(Math.PI * ((this.grainPhase + 0.5) % 1));
        const gIdxA = Math.max(0, Math.min(totalSamples - 1, Math.floor(this.tapePos + this.grainOffsetA)));
        const gIdxB = Math.max(0, Math.min(totalSamples - 1, Math.floor(this.tapePos + this.grainOffsetB)));
        const gL = ch0[gIdxA] * winA + ch0[gIdxB] * winB;
        const gR = ch1[gIdxA] * winA + ch1[gIdxB] * winB;
        sL = sL * (1 - grainMix * 0.75) + gL * (grainMix * 0.9);
        sR = sR * (1 - grainMix * 0.75) + gR * (grainMix * 0.9);
      }

      // Tactile scratch friction warmth when velocity > 1.5x or negative
      if (this.isScratching && Math.abs(this.currentVelocity) > 0.1) {
        const scratchEnv = Math.min(1, Math.abs(this.currentVelocity) / 4);
        const subtleChatter = (Math.random() * 2 - 1) * 0.012 * scratchEnv;
        sL = Math.tanh((sL + subtleChatter) * (1 + scratchEnv * 0.35));
        sR = Math.tanh((sR + subtleChatter) * (1 + scratchEnv * 0.35));
      }

      // Bitcrusher stage
      if (bits < 16 || downsample > 1) {
        if (this.crushStep++ >= downsample) {
          this.crushStep = 1;
          this.crushLastL = Math.round(sL * normFactor) / normFactor;
          this.crushLastR = Math.round(sR * normFactor) / normFactor;
        }
        sL = this.crushLastL;
        sR = this.crushLastR;
      }

      const gain = this.isBraking ? this.brakeGain : 1.0;
      outL[i] = sL * gain;
      outR[i] = sR * gain;
    }
  }

  public async resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // --- TAPE DUST / ANALOG NOISE ---
  private initTapeDust() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const hiss = (Math.random() * 2 - 1) * 0.016;
      const isPop = Math.random() < 0.00016;
      const pop = isPop ? (Math.random() * 2 - 1) * 0.38 : 0;
      data[i] = hiss + pop;
    }

    this.dustGain = this.ctx.createGain();
    this.dustGain.gain.setValueAtTime(this.fx.tapeDust * 0.4, this.ctx.currentTime);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, this.ctx.currentTime);
    bp.Q.setValueAtTime(0.7, this.ctx.currentTime);

    this.dustSource = this.ctx.createBufferSource();
    this.dustSource.buffer = buffer;
    this.dustSource.loop = true;

    this.dustSource.connect(bp);
    bp.connect(this.dustGain);
    this.dustGain.connect(this.masterGain);

    try {
      this.dustSource.start(0);
    } catch {
      // Ignore
    }
  }

  private createImpulseResponse(duration: number, decay: number): AudioBuffer {
    if (!this.ctx) throw new Error('No audio context');
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const env = Math.exp(-n * decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  // --- GENERATE ARCHIVAL SPOKEN QUOTE AUDIO ---
  public async loadQuoteAudio(quote: QuoteItem): Promise<AudioBuffer> {
    this.init();
    if (!this.ctx) throw new Error('AudioContext unavailable');

    if (this.trackBufferCache.has(quote.id)) {
      const cached = this.trackBufferCache.get(quote.id)!;
      this.currentBuffer = cached;
      this.tapePos = 0;
      return cached;
    }

    const sampleRate = this.ctx.sampleRate;
    const duration = quote.duration || 22;
    const totalSamples = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(2, totalSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Deterministic seed from quote ID
    let seed = 0;
    for (let i = 0; i < quote.id.length; i++) {
      seed = (seed * 31 + quote.id.charCodeAt(i)) % 100000;
    }

    const isSpace = quote.toneProfile === 'space';
    const isRadio = quote.toneProfile === 'radio';
    const isCinema = quote.toneProfile === 'cinema';

    // Fundamental pitch range based on speaker character
    const baseF0 = quote.id.includes('sunset') ? 195 : quote.id.includes('chaplin') ? 148 : 118 + (seed % 32);

    // Pad / underscore frequencies for cinema & space quotes
    const chord = isCinema
      ? [146.83, 220.0, 261.63, 329.63] // Dm9 cinema swell
      : isSpace
        ? [110.0, 164.81, 246.94, 329.63] // Ambient cosmos
        : [130.81, 196.0]; // Subtle room resonance

    // Syllabic cadence derived from quote text word rhythm
    const words = quote.quoteText.split(/\s+/);
    const phraseDur = duration / Math.max(6, words.length);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const wordIdx = Math.floor(t / phraseDur) % words.length;
      const wordLocalT = (t % phraseDur) / phraseDur;
      const wordHash = words[wordIdx].charCodeAt(0) + words[wordIdx].length * 7;

      // Natural speech breath pause between clauses
      const isPause = (wordIdx % 6 === 5 && wordLocalT > 0.45) || t < 0.25;
      const syllableEnv = isPause
        ? 0.02
        : Math.sin(Math.PI * Math.min(1, wordLocalT * 1.15)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3.5 * wordLocalT));

      // Intonation contour (pitch inflection across words)
      const f0 = baseF0 * (1 + 0.14 * Math.sin(2 * Math.PI * 0.45 * t + wordHash) - 0.06 * wordLocalT);
      const glottal = ((t * f0) % 1) < 0.35 ? 0.9 : -0.45;

      // Vowel Formant Frequencies (F1, F2) shifting per syllable
      const f1 = 420 + ((wordHash * 53) % 380);
      const f2 = 1150 + ((wordHash * 97) % 1100);
      const formant =
        0.55 * Math.sin(2 * Math.PI * f1 * t) +
        0.35 * Math.sin(2 * Math.PI * f2 * t) +
        0.15 * (Math.random() * 2 - 1) * (wordLocalT < 0.12 ? 1.2 : 0.15); // consonant transient

      const voice = glottal * formant * syllableEnv * 0.32;

      // Atmospheric underscore / period texture
      let ambient = 0;
      if (isCinema || isSpace) {
        const swell = 0.4 + 0.6 * Math.sin((Math.PI * t) / duration);
        chord.forEach((freq, idx) => {
          ambient += Math.sin(2 * Math.PI * freq * t) * (0.045 / (idx + 1)) * swell;
        });
      }

      // NASA Quindar telemetry tone at start and phrase breaks for Space quotes
      let telemetry = 0;
      if (isSpace && ((t > 0.3 && t < 0.55) || (Math.abs((t % 7.5) - 0.2) < 0.12))) {
        telemetry = Math.sin(2 * Math.PI * 2524 * t) * 0.08;
      }

      // Radio broadcast warmth & 60Hz hum
      const radioHum = isRadio ? Math.sin(2 * Math.PI * 60 * t) * 0.015 : 0;
      const roomTone = (Math.random() * 2 - 1) * (isRadio || isSpace ? 0.018 : 0.006);

      const sample = Math.tanh((voice + ambient + telemetry + radioHum + roomTone) * 1.25);
      left[i] = sample;
      right[i] = sample * 0.97 + ambient * 0.15;
    }

    this.trackBufferCache.set(quote.id, buffer);
    this.currentBuffer = buffer;
    this.tapePos = 0;
    return buffer;
  }

  public async loadUserAudioFile(file: File): Promise<AudioBuffer> {
    this.init();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await this.ctx.decodeAudioData(arrayBuffer);
    this.currentBuffer = decoded;
    this.tapePos = 0;
    return decoded;
  }

  public getCurrentBuffer(): AudioBuffer | null {
    return this.currentBuffer;
  }

  // --- TRANSPORT & SCRATCH API ---
  public play(onEnded?: () => void) {
    this.onEndedCallback = onEnded || null;
    this.isBraking = false;
    this.brakeGain = 1.0;
    this.isPlaying = true;
  }

  public pause() {
    this.isPlaying = false;
    this.isBraking = false;
  }

  public stop() {
    this.isPlaying = false;
    this.isBraking = false;
    this.currentVelocity = 0;
    this.tapePos = this.loop.enabled ? this.loop.start * (this.currentBuffer?.sampleRate || 44100) : 0;
  }

  public seek(seconds: number) {
    if (!this.currentBuffer) return;
    const clamped = Math.max(0, Math.min(this.currentBuffer.duration, seconds));
    this.tapePos = clamped * this.currentBuffer.sampleRate;
  }

  public getCurrentTime(): number {
    if (!this.currentBuffer) return 0;
    return this.tapePos / this.currentBuffer.sampleRate;
  }

  public getDuration(): number {
    return this.currentBuffer?.duration || 0;
  }

  public getActiveVelocity(): number {
    return this.currentVelocity;
  }

  // Hold-to-scratch methods (FM-1 style variable-speed bidirectional scrubbing up to 6x)
  public beginScratch() {
    this.isScratching = true;
    this.scratchVelocity = 0;
    this.lastScratchInputTime = performance.now();
  }

  public scratchBySeconds(deltaSeconds: number, dtMs: number) {
    if (!this.currentBuffer || !this.isScratching) return;
    const sampleRate = this.currentBuffer.sampleRate;
    const safeDtSec = Math.max(0.008, dtMs / 1000);
    // Compute speed multiplier relative to real time, clamped to [-6x, +6x]
    const rawVel = deltaSeconds / safeDtSec;
    const clampedVel = Math.max(-6.0, Math.min(6.0, rawVel));

    this.scratchVelocity = clampedVel;
    this.lastScratchInputTime = performance.now();
  }

  public endScratch() {
    this.isScratching = false;
    this.scratchVelocity = 0;
  }

  public triggerTapeStop(onComplete?: () => void) {
    this.onEndedCallback = onComplete || null;
    this.isBraking = true;
    this.brakeGain = 1.0;
  }

  // --- LOOP & FX UPDATES ---
  public setLoop(loop: LoopState) {
    this.loop = { ...loop };
  }

  public updateFX(newFX: AudioFXState) {
    this.fx = { ...newFX };
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (this.lpfFilter) {
      this.lpfFilter.frequency.setTargetAtTime(newFX.lpfCutoff, now, 0.03);
      this.lpfFilter.Q.setTargetAtTime(newFX.lpfResonance, now, 0.03);
    }
    if (this.hpfFilter) {
      this.hpfFilter.frequency.setTargetAtTime(newFX.hpfCutoff, now, 0.03);
    }
    if (this.lfoOsc && this.lfoGain) {
      this.lfoOsc.frequency.setTargetAtTime(newFX.lfoRate, now, 0.03);
      this.lfoGain.gain.setTargetAtTime(newFX.lfoDepth * 4500, now, 0.04);
    }
    if (this.delayNode && this.delayFeedbackGain && this.delayMixGain) {
      this.delayNode.delayTime.setTargetAtTime(newFX.delayTime, now, 0.04);
      this.delayFeedbackGain.gain.setTargetAtTime(newFX.delayFeedback, now, 0.04);
      this.delayMixGain.gain.setTargetAtTime(newFX.delayMix, now, 0.04);
    }
    if (this.reverbMixGain) {
      this.reverbMixGain.gain.setTargetAtTime(newFX.reverbMix, now, 0.04);
    }
    if (this.dustGain) {
      this.dustGain.gain.setTargetAtTime(newFX.tapeDust * 0.4, now, 0.05);
    }
  }

  // --- LIVE PERFORMANCE RECORDING ---
  public startRecording() {
    if (!this.mediaStreamDest) return;
    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    this.mediaRecorder = new MediaRecorder(this.mediaStreamDest.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  public stopRecording(): Promise<{ blob: Blob; url: string }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        this.isRecording = false;
        resolve({ blob: new Blob(), url: '' });
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        this.isRecording = false;
        resolve({ blob, url });
      };
      this.mediaRecorder.stop();
    });
  }

  // --- EXPORT CURRENT LOOP / QUOTE AS WAV ---
  public exportLoopToWav(startSec: number, endSec: number): Blob | null {
    if (!this.currentBuffer) return null;
    const sampleRate = this.currentBuffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startSec * sampleRate));
    const endSample = Math.min(this.currentBuffer.length, Math.floor(endSec * sampleRate));
    const length = endSample - startSample;
    if (length <= 0) return null;

    const channels = this.currentBuffer.numberOfChannels;
    const wavBuffer = new ArrayBuffer(44 + length * channels * 2);
    const view = new DataView(wavBuffer);

    const writeStr = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + length * channels * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, length * channels * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const sample = this.currentBuffer.getChannelData(ch)[startSample + i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([view], { type: 'audio/wav' });
  }
}

export const audioEngine = new TapeAudioEngine();
