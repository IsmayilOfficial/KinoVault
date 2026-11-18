import { useState } from 'react';
import { Check, Film, Info, Play, Plus } from 'lucide-react';
import type { MediaItem } from '../types';

interface CinemaCardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
  rankNumber?: number | null;
}

export function CinemaCard({
  item,
  onPlay,
  onMoreInfo,
  onToggleWatchlist,
  rankNumber,
}: CinemaCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const progressPct =
    item.progressSeconds > 0 && item.durationSeconds > 0
      ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100))
      : 0;

  return (
    <article className="group relative flex flex-col shrink-0 w-full">
      {/* 16:9 Thumbnail Frame */}
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#12141A] border border-white/10 transition-transform duration-200 group-hover:scale-[1.02]">
        <button
          type="button"
          onClick={() => onPlay(item)}
          className="block w-full h-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
          aria-label={`Play ${item.title}`}
        >
          {!imgFailed ? (
            <img
              src={item.backdropUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-80"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1D2029] to-[#0B0C10] flex flex-col items-center justify-center p-4 text-center">
              <Film className="w-7 h-7 text-white/30 mb-2" />
              <span className="text-xs font-medium text-[#D1D5DB]">{item.title}</span>
            </div>
          )}

          {/* Subtle bottom gradient for hover actions & progress bar */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-60 group-hover:opacity-95 transition-opacity" />

          {rankNumber ? (
            <span className="absolute top-2.5 left-3 font-mono-code text-xs font-medium text-white/90 bg-black/65 px-2 py-0.5 rounded">
              #{rankNumber}
            </span>
          ) : null}
        </button>

        {/* Quick Action Overlay on Hover */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
          <button
            type="button"
            onClick={() => onPlay(item)}
            className="px-3 py-1.5 bg-white text-[#08090B] hover:bg-[#E5E7EB] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {progressPct > 0 ? 'Resume' : 'Play'}
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleWatchlist(item)}
              aria-label={item.inWatchlist ? `Remove ${item.title} from My List` : `Add ${item.title} to My List`}
              title={item.inWatchlist ? 'Remove from My List' : 'Add to My List'}
              className="p-1.5 rounded-md bg-black/70 hover:bg-black text-white border border-white/20 transition-colors"
            >
              {item.inWatchlist ? <Check className="w-3.5 h-3.5 text-[#E50914]" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onMoreInfo(item)}
              aria-label={`Details for ${item.title}`}
              title="More details"
              className="p-1.5 rounded-md bg-black/70 hover:bg-black text-white border border-white/20 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Continue Watching Progress Track */}
        {progressPct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
            <div className="h-full bg-[#E50914]" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {/* Clean Unboxed Card Caption */}
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={() => onMoreInfo(item)}
          className="text-left text-sm font-medium text-[#F5F5F7] hover:text-white truncate focus:outline-none"
        >
          {item.title}
        </button>
        <span className="text-xs text-[#6B7280] shrink-0 font-mono-code">
          {item.maturityRating}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#9CA3AF] truncate">
        <span>{item.year}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{item.genres[0]}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{item.durationLabel}</span>
      </div>
    </article>
  );
}
