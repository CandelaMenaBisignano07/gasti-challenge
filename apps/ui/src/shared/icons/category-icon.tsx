import {
  Bus,
  Clapperboard,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  Plug,
  Tag,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '@/shared/theme/tokens';

const ICON_MAP: Record<Category, LucideIcon> = {
  comida: Utensils,
  transporte: Bus,
  entretenimiento: Clapperboard,
  salud: HeartPulse,
  servicios: Plug,
  educacion: GraduationCap,
  otros: MoreHorizontal,
};

type CategoryIconProps = {
  category: Category | string;
  size?: number;
  className?: string;
};

export function CategoryIcon({ category, size = 20, className }: CategoryIconProps) {
  const Icon = ICON_MAP[category as Category] ?? Tag;
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden="true" />;
}
