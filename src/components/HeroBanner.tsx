import { useState } from 'react';
import { Check, Film, Info, Play, Plus } from 'lucide-react';
import type { MediaItem } from '../types';

interface HeroBannerProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export function HeroBanner({ item, onPlay, onMoreInfo, onToggleWatchlist }: HeroBannerProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <section className="relative w-full min-h-[72vh] lg:min-h-[82vh] flex items-end pb-14 sm:pb-20 pt-24 overflow-hidden">
      {/* Full-bleed Cinema Backdrop */}
      <div className="absolute inset-0 z-0">
        {!imgFailed ? (
          <img
            src={item.backdropUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1C1F2A] via-[#101218] to-[#08090B] flex items-center justify-center">
            <Film className="w-16 h-16 text-white/15" />
          </div>
        )}
        {/* Multi-stop Scrims for >= 4.5:1 Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08090B] via-[#08090B]/45 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08090B]/95 via-[#08090B]/55 to-transparent" />
      </div>

      {/* Hero Foreground Content */}
      <div className="relative z-10 max-w-[1440px] w-full mx-auto px-6 sm:px-10">
        <div className="max-w-2xl">
          {/* Unboxed Kicker Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#D1D5DB] mb-3">
            <span className="text-[#E50914] font-semibold">Featured Premiere</span>
            <span aria-hidden="true">·</span>
            <span>{item.year}</span>
            <span aria-hidden="true">·</span>
            <span>{item.genres.join(' / ')}</span>
            <span aria-hidden="true">·</span>
            <span>{item.durationLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{item.maturityRating}</span>
            <span aria-hidden="true">·</span>
            <span>{item.quality}</span>
          </div>

          <h1
            className="font-display font-bold tracking-tight text-white mb-4 leading-[1.06]"
            style={{ fontSize: 'clamp(2.25rem, 4.5vw, 4.1rem)', textWrap: 'balance' }}
          >
            {item.title}
          </h1>

          <p className="text-sm sm:text-base text-[#E5E7EB] leading-relaxed mb-7 max-w-xl">
            {item.synopsis}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onPlay(item)}
              className="px-6 py-3 bg-[#E50914] hover:bg-[#C80812] text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              {item.progressSeconds > 0 ? 'Resume Film' : 'Watch Now'}
            </button>

            <button
              type="button"
              onClick={() => onMoreInfo(item)}
              className="px-5 py-3 bg-[#1D2029]/90 hover:bg-[#2A2E3B] border border-white/15 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Info className="w-4 h-4" />
              Details
            </button>

            <button
              type="button"
              onClick={() => onToggleWatchlist(item)}
              aria-pressed={item.inWatchlist}
              className="px-4 py-3 bg-black/40 hover:bg-white/10 border border-white/15 text-[#F5F5F7] text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              {item.inWatchlist ? (
                <>
                  <Check className="w-4 h-4 text-[#E50914]" />
                  In My List
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  My List
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
