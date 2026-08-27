import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { eur, monthKey, labelMk, labelMkShort, todayISO, uid, getCategoryGroups, fmtDate } from "../utils/helpers";
import { PALETTE } from "../config/constants";
import { Card } from "../components/Card";
import { BtnPrimary, BtnGhost } from "../components/Buttons";
import { Input, Select, Label } from "../components/Forms";
import { Chip, CountEur, EmptyState } from "../components/Typography";
import Modal from "../components/Modal";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Line, PieChart, Pie, Cell, AreaChart } from "recharts";
import { usePortfolio } from "../hooks/usePortfolio"; 
import { ASSET_TYPES, AREE, ETF_CATALOG, marketData, SETTORI, pct } from "../services/markets";
import { createPortal } from "react-dom";
import { Spinner } from "../components/Spinner";
import { ChartTip } from "../components/charts/ChartTip";
import Sparkline from "../components/charts/Sparkline";

export function InvestimentiPage({ data, update, notify, setConfirmDlg }) {
  const [assetModal, setAssetModal] = useState(null);
  const [tradeModal, setTradeModal] = useState(null);
  const [dettaglio, setDettaglio] = useState(null);
  const [aggiornando, setAggiornando] = useState(false);
  const assets = data.assets || [];
  const trades = data.trades || [];
  const pf = usePortfolio(assets, trades, data.quotes, data.portfolioSnapshots);
  const [chartRange, setChartRange] = useState(12);
  const filteredTimeline = chartRange === "all" 
    ? pf.timeline
    : pf.timeline.slice(-chartRange);

  useEffect(() => { 
    const cfg = data.settings?.market || {};
    if (marketData?.configura) {
      marketData.configura(cfg); 
    }
  }, [data.settings?.market]);

  const [esitoAgg, setEsitoAgg] = useState(null);
  const [vista, setVista] = useState("portafoglio");
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotMonth, setSnapshotMonth] = useState(monthKey(new Date()));
  const [snapshotValue, setSnapshotValue] = useState("");
  const [snapshotNote, setSnapshotNote] = useState("");
  const mercatoCaricaRef = useRef(null);
  const needAutoCarica = useRef(true);

  useEffect(() => {
    aggiornaTutti();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (aggiornando || !pf || pf.valore <= 0) return;

    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    let closedDate = new Date(now);
    if (!(now.getDate() === lastDay && now.getHours() >= 18)) {
      closedDate.setDate(0); 
    }
    
    const mk = monthKey(closedDate.toISOString());
    const hasSnapshot = (data.portfolioSnapshots || []).some((s) => s.mese === mk);
    
    if (!hasSnapshot) {
      const timer = setTimeout(() => {
        update((d) => {
          if (!d.portfolioSnapshots) d.portfolioSnapshots = [];
          if (!d.portfolioSnapshots.some((s) => s.mese === mk)) {
            d.portfolioSnapshots.push({
              mese: mk,
              valore: pf.valore,
              note: "Autosalvataggio chiusura mercati"
            });
            d.portfolioSnapshots.sort((a, b) => a.mese.localeCompare(b.mese));
          }
          return d;
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pf, aggiornando, data.portfolioSnapshots, update]);

  const saveAsset = (a) => {
    update((d) => { 
      if (!d.assets) d.assets = []; 
      const i = d.assets.findIndex((x) => x.id === a.id); 
      if (i >= 0) d.assets[i] = a; 
      else d.assets.push(a); 
      return d; 
    });
    setAssetModal(null); 
    notify(assets.some((x) => x.id === a.id) ? "Strumento aggiornato" : `${a.nome} aggiunto`);
  };

  const ensureInvestmentCategoryId = (d) => {
    if (!d.categories) d.categories = [];
    let cat = d.categories.find((c) => c.id === "etf" || (c.nome || "").toLowerCase() === "etf" || getCategoryGroups(c).includes("Investimenti"));
    if (!cat) {
      cat = { id: "etf", nome: "ETF", gruppo: "Investimenti", icona: "📈", colore: "#A78BFA", sottocategorie: [], ordine: d.categories.length };
      d.categories.push(cat);
    } else if (!getCategoryGroups(cat).includes("Investimenti")) {
      cat.gruppo = [cat.gruppo, "Investimenti"].filter(Boolean).join("|");
    }
    return cat.id;
  };

  const handleTimelineClick = (state) => {
  if (!state) return;

  let itemData = state.activePayload?.[0]?.payload;
  const index = state.activeTooltipIndex ?? state.activeIndex;
  if (!itemData && index != null && filteredTimeline?.[index]) {
    itemData = filteredTimeline[index];
  }

  const mk = itemData?.mese;
  const valore = itemData?.Valore;

  if (!mk) return;

  const snapshot = (data.portfolioSnapshots || []).find((s) => s.mese === mk);
  const currentMk = monthKey(new Date().toISOString());
  
  if (mk === currentMk && !snapshot) {
    notify("Lo snapshot per questo mese verrà creato in automatico l'ultimo giorno dopo le 18:00.");
    return; 
  }

  setSnapshotMonth(mk);
  
  if (snapshot) {
    setSnapshotValue(String(snapshot.valore).replace(".", ","));
    setSnapshotNote(snapshot.note || "");
  } else if (valore != null) {
    setSnapshotValue(String(valore).replace(".", ","));
    setSnapshotNote("");
  } else {
    setSnapshotValue("");
    setSnapshotNote("");
  }
  setSnapshotModalOpen(true);
  };

  const saveManualSnapshot = () => {
    const valore = Number(String(snapshotValue || "").replace(/,/g, "."));
    if (!snapshotMonth || !Number.isFinite(valore) || valore <= 0) {
      notify("Inserisci un valore valido prima di salvare.");
      return;
    }
    update((d) => {
      if (!d.portfolioSnapshots) d.portfolioSnapshots = [];
      const existing = d.portfolioSnapshots.find((s) => s.mese === snapshotMonth);
      if (existing) {
        existing.valore = valore;
        existing.note = snapshotNote || `Valutazione manuale ${labelMk(snapshotMonth)}`;
      } else {
        d.portfolioSnapshots.push({ mese: snapshotMonth, valore, note: snapshotNote || `Valutazione manuale ${labelMk(snapshotMonth)}` });
      }
      d.portfolioSnapshots.sort((a, b) => a.mese.localeCompare(b.mese));
      return d;
    });
    notify(`Valutazione fine mese salvata per ${labelMk(snapshotMonth)}: ${eur(valore)}`);
    setSnapshotValue("");
    setSnapshotNote("");
    setSnapshotModalOpen(false);
  };

  const saveTrade = (t) => {
    update((d) => {
      if (!d.trades) d.trades = [];
      const i = d.trades.findIndex((x) => x.id === t.id);
      const prev = i >= 0 ? d.trades[i] : null;
      if (i >= 0) d.trades[i] = t; else d.trades.push(t);

      if ((t.tipo === "acquisto" || t.tipo === "vendita") && t.conto) {
        const asset = assets.find((a) => a.id === t.assetId);
        const catId = ensureInvestmentCategoryId(d);
        const note = t.tipo === "acquisto"
          ? `Acquisto ${asset?.nome || "strumento"}`
          : `Vendita ${asset?.nome || "strumento"}`;
        const isBuy = t.tipo === "acquisto";
        const txAmount = isBuy
          ? (t.quantita * t.prezzo) + (t.commissioni || 0)
          : (t.quantita * t.prezzo) - (t.commissioni || 0);
        let txId = t.linkedTxId || prev?.linkedTxId;
        if (txId) {
          const tx = (d.transactions || []).find((x) => x.id === txId);
          if (tx) {
            tx.tipo = isBuy ? "spesa" : "entrata";
            tx.importo = txAmount;
            tx.data = t.data;
            tx.categoria = catId;
            tx.conto = t.conto;
            tx.metodo = "Investimento";
            tx.note = note;
            tx.tags = ["investimento"];
          } else {
            txId = null;
          }
        }
        if (!txId) {
          const tx = { id: uid(), tipo: isBuy ? "spesa" : "entrata", importo: txAmount, data: t.data, categoria: catId, conto: t.conto, metodo: "Investimento", note, tags: ["investimento"] };
          if (!d.transactions) d.transactions = [];
          d.transactions.unshift(tx);
          t.linkedTxId = tx.id;
        } else {
          t.linkedTxId = txId;
        }
      } else if (prev?.linkedTxId) {
        d.transactions = (d.transactions || []).filter((x) => x.id !== prev.linkedTxId);
        delete t.linkedTxId;
      }
      if (d.transactions) d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      return d;
    });
    setTradeModal(null); 
    notify("Operazione registrata");
  };

  const setPrezzo = (assetId, q) => update((d) => { 
    if (!d.quotes) d.quotes = {}; 
    d.quotes[assetId] = { ...(d.quotes[assetId] || {}), ...q }; 
    return d; 
  });

  async function aggiornaTutti() {
    if (!pf?.aperte?.length || !marketData?.quote) return;
    setAggiornando(true);
    let ok = 0; 
    const falliti = [];
    for (const a of pf.aperte) {
      try {
        const q = await marketData.quote(a, { forza: true });
        setPrezzo(a.id, { prezzo: q.prezzo, variazione: q.variazione, valuta: q.valuta || a.valuta, fonte: q.fonte, aggiornato: new Date().toISOString() });
        update((d) => {
          if (!d.quotes) d.quotes = {};
          const st = d.quotes[a.id]?.storico || [];
          const oggi = todayISO();
          const senzaOggi = st.filter((p) => p.data !== oggi);
          d.quotes[a.id] = { ...(d.quotes[a.id] || {}), storico: [...senzaOggi, { data: oggi, prezzo: q.prezzo }].slice(-400) };
          return d;
        });
        ok++;
      } catch (e) { 
        falliti.push({ nome: a.nome, motivo: e.message, suggerimento: e.suggerimento }); 
      }
    }
    setAggiornando(false);
    setEsitoAgg(falliti.length ? { ok, falliti } : null);
    notify(falliti.length ? `${ok} aggiornati · ${falliti.length} non riusciti` : `${ok} quotazioni aggiornate`);
  };

  const plTone = (pf?.pl || 0) >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3 flex-wrap" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Investimenti</p>
          <h1 className="font-display text-xl sm:text-2xl md:text-3xl text-white mt-1">Il tuo portafoglio</h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[{ v: "portafoglio", l: "Portafoglio" }, { v: "mercato", l: "Mercato" }].map((t) => (
              <button key={t.v} onClick={() => setVista(t.v)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${vista === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{t.l}</button>
            ))}
          </div>
          {vista === "portafoglio" && (
            <BtnGhost onClick={aggiornaTutti} disabled={aggiornando || !pf?.aperte?.length}>
              {aggiornando ? <span className="flex items-center gap-2"><Spinner />Aggiorno…</span> : "⟳ Quotazioni"}
            </BtnGhost>
          )}
          <BtnPrimary onClick={() => setAssetModal({})}>+ Strumento</BtnPrimary>
        </div>
      </header>

      {vista === "mercato" ? (
        <MercatoPanel 
          assets={assets} 
          notify={notify} 
          onCaricaReady={(fn) => { 
            mercatoCaricaRef.current = fn; 
            if (needAutoCarica.current && fn) { 
              try { fn(); } catch {
                //ignoriamo le exception
              } 
              needAutoCarica.current = false; 
            } 
          }} 
          onAggiungi={(e, q) => {
            const esistente = assets.find((a) => (a.isin && a.isin === e.isin) || a.ticker === e.t);
            if (esistente) { setTradeModal({ assetId: esistente.id, prezzo: q?.prezzo || "" }); return; }
            setAssetModal({ 
              nome: e.nome, ticker: e.t, isin: e.isin, tipo: e.tipo || "ETF", mercato: e.borsa, valuta: e.val,
              area: AREE?.includes(e.area) ? e.area : "Globale", settore: SETTORI?.includes(e.settore) ? e.settore : "Diversificato",
              emittente: e.em, categoria: e.cat, sym_y: e.y || "", sym_s: e.s || "" 
            });
          }} 
        />
      ) : (
        <>
          {esitoAgg && (
            <Card className="p-4 mb-4 border-amber-400/25" hover={false}>
              <div className="flex items-start gap-3">
                <span className="text-lg">ⓘ</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-amber-200">{esitoAgg.ok > 0 ? `${esitoAgg.ok} quotazioni aggiornate, ` : ""}{esitoAgg.falliti.length} non recuperate</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{esitoAgg.falliti[0]?.nome}: {esitoAgg.falliti[0]?.suggerimento || esitoAgg.falliti[0]?.motivo}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Puoi sempre inserire il prezzo a mano dal dettaglio dello strumento.</p>
                </div>
                <button onClick={() => setEsitoAgg(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Chiudi</button>
              </div>
            </Card>
          )}

          {assets.length === 0 ? (
            <Card className="p-8 text-center" hover={false}>
              <span className="text-3xl">📈</span>
              <p className="text-white mt-2">Portafoglio vuoto</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">Qui compaiono gli strumenti che possiedi. Aggiungine uno e registra i tuoi acquisti, oppure guarda i prezzi nella scheda Mercato.</p>
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {(ETF_CATALOG || []).slice(0, 6).map((e) => (
                  <button 
                    key={e.t} 
                    onClick={() => setAssetModal({ nome: e.nome, ticker: e.t, isin: e.isin, tipo: "ETF", mercato: e.borsa, valuta: e.val, area: AREE?.includes(e.area) ? e.area : "Globale", settore: SETTORI?.includes(e.settore) ? e.settore : "Diversificato", emittente: e.em, categoria: e.cat, sym_y: e.y || "", sym_s: e.s || "" })}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    + {e.t}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <BtnPrimary onClick={() => setAssetModal({})}>+ Aggiungi strumento</BtnPrimary>
                <BtnGhost onClick={() => setVista("mercato")}>Vedi il mercato</BtnGhost>
              </div>
            </Card>
          ) : (
            <>
              {/* Hero Portafoglio */}
              <Card className="p-5 sm:p-6 mb-5 relative overflow-hidden" hover={false} delay={30}>
                <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full opacity-20 blur-3xl" style={{ background: (pf?.pl || 0) >= 0 ? "radial-gradient(circle,#34D399,transparent 70%)" : "radial-gradient(circle,#FB7185,transparent 70%)" }} />
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Valore del portafoglio</p>
                    <CountEur value={pf?.valore || 0} cls="font-display text-3xl sm:text-4xl md:text-5xl text-white tracking-tight tabular-nums" />
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Chip tone={(pf?.pl || 0) >= 0 ? "up" : "down"}>{(pf?.pl || 0) >= 0 ? "▲" : "▼"} {eur(Math.abs(pf?.pl || 0))} ({pct(pf?.plPct || 0)})</Chip>
                      {pf?.varGiorno !== 0 && <Chip tone={(pf?.varGiorno || 0) >= 0 ? "up" : "down"}>oggi {(pf?.varGiorno || 0) >= 0 ? "+" : "−"}{eur(Math.abs(pf?.varGiorno || 0))}</Chip>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Capitale investito</p>
                    <p className="font-display text-xl text-slate-200 tabular-nums">{eur(pf?.investito || 0)}</p>
                  </div>
                </div>
                {pf?.senzaPrezzi && (
                  <p className="text-[11px] text-amber-300/80 mt-3">Alcuni strumenti non hanno un prezzo: aggiorna le quotazioni o inseriscilo a mano dal dettaglio.</p>
                )}
              </Card>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
                {[
                  { l: "Profitto/perdita", v: eur(pf?.pl || 0), sub: pct(pf?.plPct || 0), tone: plTone },
                  { l: "Rendimento annuo", v: pf?.annuo != null ? pct(pf.annuo, 1) : "—", sub: "stima annualizzata", tone: (pf?.annuo ?? 0) >= 0 ? "text-teal-300" : "text-rose-300" },
                  { l: "Dividendi incassati", v: eur(pf?.dividendi || 0), sub: "totale storico", tone: "text-amber-300" },
                  { l: "Realizzato", v: eur(pf?.realizzato || 0), sub: "da vendite chiuse", tone: (pf?.realizzato || 0) >= 0 ? "text-emerald-300" : "text-rose-300" },
                ].map((c, i) => (
                  <Card key={c.l} className="p-4" delay={i * 45}>
                    <p className="text-xs text-slate-400">{c.l}</p>
                    <p className={`font-display text-lg sm:text-xl mt-1 tabular-nums ${c.tone}`}>{c.v}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{c.sub}</p>
                  </Card>
                ))}
              </div>

              {/* Grafici principali */}
              <div className="grid lg:grid-cols-5 gap-5 mb-5">
                <Card className="lg:col-span-3 p-5" hover={false} delay={160}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h2 className="font-display text-white">Capitale investito nel tempo</h2>
                    <div className="flex gap-1 bg-white/5 rounded-xl p-1 self-start sm:self-auto">
                      {[
                        { l: "6M", v: 6 }, 
                        { l: "1A", v: 12 }, 
                        { l: "3A", v: 36 }, 
                        { l: "Tutto", v: "all" }
                      ].map((r) => (
                        <button 
                          key={r.v} 
                          onClick={() => setChartRange(r.v)} 
                          className={`px-3 py-1 rounded-lg text-xs transition-all ${chartRange === r.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
                        >
                          {r.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-52 sm:h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={filteredTimeline || []} onClick={handleTimelineClick}>
                        <defs>
                          <linearGradient id="ginv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B9DF9" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#8B9DF9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" style={{ pointerEvents: 'none' }}/>
                        <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16}/>
                        <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={48}/>
                        <Tooltip content={<ChartTip />}/>
                        <Area type="monotone" dataKey="Investito" stroke="#A5B4FC" strokeWidth={2.5} fill="url(#ginv)" animationDuration={600} style={{ pointerEvents: "none" }}/>
                        <Line type="monotone" dataKey="Valore" stroke="#5EEAD4" strokeWidth={2.5} dot={false} animationDuration={600} connectNulls={false} style={{ pointerEvents: "none" }}/>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2">Clicca un punto del grafico per salvare il valore di mercato a fine mese.</p>
                  {(pf?.portfolioSnapshots || []).length > 0 && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      {pf.portfolioSnapshots.slice(-4).reverse().map((s) => (
                        <div key={s.mese} className="rounded-xl bg-white/5 border border-white/10 p-2">
                          <div className="flex items-center justify-between gap-3">
                            <span>{labelMk(s.mese)}</span>
                            <span className="font-semibold tabular-nums">{eur(s.valore)}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 truncate">{s.note || "Salvato dal grafico"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="lg:col-span-2 p-5" hover={false} delay={200}>
                  <h2 className="font-display text-white mb-3">Allocazione</h2>
                  <div className="flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch gap-3">
                    <div className="h-40 w-full sm:w-1/2 lg:w-full shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pf?.perAsset || []} dataKey="value" innerRadius="55%" outerRadius="85%" paddingAngle={3} animationDuration={1000}>
                            {(pf?.perAsset || []).map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}
                          </Pie>
                          {typeof ChartTip !== "undefined" && <Tooltip content={<ChartTip />} />}
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-1.5 text-xs flex-1">
                      {(pf?.perAsset || []).slice(0, 8).map((d) => (
                        <div key={d.name} className="flex items-center justify-between gap-2 min-w-0">
                          <span className="flex items-center gap-1.5 text-slate-300 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />{d.name}</span>
                          <span className="text-slate-400 tabular-nums shrink-0">{d.peso?.toFixed(0)}%</span>
                        </div>
                      ))}
                      {!pf?.perAsset?.length && <p className="text-slate-500 col-span-2">Nessuna posizione aperta.</p>}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Posizioni */}
              <Card className="p-4 sm:p-5 mb-5" hover={false} delay={240}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="font-display text-white">Posizioni</h2>
                  <BtnGhost onClick={() => setTradeModal({})} className="py-1.5! text-xs!">+ Operazione</BtnGhost>
                </div>
                <div className="space-y-2">
                  {(pf?.posizioni || []).map((p, i) => (
                    <button 
                      key={p.id} 
                      onClick={() => setDettaglio(p.id)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/6 hover:bg-white/[0.07] hover:border-white/15 transition-all"
                      style={{ animation: "fadeUp .4s both", animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    >
                      <span className="w-10 h-10 rounded-xl grid place-items-center text-[11px] font-semibold shrink-0" style={{ background: PALETTE[i % PALETTE.length] + "1f", border: `1px solid ${PALETTE[i % PALETTE.length]}33`, color: PALETTE[i % PALETTE.length] }}>
                        {(p.ticker || p.nome).slice(0, 4)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{p.nome}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {p.qta > 0 ? `${p.qta.toLocaleString("it-IT", { maximumFractionDigits: 4 })} quote · medio ${eur(p.medio)}` : "posizione chiusa"}
                          {p.prezzo ? ` · ultimo ${eur(p.prezzo)}` : " · prezzo mancante"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-white tabular-nums">{eur(p.valore)}</p>
                        {p.qta > 0 && p.prezzo > 0 && (
                          <p className={`text-[11px] tabular-nums ${p.pl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{p.pl >= 0 ? "+" : ""}{eur(p.pl)} · {pct(p.plPct, 1)}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Ripartizioni */}
              <div className="grid sm:grid-cols-3 gap-4">
                {[["Area geografica", pf?.perArea || []], ["Settore", pf?.perSettore || []], ["Valuta", pf?.perValuta || []]].map(([titolo, dati], k) => {
                  const tot = dati.reduce((s, d) => s + d.value, 0) || 1;
                  return (
                    <Card key={titolo} className="p-4" hover={false} delay={280 + k * 40}>
                      <p className="text-xs uppercase tracking-wider text-slate-500 mb-2.5">{titolo}</p>
                      <div className="space-y-2">
                        {dati.map((d) => (
                          <div key={d.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-300 truncate">{d.name}</span>
                              <span className="text-slate-400 tabular-nums">{((d.value / tot) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.value / tot) * 100}%`, background: d.fill }} />
                            </div>
                          </div>
                        ))}
                        {!dati.length && <p className="text-xs text-slate-500">Nessun dato.</p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Modali */}
      {typeof AssetModal !== "undefined" && <AssetModal open={!!assetModal} asset={assetModal} onClose={() => setAssetModal(null)} onSave={saveAsset} />}
      {typeof TradeModal !== "undefined" && <TradeModal open={!!tradeModal} trade={tradeModal} assets={assets} data={data} onClose={() => setTradeModal(null)} onSave={saveTrade} />}
      
      <Modal open={snapshotModalOpen} onClose={() => setSnapshotModalOpen(false)} title={snapshotModalOpen ? `Valutazione fine mese · ${labelMk(snapshotMonth)}` : "Valutazione fine mese"}>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Periodo</Label>
              <Select value={snapshotMonth} onChange={(e) => setSnapshotMonth(e.target.value)}>
                {(pf?.timeline?.length ? pf.timeline : [{ mese: monthKey(new Date()), label: labelMkShort(monthKey(new Date())) }]).map((row) => (
                  <option key={row.mese} value={row.mese}>{labelMk(row.mese)}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valore di fine mese</Label>
              <Input type="text" value={snapshotValue} onChange={(e) => setSnapshotValue(e.target.value)} placeholder="12345,67" autoFocus />
            </div>
          </div>
          <div>
            <Label>Nota</Label>
            <Input value={snapshotNote} onChange={(e) => setSnapshotNote(e.target.value)} placeholder="Es. valore report broker" />
          </div>
          <p className="text-[11px] text-slate-500">Inserisci un valore manuale o modifica quello esistente per questo mese. Il grafico usa la valutazione manuale quando presente.</p>
        </div>
        <div className="modal-actions flex justify-end gap-3 mt-5">
          <BtnGhost onClick={() => setSnapshotModalOpen(false)}>Annulla</BtnGhost>
          <BtnPrimary onClick={saveManualSnapshot}>Salva valutazione</BtnPrimary>
        </div>
      </Modal>

      {dettaglio && typeof AssetDetail !== "undefined" && (
        <AssetDetail 
          pos={pf?.posizioni?.find((p) => p.id === dettaglio)} 
          onClose={() => setDettaglio(null)}
          onEdit={(a) => { setAssetModal(a); setDettaglio(null); }}
          onTrade={(assetId) => setTradeModal({ assetId })}
          onPrezzo={(v) => setPrezzo(dettaglio, { prezzo: v, ts: new Date().toISOString(), fonte: "manuale" })}
          onDelete={(a) => setConfirmDlg({ msg: `Eliminare "${a.nome}" e le sue ${a.ops.length} operazioni?`, onOk: () => { update((d) => { d.assets = d.assets.filter((x) => x.id !== a.id); d.trades = d.trades.filter((t) => t.assetId !== a.id); delete d.quotes[a.id]; return d; }); setDettaglio(null); notify("Strumento eliminato"); } })}
          onDelTrade={(id) => update((d) => { d.trades = d.trades.filter((t) => t.id !== id); return d; })} 
        />
      )}
    </div>
  );
};

function AssetDetail({ pos, onClose, onEdit, onTrade, onPrezzo, onDelete, onDelTrade }) {
  const [prezzoManuale, setPrezzoManuale] = useState("");
  const [serie, setSerie] = useState(null);
  const [caricando, setCaricando] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!pos) return;

    // Avvolgiamo in setTimeout per evitare il Cascading Render
    const timer = setTimeout(() => {
      const salvato = pos.quote?.storico;
      if (salvato?.length > 1) { 
        setSerie(salvato); 
        return; 
      }

      setCaricando(true);
      if (typeof marketData !== "undefined" && marketData.history) {
        marketData.history(pos, 90)
          .then((s) => { if (vivo && s?.length) setSerie(s); })
          .catch(() => {})
          .finally(() => vivo && setCaricando(false));
      } else {
        setCaricando(false);
      }
    }, 0);

    return () => { 
      vivo = false; 
      clearTimeout(timer);
    };
  }, [pos]);

  if (!pos) return null;

  // Rimossa la variabile inutilizzata 'acquisti'
  const su = pos.pl >= 0;
  const linea = su ? "#34D399" : "#FB7185";

  return createPortal(
    <div className="fixed inset-0 z-75 overflow-y-auto" style={{ animation: "fadeIn .2s both" }}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-w-3xl mx-auto sm:my-8 rounded-none sm:rounded-3xl overflow-hidden border-0 sm:border border-white/10 min-h-full sm:min-h-0"
        style={{ background: "rgba(12,15,23,.98)", animation: "popIn .32s cubic-bezier(.22,1,.36,1) both", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{pos.tipo} · {pos.mercato || pos.valuta}</p>
              <h2 className="font-display text-xl sm:text-2xl text-white truncate">{pos.nome}</h2>
              <p className="text-xs text-slate-500">{[pos.ticker, pos.isin, pos.broker].filter(Boolean).join(" · ")}</p>
            </div>
            <button onClick={onClose} aria-label="Chiudi" className="w-9 h-9 shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-all hover:rotate-90">✕</button>
          </div>

          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <p className="font-display text-3xl text-white tabular-nums">{pos.prezzo ? eur(pos.prezzo) : "—"}</p>
              {pos.varGiorno != null && <span className={`text-sm ${pos.varGiorno >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(pos.varGiorno)} oggi</span>}
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-500">Valore posizione</p>
              <p className="font-display text-xl text-white tabular-nums">{eur(pos.valore)}</p>
              {pos.qta > 0 && pos.prezzo > 0 && <span className={`text-xs ${su ? "text-emerald-300" : "text-rose-300"}`}>{su ? "+" : ""}{eur(pos.pl)} · {pct(pos.plPct, 1)}</span>}
            </div>
          </div>

          {/* grafico andamento */}
          <div className="h-48 sm:h-56 rounded-2xl border border-white/6 bg-white/2 mb-4 p-2">
            {caricando ? (
              <div className="h-full grid place-items-center"><Spinner size={18} /></div>
            ) : serie?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie}>
                  <defs>
                    <linearGradient id="gass" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={linea} stopOpacity={0.35} /><stop offset="100%" stopColor={linea} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="data" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  {typeof ChartTip !== "undefined" && <Tooltip content={<ChartTip />} />}
                  <Area type="monotone" dataKey="prezzo" name="Prezzo" stroke={linea} strokeWidth={2} fill="url(#gass)" animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-center px-4">
                <div>
                  <p className="text-xs text-slate-500">Storico non disponibile senza un provider di quotazioni.</p>
                  <div className="flex gap-2 mt-2 justify-center">
                    <Input type="number" step="0.0001" placeholder="prezzo attuale" value={prezzoManuale} onChange={(e) => setPrezzoManuale(e.target.value)} className="w-32! py-1.5! text-xs!" />
                    <BtnGhost onClick={() => { const v = Number(prezzoManuale); if (v > 0) { onPrezzo(v); setPrezzoManuale(""); } }} className="py-1.5! text-xs!">Aggiorna</BtnGhost>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            {[
              { l: "Quote", v: (pos.qta || 0).toLocaleString("it-IT", { maximumFractionDigits: 4 }) },
              { l: "Prezzo medio", v: eur(pos.medio) },
              { l: "Investito", v: eur(pos.costo) },
              { l: "Commissioni", v: eur(pos.commissioni) },
            ].map((c) => (
              <div key={c.l} className="rounded-xl bg-white/4 border border-white/6 p-3">
                <p className="text-[10px] text-slate-500">{c.l}</p>
                <p className="text-sm text-white tabular-nums mt-0.5">{c.v}</p>
              </div>
            ))}
          </div>

          {(pos.area || pos.settore || pos.note) && (
            <div className="rounded-xl bg-white/3 border border-white/6 p-3 mb-4">
              <div className="flex flex-wrap gap-2 mb-1.5">
                {pos.area && <Chip>{pos.area}</Chip>}
                {pos.settore && <Chip>{pos.settore}</Chip>}
                {pos.valuta && <Chip>{pos.valuta}</Chip>}
              </div>
              {pos.note && <p className="text-xs text-slate-400 leading-relaxed">{pos.note}</p>}
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-slate-500">Storico operazioni</p>
            <BtnGhost onClick={() => onTrade(pos.id)} className="py-1.5! text-xs!">+ Operazione</BtnGhost>
          </div>
          <div className="divide-y divide-white/5 mb-4">
            {(pos.ops || []).slice().reverse().map((o) => (
              <div key={o.id} className="group flex items-center gap-3 py-2.5">
                <span className={`w-8 h-8 rounded-lg grid place-items-center text-xs shrink-0 ${o.tipo === "acquisto" ? "bg-emerald-400/15 text-emerald-300" : o.tipo === "vendita" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-300"}`}>
                  {o.tipo === "acquisto" ? "↓" : o.tipo === "vendita" ? "↑" : "€"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white capitalize">{o.tipo}</p>
                  <p className="text-[11px] text-slate-500">{typeof fmtDate !== "undefined" ? fmtDate(o.data) : o.data} · {(o.quantita || 0).toLocaleString("it-IT", { maximumFractionDigits: 4 })} × {eur(o.prezzo)}{o.commissioni ? ` · comm. ${eur(o.commissioni)}` : ""}</p>
                </div>
                <span className="text-sm text-slate-200 tabular-nums">{eur(o.quantita * o.prezzo)}</span>
                <button onClick={() => onDelTrade(o.id)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 text-xs text-slate-400 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-all">🗑</button>
              </div>
            ))}
            {!(pos.ops || []).length && <EmptyState text="Nessuna operazione registrata." />}
          </div>

          <div className="modal-actions flex flex-wrap items-center gap-2 pt-3 border-t border-white/6">
            <BtnGhost onClick={() => onEdit(pos)}>Modifica</BtnGhost>
            <button onClick={() => onDelete(pos)} className="text-xs text-rose-300/70 hover:text-rose-300 px-2 transition-colors">Elimina</button>
            <div className="flex-1" />
            <BtnPrimary onClick={() => onTrade(pos.id)}>+ Operazione</BtnPrimary>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---- Mercato: prezzi e andamento degli ETF anche senza possederli ---- */


function MercatoPanel({ assets, onAggiungi, notify, onCaricaReady }) {
  const [dati, setDati] = useState({});       // ticker → { prezzo, variazione, fonte, storico }
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [progresso, setProgresso] = useState(null);
  const [filtro, setFiltro] = useState("");
  
  const posseduti = useMemo(
    () => new Set((assets || []).map((a) => (a.isin || a.ticker || "").toUpperCase())),
    [assets]
  );

  const lista = useMemo(() => {
    const catalog = typeof ETF_CATALOG !== "undefined" ? ETF_CATALOG : [];
    const q = filtro.trim().toUpperCase();
    return catalog.filter(
      (e) =>
        !q ||
        e.t.includes(q) ||
        e.nome.toUpperCase().includes(q) ||
        e.em.toUpperCase().includes(q) ||
        e.cat.toUpperCase().includes(q)
    );
  }, [filtro]);

  const stop = useRef(false);

  const carica = useCallback(async () => {
    setCaricando(true); 
    setErrore(null); 
    stop.current = false;
    let ok = 0, falliti = 0; 
    let primoErrore = null;

    for (let i = 0; i < lista.length; i++) {
      if (stop.current) break;
      const e = lista[i];
      setProgresso({ fatti: i, totale: lista.length, corrente: e.t });
      const asset = { nome: e.nome, ticker: e.t, isin: e.isin, tipo: e.tipo || "ETF", valuta: e.val, mercato: e.borsa, sym_y: e.y, sym_s: e.s, cg: e.cg };
      
      try {
        if (typeof marketData !== "undefined" && marketData.quote) {
          const q = await marketData.quote(asset);
          
          setDati((prev) => ({
            ...prev,
            [e.t]: { ...q, storico: q.storico?.slice(-45) || null }
          }));
          ok++;
        }
      } catch (err) { 
        falliti++; 
        if (!primoErrore) primoErrore = err; 
      }
      
      await new Promise((r) => setTimeout(r, 110));
    }

    setCaricando(false); 
    setProgresso(null);

    if (!ok) {
      setErrore(primoErrore?.suggerimento || primoErrore?.message || "Nessuna fonte ha risposto.");
    } else {
      setErrore(falliti ? `${falliti} strumenti non hanno un prezzo: ${primoErrore?.message || "fonte non disponibile"}` : null);
      notify?.(`${ok} quotazioni caricate${falliti ? ` · ${falliti} senza prezzo` : ""}`);
    }
  }, [lista, notify]);

  useEffect(() => { 
    if (onCaricaReady) onCaricaReady(carica); 
  }, [onCaricaReady, carica]);

  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <Card className="p-4 mb-4" hover={false}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-white">Mercato</h2>
            <p className="text-xs text-slate-500 mt-0.5">I principali ETF europei con prezzo e andamento a 90 giorni. Aggiungine uno al portafoglio per registrare i tuoi acquisti.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Input placeholder="Filtra…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-32!" />
            {caricando ? (
              <BtnGhost onClick={() => { stop.current = true; }}>Interrompi</BtnGhost>
            ) : (
              <BtnPrimary onClick={carica}>⟳ Quotazioni ({lista.length})</BtnPrimary>
            )}
          </div>
        </div>
        {progresso && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Carico {progresso.corrente}…</span>
              <span className="tabular-nums">{progresso.fatti} / {progresso.totale}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-linear-to-r from-indigo-400 to-teal-300 transition-all duration-300" style={{ width: `${(progresso.fatti / progresso.totale) * 100}%` }} />
            </div>
          </div>
        )}
        {errore && (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3">
            <p className="text-xs text-amber-200">Nessuna quotazione recuperata.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{errore}</p>
            <p className="text-[11px] text-slate-500 mt-1">Controlla il ponte in Impostazioni: dev'essere un indirizzo che inoltra le richieste, con <code className="text-indigo-300">{"{url}"}</code> al posto della destinazione.</p>
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {lista.map((e, i) => {
          const q = dati[e.t];
          const su = (q?.variazione ?? 0) >= 0;
          const gia = posseduti.has((e.isin || e.t).toUpperCase());
          return (
            <Card key={e.t + e.borsa} className="p-4" delay={Math.min(i, 10) * 35}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-indigo-300">{e.t}</span>
                    {gia && <Chip tone="up">in portafoglio</Chip>}
                  </div>
                  <p className="text-sm text-white truncate mt-0.5">{e.nome}</p>
                  <p className="text-[11px] text-slate-500 truncate">{e.isin ? e.isin + " · " : ""}{e.borsa} · {e.em}</p>
                </div>
                {typeof Sparkline !== "undefined" && <Sparkline punti={q?.storico} />}
              </div>
              <div className="flex items-end justify-between gap-2 mt-3">
                <div>
                  {q ? (
                    <>
                      <p className="font-display text-lg text-white tabular-nums">{eur(q.prezzo)}</p>
                      <p className={`text-[11px] tabular-nums ${su ? "text-emerald-300" : "text-rose-300"}`}>
                        {q.variazione != null ? `${su ? "▲" : "▼"} ${Math.abs(q.variazione).toFixed(2)}%` : "—"}
                        <span className="text-slate-600 ml-1.5">{q.fonte}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-600">{caricando ? "…" : "prezzo non caricato"}</p>
                  )}
                </div>
                <BtnGhost onClick={() => onAggiungi(e, q)} className="py-1.5! text-xs!">{gia ? "Nuovo acquisto" : "+ Portafoglio"}</BtnGhost>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AssetModal({ open, asset, onClose, onSave }) {
  const [f, setF] = useState(null);
  const [ricerca, setRicerca] = useState("");

  useEffect(() => {
    if (!open) return;

    // Avvolgiamo le chiamate a setState in un setTimeout per evitare il Cascading Render
    const timer = setTimeout(() => {
      const a = asset || {};
      setRicerca("");
      setF({
        id: a.id,
        nome: a.nome || "",
        ticker: a.ticker || "",
        isin: a.isin || "",
        tipo: a.tipo || "ETF",
        mercato: a.mercato || "",
        valuta: a.valuta || "EUR",
        broker: a.broker || "",
        area: a.area || "Globale",
        settore: a.settore || "Diversificato",
        note: a.note || "",
        emittente: a.emittente || "",
        categoria: a.categoria || "",
        sym_y: a.sym_y || "",
        sym_s: a.sym_s || ""
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [open, asset]);

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const areeList = typeof AREE !== "undefined" ? AREE : [];
  const settoriList = typeof SETTORI !== "undefined" ? SETTORI : [];
  const assetTypesList = typeof ASSET_TYPES !== "undefined" ? ASSET_TYPES : ["ETF", "Azione", "Obbligazione", "Crypto"];

  /* ricerca sul catalogo interno */
  const risultati = ricerca.trim().length >= 2 && typeof marketData !== "undefined" ? marketData.cerca(ricerca) : [];

  const scegli = (e) => {
    setF((x) => ({
      ...x,
      nome: e.nome,
      ticker: e.t,
      isin: e.isin,
      mercato: e.borsa,
      valuta: e.val,
      area: areeList.includes(e.area) ? e.area : "Globale",
      settore: settoriList.includes(e.settore) ? e.settore : "Diversificato",
      tipo: e.tipo || "ETF",
      emittente: e.em,
      categoria: e.cat,
      sym_y: e.y || "",
      sym_s: e.s || ""
    }));
    setRicerca("");
  };

  return (
    <Modal open={open} onClose={onClose} title={f.id ? "Modifica strumento" : "Nuovo strumento"} wide>
      <div className="space-y-3">
        {!f.id && (
          <div className="relative">
            <Label>Cerca lo strumento</Label>
            <Input value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Scrivi VWCE, SWDA, CSSPX, EIMI, un ISIN o un nome…" autoFocus />
            {risultati.length > 0 && (
              <div className="absolute z-30 mt-1 w-full rounded-xl overflow-hidden border border-white/15 shadow-2xl max-h-60 overflow-y-auto" style={{ background: "rgba(14,17,26,.97)", backdropFilter: "blur(20px)", animation: "popIn .18s both" }}>
                {risultati.map((e) => (
                  <button key={e.t + e.borsa} onClick={() => scegli(e)} className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors border-b border-white/4 last:border-0">
                    <span className="text-[11px] font-semibold text-indigo-300 w-14 shrink-0 mt-0.5">{e.t}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm text-white block truncate">{e.nome}</span>
                      <span className="text-[11px] text-slate-500 block truncate">{e.isin ? e.isin + " · " : ""}{e.borsa} · {e.em}</span>
                    </span>
                    <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{e.val}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-1">Oppure compila i campi a mano qui sotto.</p>
          </div>
        )}
        <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="es. Vanguard FTSE All-World" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Ticker</Label><Input value={f.ticker} onChange={(e) => set("ticker", e.target.value.toUpperCase())} placeholder="es. VWCE.DE" /></div>
          <div><Label>ISIN</Label><Input value={f.isin} onChange={(e) => set("isin", e.target.value.toUpperCase())} placeholder="IE00BK5BQT80" /></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label>Tipo</Label><Select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{assetTypesList.map((t) => <option key={t}>{t}</option>)}</Select></div>
          <div><Label>Mercato</Label><Input value={f.mercato} onChange={(e) => set("mercato", e.target.value)} placeholder="Xetra" /></div>
          <div><Label>Valuta</Label><Select value={f.valuta} onChange={(e) => set("valuta", e.target.value)}>{["EUR", "USD", "GBP", "CHF"].map((v) => <option key={v}>{v}</option>)}</Select></div>
          <div><Label>Broker</Label><Input value={f.broker} onChange={(e) => set("broker", e.target.value)} placeholder="Fineco" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Area</Label><Select value={f.area} onChange={(e) => set("area", e.target.value)}>{areeList.map((a) => <option key={a}>{a}</option>)}</Select></div>
          <div><Label>Settore</Label><Select value={f.settore} onChange={(e) => set("settore", e.target.value)}>{settoriList.map((s2) => <option key={s2}>{s2}</option>)}</Select></div>
        </div>
        <div><Label>Note</Label><Input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="TER, politica dividendi, strategia…" /></div>
        {(f.emittente || f.categoria) && <p className="text-[11px] text-slate-500">{[f.emittente, f.categoria].filter(Boolean).join(" · ")}</p>}
        <p className="text-[11px] text-slate-500">Scegliendo dall'elenco, i simboli per le quotazioni vengono impostati da soli.</p>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={() => { if (!f.nome.trim()) return; onSave({ ...f, id: f.id || uid(), nome: f.nome.trim() }); }}>{f.id ? "Salva" : "Aggiungi"}</BtnPrimary>
      </div>
    </Modal>
  );
}

function TradeModal({ open, trade, assets, data, onClose, onSave }) {
  const [f, setF] = useState(null);

  useEffect(() => {
    if (!open) return;

    // Avvolgiamo setF in un setTimeout per evitare il render a cascata
    const timer = setTimeout(() => {
      const t = trade || {};
      const accs = data?.accounts || [];
      const assts = assets || [];

      setF({
        id: t.id,
        assetId: t.assetId || assts[0]?.id || "",
        data: t.data || (typeof todayISO !== "undefined" ? todayISO() : new Date().toISOString().slice(0, 10)),
        tipo: t.tipo || "acquisto",
        quantita: t.quantita ?? "",
        prezzo: t.prezzo ?? "",
        commissioni: t.commissioni ?? "",
        conto: t.conto || accs[0]?.id || "",
        note: t.note || ""
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [open, trade, assets, data?.accounts]);

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  
  const isBuy = f.tipo === "acquisto";
  const totale = isBuy
    ? (Number(f.quantita) || 0) * (Number(f.prezzo) || 0) + (Number(f.commissioni) || 0)
    : (Number(f.quantita) || 0) * (Number(f.prezzo) || 0) - (Number(f.commissioni) || 0);

  const accsList = data?.accounts || [];
  const assetsList = assets || [];

  return (
    <Modal open={open} onClose={onClose} title={f.id ? "Modifica operazione" : "Nuova operazione"}>
      <div className="space-y-3">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {[{ v: "acquisto", l: "Acquisto" }, { v: "vendita", l: "Vendita" }, { v: "dividendo", l: "Dividendo" }].map((t) => (
            <button key={t.v} onClick={() => set("tipo", t.v)} className={`flex-1 py-1.5 rounded-lg text-sm transition-all ${f.tipo === t.v ? "bg-white/15 text-white" : "text-slate-400"}`}>{t.l}</button>
          ))}
        </div>
        <div><Label>Strumento</Label><Select value={f.assetId} onChange={(e) => set("assetId", e.target.value)}>{assetsList.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{f.tipo === "dividendo" ? "Quote possedute" : "Quantità"}</Label><Input type="number" step="0.0001" value={f.quantita} onChange={(e) => set("quantita", e.target.value)} placeholder="10" autoFocus /></div>
          <div><Label>{f.tipo === "dividendo" ? "Dividendo per quota" : "Prezzo unitario"}</Label><Input type="number" step="0.0001" value={f.prezzo} onChange={(e) => set("prezzo", e.target.value)} placeholder="98,50" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Data</Label><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
          <div><Label>Conto</Label><Select value={f.conto} onChange={(e) => set("conto", e.target.value)}>{accsList.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Commissioni</Label><Input type="number" step="0.01" value={f.commissioni} onChange={(e) => set("commissioni", e.target.value)} placeholder="2,95" /></div>
          <div className="flex items-end"><p className="text-[11px] text-slate-500">Il conto selezionato verrà usato per registrare automaticamente il movimento di spesa.</p></div>
        </div>
        {totale > 0 && <p className="text-[11px] text-slate-500">Totale operazione: <b className="text-white">{typeof eur !== "undefined" ? eur(totale) : totale}</b></p>}
        <div><Label>Note</Label><Input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="PAC mensile…" /></div>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={() => { const q = Number(f.quantita), p = Number(f.prezzo); if (!(q > 0) || !(p >= 0) || !f.assetId) return; onSave({ ...f, id: f.id || uid(), quantita: q, prezzo: p, commissioni: Number(f.commissioni) || 0 }); }}>{f.id ? "Salva" : "Registra"}</BtnPrimary>
      </div>
    </Modal>
  );
}

