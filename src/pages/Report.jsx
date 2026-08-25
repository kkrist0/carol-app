import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonthsMk, endOfMonthIso, eur, labelMk, labelMkShort, mkOf, monthKey, parseMk, todayISO } from "../utils/helpers";
import { MESI, YEAR_MAX, YEAR_MIN } from "../config/constants";
import { Card } from "../components/Card";
import { MonthNavigator } from "../components/shared/MonthNavigator";
import { MonthYearSelect } from "../components/shared/MonthYearSelect";
import { ChartTip } from "../components/charts/ChartTip";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Report({ txs, catById, monthStats, data, update }) {
  const [showTr, setShowTr] = useState(false);
  const nowMk = monthKey(new Date());
  const curYear = new Date().getFullYear();

  /* ---- filtro periodo: mese / anno / intervallo ---- */
  const saved = data.settings?.lastReportPeriod || {};
  const [mode, setMode] = useState(saved.mode || "mese");
  const [pMk, setPMk] = useState(saved.pMk || nowMk);
  const [pYear, setPYear] = useState(saved.pYear || curYear);
  const [pFrom, setPFrom] = useState(saved.pFrom || mkOf(curYear, 0));
  const [pTo, setPTo] = useState(saved.pTo || nowMk);
  const [year, setYear] = useState(saved.pYear || curYear); // sezione annuale
  const [compare, setCompare] = useState(false);

  /* memorizza l'ultimo periodo del report */
  useEffect(() => {
    const p = { mode, pMk, pYear, pFrom, pTo };
    const old = data.settings?.lastReportPeriod;
    if (JSON.stringify(old) !== JSON.stringify(p)) {
      const timer = setTimeout(() => {
        update((d) => { d.settings.lastReportPeriod = p; return d; });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [mode, pMk, pYear, pFrom, pTo, data.settings, update]);
  useEffect(() => { 
    if (mode === "anno") {
      const timer = setTimeout(() => setYear(pYear), 0);
      return () => clearTimeout(timer);
    }
  }, [mode, pYear]);

  /* mesi del periodo selezionato */
  const periodMonths = useMemo(() => {
    if (mode === "mese") return [pMk];
    if (mode === "anno") return MESI.map((_, m) => mkOf(pYear, m));
    let a = pFrom, b = pTo;
    if (a > b) [a, b] = [b, a];
    const out = [];
    let mk = a;
    while (mk <= b && out.length < 72) { out.push(mk); mk = addMonthsMk(mk, 1); }
    return out;
  }, [mode, pMk, pYear, pFrom, pTo]);
  const periodSet = useMemo(() => new Set(periodMonths), [periodMonths]);
  const periodEndIso = endOfMonthIso(periodMonths[periodMonths.length - 1]);
  const periodLabel = mode === "mese" ? labelMk(pMk) : mode === "anno" ? `Anno ${pYear}` : `${labelMk(periodMonths[0])} → ${labelMk(periodMonths[periodMonths.length - 1])}`;

  /* patrimonio a una certa data */
  const base0 = useMemo(() => (data?.accounts || []).reduce((s, a) => s + a.saldoIniziale, 0), [data]);
  const patAt = useCallback((iso) => base0 + txs.filter((t) => t.data <= iso).reduce((s, t) => s + (t.tipo === "entrata" ? t.importo : t.tipo === "spesa" ? -t.importo : 0), 0), [base0, txs]);

  /* statistiche aggregate del periodo */
  const pStats = useMemo(() => {
    const per = periodMonths.map((mk) => ({ mk, ...monthStats(mk) }));
    const entrate = per.reduce((s, x) => s + x.entrate, 0);
    const uscite = per.reduce((s, x) => s + x.uscite, 0);
    const inv = per.reduce((s, x) => s + x.inv, 0);
    return { per, entrate, uscite, inv, risparmio: entrate - uscite - inv };
  }, [periodMonths, monthStats]);

  /* barre mensili del periodo */
  const barsData = useMemo(() => pStats.per.map((x) => {
    const trasf = txs.filter((t) => t.tipo === "trasferimento" && monthKey(t.data) === x.mk).reduce((s, t) => s + t.importo, 0);
    return { mese: periodMonths.length > 12 ? labelMkShort(x.mk) : MESI[parseMk(x.mk).m] + (mode === "intervallo" ? " " + String(parseMk(x.mk).y).slice(2) : ""), Entrate: x.entrate, Uscite: x.uscite, Trasferiti: trasf };
  }), [pStats, txs, periodMonths, mode]);

  /* donut categorie del periodo */
  const donut = useMemo(() => {
    const m = {};
    txs.filter((t) => t.tipo === "spesa" && periodSet.has(monthKey(t.data))).forEach((t) => (m[t.categoria] = (m[t.categoria] || 0) + t.importo));
    return Object.entries(m).map(([k, v]) => ({ name: catById[k]?.nome || "Senza categoria", value: Math.round(v), fill: catById[k]?.colore || "#8B9DF9" })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [txs, catById, periodSet]);

  /* heatmap giorno per giorno (solo modalità mese) */
  const heat = useMemo(() => {
    if (mode !== "mese") return null;
    const { y, m } = parseMk(pMk);
    const daysIn = new Date(y, m + 1, 0).getDate();
    const arr = Array.from({ length: daysIn }, (_, i) => ({ d: i + 1, v: 0 }));
    txs.filter((t) => t.tipo === "spesa" && monthKey(t.data) === pMk).forEach((t) => { arr[new Date(t.data + "T12:00:00").getDate() - 1].v += t.importo; });
    const max = Math.max(1, ...arr.map((x) => x.v));
    return { arr, max };
  }, [txs, mode, pMk]);

  /* confronto stesso mese anno precedente (modalità mese) */
  const yoy = useMemo(() => {
    if (mode !== "mese") return null;
    const { y, m } = parseMk(pMk);
    const prevMk = mkOf(y - 1, m);
    const a = monthStats(pMk), b = monthStats(prevMk);
    if (b.entrate === 0 && b.uscite === 0) return null;
    return { prevMk, dSpese: a.uscite - b.uscite, pctSpese: b.uscite > 0 ? ((a.uscite - b.uscite) / b.uscite) * 100 : null, dEntrate: a.entrate - b.entrate };
  }, [mode, pMk, monthStats]);

  const mediaGiorn = useMemo(() => {
    if (mode !== "mese") return null;
    const { y, m } = parseMk(pMk);
    const days = pMk === nowMk ? new Date().getDate() : new Date(y, m + 1, 0).getDate();
    return pStats.uscite / Math.max(1, days);
  }, [mode, pMk, pStats, nowMk]);

  /* ---- sezione annuale (come prima, con anni 2024-2028) ---- */
  const years = useMemo(() => {
    const ys = new Set(txs.map((t) => Number(t.data.slice(0, 4))));
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) ys.add(y);
    return [...ys].sort((a, b) => b - a);
  }, [txs]);

  const annual = useMemo(() => {
    const now = new Date();
    const upTo = year === now.getFullYear() ? now.getMonth() : 11;
    const rows = MESI.map((label, m) => {
      const s = monthStats(mkOf(year, m));
      return { m, mese: label, Entrate: s.entrate, Spese: s.uscite, Investimenti: s.inv, Risparmio: s.risparmio, futuro: year === now.getFullYear() && m > upTo };
    });
    const attivi = rows.filter((r) => !r.futuro);
    const totSpese = attivi.reduce((s, r) => s + r.Spese, 0);
    const totEntrate = attivi.reduce((s, r) => s + r.Entrate, 0);
    const totInv = attivi.reduce((s, r) => s + r.Investimenti, 0);
    const conDati = attivi.filter((r) => r.Spese > 0 || r.Entrate > 0);
    const maxSpesa = conDati.length ? conDati.reduce((a, b) => (b.Spese > a.Spese ? b : a)) : null;
    const maxRisp = conDati.length ? conDati.reduce((a, b) => (b.Risparmio > a.Risparmio ? b : a)) : null;
    const media = conDati.length ? totSpese / (upTo + 1) : 0;
    const spese = txs.filter((t) => t.tipo === "spesa" && t.data.startsWith(String(year)));
    const byCatSum = {}, byCatCount = {};
    spese.forEach((t) => { byCatSum[t.categoria] = (byCatSum[t.categoria] || 0) + t.importo; byCatCount[t.categoria] = (byCatCount[t.categoria] || 0) + 1; });
    const topSum = Object.entries(byCatSum).sort((a, b) => b[1] - a[1])[0];
    const topCount = Object.entries(byCatCount).sort((a, b) => b[1] - a[1])[0];
    const patEnd = patAt(year === now.getFullYear() ? todayISO() : endOfMonthIso(mkOf(year, 11)));
    const patEndPrev = patAt(endOfMonthIso(mkOf(year - 1, 11)));
    return { rows, totSpese, totEntrate, totInv, risparmioTot: totEntrate - totSpese - totInv, media, maxSpesa, maxRisp, topSum, topCount, patEnd, patEndPrev };
  }, [year, monthStats, txs, patAt]);

  const patSeries = useMemo(() => {
    const now = new Date();
    const patStart = patAt(endOfMonthIso(mkOf(year - 1, 11)));
    return MESI.map((label, m) => {
      const isFuture = year === now.getFullYear() && m > now.getMonth();
      const p = isFuture ? null : patAt(endOfMonthIso(mkOf(year, m)));
      const row = { mese: label, [String(year)]: p, "Risparmio accumulato": p == null ? null : Math.round(p - patStart) };
      if (compare) {
        const prevFuture = year - 1 === now.getFullYear() && m > now.getMonth();
        row[String(year - 1)] = prevFuture ? null : patAt(endOfMonthIso(mkOf(year - 1, m)));
      }
      return row;
    });
  }, [year, compare, patAt]);

  const crescita = annual.patEnd - annual.patEndPrev;
  const crescitaPct = annual.patEndPrev !== 0 ? (crescita / Math.abs(annual.patEndPrev)) * 100 : null;

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5" style={{ animation: "fadeUp .5s both" }}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Report</p>
        <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Analisi e tendenze</h1>
      </header>

      {/* filtro periodo */}
      <Card className="p-4 mb-5" hover={false} delay={40}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[{ v: "mese", l: "Mese" }, { v: "anno", l: "Anno" }, { v: "intervallo", l: "Intervallo" }].map((t) => (
              <button key={t.v} onClick={() => setMode(t.v)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${mode === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{t.l}</button>
            ))}
          </div>
          {mode === "mese" && <MonthNavigator value={pMk} onChange={setPMk} />}
          {mode === "anno" && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
              <button onClick={() => setPYear((y) => Math.max(YEAR_MIN, y - 1))} disabled={pYear <= YEAR_MIN} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">◀</button>
              {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => (
                <button key={y} onClick={() => setPYear(y)} className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${pYear === y ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"}`}>{y}</button>
              ))}
              <button onClick={() => setPYear((y) => Math.min(YEAR_MAX, y + 1))} disabled={pYear >= YEAR_MAX} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">▶</button>
            </div>
          )}
          {mode === "intervallo" && (
            <div className="flex flex-wrap items-center gap-2">
              <MonthYearSelect value={pFrom} onChange={setPFrom} />
              <span className="text-slate-500 text-sm">→</span>
              <MonthYearSelect value={pTo} onChange={setPTo} />
            </div>
          )}
        </div>
      </Card>

      {/* stats del periodo */}
      <div key={"ps-" + periodLabel} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { l: `Entrate · ${mode === "mese" ? "mese" : "periodo"}`, v: eur(pStats.entrate), tone: "text-emerald-300" },
          { l: `Spese · ${mode === "mese" ? "mese" : "periodo"}`, v: eur(pStats.uscite), tone: "text-rose-300" },
          { l: "Risparmio", v: eur(pStats.risparmio), tone: pStats.risparmio >= 0 ? "text-teal-300" : "text-rose-300" },
          mode === "mese"
            ? { l: "Media giornaliera", v: eur(mediaGiorn || 0), tone: "text-indigo-300" }
            : { l: "Patrimonio a fine periodo", v: eur(patAt(periodEndIso)), tone: "text-indigo-300" },
        ].map((s, i) => (
          <Card key={s.l} className="p-4" delay={i * 50}><p className="text-xs text-slate-400">{s.l}</p><p className={`font-display text-xl mt-1 tabular-nums ${s.tone}`}>{s.v}</p></Card>
        ))}
      </div>

      {yoy && (
        <Card className="p-4 mb-5" hover={false} delay={150}>
          <p className="text-sm text-slate-300">
            <span className="text-indigo-300">↔</span> Rispetto a <b className="text-white">{labelMk(yoy.prevMk).toLowerCase()}</b>: spese {yoy.dSpese >= 0 ? "aumentate" : "diminuite"} di <b className={yoy.dSpese >= 0 ? "text-rose-300" : "text-emerald-300"}>{eur(Math.abs(yoy.dSpese))}</b>
            {yoy.pctSpese != null && <span className="text-slate-500"> ({yoy.dSpese >= 0 ? "+" : "−"}{Math.abs(yoy.pctSpese).toFixed(0)}%)</span>}, entrate {yoy.dEntrate >= 0 ? "in crescita" : "in calo"} di <b className={yoy.dEntrate >= 0 ? "text-emerald-300" : "text-rose-300"}>{eur(Math.abs(yoy.dEntrate))}</b>.
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card className="p-5" hover={false} delay={200}>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="font-display text-white">Entrate vs uscite · {periodLabel}</h2>
            <button onClick={() => setShowTr((v) => !v)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${showTr ? "text-slate-200 border-slate-400/40 bg-slate-400/10" : "text-slate-500 border-white/10 hover:text-slate-300"}`}>⇄ Trasferimenti: {showTr ? "visibili" : "esclusi"}</button>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barsData} barGap={4}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="mese" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
                <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="Entrate" fill="#4ADE80" radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={900} />
                <Bar dataKey="Uscite" fill="#FB7185" radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={900} />
                {showTr && <Bar dataKey="Trasferiti" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={700} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-600 mt-2">I trasferimenti tra conti sono spostamenti interni: non contano mai come entrate, uscite, budget o risparmio.</p>
        </Card>
        <Card className="p-5" hover={false} delay={260}>
          <h2 className="font-display text-white mb-3">Spese per categoria · {periodLabel}</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="h-40 sm:h-56 w-full sm:w-1/2 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" innerRadius="52%" outerRadius="82%" paddingAngle={3} animationDuration={1000}>
                    {donut.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-1.5 text-xs flex-1 sm:max-h-52 sm:overflow-y-auto sm:pr-1">
              {donut.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2 min-w-0">
                  <span className="flex items-center gap-1.5 text-slate-300 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />{d.name}</span>
                  <span className="text-slate-400 tabular-nums shrink-0">{eur(d.value)}</span>
                </div>
              ))}
              {donut.length === 0 && <p className="text-slate-500 col-span-2">Nessuna spesa nel periodo.</p>}
            </div>
          </div>
        </Card>
      </div>
      {heat && (
        <Card className="p-5 mb-8" hover={false} delay={320}>
          <h2 className="font-display text-white mb-3">Intensità di spesa · {labelMk(pMk).toLowerCase()}</h2>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(24px, 1fr))" }}>
            {heat.arr.map((x) => (
              <div key={x.d} title={`Giorno ${x.d}: ${eur(x.v)}`} className="aspect-square rounded-md transition-transform hover:scale-110 grid place-items-center text-[9px] text-slate-500" style={{ background: x.v === 0 ? "rgba(255,255,255,.04)" : `rgba(139,157,249,${0.15 + 0.75 * (x.v / heat.max)})` }}>{x.d}</div>
            ))}
          </div>
        </Card>
      )}

      {/* ==================== VISTA ANNUALE ==================== */}
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Vista annuale</p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">L'anno in prospettiva</h1>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-wrap">
          {years.filter((y) => y >= YEAR_MIN && y <= YEAR_MAX).sort((a, b) => a - b).map((y) => (
            <button key={y} onClick={() => setYear(y)} className={`px-3 py-1 rounded-lg text-xs transition-all ${year === y ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{y}</button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { l: `Entrate ${year}`, v: eur(annual.totEntrate), tone: "text-emerald-300" },
          { l: `Spese ${year}`, v: eur(annual.totSpese), tone: "text-rose-300" },
          { l: "Risparmio totale", v: eur(annual.risparmioTot), tone: annual.risparmioTot >= 0 ? "text-teal-300" : "text-rose-300" },
          { l: "Media spese / mese", v: eur(annual.media), tone: "text-indigo-300" },
        ].map((s, i) => (
          <Card key={s.l} className="p-4" delay={i * 50}><p className="text-xs text-slate-400">{s.l}</p><p className={`font-display text-xl mt-1 tabular-nums ${s.tone}`}>{s.v}</p></Card>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card className="p-4" delay={80}><p className="text-xs text-slate-400">Mese più costoso</p><p className="text-white mt-1">{annual.maxSpesa ? `${annual.maxSpesa.mese} · ${eur(annual.maxSpesa.Spese)}` : "—"}</p></Card>
        <Card className="p-4" delay={130}><p className="text-xs text-slate-400">Miglior risparmio</p><p className="text-white mt-1">{annual.maxRisp ? `${annual.maxRisp.mese} · ${eur(annual.maxRisp.Risparmio)}` : "—"}</p></Card>
        <Card className="p-4" delay={180}><p className="text-xs text-slate-400">Categoria più costosa</p><p className="text-white mt-1 truncate">{annual.topSum ? `${catById[annual.topSum[0]]?.icona || ""} ${catById[annual.topSum[0]]?.nome || "?"} · ${eur(annual.topSum[1])}` : "—"}</p></Card>
        <Card className="p-4" delay={230}><p className="text-xs text-slate-400">Categoria più usata</p><p className="text-white mt-1 truncate">{annual.topCount ? `${catById[annual.topCount[0]]?.icona || ""} ${catById[annual.topCount[0]]?.nome || "?"} · ${annual.topCount[1]} volte` : "—"}</p></Card>
      </div>
      <Card className="p-4 mb-5" hover={false} delay={260}>
        <div className="flex items-center gap-3">
          <span className="text-lg">{crescita >= 0 ? "📈" : "📉"}</span>
          <p className="text-sm text-slate-300">
            Patrimonio {crescita >= 0 ? "cresciuto" : "diminuito"} di <b className={crescita >= 0 ? "text-emerald-300" : "text-rose-300"}>{eur(Math.abs(crescita))}</b>
            {crescitaPct != null && <span className="text-slate-500"> ({crescita >= 0 ? "+" : "−"}{Math.abs(crescitaPct).toFixed(1)}%)</span>} rispetto a fine {year - 1}.
          </p>
        </div>
      </Card>

      <Card className="p-5 mb-5" hover={false} delay={300}>
        <h2 className="font-display text-white mb-3">Spese mensili · {year}</h2>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annual.rows} barGap={3}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
              <XAxis dataKey="mese" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
              <Bar dataKey="Spese" radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={900}>
                {annual.rows.map((r, i) => <Cell key={i} fill={annual.maxSpesa && r.m === annual.maxSpesa.m && r.Spese > 0 ? "#FB7185" : "#8B9DF9"} fillOpacity={r.futuro ? 0.15 : 0.9} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 mb-5" hover={false} delay={340}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display text-white">Evoluzione patrimonio · {year}</h2>
          <button onClick={() => setCompare((v) => !v)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${compare ? "text-indigo-200 border-indigo-400/40 bg-indigo-400/10" : "text-slate-500 border-white/10 hover:text-slate-300"}`}>Confronta con {year - 1}</button>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={patSeries}>
              <defs>
                <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B9DF9" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8B9DF9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
              <XAxis dataKey="mese" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey={String(year)} name={`Patrimonio ${year}`} stroke="#A5B4FC" strokeWidth={2.5} fill="url(#gy)" animationDuration={1000} connectNulls={false} />
              <Line type="monotone" dataKey="Risparmio accumulato" stroke="#5EEAD4" strokeWidth={2} dot={false} animationDuration={1100} connectNulls={false} />
              {compare && <Line type="monotone" dataKey={String(year - 1)} name={`Patrimonio ${year - 1}`} stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} animationDuration={800} connectNulls={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-[11px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-300" />Patrimonio {year}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-300" />Risparmio accumulato da inizio anno</span>
          {compare && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" />Patrimonio {year - 1}</span>}
        </div>
      </Card>

      <Card className="p-5" hover={false} delay={380}>
        <h2 className="font-display text-white mb-3">Mese per mese · {year}</h2>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[13px] sm:text-sm min-w-104">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-normal">Mese</th>
                <th className="py-2 pr-3 font-normal text-right">Entrate</th>
                <th className="py-2 pr-3 font-normal text-right">Spese</th>
                <th className="py-2 pr-3 font-normal text-right">Investiti</th>
                <th className="py-2 font-normal text-right">Risparmio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {annual.rows.map((r) => {
                const isMax = annual.maxSpesa && r.m === annual.maxSpesa.m && r.Spese > 0;
                const isBest = annual.maxRisp && r.m === annual.maxRisp.m && r.Risparmio > 0;
                return (
                  <tr key={r.m} className="hover:bg-white/3 transition-colors">
                    <td className={`py-2 pr-3 ${r.futuro ? "text-slate-600" : "text-slate-200"}`}>{r.mese} {isMax && <span title="Mese più costoso">🔥</span>}{isBest && <span title="Miglior risparmio">🏆</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-300/90">{r.Entrate ? eur(r.Entrate) : "—"}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${isMax ? "text-rose-300 font-medium" : "text-slate-300"}`}>{r.Spese ? eur(r.Spese) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{r.Investimenti ? eur(r.Investimenti) : "—"}</td>
                    <td className={`py-2 text-right tabular-nums ${isBest ? "text-teal-300 font-medium" : r.Risparmio < 0 ? "text-rose-300/90" : "text-slate-300"}`}>{r.Entrate || r.Spese ? eur(r.Risparmio) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}