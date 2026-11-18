import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, Search } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { CinemaCard } from './components/CinemaCard';
import { CinemaRow } from './components/CinemaRow';
import { HeroBanner } from './components/HeroBanner';
import { Navbar, type NavSection } from './components/Navbar';
import { ProfileGate } from './components/ProfileGate';
import { ProfileHistoryView } from './components/ProfileHistoryView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { TitleDetailModal } from './components/TitleDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { apiRequest, setCsrfToken, setSessionToken } from './lib/api';
import type {
  AccountInfo,
  AuthStateResponse,
  CatalogResponse,
  MediaItem,
  UpcomingCatalogResponse,
  UserProfile,
} from './types';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);

  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<MediaItem[]>([]);
  const [browseItems, setBrowseItems] = useState<MediaItem[]>([]);
  const [genres, setGenres] = useState<string[]>(['All Titles']);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [section, setSection] = useState<NavSection>('home');
  const [selectedGenre, setSelectedGenre] = useState('All Titles');
  const [selectedType, setSelectedType] = useState<'all' | 'movie' | 'show'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);

  const syncAuthState = useCallback(async () => {
    try {
      const data = await apiRequest<AuthStateResponse>('/api/auth/me');
      if (data.authenticated && data.account) {
        setCsrfToken(data.csrfToken);
        setAccount(data.account);
        setProfiles(data.profiles ?? []);
        setActiveProfile(data.activeProfile ?? null);
      } else {
        setCsrfToken('');
        setSessionToken('');
        setAccount(null);
        setProfiles([]);
        setActiveProfile(null);
      }
    } catch {
      setAccount(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void syncAuthState();
  }, [syncAuthState]);

  const loadCatalog = useCallback(async () => {
    if (!activeProfile) return;
    setCatalogLoading(true);
    try {
      const [catalogResult, upcomingResult] = await Promise.allSettled([
        apiRequest<CatalogResponse>('/api/catalog'),
        apiRequest<UpcomingCatalogResponse>('/api/catalog/upcoming'),
      ]);

      if (catalogResult.status === 'fulfilled') {
        setCatalog(catalogResult.value.items);
        setGenres(catalogResult.value.genres);
      } else {
        setCatalog([]);
      }

      if (upcomingResult.status === 'fulfilled') {
        setUpcomingItems(upcomingResult.value.items);
      } else {
        setUpcomingItems([]);
      }
    } finally {
      setCatalogLoading(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile) {
      void loadCatalog();
    } else {
      setCatalog([]);
      setUpcomingItems([]);
    }
  }, [activeProfile, loadCatalog]);

  // Server-backed CMS query for Browse (type + genre + scored search)
  useEffect(() => {
    if (!activeProfile || section !== 'browse') return;
    const params = new URLSearchParams();
    if (selectedGenre !== 'All Titles') params.set('genre', selectedGenre);
    if (selectedType !== 'all') params.set('type', selectedType);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    let active = true;
    apiRequest<CatalogResponse>(`/api/catalog?${params.toString()}`)
      .then((data) => {
        if (active) setBrowseItems(data.items);
      })
      .catch(() => {
        if (active) setBrowseItems([]);
      });
    return () => {
      active = false;
    };
  }, [activeProfile, section, selectedGenre, selectedType, searchQuery]);

  async function handleSignOut() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore if session already expired
    }
    setCsrfToken('');
    setSessionToken('');
    setAccount(null);
    setProfiles([]);
    setActiveProfile(null);
    setCatalog([]);
    setUpcomingItems([]);
    setSection('home');
  }

  async function handleSwitchProfile() {
    try {
      await apiRequest('/api/profiles/lock', { method: 'POST' });
    } catch {
      // Fallback
    }
    setActiveProfile(null);
    setPlayingItem(null);
    setDetailItem(null);
    setUpcomingItems([]);
    setSection('home');
    setSelectedGenre('All Titles');
    setSelectedType('all');
    setSearchQuery('');
  }

  async function handleToggleWatchlist(item: MediaItem) {
    try {
      const res = await apiRequest<{ mediaId: string; inWatchlist: boolean }>(`/api/watchlist/${item.id}`, {
        method: 'POST',
      });
      const updateList = (list: MediaItem[]) =>
        list.map((m) => (m.id === item.id ? { ...m, inWatchlist: res.inWatchlist } : m));
      setCatalog(updateList);
      setUpcomingItems(updateList);
      setBrowseItems(updateList);
      setDetailItem((prev) => (prev && prev.id === item.id ? { ...prev, inWatchlist: res.inWatchlist } : prev));
    } catch {
      // No-op
    }
  }

  async function handleToggleFavorite(item: MediaItem) {
    const nextFavorite = !Boolean(item.isFavorite);
    const applyFavorite = (value: boolean) => {
      const updateList = (list: MediaItem[]) =>
        list.map((m) => (m.id === item.id ? { ...m, isFavorite: value } : m));
      setCatalog(updateList);
      setUpcomingItems(updateList);
      setBrowseItems(updateList);
      setDetailItem((prev) => (prev && prev.id === item.id ? { ...prev, isFavorite: value } : prev));
    };

    applyFavorite(nextFavorite);
    try {
      const res = await apiRequest<{ mediaId: string; isFavorite: boolean }>(`/api/favorites/${item.id}`, {
        method: 'POST',
      });
      applyFavorite(res.isFavorite);
    } catch {
      applyFavorite(!nextFavorite);
    }
  }

  function handleProgressUpdated(mediaId: string, positionSeconds: number) {
    const updateList = (list: MediaItem[]) =>
      list.map((m) =>
        m.id === mediaId ? { ...m, progressSeconds: positionSeconds, lastWatchedAt: Date.now() } : m
      );
    setCatalog(updateList);
    setBrowseItems(updateList);
  }

  const availableGenres = useMemo(() => {
    return genres.filter(
      (g) => g === 'All Titles' || catalog.some((item) => item.genres.includes(g))
    );
  }, [catalog, genres]);

  const heroItem = useMemo(() => {
    if (catalog.length === 0) return null;
    return catalog.find((item) => item.featured) ?? catalog[0];
  }, [catalog]);

  const continueWatching = useMemo(() => {
    return catalog
      .filter((item) => item.progressSeconds > 0)
      .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
  }, [catalog]);

  const trendingItems = useMemo(() => {
    return catalog
      .filter((item) => item.trendingRank !== null)
      .sort((a, b) => (a.trendingRank ?? 99) - (b.trendingRank ?? 99));
  }, [catalog]);

  const myListItems = useMemo(() => {
    return [...catalog, ...upcomingItems].filter((item) => item.inWatchlist);
  }, [catalog, upcomingItems]);

  const moviesRow = useMemo(() => {
    return catalog.filter((item) => item.mediaType === 'movie');
  }, [catalog]);

  const showsRow = useMemo(() => {
    return catalog.filter((item) => item.mediaType === 'show');
  }, [catalog]);

  const docFamilyItems = useMemo(() => {
    return catalog.filter(
      (item) => item.genres.includes('Documentary') || item.genres.includes('Family')
    );
  }, [catalog]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#08090B] flex items-center justify-center text-sm text-[#9CA3AF]">
        Loading KinoVault...
      </div>
    );
  }

  if (!account) {
    return (
      <AuthGate
        onAuthenticated={(state) => {
          setAccount(state.account ?? null);
          setProfiles(state.profiles ?? []);
          setActiveProfile(state.activeProfile ?? null);
        }}
      />
    );
  }

  if (!activeProfile) {
    return (
      <ProfileGate
        account={account}
        profiles={profiles}
        onProfileSelected={(profile) => {
          setActiveProfile(profile);
          setSection('home');
        }}
        onProfilesChanged={syncAuthState}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#08090B] text-[#F5F5F7] flex flex-col">
      <Navbar
        activeSection={section}
        onNavigate={(next) => {
          if (next === 'security' && activeProfile.isKids) return;
          setSection(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        activeProfile={activeProfile}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSwitchProfile={handleSwitchProfile}
        onSignOut={handleSignOut}
      />

      <main className="flex-1">
        {section === 'security' && !activeProfile.isKids ? (
          <SecurityCenterView account={account} onSwitchProfile={handleSwitchProfile} />
        ) : section === 'history' ? (
          <ProfileHistoryView
            account={account}
            activeProfile={activeProfile}
            catalog={catalog}
            onProfileUpdated={(updatedProfile, updatedAccount) => {
              setActiveProfile(updatedProfile);
              setAccount(updatedAccount);
              setProfiles((prev) => prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p)));
            }}
            onPlayMedia={setPlayingItem}
            onBrowse={() => setSection('browse')}
          />
        ) : section === 'browse' ? (
          <section className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-28 pb-20">
            <div className="flex flex-col gap-5 mb-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-1.5">
                    Browse Cinema Library
                  </h1>
                  <p className="text-sm text-[#9CA3AF]">
                    Filter movies and shows approved for {activeProfile.name} (up to {activeProfile.maxRating}).
                  </p>
                </div>

                {/* Inline Browse Search */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, director, cast..."
                    aria-label="Search movies and shows"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#12141A] border border-white/15 rounded-xl text-xs text-white placeholder-[#6B7280] focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>

              {/* Type & Genre Interactive Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#12141A] border border-white/10 rounded-xl">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'movie', label: 'Movies' },
                      { id: 'show', label: 'Shows' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.id)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        selectedType === t.id
                          ? 'bg-white text-[#08090B]'
                          : 'text-[#D1D5DB] hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#12141A] border border-white/10 rounded-xl">
                  {availableGenres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => setSelectedGenre(genre)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        selectedGenre === genre
                          ? 'bg-[#E50914] text-white'
                          : 'text-[#D1D5DB] hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {catalogLoading ? (
              <div className="py-20 text-center text-sm text-[#9CA3AF]">Loading catalog...</div>
            ) : browseItems.length === 0 ? (
              <div className="py-20 text-center bg-[#12141A] border border-white/10 rounded-2xl">
                <Film className="w-8 h-8 text-[#6B7280] mx-auto mb-3" />
                <p className="text-sm text-white font-medium mb-1">No matching titles found</p>
                <p className="text-xs text-[#9CA3AF] mb-4">
                  Try clearing your search filter or choosing another category.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGenre('All Titles');
                    setSelectedType('all');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 bg-[#1D2029] hover:bg-[#262A36] text-xs font-medium text-white rounded-lg"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {browseItems.map((item) => (
                  <CinemaCard
                    key={item.id}
                    item={item}
                    onPlay={setPlayingItem}
                    onMoreInfo={setDetailItem}
                    onToggleWatchlist={handleToggleWatchlist}
                    onToggleFavorite={handleToggleFavorite}
                    maxRating={activeProfile.maxRating}
                  />
                ))}
              </div>
            )}
          </section>
        ) : section === 'watchlist' ? (
          <section className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-28 pb-20">
            <div className="mb-8 border-b border-white/10 pb-5">
              <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-1.5">
                My List
              </h1>
              <p className="text-sm text-[#9CA3AF]">
                Saved films and shows for {activeProfile.name} · {myListItems.length} title{myListItems.length === 1 ? '' : 's'}
              </p>
            </div>

            {myListItems.length === 0 ? (
              <div className="py-20 text-center bg-[#12141A] border border-white/10 rounded-2xl">
                <Film className="w-8 h-8 text-[#6B7280] mx-auto mb-3" />
                <p className="text-sm text-white font-medium mb-1">Your list is empty</p>
                <p className="text-xs text-[#9CA3AF] mb-5">
                  Add films or shows from Home or Browse to queue them for later viewing.
                </p>
                <button
                  type="button"
                  onClick={() => setSection('browse')}
                  className="px-5 py-2.5 bg-[#E50914] hover:bg-[#C80812] text-xs font-semibold text-white rounded-lg"
                >
                  Explore Library
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {myListItems.map((item) => (
                  <CinemaCard
                    key={item.id}
                    item={item}
                    onPlay={setPlayingItem}
                    onMoreInfo={setDetailItem}
                    onToggleWatchlist={handleToggleWatchlist}
                    onToggleFavorite={handleToggleFavorite}
                    maxRating={activeProfile.maxRating}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="pb-20">
            {heroItem && (
              <HeroBanner
                item={heroItem}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
              />
            )}

            <div className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-2 pb-6 flex flex-wrap items-center gap-2">
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => {
                    setSelectedGenre(genre);
                    setSelectedType('all');
                    setSection('browse');
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#12141A] hover:bg-[#1D2029] border border-white/10 text-[#D1D5DB] hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  {genre}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <CinemaRow
                title="Continue Watching"
                subtitle={`Resume where ${activeProfile.name} left off`}
                items={continueWatching}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="Trending in Your Household"
                items={trendingItems}
                showRanks
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="My List"
                items={myListItems}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="Feature Films"
                items={moviesRow}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="Series & Limited Shows"
                items={showsRow}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="Documentary & Family Cinema"
                items={docFamilyItems}
                onPlay={setPlayingItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />

              <CinemaRow
                title="Coming Soon"
                subtitle="Upcoming premieres arriving in your household vault"
                items={upcomingItems}
                onPlay={setDetailItem}
                onMoreInfo={setDetailItem}
                onToggleWatchlist={handleToggleWatchlist}
                onToggleFavorite={handleToggleFavorite}
                maxRating={activeProfile.maxRating}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 py-8 px-6 sm:px-10 max-w-[1440px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B7280]">
        <span>KinoVault Home Cinema · {account.displayName}</span>
        <span>Profile: {activeProfile.name} ({activeProfile.maxRating})</span>
      </footer>

      {detailItem && (
        <TitleDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onPlay={setPlayingItem}
          onToggleWatchlist={handleToggleWatchlist}
        />
      )}

      {playingItem && (
        <VideoPlayerModal
          item={playingItem}
          onClose={() => setPlayingItem(null)}
          onProgressUpdated={handleProgressUpdated}
        />
      )}
    </div>
  );
}
