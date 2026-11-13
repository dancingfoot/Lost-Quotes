import React from 'react';
import { Shuffle } from 'lucide-react';
import { QuoteCategory } from '../types';

export type NavFilter = QuoteCategory | 'Saved';

interface NavbarProps {
  activeNav: NavFilter;
  onSelectNav: (nav: NavFilter) => void;
  onRandomPick: () => void;
}

const NAV_ITEMS: { label: string; value: NavFilter }[] = [
  { label: 'All Quotes', value: 'All Quotes' },
  { label: 'Political', value: 'Political Quotes' },
  { label: 'Historical', value: 'Historical Quotes' },
  { label: 'Movie', value: 'Movie Quotes' },
  { label: 'Saved', value: 'Saved' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeNav,
  onSelectNav,
  onRandomPick,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#0c0e13]/95 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onSelectNav('All Quotes')}
          className="text-base font-bold tracking-tight text-white hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Lost Quotes
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.value;
            return (
              <button
                key={item.value}
                onClick={() => onSelectNav(item.value)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-amber-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={onRandomPick}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Random Quote</span>
          </button>
        </div>
      </div>

      {/* Mobile horizontal category strip */}
      <div className="md:hidden border-t border-zinc-800/60 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
        {NAV_ITEMS.map((item) => {
          const isActive = activeNav === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onSelectNav(item.value)}
              className={`whitespace-nowrap shrink-0 pb-0.5 border-b ${
                isActive ? 'border-amber-500 text-white' : 'border-transparent text-zinc-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
