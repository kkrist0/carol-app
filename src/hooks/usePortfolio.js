import { PALETTE } from '../config/constants'; 
import { useMemo, useState } from 'react';
import { monthKey, labelMkShort, addMonthsMk } from '../utils/helpers';

export function usePortfolio(assets, trades, quotes, snapshots) {
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    const posizioni = (assets || []).map((a) => {
      const ops = (trades || []).filter((t) => t.assetId === a.id).sort((x, y) => x.data.localeCompare(y.data));
      let qta = 0, costo = 0, realizzato = 0, dividendi = 0, commissioni = 0;
      ops.forEach((t) => {
        commissioni += t.commissioni || 0;
        if (t.tipo === "acquisto") { costo += t.quantita * t.prezzo + (t.commissioni || 0); qta += t.quantita; }
        else if (t.tipo === "vendita") {
          const medio = qta ? costo / qta : 0;
          realizzato += t.quantita * (t.prezzo - medio) - (t.commissioni || 0);
          costo -= medio * t.quantita; qta -= t.quantita;
        } else if (t.tipo === "dividendo") dividendi += t.quantita * t.prezzo;
      });
      const q = (quotes || {})[a.id];
      const prezzo = q?.prezzo || 0;
      const valore = qta * prezzo;
      const medio = qta ? costo / qta : 0;
      const pl = prezzo ? valore - costo : 0;
      return { ...a, ops, qta, costo, medio, prezzo, valore, pl, plPct: costo ? (pl / costo) * 100 : 0, realizzato, dividendi, commissioni, varGiorno: q?.varGiorno ?? null, aggiornato: q?.ts, senzaPrezzo: !prezzo && qta > 0 };
    });
    const aperte = posizioni.filter((p) => p.qta > 0.0000001);
    const investito = aperte.reduce((s, p) => s + p.costo, 0);
    const valore = aperte.reduce((s, p) => s + p.valore, 0);
    const pl = aperte.reduce((s, p) => s + p.pl, 0);
    const dividendi = posizioni.reduce((s, p) => s + p.dividendi, 0);
    const realizzato = posizioni.reduce((s, p) => s + p.realizzato, 0);
    const varGiorno = aperte.reduce((s, p) => s + (p.varGiorno != null ? (p.valore * p.varGiorno) / 100 : 0), 0);

    const raggruppa = (campo) => {
      const m = {};
      aperte.forEach((p) => { const k = p[campo] || "Altro"; m[k] = (m[k] || 0) + p.valore; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value: Math.round(value), fill: PALETTE[i % PALETTE.length] }));
    };

    const priceHistoryByAsset = {};
    (assets || []).forEach((a) => {
      const storico = (quotes || {})[a.id]?.storico || [];
      priceHistoryByAsset[a.id] = storico.slice().sort((x, y) => x.data.localeCompare(y.data)).reduce((map, entry) => {
        const mk = monthKey(entry.data);
        map[mk] = entry.prezzo;
        return map;
      }, {});
    });
    const snapshotByMonth = (snapshots || []).reduce((map, s) => { if (s?.mese) map[s.mese] = s; return map; }, {});

    /* capitale investito e valore di mercato nel tempo, mese per mese */
    const tutte = [...(trades || [])].sort((a, b) => a.data.localeCompare(b.data));
    const timeline = [];
    if (tutte.length) {
      let mk = monthKey(tutte[0].data);
      const fine = monthKey(new Date());
      let cum = 0, i = 0;
      const holdings = {};
      while (mk <= fine && timeline.length < 180) {
        while (i < tutte.length && monthKey(tutte[i].data) <= mk) {
          const t = tutte[i];
          if (!holdings[t.assetId]) holdings[t.assetId] = { qta: 0, costo: 0 };
          const assetState = holdings[t.assetId];
          if (t.tipo === "acquisto") {
            assetState.qta += t.quantita;
            assetState.costo += t.quantita * t.prezzo + (t.commissioni || 0);
            cum += t.quantita * t.prezzo + (t.commissioni || 0);
          } else if (t.tipo === "vendita") {
            const medio = assetState.qta ? assetState.costo / assetState.qta : 0;
            assetState.qta -= t.quantita;
            assetState.costo -= medio * t.quantita;
            cum -= t.quantita * t.prezzo;
          }
          i++;
        }
        let valoreMk = 0;
        Object.entries(holdings).forEach(([assetId, state]) => {
          if (state.qta <= 0) return;
          const prezzoMk = priceHistoryByAsset[assetId]?.[mk];
          if (prezzoMk != null) valoreMk += state.qta * prezzoMk;
        });
        const snapshot = snapshotByMonth[mk];
        if (snapshot?.valore != null) {
          valoreMk = snapshot.valore;
        } else if (valoreMk === 0 && aperte.length && monthKey(new Date()) === mk) {
          valoreMk = valore;
        }
        timeline.push({ mese: mk, label: labelMkShort(mk), Investito: Math.round(cum), Valore: valoreMk != null ? Math.round(valoreMk) : null });
        mk = addMonthsMk(mk, 1);
      }
    }
    const primo = tutte.find((t) => t.tipo === "acquisto");
    const anni = primo ? Math.max(0.08, (now - Date.parse(primo.data + "T12:00")) / 31557600000) : 0;
    const twr = investito ? (pl / investito) * 100 : 0;
    const annuo = anni > 0.25 && investito ? (Math.pow(1 + pl / investito, 1 / anni) - 1) * 100 : null;

    return { posizioni, aperte, investito, valore, pl, plPct: investito ? (pl / investito) * 100 : 0, dividendi, realizzato, varGiorno,
      perArea: raggruppa("area"), perSettore: raggruppa("settore"), perValuta: raggruppa("valuta"),
      perAsset: aperte.map((p, i) => ({ name: p.nome, value: Math.round(p.valore), fill: PALETTE[i % PALETTE.length], peso: valore ? (p.valore / valore) * 100 : 0 })).sort((a, b) => b.value - a.value),
      timeline, twr, annuo, senzaPrezzi: aperte.some((p) => p.senzaPrezzo), portfolioSnapshots: snapshots || [] };
  }, [assets, trades, quotes, snapshots, now]);
}