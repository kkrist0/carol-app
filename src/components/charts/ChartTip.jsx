import { eur } from "../../utils/helpers";

export const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-xs border border-indigo-300/20 shadow-2xl shadow-indigo-950/60" style={{ background: "rgba(14,17,26,0.96)", backdropFilter: "blur(16px)" }}>
      <div className="text-slate-400 mb-1.5 font-medium tracking-wide">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-white py-0.5">
          <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: p.color || p.fill, boxShadow: `0 0 6px ${p.color || p.fill}66` }} />
          <span className="text-slate-300">{p.name}</span>
          <b className="ml-auto pl-3 tabular-nums">{eur(p.value)}</b>
        </div>
      ))}
    </div>
  );
};