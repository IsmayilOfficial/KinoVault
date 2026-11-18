import type { AvatarKey } from '../types';

const AVATAR_STYLES: Record<AvatarKey, { bg: string; accent: string; label: string }> = {
  crimson: {
    bg: 'from-[#991B1B] via-[#7F1D1D] to-[#2B0909]',
    accent: 'text-[#FCA5A5]',
    label: 'Crimson',
  },
  obsidian: {
    bg: 'from-[#27272A] via-[#18181B] to-[#09090B]',
    accent: 'text-[#E4E4E7]',
    label: 'Obsidian',
  },
  cobalt: {
    bg: 'from-[#1D4ED8] via-[#1E3A8A] to-[#0F172A]',
    accent: 'text-[#BFDBFE]',
    label: 'Cobalt',
  },
  amber: {
    bg: 'from-[#B45309] via-[#92400E] to-[#291505]',
    accent: 'text-[#FDE68A]',
    label: 'Amber',
  },
  emerald: {
    bg: 'from-[#047857] via-[#065F46] to-[#052E22]',
    accent: 'text-[#A7F3D0]',
    label: 'Emerald',
  },
  silver: {
    bg: 'from-[#52525B] via-[#3F3F46] to-[#18181B]',
    accent: 'text-[#F4F4F5]',
    label: 'Silver',
  },
};

export const AVATAR_KEYS: AvatarKey[] = ['crimson', 'cobalt', 'amber', 'emerald', 'obsidian', 'silver'];

interface ProfileAvatarProps {
  name: string;
  avatarKey: AvatarKey;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-8 h-8 text-xs rounded-md',
  md: 'w-10 h-10 text-sm rounded-lg',
  lg: 'w-24 h-24 text-3xl rounded-xl',
  xl: 'w-28 h-28 sm:w-32 sm:h-32 text-4xl rounded-2xl',
};

export function ProfileAvatar({ name, avatarKey, size = 'md', className = '' }: ProfileAvatarProps) {
  const style = AVATAR_STYLES[avatarKey] ?? AVATAR_STYLES.silver;
  const initial = (name.trim().charAt(0) || 'K').toUpperCase();

  return (
    <div
      className={`relative inline-flex items-center justify-center bg-gradient-to-br ${style.bg} border border-white/15 font-display font-semibold select-none overflow-hidden shrink-0 ${SIZE_MAP[size]} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.18),transparent_58%)]" />
      <span className={`relative z-10 tracking-tight ${style.accent}`}>{initial}</span>
    </div>
  );
}
