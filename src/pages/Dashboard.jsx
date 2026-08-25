import { useState, useMemo, useEffect, useCallback } from "react";
import { eur, monthKey, todayISO, addMonthsMk, labelMk } from "../utils/helpers";
import { Card } from "../components/Card";
import { ChartTip } from "../components/charts/ChartTip";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { usePortfolio } from "../hooks/usePortfolio";
import { useCarrieraStats } from "../hooks/useCarriera";
import { marketData } from "../services/markets";
import { MonthNavigator } from "../components/shared/MonthNavigator";
import { Chip, CountEur, EmptyState } from "../components/Typography";
import { TxList } from "../components/shared/TxList";

export function Dashboard({ patrimonio, isCurrentMonth, selMonth, setSelMonth, cur, prev, series, chartRange, setChartRange, txs, catById, accById, insights, data, update, setTxModal, softDelete, setPage }) {
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
    const current = patrimonioVisualizzato;
    const previousMk = addMonthsMk(selMonth, -1);
    const previousLiquidi = prev ? patrimonio - cur.risparmio - cur.inv : 0;
    const previousInvestimenti = investimentiAt(previousMk);
    const previousTfr = tfrAt(previousMk);
    const fallbackLiquidi = previousLiquidi || 0;
    const previous = (patrimonioToggles.liquidi ? fallbackLiquidi : 0) +
      (patrimonioToggles.investimenti ? previousInvestimenti : 0) +
      (patrimonioToggles.tfr ? previousTfr : 0);
    return current - previous;
  }, [patrimonioVisualizzato, selMonth, patrimonioToggles, investimentiAt, tfrAt, patrimonio, prev, cur]);

  const toggleItems = [
    { key: "liquidi", label: "Cash", short: "Cash", icon: "●" },
    { key: "investimenti", label: "Portfolio", short: "Portfolio", icon: "↗" },
    { key: "tfr", label: "Ret. Account", short: "Ret. Account", icon: "◴" },
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
      {/* Hero patrimonio */}
      <Card className="p-5 sm:p-6 md:p-8 mb-5 relative overflow-hidden" delay={40} hover={false}>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-20 blur-3xl bg-linear-to-br from-indigo-400 to-teal-300" />
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div key={selMonth} style={{ animation: "fadeUp .4s both" }}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm text-slate-400">
                {isCurrentMonth ? "Financial Net Worth" : `Patrimonio a fine ${labelMk(selMonth).toLowerCase()}`}
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
            <CountEur value={patrimonioVisualizzato} cls="font-display text-3xl sm:text-4xl md:text-5xl text-white tracking-tight tabular-nums" />
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Chip tone={deltaPatrimonio >= 0 ? "up" : "down"}>{deltaPatrimonio >= 0 ? "▲" : "▼"} {eur(Math.abs(deltaPatrimonio))}</Chip>
              {!isCurrentMonth && <Chip>Vista storica</Chip>}
              {patrimonioToggles.investimenti && componentValues.investimenti > 0 && <Chip>{eur(componentValues.investimenti)} {toggleItems.find(i => i.key === "investimenti")?.label}</Chip>}
              {patrimonioToggles.tfr && componentValues.tfr > 0 && <Chip>{eur(componentValues.tfr)} {toggleItems.find(i => i.key === "tfr")?.label}</Chip>}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 shrink-0 w-full md:w-auto mt-1 md:mt-0">
            {/* Toggle Componenti Patrimonio */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {toggleItems.map((item) => {
                const active = patrimonioToggles[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => togglePatrimonio(item.key)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all text-center ${
                      active ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.short}
                  </button>
                );
              })}
            </div>
            {/* Selettore Tempo */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {[
                { l: "1M", v: 30 }, 
                { l: "3M", v: 90 }, 
                { l: "1Y", v: 365 }, 
                { l: "All", v: "all" }
              ].map((r) => (
                <button 
                  key={r.v} 
                  onClick={() => setChartRange(r.v)} 
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all text-center ${chartRange == r.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  {r.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* GRAFICO */}
        <div className="h-48 md:h-56 mt-6 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seriePatrimonio} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
              <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="valore" name="Patrimonio" stroke="url(#gws)" strokeWidth={2.5} fill="url(#gw)" animationDuration={600} activeDot={{ r: 4, fill: "#5EEAD4", stroke: "rgba(94,234,212,.3)", strokeWidth: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
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