import { useState, useMemo, useEffect, useCallback } from "react";
import { eur, monthKey, todayISO, addMonthsMk, labelMk, labelMkShortEn } from "../utils/helpers";
import { Card } from "../components/Card";
import { ChartTip } from "../components/charts/ChartTip";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { usePortfolio } from "../hooks/usePortfolio";
import { useCarrieraStats } from "../hooks/useCarriera";
import { marketData } from "../services/markets";
import { MonthNavigator } from "../components/shared/MonthNavigator";
import { Chip, CountEur, EmptyState } from "../components/Typography";
import { TxList } from "../components/shared/TxList";

export function Dashboard({ patrimonio, isCurrentMonth, selMonth, setSelMonth, cur, series, chartRange, setChartRange, txs, catById, accById, insights, data, update, setTxModal, softDelete, setPage }) {
  const budgetTot = Object.values(data.budgets || {}).reduce((s, v) => s + v, 0);
  const budgetSpeso = Object.keys(data.budgets || {}).reduce((s, k) => s + cur.mt.filter((t) => t.tipo === "spesa" && t.categoria === k).reduce((x, t) => x + t.importo, 0), 0);
  const monthTxs = useMemo(() => txs.filter((t) => monthKey(t.data) === selMonth).slice(0, 6), [txs, selMonth]);

  /* La Dashboard può mostrare una qualsiasi combinazione dei tre blocchi
     patrimoniali. I valori vengono letti dalle sezioni Investimenti e Stipendio/TFR. */
  const savedToggles = data.settings?.patrimonioToggles || {};
  const [patrimonioToggles, setPatrimonioToggles] = useState({
    liquidi: savedToggles.liquidi ?? true,
    investimenti: savedToggles.investimenti ?? true,
    tfr: savedToggles.tfr ?? false,
  });

  useEffect(() => {
    if (!isCurrentMonth && chartRange === "MTD") setChartRange(30);
  }, [isCurrentMonth, chartRange, setChartRange]);

  useEffect(() => {
    const next = {
      liquidi: savedToggles.liquidi ?? true,
      investimenti: savedToggles.investimenti ?? true,
      tfr: savedToggles.tfr ?? false,
    };
    if (
      next.liquidi !== patrimonioToggles.liquidi ||
      next.investimenti !== patrimonioToggles.investimenti ||
      next.tfr !== patrimonioToggles.tfr
    ) {
      const timer = setTimeout(() => setPatrimonioToggles(next), 0);
      return () => clearTimeout(timer);
    }
  }, [
    savedToggles.liquidi, 
    savedToggles.investimenti, 
    savedToggles.tfr, 
    patrimonioToggles.liquidi, 
    patrimonioToggles.investimenti, 
    patrimonioToggles.tfr
  ]);

  const pf = usePortfolio(data.assets || [], data.trades || [], data.quotes || {}, data.portfolioSnapshots || []);
  const [isUpdatingQuotes, setIsUpdatingQuotes] = useState(false);

  /* Funzione per aggiornare le quotazioni, usata all'avvio e al click */
  const forceUpdateQuotes = useCallback(async () => {
    if (!pf.aperte || pf.aperte.length === 0 || isUpdatingQuotes) return;
    setIsUpdatingQuotes(true);

    const cfg = data.settings?.market || {};
    marketData.configura(cfg);

    let ciSonoAggiornamenti = false;
    const nuoviDati = {};

    for (const a of pf.aperte) {
      try {
        const q = await marketData.quote(a, { forza: true });
        nuoviDati[a.id] = {
          prezzo: q.prezzo,
          variazione: q.variazione,
          valuta: q.valuta || a.valuta,
          fonte: q.fonte,
          aggiornato: new Date().toISOString()
        };
        ciSonoAggiornamenti = true;
      } catch {
        // Ignoriamo gli errori silenziosamente sulla Dashboard
      }
    }

    if (ciSonoAggiornamenti) {
      update((d) => {
        if (!d.quotes) d.quotes = {};
        const oggi = new Date().toISOString().slice(0, 10);
        
        for (const [id, qData] of Object.entries(nuoviDati)) {
          d.quotes[id] = { ...(d.quotes[id] || {}), ...qData };
          const st = d.quotes[id].storico || [];
          const senzaOggi = st.filter((p) => p.data !== oggi);
          d.quotes[id].storico = [...senzaOggi, { data: oggi, prezzo: qData.prezzo }].slice(-400);
        }
        return d;
      });
    }
    
    setIsUpdatingQuotes(false);
  }, [pf.aperte, isUpdatingQuotes, data.settings?.market, update]);

  // Esegue l'aggiornamento in automatico all'apertura della pagina
  useEffect(() => {
    const timer = setTimeout(() => forceUpdateQuotes(), 0);
    return () => clearTimeout(timer);
    
    // Diciamo a React di ignorare la regola, perché vogliamo che scatti SOLO al mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carrieraStats = useCarrieraStats(data, new Date().getFullYear());

  const valueAtOrBefore = useCallback((rows, key, valueKey, mk) => {
    const sorted = (rows || []).filter((r) => r && r[key] && r[key] <= mk).sort((a, b) => a[key].localeCompare(b[key]));
    return sorted.length ? Number(sorted[sorted.length - 1][valueKey]) || 0 : 0;
  }, []);

  const investimentiAt = useCallback((mk) => {
    if (mk === monthKey(new Date())) return pf.valore || 0;
    return valueAtOrBefore(pf.timeline, "mese", "Valore", mk);
  }, [pf, valueAtOrBefore]);

  const tfrAt = useCallback((mk) => {
    if (mk === monthKey(new Date())) return carrieraStats.tfrTotale || 0;
    return valueAtOrBefore(carrieraStats.tfrSerie, "mk", "totale", mk);
  }, [carrieraStats, valueAtOrBefore]);

  const interpolateMonthly = useCallback((iso, getValueFn) => {
    const mk = monthKey(iso);
    const prevMk = addMonthsMk(mk, -1);
    
    const prevVal = getValueFn(prevMk);
    const currVal = getValueFn(mk);
    
    const d = parseInt(iso.slice(8, 10), 10); // estrae il giorno (es. 15)
    const nowIso = todayISO();
    
    // Se siamo nel mese in corso, interpoliamo fino a 'oggi'
    if (mk === monthKey(nowIso)) {
      const todayD = new Date().getDate();
      const frac = todayD > 0 ? d / todayD : 1;
      return prevVal + (currVal - prevVal) * Math.min(1, frac);
    } 
    // Altrimenti interpoliamo sull'intero mese (passato)
    else {
      const [y, m] = mk.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const frac = d / daysInMonth;
      return prevVal + (currVal - prevVal) * frac;
    }
  }, []);

  const componentValues = useMemo(() => ({
    liquidi: patrimonio,
    investimenti: investimentiAt(selMonth),
    tfr: tfrAt(selMonth),
  }), [patrimonio, selMonth, investimentiAt, tfrAt]);

  const patrimonioVisualizzato = useMemo(() => (
    (patrimonioToggles.liquidi ? componentValues.liquidi : 0) +
    (patrimonioToggles.investimenti ? componentValues.investimenti : 0) +
    (patrimonioToggles.tfr ? componentValues.tfr : 0)
  ), [patrimonioToggles, componentValues]);

  const togglePatrimonio = (key) => {
    const next = { ...patrimonioToggles, [key]: !patrimonioToggles[key] };
    setPatrimonioToggles(next);
    update((d) => {
      d.settings = d.settings || {};
      d.settings.patrimonioToggles = next;
      return d;
    });
  };

  const seriePatrimonio = useMemo(() => series.map((point) => {
    const liquidi = point.valore || 0;
    
    // Invece del gradino secco, usiamo la nostra nuova interpolazione!
    const investimenti = interpolateMonthly(point.iso, investimentiAt);
    const tfr = interpolateMonthly(point.iso, tfrAt);
    
    return {
      ...point,
      valore: Math.round(
        (patrimonioToggles.liquidi ? liquidi : 0) +
        (patrimonioToggles.investimenti ? investimenti : 0) +
        (patrimonioToggles.tfr ? tfr : 0)
      ),
    };
  }), [series, patrimonioToggles, investimentiAt, tfrAt, interpolateMonthly]);

  const deltaPatrimonio = useMemo(() => {
    if (seriePatrimonio.length < 2) return 0;
    const first = seriePatrimonio[0].valore || 0;
    const last = seriePatrimonio[seriePatrimonio.length - 1].valore || 0;
    return last - first;
  }, [seriePatrimonio]);

  const totalPatrimonioComponents = (componentValues.liquidi || 0) + (componentValues.investimenti || 0) + (componentValues.tfr || 0);

  const patrimonioComponents = [
    {
      key: "liquidi",
      label: "Cash",
      val: componentValues.liquidi || 0,
      color: "#38BDF8",
      icon: "💵",
    },
    {
      key: "investimenti",
      label: "Portfolio",
      val: componentValues.investimenti || 0,
      color: "#818CF8",
      icon: "📈",
    },
    {
      key: "tfr",
      label: "Retirement Accounts",
      val: componentValues.tfr || 0,
      color: "#FBBF24",
      icon: "🛡️",
    },
  ];

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
          <h1 className="font-display text-2xl md:text-3xl text-white mt-1">Monthly Recap</h1>
        </div>
        <MonthNavigator value={selMonth} onChange={setSelMonth} max={monthKey(new Date())} />
      </header>
      {/* Hero patrimonio diviso in due sezioni */}
      <Card className="p-5 sm:p-6 md:p-8 mb-5 relative overflow-hidden" delay={40} hover={false}>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-20 blur-3xl bg-linear-to-br from-indigo-400 to-teal-300 pointer-events-none" />
        
        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          
          {/* SEZIONE SINISTRA: Patrimonio e Componenti con Barre Percentuali */}
          <div className="lg:col-span-5 flex flex-col justify-between" key={selMonth} style={{ animation: "fadeUp .4s both" }}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  {isCurrentMonth ? "Financial Net Worth" : `Financial Net Worth (as of ${labelMkShortEn(selMonth).toLowerCase()})`}
                </p>
                {/* Mostra il tasto di aggiornamento solo sul mese in corso e se ci sono investimenti */}
                {isCurrentMonth && pf.aperte?.length > 0 && (
                  <button 
                    onClick={forceUpdateQuotes} 
                    disabled={isUpdatingQuotes}
                    className={`text-slate-500 hover:text-white transition-all text-xs flex items-center justify-center w-5 h-5 rounded-md hover:bg-white/10 ${isUpdatingQuotes ? "animate-spin text-white" : ""}`}
                    title="Aggiorna quotazioni investimenti"
                  >
                    ⟳
                  </button>
                )}
              </div>

              <CountEur value={patrimonioVisualizzato} cls="font-display text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight tabular-nums" />
              
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <Chip tone={deltaPatrimonio >= 0 ? "up" : "down"}>
                  {deltaPatrimonio >= 0 ? "▲" : "▼"} {eur(Math.abs(deltaPatrimonio))}
                </Chip>
              </div>
            </div>

            {/* Le 3 parti che compongono il patrimonio */}
            <div className="mt-6 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500 px-1">
                <span>Asset Allocation</span>
              </div>
              {patrimonioComponents.map((item) => {
                const active = patrimonioToggles[item.key];
                const pct = totalPatrimonioComponents > 0 
                  ? Math.round((item.val / totalPatrimonioComponents) * 1000) / 10 
                  : 0;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => togglePatrimonio(item.key)}
                    className={`w-full text-left p-3 border rounded-xl cursor-pointer group ${
                      active
                        ? "bg-white/5 border-white/12 hover:border-white/20 shadow-sm"
                        : "bg-white/5 border-white/0 text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110" 
                          style={{ 
                            backgroundColor: active ? item.color : "#64748B",
                            boxShadow: active ? `0 0 8px ${item.color}66` : "none"
                          }} 
                        />
                        <span className={`text-xs sm:text-sm font-medium truncate ${active ? "text-white" : "text-slate-400"}`}>
                          {item.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs sm:text-sm font-semibold tabular-nums ${active ? "text-slate-200" : "text-slate-500"}`}>
                          {eur(item.val)}
                        </span>
                        <span 
                          className={`text-[11px] tabular-nums font-medium px-1.5 py-0.5 rounded ${
                            active ? "bg-white/10 text-slate-300" : "bg-white/5 text-slate-500"
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Barra percentuale */}
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(100, Math.max(0, pct))}%`,
                          backgroundColor: active ? item.color : "#475569",
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SEZIONE DESTRA: Selettore Temporale e Grafico */}
          <div className="lg:col-span-7 flex flex-col justify-between pt-4 lg:pt-0 lg:border-l lg:border-white/5 lg:pl-6">
            {/* Selettore Tempo in alto a destra */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs uppercase tracking-wider text-slate-400 hidden sm:inline">
                Chart
              </span>
              <div className="flex gap-1 bg-white/5 rounded-xl p-1 ml-auto">
                {[
                  ...(isCurrentMonth ? [{ l: "MTD", v: "MTD" }] : []),
                  { l: "1M", v: 30 }, 
                  { l: "3M", v: 90 }, 
                  { l: "1Y", v: 365 }, 
                  { l: "All", v: "all" }
                ].map((r) => (
                  <button 
                    key={r.v} 
                    onClick={() => setChartRange(r.v)} 
                    className={`px-3 py-1.5 cursor-pointer rounded-lg text-xs whitespace-nowrap transition-all text-center ${
                      chartRange == r.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {r.l}
                  </button>
                ))}
              </div>
            </div>
            {/* Grafico ad Area oppure Messaggio di Selezione */}
            
            {!(patrimonioToggles.liquidi || patrimonioToggles.investimenti || patrimonioToggles.tfr) ? (
              <div className="h-60 sm:h-72 md:h-80 w-full flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-white/10 bg-white/2">
                <p className="text-sm font-display text-white mb-1">
                  No data to display
                </p>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Select one or more asset types on the left (Cash - Portfolio - Retirement Accounts) to display the chart.
                </p>
              </div>
            ) : (() => {
              const vals = seriePatrimonio.map((p) => p.valore).filter((v) => v != null);
              const dataMin = vals.length ? Math.min(...vals) : 0;
              const dataMax = vals.length ? Math.max(...vals) : 0;
              const TICK = 250;
              const yMin = chartRange === "all" ? 0 : Math.floor(Math.max(0, dataMin - 100) / TICK) * TICK;
              const yMaxRaw = Math.ceil((dataMax + 100) / TICK) * TICK;
              // step tra i tick: multiplo di 250 che divide l'intervallo in 4 parti uguali
              const tickStep = Math.max(TICK, Math.ceil(((yMaxRaw - yMin) / 4) / TICK) * TICK);
              const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + i * tickStep);
              const yMax = yTicks[4]; // domain superiore = ultimo tick
              const fmtY = (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : String(Math.round(v)));

              return (
                <div className="h-60 sm:h-72 md:h-80 w-full flex flex-col p-6 rounded-2xl border-white/10 bg-white/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={seriePatrimonio} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B9DF9" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#8B9DF9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gws" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8B9DF9" />
                          <stop offset="60%" stopColor="#A78BFA" />
                          <stop offset="100%" stopColor="#5EEAD4" />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="giorno" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
                      <YAxis
                        tick={{ fill: "#64748B", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        domain={[yMin, yMax]}
                        ticks={yTicks}
                        tickFormatter={fmtY}
                      />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="valore" name="Patrimonio" stroke="url(#gws)" strokeWidth={2.5} fill="url(#gw)" animationDuration={600} activeDot={{ r: 4, fill: "#5EEAD4", stroke: "rgba(94,234,212,.3)", strokeWidth: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>

        </div>
      </Card>
      {/* Quick stats */}
      <div key={"qs-" + selMonth} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { l: "Entrate mese", v: cur.entrate, tone: "text-emerald-300" },
          { l: "Uscite mese", v: cur.uscite, tone: "text-rose-300" },
          { l: "Risparmio", v: cur.risparmio, tone: cur.risparmio >= 0 ? "text-teal-300" : "text-rose-300" },
          { l: "Budget rimanente", v: Math.max(0, budgetTot - budgetSpeso), tone: "text-indigo-300" },
        ].map((s, i) => (
          <Card key={s.l} className="p-4" delay={60 + i * 60}>
            <p className="text-xs text-slate-400">{s.l}</p>
            <CountEur value={s.v} cls={`font-display text-xl md:text-2xl mt-1 block tabular-nums ${s.tone}`} />
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Movimenti del mese */}
        <Card className="lg:col-span-3 p-5 min-w-0" delay={340} hover={false}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-white">Movimenti di {labelMk(selMonth).toLowerCase()}</h2>
            <button onClick={() => setPage("movimenti")} className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors">Vedi tutti →</button>
          </div>
          <div key={"tx-" + selMonth}>
            <TxList txs={monthTxs} catById={catById} accById={accById} onEdit={setTxModal} onDelete={softDelete} compact />
            {monthTxs.length === 0 && <EmptyState text={`Nessun movimento a ${labelMk(selMonth).toLowerCase()}. Tocca + per registrarne uno.`} />}
          </div>
        </Card>

        {/* Insight */}
        <Card className="lg:col-span-2 p-5" delay={400} hover={false}>
          <h2 className="font-display text-white mb-3">Insight del mese</h2>
          <div key={"in-" + selMonth} className="space-y-3">
            {insights.map((t, i) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-white/4 border border-white/6" style={{ animation: `fadeUp .5s both`, animationDelay: `${120 + i * 90}ms` }}>
                <span className="text-indigo-300 mt-0.5">✦</span>
                <p className="text-sm text-slate-300 leading-snug">{t}</p>
              </div>
            ))}
            {insights.length === 0 && <EmptyState text="Gli insight appariranno quando ci saranno movimenti nel mese." />}
          </div>
        </Card>
      </div>
    </div>
  );
}