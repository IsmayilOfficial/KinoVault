export type MaturityRating = 'G' | 'PG' | 'PG-13' | 'R';
export type MediaType = 'movie' | 'show';

export interface AudioTrackOption {
  code: string;
  label: string;
  channelFormat?: string;
}

export interface SubtitleTrackOption {
  code: string;
  label: string;
}

export interface MediaItem {
  id: string;
  mediaType: MediaType;
  seasonsLabel?: string;
  title: string;
  tagline: string;
  synopsis: string;
  director: string;
  cast: string[];
  year: number;
  durationLabel: string;
  durationSeconds: number;
  maturityRating: MaturityRating;
  genres: string[];
  quality: '4K HDR' | '1080p HD';
  audio: 'Dolby Atmos' | '5.1 Surround';
  audioTracks?: AudioTrackOption[];
  subtitleTracks?: SubtitleTrackOption[];
  backdropUrl: string;
  mediaFilename?: string;
  featured: boolean;
  trendingRank?: number;
  viewCount?: number;
  popularityScore?: number;
  isUpcoming?: boolean;
  releaseDateLabel?: string;
}

export const MATURITY_LEVELS: Record<MaturityRating, number> = {
  G: 0,
  PG: 1,
  'PG-13': 2,
  R: 3,
};

export function isRatingAllowed(itemRating: MaturityRating, profileMaxRating: MaturityRating): boolean {
  return MATURITY_LEVELS[itemRating] <= MATURITY_LEVELS[profileMaxRating];
}

export const MEDIA_CATALOG: MediaItem[] = [
  {
    id: 'meridian-nine',
    mediaType: 'movie',
    title: 'Meridian Nine',
    tagline: 'Forty thousand kilometers above Earth, silence carries a pulse.',
    synopsis:
      'After an orbital observatory records an unscheduled gravitational shift above the Pacific, lone telemetry engineer Mara Vance must decode an impossible transmission before station power fails.',
    director: 'Henrik Lindqvist',
    cast: ['Clara Johansson', 'Dev Patel', 'Mads Lindholm'],
    year: 2025,
    durationLabel: '2h 18m',
    durationSeconds: 24,
    maturityRating: 'PG-13',
    genres: ['Sci-Fi', 'Drama'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    audioTracks: [
      { code: 'en', label: 'English [Original]', channelFormat: 'Dolby Atmos' },
      { code: 'es', label: 'Español', channelFormat: '5.1 Surround' },
      { code: 'fr', label: 'Français', channelFormat: '5.1 Surround' },
      { code: 'ja', label: '日本語', channelFormat: '5.1 Surround' },
    ],
    subtitleTracks: [
      { code: 'en-cc', label: 'English [CC]' },
      { code: 'es', label: 'Español' },
      { code: 'fr', label: 'Français' },
      { code: 'ja', label: '日本語' },
      { code: 'de', label: 'Deutsch' },
    ],
    backdropUrl: '/src/assets/images/cinema_meridian_nine_1795041005320.jpg',
    mediaFilename: 'meridian-nine.mp4',
    featured: true,
    trendingRank: 1,
    viewCount: 320_400,
    popularityScore: 98,
  },
  {
    id: 'velvet-alibi',
    mediaType: 'show',
    seasonsLabel: 'Limited Series · 8 Episodes',
    title: 'The Velvet Alibi',
    tagline: 'Every cobblestone in Prague remembers who walked home alone.',
    synopsis:
      'A disgraced archivist is summoned back to the ministry after a ledger thought burned in 1978 surfaces in an estate auction, pulling him into a nocturnal maze of false confessions.',
    director: 'Tomasz Kowalski',
    cast: ['Matthias Schoenaerts', 'Lea Seydoux', 'Stellan Borg'],
    year: 2024,
    durationLabel: '52m / ep',
    durationSeconds: 24,
    maturityRating: 'R',
    genres: ['Thriller & Noir', 'Drama'],
    quality: '4K HDR',
    audio: '5.1 Surround',
    audioTracks: [
      { code: 'en', label: 'English [Original]', channelFormat: '5.1 Surround' },
      { code: 'cs', label: 'Čeština', channelFormat: '5.1 Surround' },
      { code: 'fr', label: 'Français', channelFormat: '5.1 Surround' },
      { code: 'de', label: 'Deutsch', channelFormat: 'Stereo' },
    ],
    subtitleTracks: [
      { code: 'en-cc', label: 'English [CC]' },
      { code: 'cs', label: 'Čeština' },
      { code: 'fr', label: 'Français' },
      { code: 'de', label: 'Deutsch' },
    ],
    backdropUrl: '/src/assets/images/cinema_velvet_alibi_1795041007028.jpg',
    mediaFilename: 'velvet-alibi.mp4',
    featured: false,
    trendingRank: 2,
    viewCount: 248_900,
    popularityScore: 95,
  },
  {
    id: 'svalbard-echoes',
    mediaType: 'show',
    seasonsLabel: '1 Season · 6 Episodes',
    title: 'Echoes of Svalbard',
    tagline: 'Where the polar night meets ancient glacial memory.',
    synopsis:
      'Filmed over fourteen winter weeks aboard an ice-class research vessel, oceanographers map acoustic currents beneath the High Arctic shelf as the sea freezes around them.',
    director: 'Astrid Solberg',
    cast: ['Narrated by Tilda Swinton'],
    year: 2025,
    durationLabel: '48m / ep',
    durationSeconds: 24,
    maturityRating: 'G',
    genres: ['Documentary'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    audioTracks: [
      { code: 'en', label: 'English [Original]', channelFormat: 'Dolby Atmos' },
      { code: 'no', label: 'Norsk', channelFormat: '5.1 Surround' },
      { code: 'sv', label: 'Svenska', channelFormat: 'Stereo' },
    ],
    subtitleTracks: [
      { code: 'en-cc', label: 'English [CC]' },
      { code: 'no', label: 'Norsk' },
      { code: 'sv', label: 'Svenska' },
      { code: 'es', label: 'Español' },
    ],
    backdropUrl: '/src/assets/images/cinema_svalbard_echoes_1795041007623.jpg',
    mediaFilename: 'svalbard-echoes.mp4',
    featured: false,
    trendingRank: 4,
    viewCount: 142_300,
    popularityScore: 91,
  },
  {
    id: 'clockwork-harbor',
    mediaType: 'movie',
    title: 'Clockwork Harbor',
    tagline: 'A tide of brass sails, sea fog, and forgotten charts.',
    synopsis:
      'Young apprentice mapmaker Pippa discovers a wind-powered compass inside her grandfather’s lighthouse that points toward an island only visible when the evening bells ring.',
    director: 'Haruka Takahashi',
    cast: ['Saoirse Ronan', 'Bill Nighy', 'Jacob Tremblay'],
    year: 2024,
    durationLabel: '1h 42m',
    durationSeconds: 24,
    maturityRating: 'PG',
    genres: ['Family', 'Sci-Fi'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    backdropUrl: '/src/assets/images/cinema_clockwork_harbor_1795041007667.jpg',
    mediaFilename: 'clockwork-harbor.mp4',
    featured: false,
    trendingRank: 3,
    viewCount: 185_600,
    popularityScore: 94,
  },
  {
    id: 'glass-horizon',
    mediaType: 'movie',
    title: 'Glass Horizon',
    tagline: 'Some houses are built to keep the storm out. Others trap it inside.',
    synopsis:
      'Over a fog-bound weekend at their father’s concrete cliffside residence, two estranged architects negotiate the future of his studio while buried correspondence comes to light.',
    director: 'Celine Moreau',
    cast: ['Rebecca Ferguson', 'Oscar Isaac', 'Charlotte Rampling'],
    year: 2025,
    durationLabel: '2h 04m',
    durationSeconds: 24,
    maturityRating: 'R',
    genres: ['Drama'],
    quality: '4K HDR',
    audio: '5.1 Surround',
    backdropUrl: '/src/assets/images/cinema_glass_horizon_1795041008067.jpg',
    mediaFilename: 'glass-horizon.mp4',
    featured: false,
    viewCount: 64_200,
    popularityScore: 78,
  },
  {
    id: 'iron-courier',
    mediaType: 'movie',
    title: 'Iron Courier',
    tagline: 'Four alpine passes. Zero radio contact.',
    synopsis:
      'Tasked with transporting an encrypted diplomatic drive across the Dolomites before midnight, a retired rally driver realizes every checkpoint along the border has been compromised.',
    director: 'Lukas Brenner',
    cast: ['Daniel Bruhl', 'Vicky Krieps', 'Nikolaj Coster-Waldau'],
    year: 2023,
    durationLabel: '1h 51m',
    durationSeconds: 24,
    maturityRating: 'R',
    genres: ['Thriller & Noir'],
    quality: '1080p HD',
    audio: 'Dolby Atmos',
    backdropUrl: '/src/assets/images/cinema_iron_courier_1795041009078.jpg',
    mediaFilename: 'iron-courier.mp4',
    featured: false,
    trendingRank: 5,
    viewCount: 79_500,
    popularityScore: 81,
  },
  {
    id: 'kyoto-solstice',
    mediaType: 'movie',
    title: 'Solstice in Kyoto',
    tagline: 'Autumn rain falls slowest on the things left unsaid.',
    synopsis:
      'A master restorer of antique paper screens spends one final rainy season teaching her apprentice the quiet craft of preserving family memory in a changing neighborhood.',
    director: 'Kenji Watanabe',
    cast: ['Sakura Ando', 'Hidetoshi Nishijima', 'Aoi Yu'],
    year: 2024,
    durationLabel: '1h 48m',
    durationSeconds: 24,
    maturityRating: 'PG',
    genres: ['Drama', 'Family'],
    quality: '4K HDR',
    audio: '5.1 Surround',
    audioTracks: [
      { code: 'ja', label: '日本語 [Original]', channelFormat: '5.1 Surround' },
      { code: 'en', label: 'English', channelFormat: '5.1 Surround' },
      { code: 'fr', label: 'Français', channelFormat: 'Stereo' },
    ],
    subtitleTracks: [
      { code: 'en', label: 'English' },
      { code: 'ja', label: '日本語 [CC]' },
      { code: 'fr', label: 'Français' },
      { code: 'es', label: 'Español' },
    ],
    backdropUrl: '/src/assets/images/cinema_kyoto_solstice_1795041009823.jpg',
    mediaFilename: 'kyoto-solstice.mp4',
    featured: false,
    viewCount: 84_100,
    popularityScore: 82,
  },
  {
    id: 'kepler-signal',
    mediaType: 'show',
    seasonsLabel: '2 Seasons · 16 Episodes',
    title: 'Signal from Kepler',
    tagline: 'Thirty-two dishes listening to a sky that finally answers.',
    synopsis:
      'At a high-altitude Atacama array, a graduate acoustician isolates a repeating harmonic pattern buried inside cosmic background noise—setting off a 72-hour international protocol.',
    director: 'Mateo Alvarez',
    cast: ['Gael Garcia Bernal', 'Jodie Comer', 'Mahershala Ali'],
    year: 2025,
    durationLabel: '56m / ep',
    durationSeconds: 24,
    maturityRating: 'PG-13',
    genres: ['Sci-Fi', 'Documentary'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    audioTracks: [
      { code: 'es', label: 'Español [Original]', channelFormat: 'Dolby Atmos' },
      { code: 'en', label: 'English', channelFormat: 'Dolby Atmos' },
      { code: 'fr', label: 'Français', channelFormat: '5.1 Surround' },
    ],
    subtitleTracks: [
      { code: 'en', label: 'English' },
      { code: 'es-cc', label: 'Español [CC]' },
      { code: 'fr', label: 'Français' },
      { code: 'pt', label: 'Português' },
    ],
    backdropUrl: '/src/assets/images/cinema_kepler_signal_1795041009306.jpg',
    mediaFilename: 'kepler-signal.mp4',
    featured: false,
    viewCount: 164_800,
    popularityScore: 92,
  },
];

export const UPCOMING_CATALOG: MediaItem[] = [
  {
    id: 'amber-observatory',
    mediaType: 'movie',
    title: 'The Amber Observatory',
    tagline: 'Every century, the mountain dome opens for a single night.',
    synopsis:
      'When two siblings spend winter break with their astronomer aunt atop a snowbound observatory, an antique brass telescope reveals signals from a wandering comet.',
    director: 'Nora Lindberg',
    cast: ['Mckenna Grace', 'Stellan Skarsgard', 'Kerry Condon'],
    year: 2026,
    durationLabel: '1h 54m',
    durationSeconds: 0,
    maturityRating: 'PG',
    genres: ['Family', 'Sci-Fi'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    backdropUrl: '/src/assets/images/cinema_amber_observatory_1795042658157.jpg',
    featured: false,
    isUpcoming: true,
    releaseDateLabel: 'Dec 12',
  },
  {
    id: 'silent-fjord',
    mediaType: 'show',
    seasonsLabel: 'Limited Series · 6 Episodes',
    title: 'Silent Fjord',
    tagline: 'Still water keeps every secret until the thaw.',
    synopsis:
      'A maritime hydrologist returns to a remote western fjord to decommission a weather station, only to uncover decades of missing logs hidden inside the boathouse.',
    director: 'Joachim Solberg',
    cast: ['Anders Danielsen Lie', 'Alicia Vikander', 'Kristofer Hivju'],
    year: 2026,
    durationLabel: '54m / ep',
    durationSeconds: 0,
    maturityRating: 'PG-13',
    genres: ['Thriller & Noir', 'Drama'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    backdropUrl: '/src/assets/images/cinema_silent_fjord_1795042658243.jpg',
    featured: false,
    isUpcoming: true,
    releaseDateLabel: 'Dec 28',
  },
  {
    id: 'night-train-trieste',
    mediaType: 'movie',
    title: 'Night Train to Trieste',
    tagline: 'Four compartments. One missing courier before dawn.',
    synopsis:
      'Boarded onto a winter sleeper crossing the Julian Alps, a diplomat realizes the encrypted treaty briefcase handcuffed to his seat has been swapped during a fogbound stop.',
    director: 'Matteo Garrone',
    cast: ['Franz Rogowski', 'Alba Rohrwacher', 'Viggo Mortensen'],
    year: 2027,
    durationLabel: '2h 09m',
    durationSeconds: 0,
    maturityRating: 'R',
    genres: ['Thriller & Noir', 'Drama'],
    quality: '4K HDR',
    audio: '5.1 Surround',
    backdropUrl: '/src/assets/images/cinema_night_train_trieste_1795042659306.jpg',
    featured: false,
    isUpcoming: true,
    releaseDateLabel: 'Jan 15',
  },
  {
    id: 'coral-cartographers',
    mediaType: 'show',
    seasonsLabel: '1 Season · 4 Episodes',
    title: 'Reef Cartographers',
    tagline: 'Charting the sunlit canyons beneath the Coral Sea.',
    synopsis:
      'Marine biologists and deep-sea pilots spend ninety days mapping untouched twilight coral arches with whisper-quiet submersibles and 8K low-light cinema optics.',
    director: 'Elena Vance',
    cast: ['Narrated by David Attenborough'],
    year: 2027,
    durationLabel: '50m / ep',
    durationSeconds: 0,
    maturityRating: 'G',
    genres: ['Documentary'],
    quality: '4K HDR',
    audio: 'Dolby Atmos',
    backdropUrl: '/src/assets/images/cinema_coral_cartographers_1795042659627.jpg',
    featured: false,
    isUpcoming: true,
    releaseDateLabel: 'Feb 03',
  },
];

export const ALL_GENRES = ['All Titles', 'Sci-Fi', 'Thriller & Noir', 'Drama', 'Documentary', 'Family'] as const;

export function getMediaById(id: string): MediaItem | undefined {
  return MEDIA_CATALOG.find((item) => item.id === id);
}

export function getAnyMediaById(id: string): MediaItem | undefined {
  return MEDIA_CATALOG.find((item) => item.id === id) ?? UPCOMING_CATALOG.find((item) => item.id === id);
}

export function resolveAudioTracks(item: MediaItem): AudioTrackOption[] {
  if (item.audioTracks && item.audioTracks.length > 0) {
    return item.audioTracks;
  }
  return [
    { code: 'en', label: 'English [Original]', channelFormat: item.audio },
    { code: 'es', label: 'Español', channelFormat: '5.1 Surround' },
    { code: 'fr', label: 'Français', channelFormat: '5.1 Surround' },
  ];
}

export function resolveSubtitleTracks(item: MediaItem): SubtitleTrackOption[] {
  if (item.subtitleTracks && item.subtitleTracks.length > 0) {
    return item.subtitleTracks;
  }
  return [
    { code: 'en-cc', label: 'English [CC]' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
  ];
}

// Indexed token relevance scoring for CMS catalog search
export function scoreAndFilterCatalog(
  items: MediaItem[],
  options: { genre?: string; mediaType?: string; query?: string }
): MediaItem[] {
  const genre = options.genre?.trim() || 'All Titles';
  const mediaType = options.mediaType?.trim() || 'all';
  const rawQuery = options.query?.trim().toLowerCase() || '';
  const tokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

  const scored: { item: MediaItem; score: number }[] = [];

  for (const item of items) {
    if (genre !== 'All Titles' && !item.genres.includes(genre)) continue;
    if ((mediaType === 'movie' || mediaType === 'show') && item.mediaType !== mediaType) continue;

    if (tokens.length === 0) {
      scored.push({ item, score: item.featured ? 100 : item.year });
      continue;
    }

    const titleLower = item.title.toLowerCase();
    const directorLower = item.director.toLowerCase();
    const castLower = item.cast.join(' ').toLowerCase();
    const genresLower = item.genres.join(' ').toLowerCase();
    const synopsisLower = item.synopsis.toLowerCase();

    let totalScore = 0;
    let allTokensMatched = true;

    for (const token of tokens) {
      let tokenScore = 0;
      if (titleLower === rawQuery) tokenScore += 120;
      else if (titleLower.startsWith(token)) tokenScore += 60;
      else if (titleLower.includes(token)) tokenScore += 40;

      if (directorLower.includes(token)) tokenScore += 25;
      if (castLower.includes(token)) tokenScore += 20;
      if (genresLower.includes(token)) tokenScore += 18;
      if (synopsisLower.includes(token)) tokenScore += 8;

      if (tokenScore === 0) {
        allTokensMatched = false;
        break;
      }
      totalScore += tokenScore;
    }

    if (allTokensMatched) {
      scored.push({ item, score: totalScore });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}
