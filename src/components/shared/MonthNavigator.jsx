import { useState, useRef, useCallback, useEffect } from "react";
import { addMonthsMk, monthKey, parseMk, labelMk, mkOf } from "../../utils/helpers";
import { YEAR_MAX, YEAR_MIN, MESI } from "../../config/constants";
import { createPortal } from "react-dom";

export function MonthNavigator({ value, onChange, max }) {
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(parseMk(value).y);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 288;
    setPos({ top: Math.min(r.bottom + 8, window.innerHeight - 340), left: Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8)) });
  }, []);

  const toggle = () => { if (!open) { place(); setViewY(parseMk(value).y); } setOpen((o) => !o); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open, place]);

  const { m: selM, y: selY } = parseMk(value);
  const nowMk = monthKey(new Date());
  const maxY = max ? parseMk(max).y : YEAR_MAX;

  return (
    <>
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-full sm:w-auto" ref={btnRef}>
        <button onClick={() => onChange(addMonthsMk(value, -1))} className="w-9 h-9 shrink-0 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all" title="Mese precedente">◀</button>
        <button onClick={toggle} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all min-w-[9.5rem] text-center ${open ? "bg-white/15 text-white" : "text-white hover:bg-white/10"}`} title="Apri il calendario">
          {labelMk(value)} <span className="text-slate-500 text-xs ml-1">▾</span>
        </button>
        <button onClick={() => onChange(addMonthsMk(value, 1))} disabled={max && value >= max} className="w-9 h-9 shrink-0 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed active:scale-90 transition-all" title="Mese successivo">▶</button>
      </div>
      {open && createPortal(
        <div ref={panelRef} className="fixed z-[95] w-72 rounded-2xl p-3 shadow-2xl border border-white/15" style={{ top: pos.top, left: pos.left, background: "rgba(14,17,26,0.97)", backdropFilter: "blur(24px)", animation: "popIn .2s cubic-bezier(.22,1,.36,1) both" }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setViewY((y) => Math.max(YEAR_MIN, y - 1))} disabled={viewY <= YEAR_MIN} className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">◀</button>
            <div className="flex gap-1">
              {[viewY - 1, viewY, viewY + 1].filter((y) => y >= YEAR_MIN && y <= YEAR_MAX).map((y) => (
                <button key={y} onClick={() => setViewY(y)} className={`px-2.5 py-1 rounded-lg text-sm transition-all ${y === viewY ? "font-display text-white bg-white/10" : "text-slate-500 hover:text-white"}`}>{y}</button>
              ))}
            </div>
            <button onClick={() => setViewY((y) => Math.min(YEAR_MAX, y + 1))} disabled={viewY >= YEAR_MAX || (max && viewY >= maxY)} className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all">▶</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MESI.map((label, m) => {
              const mk = mkOf(viewY, m);
              const active = m === selM && viewY === selY;
              const isNow = mk === nowMk;
              const isDisabled = max && mk > max;
              return (
                <button key={m} onClick={() => { onChange(mk); setOpen(false); }} disabled={isDisabled} className={`py-2.5 rounded-xl text-sm transition-all active:scale-95 ${active ? "bg-gradient-to-r from-indigo-400 to-violet-400 text-slate-950 font-semibold shadow-lg shadow-indigo-500/30" : isNow ? "text-indigo-300 bg-indigo-400/10 border border-indigo-400/30 hover:bg-indigo-400/20" : "text-slate-300 bg-white/5 hover:bg-white/10 hover:text-white disabled:opacity-10 disabled:hover:bg-white/5 disabled:hover:text-slate-300 disabled:cursor-not-allowed"}`}>{label}</button>
              );
            })}
          </div>
          <button onClick={() => { onChange(nowMk); setOpen(false); }} className="w-full mt-3 py-2 rounded-xl text-xs text-slate-400 bg-white/5 hover:bg-white/10 hover:text-white transition-all">Torna a oggi</button>
        </div>,
        document.body
      )}
    </>
  );
}