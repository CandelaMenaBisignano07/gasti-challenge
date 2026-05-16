type MeshBackgroundProps = {
  className?: string;
  visible?: boolean;
};

export function MeshBackground({ className, visible = true }: MeshBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none fixed inset-0 -z-10 bg-mesh animate-mesh-drift',
        'transition-opacity duration-base ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
