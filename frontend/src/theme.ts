import type { ContainerInfo } from './types';

export type StatusKey = ContainerInfo['status'];

export const UI = {
  pageBg: 'bg-gray-950',
  cardBg: 'bg-gray-900',
  inputBg: 'bg-gray-800',
  versionBoxBg: 'bg-gray-800/60',

  borderDefault: 'border-gray-800',
  borderSubtle: 'border-gray-700',
  borderInput: 'border-gray-600',

  textPrimary: 'text-white',
  textSecondary: 'text-gray-400',
  textMuted: 'text-gray-500',
  textFaint: 'text-gray-600',
  textDim: 'text-gray-700',
  textHover: 'hover:text-gray-300',

  primaryText: 'text-blue-400',
  primaryTextHover: 'hover:text-blue-300',
  primaryBg: 'bg-blue-600',
  primaryBgHover: 'hover:bg-blue-500',

  errorBg: 'bg-red-500/10',
  errorBorder: 'border-red-500/30',
  errorText: 'text-red-400',
  errorTextHover: 'hover:text-red-300',
} as const;

export const STATUS_THEME: Record<
  StatusKey,
  {
    badgeLabel: string;
    text: string;
    textLight: string;
    bg: string;
    bgBadge: string;
    border: string;
    borderBadge: string;
    borderStrong: string;
    shadow: string;
  }
> = {
  'breaking-change': {
    badgeLabel: 'Breaking change!',
    text: 'text-red-400',
    textLight: 'text-red-300',
    bg: 'bg-red-500/10',
    bgBadge: 'bg-red-500/15',
    border: 'border-red-500/20',
    borderBadge: 'border-red-500/30',
    borderStrong: 'border-red-500/40',
    shadow: 'shadow-red-500/10 shadow-lg',
  },
  'update-available': {
    badgeLabel: 'Update available',
    text: 'text-amber-400',
    textLight: 'text-amber-300',
    bg: 'bg-amber-500/10',
    bgBadge: 'bg-amber-500/15',
    border: 'border-amber-500/20',
    borderBadge: 'border-amber-500/30',
    borderStrong: 'border-amber-500/30',
    shadow: '',
  },
  'up-to-date': {
    badgeLabel: 'Up to date',
    text: 'text-emerald-400',
    textLight: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    bgBadge: 'bg-emerald-500/15',
    border: 'border-emerald-500/20',
    borderBadge: 'border-emerald-500/30',
    borderStrong: 'border-emerald-500/30',
    shadow: '',
  },
  unknown: {
    badgeLabel: 'Unknown',
    text: 'text-gray-400',
    textLight: 'text-gray-400',
    bg: 'bg-gray-500/10',
    bgBadge: 'bg-gray-500/15',
    border: 'border-gray-500/20',
    borderBadge: 'border-gray-500/30',
    borderStrong: 'border-gray-500/30',
    shadow: '',
  },
  'no-repo': {
    badgeLabel: 'No repo linked',
    text: 'text-blue-400',
    textLight: 'text-blue-400',
    bg: 'bg-blue-500/10',
    bgBadge: 'bg-blue-500/15',
    border: 'border-blue-500/20',
    borderBadge: 'border-blue-500/30',
    borderStrong: 'border-blue-500/30',
    shadow: '',
  },
};
