import { useCountUp } from "../hooks/useCountUp";
import { eur } from "../utils/helpers";

export const CountEur = ({ value, cls }) => {
  const v = useCountUp(value);
  return <span className={cls}>{eur(v)}</span>;
};

export const Chip = ({ children, tone = "muted" }) => {
  const tones = {
    up: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    down: "text-rose-300 bg-rose-400/10 border-rose-400/20",
    muted: "text-slate-300 bg-white/5 border-white/10",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${tones[tone]}`}>{children}</span>;
};

export const EmptyState = ({ text }) => <p className="text-sm text-slate-500 py-6 text-center">{text}</p>;

export function StyleTag() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
      .font-display { font-family: 'Sora', system-ui, sans-serif; font-weight: 600; letter-spacing: -0.02em; }
      .font-body { font-family: 'Inter', system-ui, sans-serif; }
      .glass { position: relative; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
      .glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0) 28%); opacity: .7; }
      .glass-strong { background: rgba(16,19,28,0.88); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
      .card-hover { transition: transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s, border-color .35s; }
      .card-hover:hover { transform: translateY(-3px); border-color: rgba(165,180,252,0.25); box-shadow: 0 20px 44px -20px rgba(99,102,241,0.4), 0 0 0 1px rgba(139,157,249,0.08); }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes pageIn { from { opacity: 0; transform: translateY(10px) scale(.995); } to { opacity: 1; transform: none; } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sheetIn { from { opacity: 0; transform: translateY(24px) scale(.99); } to { opacity: 1; transform: none; } }
      @media (min-width: 640px) { @keyframes sheetIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } } }
      /* i pulsanti restano sempre a portata, anche a modale scorrevole */
      @media (max-width: 639px) {
        .modal-sheet .modal-actions { flex-direction: column-reverse; align-items: stretch; }
        .modal-sheet .modal-actions > button { width: 100%; padding-top: .7rem; padding-bottom: .7rem; }
        .modal-sheet .modal-actions > .flex-1 { display: none; }
      }
      .modal-sheet .modal-actions { position: sticky; bottom: -1rem; z-index: 2; padding: .75rem 0 1rem;
        margin-bottom: -1rem; background: linear-gradient(to top, rgba(16,19,28,.98) 62%, rgba(16,19,28,0)); }
      /* spazio sotto: la barra di navigazione mobile non deve coprire i contenuti */
      .main-pad { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 7.5rem); }
      @media (min-width: 768px) { .main-pad { padding-bottom: 2rem; } .fab-bottom { bottom: 2rem !important; } }
      @keyframes drawerIn { from { opacity: .4; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
      @keyframes popIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes slideDown { from { opacity: 0; transform: translate(-50%,-12px); } to { opacity: 1; transform: translate(-50%,0); } }
      @keyframes breath { 0%,100% { transform: scale(1); opacity:.9 } 50% { transform: scale(1.12); opacity:1 } }
      @keyframes drift { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px,30px); } }
      @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes gmPulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity:.45 } 50% { transform: translate(-50%,-50%) scale(2.1); opacity:0 } }
      .gm { position:absolute; left:0; top:0; }
      .gm-halo { position:absolute; left:0; top:0; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%;
        background: radial-gradient(circle, var(--c) 0%, transparent 68%); animation: gmPulse 2.8s ease-out infinite; pointer-events:none; }
      .gm-dot { position:absolute; left:0; top:0; transform: translate(-50%,-50%); display:grid; place-items:center;
        width:20px; height:20px; border-radius:50%; font-size:10px; line-height:1; font-weight:700; color:#fff;
        background: rgba(8,12,20,.92); border:2px solid var(--c); box-shadow: 0 0 12px var(--c), 0 2px 6px rgba(0,0,0,.6);
        transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s; }
      .gm:hover .gm-dot { transform: translate(-50%,-50%) scale(1.45); box-shadow: 0 0 22px var(--c), 0 0 44px var(--c); }
      .gm-sel .gm-dot { transform: translate(-50%,-50%) scale(1.35); box-shadow: 0 0 20px var(--c), 0 0 40px var(--c); }
      .gm-plane { position:absolute; left:0; top:0; transform: translate(-50%,-50%); font-size:13px; color:#E2E8F0;
        filter: drop-shadow(0 0 6px rgba(226,232,240,.8)); pointer-events:none; }
      .skeleton { position: relative; overflow: hidden; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.06); animation: fadeUp .5s both; }
      .skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); animation: shimmer 1.6s ease-in-out infinite; }
      .card-hover, .glass-strong { will-change: transform; }
      .btn-shine::after { content: ""; position: absolute; inset: 0; transform: translateX(-110%) skewX(-18deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); transition: transform .55s ease; }
      .btn-shine:hover::after { transform: translateX(110%) skewX(-18deg); }
      :focus-visible { outline: 2px solid rgba(139,157,249,.65); outline-offset: 2px; border-radius: 10px; }
      ::selection { background: rgba(139,157,249,.35); color: #fff; }
      tbody tr { transition: background .18s ease; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001s !important; transition-duration: .001s !important; } }
    `}</style>
  );
}