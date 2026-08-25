import { useState, useEffect, useRef } from "react";
import { eur } from "../utils/helpers";

export function CommandPalette({ open, onClose, nav, setPage, txs, catById, onNew }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setQ("");
        ref.current?.focus();
      }, 60);

      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const ql = q.toLowerCase();
  const pages = nav.filter((n) => n.label.toLowerCase().includes(ql));
  const found =
    q.length > 1
      ? txs
          .filter((t) =>
            `${t.note || ""} ${catById[t.categoria]?.nome || ""}`
              .toLowerCase()
              .includes(ql)
          )
          .slice(0, 5)
      : [];

  return (
    <div
      className="fixed inset-0 z-95 flex items-start justify-center pt-20 sm:pt-24 p-4"
      style={{ animation: "fadeIn .15s both" }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative glass-strong rounded-2xl w-full max-w-lg overflow-hidden"
        style={{ animation: "popIn .25s cubic-bezier(.22,1,.36,1) both" }}
      >
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca pagine, movimenti, azioni…"
          className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-500 outline-none border-b border-white/10"
        />
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">
            Azioni
          </p>
          <button
            onClick={() => {
              onNew();
              onClose();
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/10 transition-colors"
          >
            ＋ Nuovo movimento
          </button>
          <p className="px-3 py-1 mt-1 text-[10px] uppercase tracking-wider text-slate-500">
            Pagine
          </p>
          {pages.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setPage(n.id);
                onClose();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <span className="opacity-70">{n.icon}</span>
              {n.label}
            </button>
          ))}
          {found.length > 0 && (
            <p className="px-3 py-1 mt-1 text-[10px] uppercase tracking-wider text-slate-500">
              Movimenti
            </p>
          )}
          {found.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setPage("movimenti");
                onClose();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 transition-colors flex justify-between"
            >
              <span className="truncate">
                {catById[t.categoria]?.icona} {t.note || catById[t.categoria]?.nome}
              </span>
              <span className="text-slate-500 tabular-nums shrink-0 ml-3">
                {eur(t.importo)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}