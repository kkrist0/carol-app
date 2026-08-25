// eslint-disable-next-line no-unused-vars
export default function Sparkline({ punti, colore = "#8B9DF9", w = 90, h = 28 }) {
  if (!punti?.length || punti.length < 2) return <div style={{ width: w, height: h }} className="rounded bg-white/4" />;
  const val = punti.map((p) => p.prezzo);
  const min = Math.min(...val), max = Math.max(...val), span = max - min || 1;
  const d = punti.map((p, i) => `${(i / (punti.length - 1)) * w},${h - ((p.prezzo - min) / span) * (h - 4) - 2}`).join(" L");
  const su = val[val.length - 1] >= val[0];
  const c = su ? "#4ADE80" : "#FB7185";
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible">
      <polyline points={d.replace(/ L/g, " ")} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((val[val.length - 1] - min) / span) * (h - 4) - 2} r="2.2" fill={c} />
    </svg>
  );
}