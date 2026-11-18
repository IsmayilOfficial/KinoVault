import { useState } from 'react';
import { Bell, CalendarClock, Check, Film, Heart, Info, Play, Plus } from 'lucide-react';
import {
  getAgeRatingBadgeClasses,
  getDisplayAgeRating,
  isRatingAllowed,
} from '../lib/maturity';
import type { MaturityRating, MediaItem } from '../types';

interface CinemaCardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
  onToggleFavorite?: (item: MediaItem) => void;
  rankNumber?: number | null;
  maxRating?: MaturityRating;
}

export function CinemaCard({
  item,
  onPlay,
  onMoreInfo,
  onToggleWatchlist,
  onToggleFavorite,
  rankNumber,
  maxRating,
}: CinemaCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [localFavorite, setLocalFavorite] = useState(Boolean(item.isFavorite));

  if (!isRatingAllowed(item.maturityRating, maxRating)) {
    return null;
  }

  const isFavorited = onToggleFavorite ? Boolean(item.isFavorite) : localFavorite;

  const progressPct =
    item.progressSeconds > 0 && item.durationSeconds > 0
      ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100))
      : 0;
  const isUpcoming = Boolean(item.isUpcoming);
  const ageRatingLabel = getDisplayAgeRating(item.maturityRating, item.mediaType);

  return (
    <article className="group relative flex flex-col shrink-0 w-full">
      {/* 16:9 Thumbnail Frame */}
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#12141A] border border-white/10 transition-transform duration-200 group-hover:scale-[1.02]">
        <button
          type="button"
          onClick={() => (isUpcoming ? onMoreInfo(item) : onPlay(item))}
          className="block w-full h-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
          aria-label={isUpcoming ? `View upcoming details for ${item.title}` : `Play ${item.title}`}
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

          {isUpcoming ? (
            <span className="absolute top-2.5 left-3 font-mono-code text-[11px] font-medium text-white bg-black/75 border border-white/15 px-2 py-0.5 rounded inline-flex items-center gap-1.5">
              <CalendarClock className="w-3 h-3 text-[#E50914]" />
              {item.releaseDateLabel ? `Coming ${item.releaseDateLabel}` : 'Coming Soon'}
            </span>
          ) : rankNumber ? (
            <span className="absolute top-2.5 left-3 font-mono-code text-xs font-medium text-white/90 bg-black/65 px-2 py-0.5 rounded">
              #{rankNumber}
            </span>
          ) : null}
        </button>

        {/* Top-Right Overlays: Heart Favorite Toggle + Age Rating Badge */}
        <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleFavorite) {
                onToggleFavorite(item);
              } else {
                setLocalFavorite((prev) => !prev);
              }
            }}
            aria-label={
              isFavorited
                ? `Remove ${item.title} from favorites`
                : `Mark ${item.title} as favorite`
            }
            aria-pressed={isFavorited}
            title={isFavorited ? 'Favorited' : 'Favorite'}
            data-testid={`favorite-toggle-${item.id}`}
            className={`p-1.5 rounded-full border backdrop-blur-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${
              isFavorited
                ? 'bg-black/80 border-[#E50914]/60 text-[#E50914] opacity-100'
                : 'bg-black/65 border-white/15 text-white/85 hover:text-white hover:border-white/35 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
          </button>

          <span
            data-testid={`age-rating-${item.id}`}
            title={`Rated ${ageRatingLabel}`}
            className={`pointer-events-none font-mono-code text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded border backdrop-blur-sm ${getAgeRatingBadgeClasses(
              item.maturityRating
            )}`}
          >
            {ageRatingLabel}
          </span>
        </div>

        {/* Quick Action Overlay on Hover */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
          {isUpcoming ? (
            <button
              type="button"
              onClick={() => onMoreInfo(item)}
              className="px-3 py-1.5 bg-white text-[#08090B] hover:bg-[#E5E7EB] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5" />
              Preview Details
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPlay(item)}
              className="px-3 py-1.5 bg-white text-[#08090B] hover:bg-[#E5E7EB] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {progressPct > 0 ? 'Resume' : 'Play'}
            </button>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleWatchlist(item)}
              aria-label={
                isUpcoming
                  ? item.inWatchlist
                    ? `Remove reminder for ${item.title}`
                    : `Remind me when ${item.title} premieres`
                  : item.inWatchlist
                    ? `Remove ${item.title} from My List`
                    : `Add ${item.title} to My List`
              }
              title={
                isUpcoming
                  ? item.inWatchlist
                    ? 'Reminder Set'
                    : 'Remind Me'
                  : item.inWatchlist
                    ? 'Remove from My List'
                    : 'Add to My List'
              }
              className="p-1.5 rounded-md bg-black/70 hover:bg-black text-white border border-white/20 transition-colors"
            >
              {item.inWatchlist ? (
                <Check className="w-3.5 h-3.5 text-[#E50914]" />
              ) : isUpcoming ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
            {!isUpcoming && (
              <button
                type="button"
                onClick={() => onMoreInfo(item)}
                aria-label={`Details for ${item.title}`}
                title="More details"
                className="p-1.5 rounded-md bg-black/70 hover:bg-black text-white border border-white/20 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            )}
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
        <span className="text-[11px] text-[#9CA3AF] shrink-0 uppercase tracking-wider">
          {item.mediaType === 'show' ? 'Series' : 'Film'}
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
