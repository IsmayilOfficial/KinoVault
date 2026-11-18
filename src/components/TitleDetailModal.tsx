import { useEffect } from 'react';
import { Check, Play, Plus, X } from 'lucide-react';
import type { MediaItem } from '../types';

interface TitleDetailModalProps {
  item: MediaItem;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export function TitleDetailModal({ item, onClose, onPlay, onToggleWatchlist }: TitleDetailModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#12141A] border border-white/15 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 16:9 Preview Header */}
        <div className="relative aspect-video w-full bg-[#08090B]">
          <img
            src={item.backdropUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141A] via-[#12141A]/35 to-black/30" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="absolute top-4 right-4 p-2 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#D1D5DB] mb-2">
              <span>{item.year}</span>
              <span aria-hidden="true">·</span>
              <span>{item.durationLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{item.maturityRating}</span>
              <span aria-hidden="true">·</span>
              <span>{item.quality}</span>
              <span aria-hidden="true">·</span>
              <span>{item.audio}</span>
            </div>
            <h2 id="detail-modal-title" className="font-display text-2xl sm:text-4xl font-bold text-white mb-4">
              {item.title}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPlay(item);
                }}
                className="px-6 py-2.5 bg-[#E50914] hover:bg-[#C80812] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                {item.progressSeconds > 0 ? 'Resume Film' : 'Play'}
              </button>

              <button
                type="button"
                onClick={() => onToggleWatchlist(item)}
                className="px-4 py-2.5 bg-[#1D2029] hover:bg-[#262A36] border border-white/15 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                {item.inWatchlist ? (
                  <>
                    <Check className="w-4 h-4 text-[#E50914]" />
                    In My List
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add to My List
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Credits & Synopsis */}
        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            <p className="text-sm font-medium text-white">{item.tagline}</p>
            <p className="text-sm text-[#D1D5DB] leading-relaxed">{item.synopsis}</p>
          </div>

          <div className="space-y-3 text-xs border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
            <div>
              <span className="text-[#9CA3AF] block mb-0.5">Director</span>
              <span className="text-white font-medium">{item.director}</span>
            </div>
            <div>
              <span className="text-[#9CA3AF] block mb-0.5">Cast</span>
              <span className="text-[#E5E7EB] leading-relaxed block">{item.cast.join(', ')}</span>
            </div>
            <div>
              <span className="text-[#9CA3AF] block mb-0.5">Genres</span>
              <span className="text-[#E5E7EB]">{item.genres.join(' · ')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
