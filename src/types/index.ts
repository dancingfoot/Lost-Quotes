export type QuoteCategory =
  | 'All Quotes'
  | 'Political Quotes'
  | 'Historical Quotes'
  | 'Movie Quotes';

export type QuoteSourcePlatform = 'All' | 'YouTube' | 'Internet Archive';

export type QuoteToneProfile = 'speech' | 'radio' | 'cinema' | 'space';

export interface QuoteItem {
  id: string;
  slug: string;
  title: string;
  speaker: string;
  year: number;
  sourcePlatform: 'YouTube' | 'Internet Archive';
  sourceName: string;
  sourceUrl: string;
  youtubeId?: string;
  category: Exclude<QuoteCategory, 'All Quotes'>;
  duration: number; // seconds
  tags: string[];
  quoteText: string;
  context: string;
  toneProfile: QuoteToneProfile;
}

export interface LoopState {
  enabled: boolean;
  start: number; // seconds
  end: number;   // seconds
}

export interface AudioFXState {
  speed: number;          // 0.25 to 2.0
  reverse: boolean;
  grainSmear: number;     // 0 to 1 (granular / paulstretch texture)
  lpfCutoff: number;      // 250 to 20000 Hz
  lpfResonance: number;   // 0.5 to 15
  hpfCutoff: number;      // 20 to 2500 Hz
  lfoRate: number;        // 0.1 to 10 Hz
  lfoDepth: number;       // 0 to 1 (modulates filter cutoff)
  bitDepth: number;       // 6 to 16 bits
  tapeDust: number;       // 0 to 1 (vinyl/tape hiss & crackle)
  delayTime: number;      // 0.05 to 0.75 s
  delayFeedback: number;  // 0 to 0.85
  delayMix: number;       // 0 to 1
  reverbMix: number;      // 0 to 1
}
