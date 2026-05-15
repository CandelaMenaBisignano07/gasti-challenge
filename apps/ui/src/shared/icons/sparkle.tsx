type SparkleProps = {
  size?: number;
  className?: string;
};

export function Sparkle({ size = 14, className }: SparkleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z" />
    </svg>
  );
}
