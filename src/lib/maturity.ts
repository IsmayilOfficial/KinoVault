import type { MaturityRating, MediaType } from '../types';

export const MATURITY_LEVELS: Record<MaturityRating, number> = {
  G: 0,
  PG: 1,
  'PG-13': 2,
  R: 3,
};

export function isRatingAllowed(
  itemRating: MaturityRating,
  maxRating?: MaturityRating | null
): boolean {
  if (!maxRating) return true;
  return MATURITY_LEVELS[itemRating] <= MATURITY_LEVELS[maxRating];
}

export function getDisplayAgeRating(rating: MaturityRating, mediaType: MediaType): string {
  if (mediaType === 'show') {
    switch (rating) {
      case 'G':
        return 'TV-G';
      case 'PG':
        return 'TV-PG';
      case 'PG-13':
        return 'TV-14';
      case 'R':
        return 'TV-MA';
    }
  }
  return rating;
}

export function getAgeRatingBadgeClasses(rating: MaturityRating): string {
  switch (rating) {
    case 'G':
      return 'bg-black/80 border-emerald-400/40 text-emerald-300';
    case 'PG':
      return 'bg-black/80 border-sky-400/40 text-sky-200';
    case 'PG-13':
      return 'bg-black/80 border-amber-400/45 text-amber-200';
    case 'R':
      return 'bg-black/80 border-[#E50914]/55 text-[#FCA5A5]';
  }
}
