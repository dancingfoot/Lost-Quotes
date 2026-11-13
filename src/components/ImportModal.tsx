import React, { useState } from 'react';
import { X, Youtube, Archive, FileAudio, AlertCircle } from 'lucide-react';
import { QuoteCategory, QuoteItem } from '../types';
import { audioEngine } from '../utils/audioEngine';
import { extractArchiveIdentifier, resolveArchiveMediaUrls } from '../utils/archiveFetcher';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuote: (quote: QuoteItem) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportQuote,
}) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'archive' | 'file'>('youtube');
  const [sourceUrl, setSourceUrl] = useState('');
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [category, setCategory] = useState<Exclude<QuoteCategory, 'All Quotes'>>('Political Quotes');
  const [quoteText, setQuoteText] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    if (!speaker) {
      setSpeaker('Local Archive Recording');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let ytId = '';
      let archiveId = '';
      let videoUrl: string | undefined;
      let resolvedDuration = 24;

      if (activeTab === 'youtube') {
        if (!sourceUrl.trim()) {
          setError('Please enter a YouTube URL or 11-character video ID.');
          setIsLoading(false);
          return;
        }
        ytId = extractYoutubeId(sourceUrl) || sourceUrl.trim();
      } else if (activeTab === 'archive') {
        if (!sourceUrl.trim()) {
          setError('Please enter an Internet Archive item URL or identifier.');
          setIsLoading(false);
          return;
        }
        archiveId = extractArchiveIdentifier(sourceUrl) || '';
        if (archiveId) {
          const media = await resolveArchiveMediaUrls(archiveId);
          videoUrl = media.videoUrl;
          if (media.duration) resolvedDuration = Math.min(180, media.duration);
        }
      } else if (activeTab === 'file' && !uploadedFile) {
        setError('Please select an audio file to load.');
        setIsLoading(false);
        return;
      }

      const id = `custom-${Date.now()}`;
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const newQuote: QuoteItem = {
        id,
        slug: id,
        title: title.trim() || (uploadedFile ? uploadedFile.name : 'Imported Archival Quote'),
        speaker: speaker.trim() || 'Unknown Speaker',
        year: new Date().getFullYear(),
        sourcePlatform: activeTab === 'archive' ? 'Internet Archive' : 'YouTube',
        sourceName:
          activeTab === 'youtube'
            ? 'YouTube Import'
            : activeTab === 'archive'
              ? 'Internet Archive Import'
              : 'Local Audio File',
        sourceUrl: sourceUrl.trim() || 'https://archive.org',
        youtubeId: ytId || undefined,
        archiveId: archiveId || undefined,
        videoUrl,
        isLocalAudio: activeTab === 'file',
        category,
        duration: resolvedDuration,
        tags: parsedTags.length > 0 ? parsedTags : ['Imported', category.replace(' Quotes', '')],
        quoteText:
          quoteText.trim() ||
          'Custom archival quote loaded into the tape deck for looping, scrubbing, and effects.',
        context:
          activeTab === 'file'
            ? `Loaded directly from local file (${uploadedFile?.name}).`
            : `Imported from ${activeTab === 'youtube' ? 'YouTube' : 'Internet Archive'}.`,
        toneProfile: category === 'Movie Quotes' ? 'cinema' : 'speech',
      };

      if (uploadedFile) {
        const buf = await audioEngine.loadUserAudioFile(uploadedFile);
        newQuote.duration = Math.round(buf.duration);
      } else {
        await audioEngine.loadQuoteAudio(newQuote);
      }

      onImportQuote(newQuote);
      onClose();
    } catch {
      setError('Could not load audio source. Please try another file or link.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13161e] w-full max-w-lg rounded-xl border border-zinc-800 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-white">Import Quote Source</h3>
            <p className="text-xs text-zinc-400">Add from YouTube, Internet Archive, or local audio</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source tabs */}
        <div className="grid grid-cols-3 border-b border-zinc-800 bg-[#0c0e13]">
          <button
            type="button"
            onClick={() => setActiveTab('youtube')}
            className={`py-3 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'youtube'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            <span>YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`py-3 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'archive'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archive.org</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`py-3 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'file'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>Audio File</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'file' ? (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-300 font-medium block">Upload WAV, MP3, OGG, or FLAC</label>
              <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-zinc-700 hover:border-amber-500 rounded-lg cursor-pointer bg-[#0c0e13] p-4 text-center transition-colors">
                <FileAudio className="w-6 h-6 text-amber-400 mb-1" />
                <span className="text-xs text-zinc-300">
                  {uploadedFile ? uploadedFile.name : 'Click to select audio file'}
                </span>
                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-300 font-medium block">
                {activeTab === 'youtube' ? 'YouTube URL or Video ID' : 'Internet Archive URL'}
              </label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={
                  activeTab === 'youtube'
                    ? 'https://www.youtube.com/watch?v=J7GY1Xg6X20'
                    : 'https://archive.org/details/...'
                }
                className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Speech or scene title"
                className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Speaker</label>
              <input
                type="text"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                placeholder="Speaker or character"
                className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Category</label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Exclude<QuoteCategory, 'All Quotes'>)
                }
                className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                <option value="Political Quotes">Political Quotes</option>
                <option value="Historical Quotes">Historical Quotes</option>
                <option value="Movie Quotes">Movie Quotes</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Tags (comma separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Oratory, 1960s, Cinema"
                className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Quote Transcript</label>
            <textarea
              rows={2}
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="Paste the spoken quote excerpt..."
              className="w-full px-3 py-2 bg-[#0c0e13] border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
          >
            {isLoading ? 'Loading Tape...' : 'Load onto Tape Deck'}
          </button>
        </form>
      </div>
    </div>
  );
};
