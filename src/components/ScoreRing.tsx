"use client";

export default function ScoreRing({
  score,
  size = 64,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const stroke = size >= 64 ? 5 : 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    score >= 70 ? "#d9542b" : score >= 55 ? "#a9751c" : "#b3a894";
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#eee8dd"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * score) / 100}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="font-display font-bold"
          style={{ fontSize: size / 3.2, color }}
        >
          {score}
        </span>
        {label && (
          <span className="text-[9px] tracking-wide text-muted">{label}</span>
        )}
      </div>
    </div>
  );
}
