/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar, NavFilter } from './components/Navbar';
import { TapeDeck } from './components/TapeDeck';
import { FxRack } from './components/FxRack';
import { QuoteBrowser } from './components/QuoteBrowser';
import { ImportModal } from './components/ImportModal';
import { GitHubPagesModal } from './components/GitHubPagesModal';
import { RecordingModal } from './components/RecordingModal';
import { INITIAL_QUOTES } from './data/quotes';
import {
  AudioFXState,
  LoopState,
  QuoteCategory,
  QuoteItem,
  QuoteSourcePlatform,
} from './types';
import { audioEngine } from './utils/audioEngine';
import { fetchArchiveVideoQuotes, resolveArchiveMediaUrls } from './utils/archiveFetcher';

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

export default function App() {
  const [quotes, setQuotes] = useState<QuoteItem[]>(INITIAL_QUOTES);
  const [currentQuote, setCurrentQuote] = useState<QuoteItem>(INITIAL_QUOTES[0]);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Filters
  const [activeNav, setActiveNav] = useState<NavFilter>('All Quotes');
  const [sourceFilter, setSourceFilter] = useState<QuoteSourcePlatform>('All');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Live Archive.org Video Fetch state
  const [isFetchingArchive, setIsFetchingArchive] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);

  // Tape Loop & Effects
  const [loop, setLoop] = useState<LoopState>({
    enabled: false,
    start: 2,
    end: 8,
  });
  const [fx, setFx] = useState<AudioFXState>(DEFAULT_FX);
  const [volume, setVolume] = useState<number>(0.85);

  // Saved Quotes
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('lost_quotes_saved_v2');
      return stored
        ? JSON.parse(stored)
        : ['chaplin-great-dictator-1940', 'jfk-ask-not-1961'];
    } catch {
      return ['chaplin-great-dictator-1940'];
    }
  });

  // Recording & Modals
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [isGithubOpen, setIsGithubOpen] = useState<boolean>(false);

  // Sync loop state to engine
  useEffect(() => {
    audioEngine.setLoop(loop);
  }, [loop]);

  // Sync master volume to engine
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Load quote video & waveform audio buffer onto tape deck
  const loadQuote = useCallback(async (quote: QuoteItem, autoPlay: boolean = false) => {
    try {
      audioEngine.pause();
      setIsPlaying(false);

      let enrichedQuote = quote;
      if (quote.archiveId && !quote.videoUrl) {
        setCurrentQuote(quote);
        const resolved = await resolveArchiveMediaUrls(quote.archiveId);
        if (resolved.videoUrl) {
          enrichedQuote = {
            ...quote,
            videoUrl: resolved.videoUrl,
            duration: resolved.duration ? Math.min(180, resolved.duration) : quote.duration,
          };
          setQuotes((prev) => prev.map((q) => (q.id === quote.id ? enrichedQuote : q)));
        }
      }

      setCurrentQuote(enrichedQuote);

      const dur = enrichedQuote.duration || 22;
      const defaultLoop: LoopState = {
        enabled: false,
        start: Number((dur * 0.15).toFixed(2)),
        end: Number((dur * 0.45).toFixed(2)),
      };
      setLoop(defaultLoop);
      audioEngine.setLoop(defaultLoop);

      const buffer = await audioEngine.loadQuoteAudio(enrichedQuote);
      setAudioBuffer(buffer);
      audioEngine.seek(0);

      if (autoPlay) {
        await audioEngine.resume();
        audioEngine.play(() => setIsPlaying(false));
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Failed to load quote audio:', err);
    }
  }, []);

  // Initial load & hash routing
  useEffect(() => {
    const hash = window.location.hash;
    let initial = INITIAL_QUOTES[0];
    if (hash.startsWith('#quote/')) {
      const slug = hash.replace('#quote/', '');
      const matched = INITIAL_QUOTES.find((q) => q.slug === slug || q.id === slug);
      if (matched) initial = matched;
    }
    loadQuote(initial, false);
  }, [loadQuote]);

  // Fetch live video quote samples from Internet Archive
  const handleFetchArchiveQuotes = async (
    query: string,
    category: Exclude<QuoteCategory, 'All Quotes'>
  ) => {
    setIsFetchingArchive(true);
    setFetchError(null);
    setFetchStatus(null);

    try {
      const fetched = await fetchArchiveVideoQuotes(query, category, 6);
      if (fetched.length === 0) {
        setFetchError(`No MPEG4 video samples found on Internet Archive for "${query}".`);
        return;
      }

      setQuotes((prev) => {
        const existingIds = new Set(prev.map((q) => q.id));
        const novel = fetched.filter((q) => !existingIds.has(q.id));
        return [...novel, ...prev];
      });

      setActiveNav(category);
      setSourceFilter('All');
      setSelectedTag(null);
      setFetchStatus(`Loaded ${fetched.length} live video samples from Internet Archive.`);

      // Load the first fetched video directly onto the Tape Deck
      window.location.hash = `quote/${fetched[0].slug}`;
      await loadQuote(fetched[0], false);
    } catch (err) {
      setFetchError(
        err instanceof Error
          ? `Could not fetch Internet Archive videos: ${err.message}`
          : 'Could not reach Internet Archive search API.'
      );
    } finally {
      setIsFetchingArchive(false);
    }
  };

  // Extract all unique tags across archive
  const allTags = useMemo(() => {
    const set = new Set<string>();
    quotes.forEach((q) => q.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [quotes]);

  // Filtered quotes list
  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (activeNav === 'Saved') {
        if (!savedIds.includes(q.id)) return false;
      } else if (activeNav !== 'All Quotes') {
        if (q.category !== activeNav) return false;
      }

      if (sourceFilter !== 'All' && q.sourcePlatform !== sourceFilter) {
        return false;
      }

      if (selectedTag && !q.tags.includes(selectedTag)) {
        return false;
      }

      if (searchQuery.trim()) {
        const needle = searchQuery.toLowerCase();
        const hit =
          q.title.toLowerCase().includes(needle) ||
          q.speaker.toLowerCase().includes(needle) ||
          q.quoteText.toLowerCase().includes(needle) ||
          q.sourceName.toLowerCase().includes(needle) ||
          q.tags.some((t) => t.toLowerCase().includes(needle));
        if (!hit) return false;
      }

      return true;
    });
  }, [quotes, activeNav, sourceFilter, selectedTag, searchQuery, savedIds]);

  // Transport controls
  const handleTogglePlay = async () => {
    await audioEngine.resume();
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
  };

  const handleTapeStop = () => {
    audioEngine.triggerTapeStop(() => {
      setIsPlaying(false);
    });
  };

  const handleResetFX = () => {
    setFx(DEFAULT_FX);
    audioEngine.updateFX(DEFAULT_FX);
  };

  // Random picker across all quotes or filtered subset
  const pickRandomFrom = (pool: QuoteItem[]) => {
    if (pool.length === 0) return;
    const candidates = pool.filter((q) => q.id !== currentQuote.id);
    const list = candidates.length > 0 ? candidates : pool;
    const chosen = list[Math.floor(Math.random() * list.length)];
    window.location.hash = `quote/${chosen.slug}`;
    loadQuote(chosen, true);
  };

  const handleRandomAll = () => pickRandomFrom(quotes);
  const handleRandomFiltered = () => pickRandomFrom(filteredQuotes);

  // Bookmarks
  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem('lost_quotes_saved_v2', JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  // Live session recording
  const handleToggleRecord = async () => {
    await audioEngine.resume();
    if (isRecording) {
      const result = await audioEngine.stopRecording();
      setIsRecording(false);
      setRecordedBlob(result.blob);
      setRecordedUrl(result.url);
      setIsRecordingModalOpen(true);
    } else {
      audioEngine.startRecording();
      setIsRecording(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0e13] text-zinc-100 flex flex-col">
      <Navbar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        onRandomPick={handleRandomAll}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Video & FM-1 Tape Deck with Scrolling Waveform & Hold-to-Scratch */}
        <TapeDeck
          quote={currentQuote}
          audioBuffer={audioBuffer}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onStop={handleStop}
          onTapeStop={handleTapeStop}
          fx={fx}
          onChangeFX={setFx}
          loop={loop}
          onChangeLoop={setLoop}
          isSaved={savedIds.includes(currentQuote.id)}
          onToggleSave={() => toggleSave(currentQuote.id)}
          isRecording={isRecording}
          onToggleRecord={handleToggleRecord}
          onOpenImport={() => setIsImportOpen(true)}
          volume={volume}
          onChangeVolume={setVolume}
        />

        {/* FM-1 Style Effects & Processing Rack */}
        <FxRack
          fx={fx}
          onChangeFX={setFx}
          onResetFX={handleResetFX}
        />

        {/* Quote Video Archive Browser + Live Archive.org Video Fetcher */}
        <QuoteBrowser
          quotes={quotes}
          filteredQuotes={filteredQuotes}
          currentQuoteId={currentQuote.id}
          isPlaying={isPlaying}
          activeNav={activeNav}
          onSelectNav={setActiveNav}
          sourceFilter={sourceFilter}
          onChangeSourceFilter={setSourceFilter}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          allTags={allTags}
          searchQuery={searchQuery}
          onChangeSearch={setSearchQuery}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onSelectQuote={(q, autoPlay) => {
            window.location.hash = `quote/${q.slug}`;
            loadQuote(q, autoPlay);
          }}
          onRandomFiltered={handleRandomFiltered}
          onFetchArchiveQuotes={handleFetchArchiveQuotes}
          isFetchingArchive={isFetchingArchive}
          fetchError={fetchError}
          fetchStatus={fetchStatus}
        />
      </main>

      <footer className="border-t border-zinc-800/80 py-5 px-4 sm:px-6 mt-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>Lost Quotes — FM-1 Video & Archival Quote Sampler</span>
          <button
            onClick={() => setIsGithubOpen(true)}
            className="hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Deploy on GitHub Pages
          </button>
        </div>
      </footer>

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportQuote={(newQuote) => {
          setQuotes((prev) => [newQuote, ...prev]);
          setCurrentQuote(newQuote);
          setAudioBuffer(audioEngine.getCurrentBuffer());
          setIsPlaying(false);
          const dur = newQuote.duration || 22;
          setLoop({
            enabled: false,
            start: Number((dur * 0.15).toFixed(2)),
            end: Number((dur * 0.45).toFixed(2)),
          });
        }}
      />

      <GitHubPagesModal
        isOpen={isGithubOpen}
        onClose={() => setIsGithubOpen(false)}
      />

      <RecordingModal
        isOpen={isRecordingModalOpen}
        onClose={() => setIsRecordingModalOpen(false)}
        audioUrl={recordedUrl}
        audioBlob={recordedBlob}
      />
    </div>
  );
}
