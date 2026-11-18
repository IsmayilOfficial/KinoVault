import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, LogOut, Search, Shield, Users, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { ProfileAvatar } from './ProfileAvatar';

export type NavSection = 'home' | 'browse' | 'watchlist' | 'history' | 'security';

interface NavbarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  activeProfile: UserProfile;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSwitchProfile: () => void;
  onSignOut: () => void;
}

export function Navbar({
  activeSection,
  onNavigate,
  activeProfile,
  searchQuery,
  onSearchChange,
  onSwitchProfile,
  onSignOut,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const navItems: { id: NavSection; label: string }[] = activeProfile.isKids
    ? [
        { id: 'home', label: 'Home' },
        { id: 'browse', label: 'Browse' },
        { id: 'watchlist', label: 'My List' },
        { id: 'history', label: 'History' },
      ]
    : [
        { id: 'home', label: 'Home' },
        { id: 'browse', label: 'Browse' },
        { id: 'watchlist', label: 'My List' },
        { id: 'history', label: 'History' },
        { id: 'security', label: 'Security' },
      ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-colors duration-200 ${
        scrolled
          ? 'bg-[#08090B]/95 backdrop-blur-md border-b border-white/10'
          : 'bg-gradient-to-b from-[#08090B]/90 via-[#08090B]/55 to-transparent'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] rounded"
        >
          KinoVault
        </button>

        {/* Zone 2: 4-5 Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-white border-[#E50914]'
                    : 'text-[#D1D5DB] border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Search + Active Profile Switcher */}
        <div className="flex items-center gap-3 shrink-0">
          {searchOpen ? (
            <div className="flex items-center bg-[#12141A] border border-white/20 rounded-lg px-2.5 py-1.5">
              <Search className="w-4 h-4 text-[#9CA3AF] shrink-0 mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  if (activeSection !== 'browse' && e.target.value.trim()) {
                    onNavigate('browse');
                  }
                }}
                placeholder="Titles, directors, genres..."
                className="w-36 sm:w-52 bg-transparent text-xs text-white placeholder-[#6B7280] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setSearchOpen(false);
                }}
                aria-label="Clear search"
                className="p-0.5 text-[#9CA3AF] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search library"
              className="p-2 text-[#D1D5DB] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              <ProfileAvatar name={activeProfile.name} avatarKey={activeProfile.avatarKey} size="sm" />
              <span className="hidden sm:inline text-xs font-medium text-white max-w-[100px] truncate">
                {activeProfile.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#9CA3AF]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#12141A] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-white/10">
                  <div className="text-xs font-semibold text-white truncate">{activeProfile.name}</div>
                  <div className="text-xs text-[#9CA3AF]">
                    {activeProfile.isKids ? `Kids Mode · Max ${activeProfile.maxRating}` : `Rated up to ${activeProfile.maxRating}`}
                  </div>
                </div>

                <div className="md:hidden py-1 border-b border-white/10">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-[#D1D5DB] hover:text-white hover:bg-white/5"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onNavigate('history');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[#D1D5DB] hover:text-white hover:bg-white/5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Profile & Watch History
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSwitchProfile();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[#D1D5DB] hover:text-white hover:bg-white/5"
                >
                  <Users className="w-3.5 h-3.5" />
                  Switch Profile
                </button>

                {!activeProfile.isKids && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('security');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[#D1D5DB] hover:text-white hover:bg-white/5"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Security & Sessions
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[#FCA5A5] hover:text-white hover:bg-[#E50914]/15"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
