import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '../types';
import { CinemaCard } from './CinemaCard';

interface CinemaRowProps {
  title: string;
  subtitle?: string;
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
  showRanks?: boolean;
}

export function CinemaRow({
  title,
  subtitle,
  items,
  onPlay,
  onMoreInfo,
  onToggleWatchlist,
  showRanks = false,
}: CinemaRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  function scrollBy(direction: 'left' | 'right') {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(320, el.clientWidth * 0.75);
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  }

  return (
    <section className="relative group/row py-4">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 mb-4 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-white truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="hidden sm:inline text-xs text-[#9CA3AF] truncate">{subtitle}</span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scrollBy('left')}
            aria-label={`Scroll ${title} left`}
            className="p-1.5 rounded-lg bg-[#12141A] border border-white/10 text-[#D1D5DB] hover:text-white hover:border-white/25 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy('right')}
            aria-label={`Scroll ${title} right`}
            className="p-1.5 rounded-lg bg-[#12141A] border border-white/10 text-[#D1D5DB] hover:text-white hover:border-white/25 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="cinema-scroll flex gap-4 sm:gap-5 overflow-x-auto px-6 sm:px-10 max-w-[1440px] mx-auto"
      >
        {items.map((item, idx) => (
          <div key={item.id} className="w-[260px] sm:w-[300px] lg:w-[320px] shrink-0">
            <CinemaCard
              item={item}
              onPlay={onPlay}
              onMoreInfo={onMoreInfo}
              onToggleWatchlist={onToggleWatchlist}
              rankNumber={showRanks ? idx + 1 : null}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
