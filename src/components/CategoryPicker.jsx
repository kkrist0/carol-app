import { useState, useEffect, useRef } from "react";
import { getCategoryGroups, getCategoryGroupLabel } from "../utils/helpers";

export function CategoryPicker({
  data,
  value,
  tipoEntrata,
  onSelect,
  onEditCat,
  onCreate,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
  if (open) {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
  } else {
    const timer = setTimeout(() => {
      setQ("");
    }, 0);
    return () => clearTimeout(timer);
  }
}, [open]);

  const sel = data.categories.find((c) => c.id === value);
  const cats = [...data.categories]
    .sort((a, b) => a.ordine - b.ordine)
    .filter((c) =>
      tipoEntrata
        ? getCategoryGroups(c).includes("Entrate")
        : !getCategoryGroups(c).includes("Entrate")
    );
  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? cats.filter(
        (c) =>
          c.nome.toLowerCase().includes(ql) ||
          getCategoryGroupLabel(c).toLowerCase().includes(ql)
      )
    : cats;
  const exactMatch = cats.some((c) => c.nome.toLowerCase() === ql);
  const canCreate = ql.length > 0 && !exactMatch;

  const pick = (id) => {
    onSelect(id);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) pick(filtered[0].id);
      else if (canCreate) {
        onCreate(q.trim());
        setOpen(false);
      }
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 bg-white/5 border rounded-xl px-3 py-2 text-sm text-left transition-all ${
          open ? "border-indigo-400/60 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
        }`}
      >
        {sel ? (
          <>
            <span
              className="w-6 h-6 rounded-lg grid place-items-center text-sm"
              style={{
                background: sel.colore + "1f",
                border: `1px solid ${sel.colore}33`,
              }}
            >
              {sel.icona}
            </span>
            <span className="text-white">{sel.nome}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              {getCategoryGroupLabel(sel)}
            </span>
          </>
        ) : (
          <span className="text-slate-500">Cerca o crea una categoria…</span>
        )}
        <span
          className={`ml-auto text-slate-500 text-xs transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1.5 w-full glass-strong rounded-xl overflow-hidden shadow-2xl"
          style={{ animation: "popIn .18s cubic-bezier(.22,1,.36,1) both" }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Digita per cercare o creare…"
            className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none border-b border-white/10"
          />
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  value === c.id ? "bg-indigo-400/15" : "hover:bg-white/[0.07]"
                }`}
                onClick={() => pick(c.id)}
              >
                <span
                  className="w-6 h-6 rounded-lg grid place-items-center text-sm shrink-0"
                  style={{
                    background: c.colore + "1f",
                    border: `1px solid ${c.colore}33`,
                  }}
                >
                  {c.icona}
                </span>
                <span className="text-sm text-slate-200 truncate">{c.nome}</span>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                  {getCategoryGroupLabel(c)}
                </span>
                {c.sottocategorie?.length > 0 && (
                  <span className="text-[10px] text-slate-600">
                    · {c.sottocategorie.length} sub
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditCat(c);
                    setOpen(false);
                  }}
                  title="Modifica categoria"
                  className="ml-auto w-6 h-6 rounded-md text-xs text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white transition-all shrink-0"
                >
                  ✎
                </button>
              </div>
            ))}
            {filtered.length === 0 && !canCreate && (
              <p className="text-xs text-slate-500 px-2 py-3">Nessuna categoria.</p>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  onCreate(q.trim());
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-indigo-300 hover:bg-indigo-400/10 transition-colors"
                style={{ animation: "fadeUp .2s both" }}
              >
                <span className="w-6 h-6 rounded-lg grid place-items-center bg-indigo-400/15 border border-indigo-400/30">
                  ＋
                </span>
                Crea "{q.trim()}"
              </button>
            )}
            {!ql && (
              <button
                type="button"
                onClick={() => {
                  onCreate("");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-slate-400 hover:bg-white/[0.07] hover:text-white transition-colors"
              >
                <span className="w-6 h-6 rounded-lg grid place-items-center bg-white/5 border border-white/10">
                  ＋
                </span>
                Nuova categoria…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}