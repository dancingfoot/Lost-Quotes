# Lost Quotes

**Lost Quotes** is an FM-1 inspired browser video & tape quote sampler built for digging, watching, looping, scratching, and processing iconic spoken quotes from **YouTube** and the **Internet Archive**.

Designed with a matte hardware aesthetic inspired by [ferluht/fm1-sampler](https://github.com/ferluht/fm1-sampler), Lost Quotes pairs a live synced video monitor with a stationary-needle scrolling tape deck, bidirectional hold-to-scratch scrubbing, A/B looping, and real-time Web Audio DSP effects.

---

## Key Features

- **Live Video Monitor Synced to the Tape Deck**: Watch the actual YouTube video (`YT.Player` IFrame API) or direct Internet Archive MPEG4 stream (`<video>` / embed fallback) right inside the deck, synced with play/pause, speed, seek, and loop boundaries.
- **Live Internet Archive Video Fetching**: Query `archive.org` directly from the browser for real public-domain MPEG4 newsreels, presidential speeches, NASA missions, and classic cinema clips—or use one-click topic diggers.
- **FM-1 Scrolling Waveform & Hold-to-Scratch**: Audio waveform glides smoothly beneath a stationary center tape needle. Hold and drag anywhere on the waveform for responsive `±6.0x` bidirectional scratch scrubbing.
- **A/B Looping & Export**: Set custom `IN` / `OUT` loop points on the fly, halve (`1/2x`) or double (`2x`) loop lengths, export loops to `.wav`, or record live tape performances.
- **4-Module Tape & DSP FX Rack**:
  - **Tape & Grain**: Variable tape speed (`0.25x–2.0x`), granular/Paulstretch vocal smear, tape dust hiss & crackle, and bit grit (`6–16 bit`).
  - **Filter**: Resonant low-pass and high-pass filters.
  - **LFO Modulation**: Continuous filter sweep rate and depth.
  - **Delay & Reverb**: Stereo delay time/feedback/mix and impulse-response space reverb.
- **Category & Tag Crate Digging**: Filter quotes across **Political Quotes**, **Historical Quotes**, **Movie Quotes**, **Saved**, source platform (**YouTube** / **Internet Archive**), interactive tags, or pick randomly with **Random Quote** / **Random Match**.
- **Custom Import**: Load custom YouTube links, Internet Archive URLs/identifiers, or local audio files (`WAV`, `MP3`, `OGG`, `FLAC`) directly onto the tape deck.

---

## Development

```bash
npm install
npm run dev
```

Build the static bundle for production or GitHub Pages:

```bash
npm run build
```

---

## GitHub Pages Deployment

The project is pre-configured for static GitHub Pages hosting:

- `vite.config.ts` sets `base: './'` for relative asset paths.
- `public/.nojekyll` prevents Jekyll from ignoring underscore-prefixed files.
- `.github/workflows/deploy.yml` builds `./dist` and deploys automatically on push to `main`.
