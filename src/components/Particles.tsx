import { useMemo } from "react";

const COLORS = [
  "oklch(0.72 0.32 350)", // pink
  "oklch(0.85 0.22 195)", // cyan
  "oklch(0.68 0.28 295)", // violet
  "oklch(0.88 0.27 135)", // lime
];

export function Particles({ count = 28 }: { count?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const size = Math.random() * 4 + 2;
        return {
          id: i,
          left: `${Math.random() * 100}%`,
          size: `${size}px`,
          delay: `${Math.random() * 12}s`,
          duration: `${10 + Math.random() * 16}s`,
          color: COLORS[i % COLORS.length],
          opacity: 0.5 + Math.random() * 0.5,
        };
      }),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {items.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            color: p.color,
            background: p.color,
            opacity: p.opacity,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}
