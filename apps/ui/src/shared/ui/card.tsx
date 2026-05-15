import type { CardElevation, CardRadius, CardVariant } from '@/shared/theme/tokens';
import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  elevation?: CardElevation;
  radius?: CardRadius;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<CardVariant, string> = {
  plain: 'bg-surface-0 border border-line-1',
  lavender: 'bg-surface-tint border border-line-1',
  frosted: 'bg-surface-frost border border-line-mesh backdrop-blur-2',
};

const ELEVATION_CLASSES: Record<CardElevation, string> = {
  0: '',
  1: 'shadow-1',
  2: 'shadow-2',
  3: 'shadow-3',
};

const RADIUS_CLASSES: Record<CardRadius, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

export function Card({
  variant = 'plain',
  elevation,
  radius = 'lg',
  className,
  children,
  ...rest
}: CardProps) {
  const resolvedElevation: CardElevation =
    elevation ?? (variant === 'lavender' ? 0 : variant === 'frosted' ? 3 : 2);

  const frostedInnerHighlight =
    variant === 'frosted' ? 'shadow-[inset_0_1px_0_var(--line-inner)]' : '';

  return (
    <div
      className={[
        VARIANT_CLASSES[variant],
        ELEVATION_CLASSES[resolvedElevation],
        RADIUS_CLASSES[radius],
        frostedInnerHighlight,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
