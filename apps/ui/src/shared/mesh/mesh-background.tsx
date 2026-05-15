type MeshBackgroundProps = {
  className?: string;
};

export function MeshBackground({ className }: MeshBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={['pointer-events-none fixed inset-0 -z-10 bg-mesh', className].filter(Boolean).join(' ')}
    />
  );
}
