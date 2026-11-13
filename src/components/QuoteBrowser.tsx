import React from 'react';
import {
  Search,
  Shuffle,
  Bookmark,
  Play,
  Youtube,
  Archive,
} from 'lucide-react';
import { QuoteCategory, QuoteItem, QuoteSourcePlatform } from '../types';
import { QUOTE_CATEGORIES } from '../data/quotes';
import { NavFilter } from './Navbar';

interface QuoteBrowserProps {
  quotes: QuoteItem[];
  filteredQuotes: QuoteItem[];
  currentQuoteId: string;
  isPlaying: boolean;
  activeNav: NavFilter;
  onSelectNav: (nav: NavFilter) => void;
  sourceFilter: QuoteSourcePlatform;
  onChangeSourceFilter: (src: QuoteSourcePlatform) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  allTags: string[];
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  savedIds: string[];
  onToggleSave: (id: string) => void;
  onSelectQuote: (quote: QuoteItem, autoPlay?: boolean) => void;
  onRandomFiltered: () => void;
}

export const QuoteBrowser: React.FC<QuoteBrowserProps> = ({
  filteredQuotes,
  currentQuoteId,
  isPlaying,
  activeNav,
  onSelectNav,
  sourceFilter,
  onChangeSourceFilter,
  selectedTag,
  onSelectTag,
  allTags,
  searchQuery,
  onChangeSearch,
  savedIds,
  onToggleSave,
  onSelectQuote,
  onRandomFiltered,
}) => {
  return (
    <section className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-[#13161e] border border-zinc-800/90 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Search quotes, speakers, films, or archive sources..."
              className="w-full pl-10 pr-16 py-2.5 bg-[#0c0e13] border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onChangeSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Source Filter & Random Filtered Pick */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center p-1 bg-[#0c0e13] border border-zinc-800 rounded-lg">
              {(['All', 'YouTube', 'Internet Archive'] as QuoteSourcePlatform[]).map((src) => {
                const active = sourceFilter === src;
                return (
                  <button
                    key={src}
                    onClick={() => onChangeSourceFilter(src)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#1e2330] text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {src === 'All' ? 'All Sources' : src}
                  </button>
                );
              })}
            </div>

            <button
              onClick={onRandomFiltered}
              disabled={filteredQuotes.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#1a1e29] hover:bg-zinc-800 disabled:opacity-40 text-amber-400 border border-zinc-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Pick a random quote from the current filtered list"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Random Match</span>
            </button>
          </div>
        </div>

        {/* Category Segmented Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-800/70">
          <div className="flex flex-wrap items-center gap-1.5">
            {([...QUOTE_CATEGORIES, 'Saved'] as NavFilter[]).map((cat) => {
              const isActive = activeNav === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectNav(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'bg-[#0c0e13] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <span className="text-xs font-mono text-zinc-500">
            {filteredQuotes.length} {filteredQuotes.length === 1 ? 'quote' : 'quotes'}
          </span>
        </div>

        {/* Interactive Tags Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-800/60">
          <button
            onClick={() => onSelectTag(null)}
            className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedTag === null
                ? 'bg-zinc-200 text-zinc-900 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 bg-[#0c0e13]'
            }`}
          >
            All Tags
          </button>
          {allTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => onSelectTag(active ? null : tag)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'text-zinc-400 hover:text-zinc-200 bg-[#0c0e13] border border-zinc-800/70'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quotes Grid */}
      {filteredQuotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuotes.map((quote) => {
            const isCurrent = quote.id === currentQuoteId;
            const isSaved = savedIds.includes(quote.id);

            return (
              <article
                key={quote.id}
                className={`bg-[#13161e] rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isCurrent
                    ? 'border-amber-500/70'
                    : 'border-zinc-800/90 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Unboxed quiet metadata line */}
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className={isCurrent ? 'text-amber-400 font-medium' : 'text-zinc-300'}>
                        {quote.category.replace(' Quotes', '')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{quote.year}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 truncate">
                        {quote.sourcePlatform === 'YouTube' ? (
                          <Youtube className="w-3 h-3 text-zinc-400 shrink-0" />
                        ) : (
                          <Archive className="w-3 h-3 text-zinc-400 shrink-0" />
                        )}
                        <span className="truncate">{quote.sourcePlatform}</span>
                      </span>
                    </div>

                    <button
                      onClick={() => onToggleSave(quote.id)}
                      className={`p-1.5 rounded-md transition-colors shrink-0 cursor-pointer ${
                        isSaved ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'
                      }`}
                      title={isSaved ? 'Remove from Saved' : 'Save Quote'}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Title & Speaker */}
                  <div>
                    <h3
                      onClick={() => onSelectQuote(quote, false)}
                      className="text-base font-semibold text-white hover:text-amber-400 transition-colors cursor-pointer line-clamp-1"
                    >
                      {quote.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{quote.speaker}</p>
                  </div>

                  {/* Quote excerpt */}
                  <p className="font-quote italic text-sm text-zinc-300 leading-relaxed line-clamp-3">
                    “{quote.quoteText}”
                  </p>
                </div>

                {/* Footer: unboxed tags + Load to Tape action */}
                <div className="pt-3 border-t border-zinc-800/70 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-mono text-zinc-500 truncate">
                    {quote.tags.slice(0, 3).join(' · ')}
                  </span>

                  <button
                    onClick={() => onSelectQuote(quote, true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrent && isPlaying
                        ? 'bg-amber-500 text-black font-semibold'
                        : 'bg-[#1a1e29] hover:bg-amber-500 hover:text-black text-zinc-200 border border-zinc-700/70'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{isCurrent && isPlaying ? 'Playing' : 'Load Tape'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#13161e] border border-zinc-800/90 rounded-xl p-12 text-center space-y-3">
          <h4 className="text-sm font-semibold text-zinc-200">No quotes match your current filters</h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Try clearing the tag filter, switching source platforms, or resetting your search query.
          </p>
          <button
            onClick={() => {
              onSelectNav('All Quotes');
              onChangeSourceFilter('All');
              onSelectTag(null);
              onChangeSearch('');
            }}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}
    </section>
  );
};
