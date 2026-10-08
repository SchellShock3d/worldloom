/**
 * The world, drawn as threads: each line is an ongoing process, each knot a
 * milestone. Decorative, used on the sign-in screens.
 */
const THREADS = [
  { y: 22, label: "The plague spreads north", pct: 64, color: "var(--ember)", wave: 18 },
  { y: 38, label: "The Cult of Ash seeks the Sun Crown", pct: 41, color: "var(--arcane)", wave: 12 },
  { y: 54, label: "Merchant traffic on the Northroad", pct: 78, color: "var(--brass)", wave: 9 },
  { y: 70, label: "The Thieves' Guild eyes the council", pct: 23, color: "var(--accent)", wave: 15 },
];

export function ThreadsIllustration() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[8%]">
      <svg viewBox="0 0 100 92" className="w-full max-w-3xl" preserveAspectRatio="xMidYMid meet">
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={i * 10} y1="6" x2={i * 10} y2="86" stroke="var(--line)" strokeWidth="0.25" />
        ))}
        {THREADS.map((t) => {
          const d = `M0 ${t.y} C 20 ${t.y - t.wave / 3}, 30 ${t.y + t.wave / 3}, 50 ${t.y} S 80 ${t.y - t.wave / 4}, 100 ${t.y}`;
          return (
            <g key={t.label}>
              <path d={d} stroke="var(--line-strong)" strokeWidth="0.5" fill="none" strokeDasharray="1.4 0.8" />
              <path d={d} stroke={t.color} strokeWidth="0.9" fill="none" pathLength={100} strokeDasharray={`${t.pct} 100`} strokeLinecap="round" />
              <circle cx={t.pct} cy={t.y + Math.sin((t.pct / 100) * Math.PI * 2) * 0.6} r="1.3" fill="var(--bg-subtle)" stroke={t.color} strokeWidth="0.6" />
              <text x="0" y={t.y - 3.2} fontSize="2.4" fill="var(--text-muted)" fontFamily="var(--font-sans)">
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-10 max-w-md font-serif text-2xl leading-snug text-fg">
        Your world keeps moving between sessions. Worldloom keeps track of where it&rsquo;s going.
      </p>
    </div>
  );
}
