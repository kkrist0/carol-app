import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { addMonthsMk, eur, labelMk, labelMkShort, mkOf, monthKey, parseMk } from "../utils/helpers";
import { MESI, YEAR_MAX, YEAR_MIN } from "../config/constants";
import { BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { MonthNavigator } from "../components/shared/MonthNavigator";
import { MonthYearSelect } from "../components/shared/MonthYearSelect";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip } from "../components/charts/ChartTip";
import { Input, Select } from "../components/Forms";
import { Chip, CountEur, EmptyState } from "../components/Typography";
import { TxList } from "../components/shared/TxList";

export function Movimenti({ txs, catById, accById, data, setTxModal, softDelete }) {
  const [nowMk] = useState(() => monthKey(new Date()));
  const [curYear] = useState(() => new Date().getFullYear());
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [fCat, setFCat] = useState("");
  const [fConto, setFConto] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [pmode, setPmode] = useState("tutto"); // tutto | mese | anno | intervallo
  const [pMk, setPMk] = useState(nowMk);
  const [pYear, setPYear] = useState(curYear);
  const [pFrom, setPFrom] = useState(mkOf(curYear, 0));
  const [pTo, setPTo] = useState(nowMk);
  const [view, setView] = useState("gruppi"); // gruppi | lista
  const [limit, setLimit] = useState(60);
  const [expandedGroups, setExpandedGroups] = useState(new Set([nowMk]));
  const [showFilters, setShowFilters] = useState(false);

  // Effetto che controlla il campo di ricerca
  useEffect(() => {
    if (dq === "") {
      const timer = setTimeout(() => setExpandedGroups(new Set([nowMk])), 0);
      return () => clearTimeout(timer);
    }
  }, [dq, nowMk]);

  const toggleGroup = (mk) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(mk)) next.delete(mk);
      else next.add(mk);
      return next;
    });
  };
  useEffect(() => { 
    const timer = setTimeout(() => setLimit(60), 0);
    return () => clearTimeout(timer);
  }, [dq, fCat, fConto, fTipo, pmode, pMk, pYear, pFrom, pTo]);

  /* mesi del periodo (null = nessun filtro temporale) */
  const periodMonths = useMemo(() => {
    if (pmode === "mese") return [pMk];
    if (pmode === "anno") return MESI.map((_, m) => mkOf(pYear, m));
    if (pmode === "intervallo") {
      let a = pFrom, b = pTo;
      if (a > b) [a, b] = [b, a];
      const out = []; let mk = a;
      while (mk <= b && out.length < 72) { out.push(mk); mk = addMonthsMk(mk, 1); }
      return out;
    }
    return null;
  }, [pmode, pMk, pYear, pFrom, pTo]);
  const periodSet = useMemo(() => (periodMonths ? new Set(periodMonths) : null), [periodMonths]);
  const periodLabel = pmode === "tutto" ? "Tutto lo storico" : pmode === "mese" ? labelMk(pMk) : pmode === "anno" ? `Anno ${pYear}` : `${labelMk(periodMonths[0])} → ${labelMk(periodMonths[periodMonths.length - 1])}`;

  const filtered = useMemo(() => txs.filter((t) => {
    if (periodSet && !periodSet.has(monthKey(t.data))) return false;
    if (fCat && t.categoria !== fCat) return false;
    if (fConto && t.conto !== fConto && t.contoDest !== fConto) return false;
    if (fTipo && t.tipo !== fTipo) return false;
    if (dq) {
      const s = `${t.note || ""} ${catById[t.categoria]?.nome || ""} ${t.sottocategoria || ""} ${accById[t.conto]?.nome || ""} ${(t.tags || []).join(" ")}`.toLowerCase();
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const query = escapeRegExp(dq.toLowerCase());
      const regex = new RegExp(`\\b${query}`, 'i');
      if (!regex.test(s)) return false;
    }
    return true;
  }), [txs, dq, fCat, fConto, fTipo, periodSet, catById, accById]);

  /* totali del set filtrato */
  const tot = useMemo(() => {
    const spese = filtered.filter((t) => t.tipo === "spesa").reduce((s, t) => s + t.importo, 0);
    const entrate = filtered.filter((t) => t.tipo === "entrata").reduce((s, t) => s + t.importo, 0);
    return { spese, entrate };
  }, [filtered]);

  /* raggruppamento per mese (desc) */
  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach((t) => { const mk = monthKey(t.data); if (!m.has(mk)) m.set(mk, []); m.get(mk).push(t); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mk, list]) => ({
      mk, list,
      spese: list.filter((t) => t.tipo === "spesa").reduce((s, t) => s + t.importo, 0),
      entrate: list.filter((t) => t.tipo === "entrata").reduce((s, t) => s + t.importo, 0),
    }));
  }, [filtered]);

  /* grafico spese mese per mese sul periodo (anno o intervallo) */
  const chartData = useMemo(() => {
    if (!periodMonths || pmode === "mese") return null;
    return periodMonths.map((mk) => {
      const mt = filtered.filter((t) => monthKey(t.data) === mk);
      return {
        mese: periodMonths.length > 12 ? labelMkShort(mk) : MESI[parseMk(mk).m],
        Spese: Math.round(mt.filter((t) => t.tipo === "spesa").reduce((s, t) => s + t.importo, 0)),
        Entrate: Math.round(mt.filter((t) => t.tipo === "entrata").reduce((s, t) => s + t.importo, 0)),
      };
    });
  }, [periodMonths, pmode, filtered]);
  const chartAvg = useMemo(() => {
    if (!chartData) return null;
    const attivi = chartData.filter((r) => r.Spese > 0);
    return attivi.length ? attivi.reduce((s, r) => s + r.Spese, 0) / attivi.length : 0;
  }, [chartData]);

  /* distribuzione categorie del periodo filtrato */
  const catDist = useMemo(() => {
    const m = {};
    filtered.filter((t) => t.tipo === "spesa").forEach((t) => (m[t.categoria] = (m[t.categoria] || 0) + t.importo));
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return { entries, max };
  }, [filtered]);

  const visible = filtered.slice(0, limit);

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3 flex-wrap" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Movimenti</p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Spese ed entrate nel tempo</h1>
        </div>
        <BtnPrimary onClick={() => setTxModal({})}>+ Nuovo</BtnPrimary>
      </header>

      {/* filtro periodo */}
      <Card className="p-4 mb-4" hover={false} delay={40}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[{ v: "tutto", l: "Tutto" }, { v: "mese", l: "Mese" }, { v: "anno", l: "Anno" }, { v: "intervallo", l: "Intervallo" }].map((t) => (
              <button key={t.v} onClick={() => setPmode(t.v)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${pmode === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{t.l}</button>
            ))}
          </div>
          {pmode === "mese" && <MonthNavigator value={pMk} onChange={setPMk} />}
          {pmode === "anno" && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 flex-wrap">
              <button onClick={() => setPYear((y) => Math.max(YEAR_MIN, y - 1))} disabled={pYear <= YEAR_MIN} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">◀</button>
              {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => (
                <button key={y} onClick={() => setPYear(y)} className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${pYear === y ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"}`}>{y}</button>
              ))}
              <button onClick={() => setPYear((y) => Math.min(YEAR_MAX, y + 1))} disabled={pYear >= YEAR_MAX} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">▶</button>
            </div>
          )}
          {pmode === "intervallo" && (
            <div className="flex flex-wrap items-center gap-2">
              <MonthYearSelect value={pFrom} onChange={setPFrom} />
              <span className="text-slate-500 text-sm">→</span>
              <MonthYearSelect value={pTo} onChange={setPTo} />
            </div>
          )}

          {/* TASTO RESET VISIBILE SOLO SU DESKTOP (in alto a destra) */}
          <div className="hidden md:flex ml-auto bg-white/5 rounded-xl p-1">
            <button 
              onClick={() => { setQ(""); setFTipo(""); setFCat(""); setFConto(""); }} 
              disabled={!(q || fTipo || fCat || fConto)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-300 ${
                q || fTipo || fCat || fConto
                  ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 active:scale-95 cursor-pointer"
                  : "text-slate-500 cursor-not-allowed"
              }`}
            >
              ✕ Azzera filtri
            </button>
          </div>

          {/* PULSANTE FILTRI VISIBILE SOLO SU MOBILE */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`md:hidden ml-auto p-1 active:scale-95 transition-colors duration-300 ${
              q || fTipo || fCat || fConto
                ? "text-indigo-400"
                : "text-white/40 hover:text-white/70"
            }`}
            aria-label="Mostra o nascondi i filtri"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </button>
        </div>

        {/* GRIGLIA ANIMATA E PULSANTE RESET */}
        <div className={`flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${showFilters ? "max-h-125 mt-3 opacity-100" : "max-h-0 opacity-0 md:max-h-125 md:mt-3 md:opacity-100"}`}>
          
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Input placeholder="Cerca note, categorie, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Tutti i tipi</option><option value="spesa">Spese</option><option value="entrata">Entrate</option><option value="trasferimento">Trasferimenti</option></Select>
            <Select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Tutte le categorie</option>{[...data.categories].sort((a, b) => a.ordine - b.ordine).map((c) => <option key={c.id} value={c.id}>{c.icona} {c.nome}</option>)}</Select>
            <Select value={fConto} onChange={(e) => setFConto(e.target.value)}><option value="">Tutti i conti</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.icona} {a.nome}</option>)}</Select>
          </div>

          {/* TASTO RESET VISIBILE SOLO SU MOBILE (in basso sotto i filtri) */}
          <div className="mt-3 flex md:hidden justify-end">
            <button 
              onClick={() => { setQ(""); setFTipo(""); setFCat(""); setFConto(""); }} 
              disabled={!(q || fTipo || fCat || fConto)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-300 ${
                q || fTipo || fCat || fConto
                  ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 active:scale-95 cursor-pointer"
                  : "bg-white/5 text-slate-500 cursor-not-allowed"
              }`}
            >
              ✕ Azzera filtri
            </button>
          </div>
          
        </div>
      </Card>

      {/* riepilogo del periodo filtrato */}
      <div key={"sum-" + periodLabel + fCat + fConto + fTipo} className="grid grid-cols-3 gap-3 mb-4">
        <Card className="p-3.5" delay={60}><p className="text-[11px] text-slate-500">Spese · {periodLabel.toLowerCase()}</p><CountEur value={tot.spese} cls="font-display text-lg text-rose-300 tabular-nums" /></Card>
        <Card className="p-3.5" delay={110}><p className="text-[11px] text-slate-500">Entrate</p><CountEur value={tot.entrate} cls="font-display text-lg text-emerald-300 tabular-nums" /></Card>
        <Card className="p-3.5" delay={160}><p className="text-[11px] text-slate-500">Saldo</p><CountEur value={tot.entrate - tot.spese} cls={`font-display text-lg tabular-nums ${tot.entrate - tot.spese >= 0 ? "text-teal-300" : "text-rose-300"}`} /></Card>
      </div>

      {/* grafici del periodo (anno / intervallo) */}
      {chartData && (
        <Card className="p-5 mb-4" hover={false} delay={180}>
          <h2 className="font-display text-white mb-3">Spese mese per mese · {periodLabel}</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={3}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="mese" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="Spese" fill="#FB7185" fillOpacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={900} />
                <Line type="monotone" dataKey="Spese" name="Andamento" stroke="#FDA4AF" strokeWidth={2} dot={{ r: 2.5, fill: "#FDA4AF" }} animationDuration={1100} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {chartAvg > 0 && <p className="text-[11px] text-slate-500 mt-2">Media dei mesi con spese: <b className="text-slate-300">{eur(chartAvg)}</b> · i mesi sopra la media meritano un'occhiata.</p>}
          {catDist.entries.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Distribuzione categorie</p>
              {catDist.entries.map(([k, v]) => {
                const c = catById[k];
                return (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="w-6 text-center text-sm shrink-0">{c?.icona || "•"}</span>
                    <span className="text-xs text-slate-300 w-28 truncate shrink-0">{c?.nome || "Senza categoria"}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(v / catDist.max) * 100}%`, background: c?.colore || "#8B9DF9" }} />
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums w-20 text-right shrink-0">{eur(v)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* vista: raggruppata / lista */}
      <div className="flex items-center justify-between mb-3" style={{ animation: "fadeUp .4s both" }}>
        <p className="text-xs text-slate-500">{filtered.length} movimenti</p>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {[{ v: "gruppi", l: "Per mese" }, { v: "lista", l: "Lista" }].map((t) => (
            <button key={t.v} onClick={() => setView(t.v)} className={`px-3 py-1 rounded-lg text-xs transition-all ${view === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{t.l}</button>
          ))}
        </div>
      </div>
      {view === "gruppi" ? (
        <div className="space-y-4">
          {groups.map((g, gi) => {
            // È espanso se c'è del testo nella ricerca, OPPURE se l'utente/il default lo ha espanso
            const isExpanded = dq !== "" ? true : expandedGroups.has(g.mk);
            
            return (
              <Card key={g.mk} className="p-4" hover={false} delay={Math.min(gi, 6) * 60}>
                <div 
                  className={`flex items-center justify-between mb-1 flex-wrap gap-2 select-none ${dq === "" ? "cursor-pointer" : ""}`}
                  // Permettiamo di cliccare per chiudere/aprire solo se NON stiamo cercando
                  onClick={() => { if (dq === "") toggleGroup(g.mk); }}
                >
                  <h3 className="font-display text-white flex items-center gap-2">
                    <span className="text-slate-500 text-xs transition-transform duration-200" style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
                    {labelMk(g.mk)}
                  </h3>
                  <div className="flex gap-2 text-xs">
                    {g.spese > 0 && <Chip tone="down">Spese {eur(g.spese)}</Chip>}
                    {g.entrate > 0 && <Chip tone="up">Entrate {eur(g.entrate)}</Chip>}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ animation: "fadeIn .2s ease-out" }}>
                    <TxList txs={g.list} catById={catById} accById={accById} onEdit={setTxModal} onDelete={softDelete} />
                    <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-white/5 text-right">Totale {MESI[parseMk(g.mk).m]}: <b className="text-slate-300">{eur(g.spese)}</b> di spese{g.entrate > 0 ? ` · ${eur(g.entrate)} di entrate` : ""}</p>
                  </div>
                )}
              </Card>
            );
          })}
          {groups.length === 0 && <Card className="p-4" hover={false}><EmptyState text="Nessun movimento con questi filtri." /></Card>}
        </div>
      ) : (
        <Card className="p-4" hover={false}>
          <TxList txs={visible} catById={catById} accById={accById} onEdit={setTxModal} onDelete={softDelete} />
          {filtered.length === 0 && <EmptyState text="Nessun risultato con questi filtri." />}
          {filtered.length > visible.length && (
            <button onClick={() => setLimit((l) => l + 100)} className="w-full mt-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 transition-all">Mostra altri {Math.min(100, filtered.length - visible.length)}</button>
          )}
        </Card>
      )}
    </div>
  );
}