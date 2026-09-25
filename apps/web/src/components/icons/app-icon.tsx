import { cn } from '@myshop/ui';
import type { LucideIcon } from 'lucide-react';

/** Цвета иконок в стиле системных приложений iOS (Настройки, Wallet, Здоровье). */
const TINTS = {
  blue: 'from-[#4ba3ff] to-[#007aff]',
  green: 'from-[#4cd964] to-[#28b446]',
  orange: 'from-[#ffb340] to-[#ff9500]',
  red: 'from-[#ff6961] to-[#ff3b30]',
  purple: 'from-[#c07cf5] to-[#af52de]',
  indigo: 'from-[#7d7aff] to-[#5856d6]',
  teal: 'from-[#6ad8f0] to-[#30b0c7]',
  gray: 'from-[#aeaeb2] to-[#8e8e93]',
  pink: 'from-[#ff6b8a] to-[#ff2d55]',
  yellow: 'from-[#ffd84d] to-[#ffcc00]',
} as const;

export type IconTint = keyof typeof TINTS;

/**
 * Иконка-«плитка» как в iOS: скруглённый квадрат с градиентом и белым символом.
 * Символы — lucide (линейные, по стилю близки к SF Symbols).
 */
export function AppIcon({
  icon: Icon,
  tint,
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tint: IconTint;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = {
    sm: 'size-7 rounded-[8px]',
    md: 'size-9 rounded-[10px]',
    lg: 'size-12 rounded-[14px]',
  }[size];
  const glyph = { sm: 16, md: 20, lg: 26 }[size];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center bg-gradient-to-b text-white shadow-sm',
        TINTS[tint],
        box,
        className,
      )}
    >
      <Icon size={glyph} strokeWidth={2.2} />
    </span>
  );
}
