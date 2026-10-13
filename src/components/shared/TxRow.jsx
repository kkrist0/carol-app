import { memo } from "react";
import { eur } from "../../utils/helpers";
import { CompanyLogo } from "./CompanyLogo";

// eslint-disable-next-line no-unused-vars
export const TxRow = memo(function TxRow({ t, c, contoNome, contoDestNome, onEdit, compact, i }) {
  const isIn = t.tipo === "entrata";
  const isTr = t.tipo === "trasferimento";
  const categoryIcon = c?.icona || "•";
  const categoryColor = c?.colore || "#94A3B8";

  return (
    <div 
      onClick={() => onEdit(t)} 
      className="group flex items-center gap-3 py-3 px-1 rounded-lg cursor-pointer hover:bg-white/6 active:bg-white/10 transition-colors" 
      style={{ animation: `fadeUp .4s both`, animationDelay: `${Math.min(i, 12) * 35}ms` }}
    >
      <div 
        className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0 overflow-hidden relative select-none" 
        style={{ 
          background: categoryColor + "1f", 
          border: `1px solid ${categoryColor}33` 
        }}
      >
        {isTr ? (
          "⇄"
        ) : t.compagnia ? (
          <CompanyLogo 
            name={t.compagnia} 
            className="w-full h-full object-cover"
            fallbackNode={<span>{categoryIcon}</span>} 
          />
        ) : (
          categoryIcon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{t.note || (isTr ? "Trasferimento tra conti" : c?.nome || "Movimento")}</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className="max-w-full truncate rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[10px] text-slate-100">
            {isTr ? `${contoNome || "?"} → ${contoDestNome || "?"}` : contoNome || "Conto non disponibile"}
          </span>
          {!isTr && (
            <span className="max-w-full truncate rounded-full border border-slate-600 px-3 py-1 text-[10px] text-slate-50" style={{ background: `color-mix(in srgb, ${categoryColor} 65%, #1e293b)` }}>
              {c?.nome || "Senza categoria"}{t.sottocategoria ? ` · ${t.sottocategoria}` : ""}
            </span>
          )}
        </div>
      </div>
      <span className={`text-sm tabular-nums font-medium shrink-0 whitespace-nowrap ${isIn ? "text-emerald-300" : isTr ? "text-slate-400" : "text-rose-300"}`}>{isIn ? "+" : isTr ? "" : "-"}{eur(t.importo)}</span>
    </div>
  );
});