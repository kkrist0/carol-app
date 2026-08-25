import { memo } from "react";
import { eur, fmtDate } from "../../utils/helpers";

// eslint-disable-next-line no-unused-vars
export const TxRow = memo(function TxRow({ t, c, contoNome, contoDestNome, onEdit, compact, i }) {
  const isIn = t.tipo === "entrata";
  const isTr = t.tipo === "trasferimento";
  return (
    <div 
      onClick={() => onEdit(t)} 
      className="group flex items-center gap-3 py-2.5 px-1 rounded-lg cursor-pointer hover:bg-white/[0.06] active:bg-white/10 transition-colors" 
      style={{ animation: `fadeUp .4s both`, animationDelay: `${Math.min(i, 12) * 35}ms` }}
    >
      <div className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0" style={{ background: (c?.colore || "#94A3B8") + "1f", border: `1px solid ${(c?.colore || "#94A3B8")}33` }}>
        {isTr ? "⇄" : c?.icona || "•"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{t.note || (isTr ? "Trasferimento tra conti" : c?.nome || "Movimento")}</p>
        <p className="text-xs text-slate-500 truncate">{[isTr ? `${contoNome || "?"} → ${contoDestNome || "?"}` : c ? c.nome + (t.sottocategoria ? " › " + t.sottocategoria : "") : null, !isTr ? contoNome : null, fmtDate(t.data)].filter(Boolean).join(" · ")}</p>
      </div>
      <span className={`text-sm tabular-nums font-medium shrink-0 whitespace-nowrap ${isIn ? "text-emerald-300" : isTr ? "text-slate-400" : "text-slate-200"}`}>{isIn ? "+" : isTr ? "" : "−"}{eur(t.importo)}</span>
    </div>
  );
});