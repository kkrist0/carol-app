import { memo, useState } from "react";
import { eur } from "../../utils/helpers";
import { CompanyLogo } from "./CompanyLogo";

// eslint-disable-next-line no-unused-vars
export const TxRow = memo(function TxRow({ t, c, contoNome, contoColore, contoDestNome, contoDestColore, onEdit, compact, i }) {
  const isIn = t.tipo === "entrata";
  const isTr = t.tipo === "trasferimento";
  const categoryIcon = c?.icona || "•";
  const categoryInitial = (c?.nome || "").trim().charAt(0).toLocaleUpperCase("it-IT") || categoryIcon;
  const categoryColor = c?.colore || "#94A3B8";
  const iconColor = isTr ? "#475569" : categoryColor;
  const accountColor = contoColore || "#64748B";
  const destinationAccountColor = contoDestColore || accountColor;
  const [logoStatus, setLogoStatus] = useState({ name: null, loaded: false });
  const hasCompanyLogo = Boolean(t.compagnia && logoStatus.name === t.compagnia && logoStatus.loaded);

  return (
    <div 
      onClick={() => onEdit(t)} 
      className="group flex items-center gap-3 py-3 px-1 rounded-lg cursor-pointer hover:bg-white/6 active:bg-white/10 transition-colors" 
      style={{ animation: `fadeUp .4s both`, animationDelay: `${Math.min(i, 12) * 35}ms` }}
    >
      <div 
        className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0 overflow-hidden relative select-none" 
        style={hasCompanyLogo
          ? { background: "transparent", border: "none" }
          : {
              background: "#FFFFFF",
              border: `2px solid ${iconColor}`,
            }}
      >
        {isTr ? (
          <span className="font-bold" style={{ color: iconColor }}>⇄</span>
        ) : t.compagnia ? (
          <CompanyLogo 
            name={t.compagnia} 
            className="w-full h-full object-contain"
            fallbackNode={<span className="font-bold uppercase" style={{ color: categoryColor }}>{categoryInitial}</span>}
            onLoad={() => setLogoStatus({ name: t.compagnia, loaded: true })}
            onError={() => setLogoStatus({ name: t.compagnia, loaded: false })}
          />
        ) : (
          <span className="font-bold uppercase" style={{ color: categoryColor }}>{categoryInitial}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{t.note || (isTr ? "Trasferimento tra conti" : c?.nome || "Movimento")}</p>
        <div className="flex flex-nowrap gap-1.5 mt-1.5 min-w-0 overflow-hidden">
          <span
            className={`min-w-0 max-w-full truncate rounded-full px-3 py-1 text-[10px] font-semibold ${isTr ? "border-2 border-transparent" : "border"}`}
            style={isTr
              ? { background: `linear-gradient(color-mix(in srgb, ${accountColor} 10%, #F1F5F9), color-mix(in srgb, ${destinationAccountColor} 10%, #F1F5F9)) padding-box, linear-gradient(90deg, ${accountColor}, ${destinationAccountColor}) border-box` }
              : { background: `color-mix(in srgb, ${accountColor} 10%, #F1F5F9)`, borderColor: accountColor, color: accountColor, boxShadow: `inset 0 0 0 1px ${accountColor}` }}
          >
            {isTr ? (
              <>
                <span style={{ color: accountColor }}>{contoNome || "?"}</span>
                {" "}
                <span className="font-bold" style={{ backgroundImage: `linear-gradient(90deg, ${accountColor}, ${destinationAccountColor})`, color: "transparent", backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>→</span>
                {" "}
                <span style={{ color: destinationAccountColor }}>{contoDestNome || "?"}</span>
              </>
            ) : contoNome || "Conto non disponibile"}
          </span>
          {!isTr && (
            <span
              className="min-w-0 max-w-full truncate shrink rounded-full px-3 py-1 text-[10px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${categoryColor} 65%, #1e293b)`,
                color: `color-mix(in srgb, ${categoryColor} 30%, #F1F5F9)`,
              }}
            >
              <span className={t.sottocategoria ? "hidden sm:inline" : undefined}>{c?.nome || "Senza categoria"}</span>
              {t.sottocategoria && (
                <>
                  <span className="hidden sm:inline"> · </span>
                  <span>{t.sottocategoria}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <span className={`text-sm tabular-nums font-medium shrink-0 whitespace-nowrap ${isIn ? "text-emerald-300" : isTr ? "text-slate-400" : "text-rose-300"}`}>{isIn ? "+" : isTr ? "" : "-"}{eur(t.importo)}</span>
    </div>
  );
});