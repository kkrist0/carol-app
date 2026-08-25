import { useMemo } from "react";
import { INFLAZIONE_DEFAULT, MESI, TFR_CONTRIBUTO, TFR_DIVISORE, TFR_RIVAL_BASE } from "../config/constants";
import { annoCorr, labelMkShort, mkOf } from "../utils/helpers";

export const tfrMensile = (lordoAnnuo) => (lordoAnnuo / TFR_DIVISORE - lordoAnnuo * TFR_CONTRIBUTO) / 12;
export const nettoTotale = (p) => (p.lordo || 0) + (p.bonus || 0) + (p.straordinari || 0) + (p.rimborsi || 0) + (p.premio || 0) + (p.tredicesima || 0) + (p.quattordicesima || 0) + (p.altre || 0) - (p.trattenute || 0);
export const quotaTfrAnnua = (ral) => (ral / 13.5) - ral * 0.005;

export function useCarrieraStats(data, anno) {
  return useMemo(() => {
    const jobs = data.jobs || [];
    const payslips = [...(data.payslips || [])].sort((a, b) => a.mese.localeCompare(b.mese));
    const tfrManuali = data.tfrEntries || [];
    const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));
    const annoStr = String(anno);

    /* --- serie mensile dell'anno scelto --- */
    const mesiAnno = MESI.map((label, m) => {
      const mk = mkOf(anno, m);
      const p = payslips.find((x) => x.mese === mk);
      return {
        mk, mese: label,
        Lordo: p ? Math.round((p.lordo || 0) * 100) / 100 : 0,
        Netto: p ? Math.round(nettoTotale(p) * 100) / 100 : 0,
        Base: p ? Math.round((p.netto || 0) * 100) / 100 : 0,
        Extra: p ? Math.round((nettoTotale(p) - (p.netto || 0)) * 100) / 100 : 0,
        busta: p || null,
        futuro: anno === new Date().getFullYear() && m > new Date().getMonth(),
      };
    });
    const conDati = mesiAnno.filter((x) => x.busta);
    const totLordo = conDati.reduce((s, x) => s + x.Lordo, 0);
    const totNetto = conDati.reduce((s, x) => s + x.Netto, 0);
    const mediaNetto = conDati.length ? totNetto / conDati.length : 0;
    const mediaLordo = conDati.length ? totLordo / conDati.length : 0;
    /* extra e prelievo fiscale stimato (lordo meno netto base) */
    const bustePeriodo = conDati.map((x) => x.busta);
    const totBonus = bustePeriodo.reduce((s, b) => s + (b.bonus || 0) + (b.premio || 0), 0);
    const mesiConBonus = bustePeriodo.filter((b) => (b.bonus || 0) + (b.premio || 0) > 0).length;
    const mediaBonus = mesiConBonus ? totBonus / mesiConBonus : 0;
    const totStraordinari = bustePeriodo.reduce((s, b) => s + (b.straordinari || 0), 0);
    const totRimborsi = bustePeriodo.reduce((s, b) => s + (b.rimborsi || 0), 0);
    const totTrattenute = bustePeriodo.reduce((s, b) => s + (b.trattenute || 0), 0);
    const nettoBase = bustePeriodo.reduce((s, b) => s + (b.netto || 0), 0);
    const tasseStimate = Math.max(0, totLordo - nettoBase);
    const aliquota = totLordo > 0 ? (tasseStimate / totLordo) * 100 : 0;

    /* --- confronto anno per anno --- */
    const perAnno = {};
    payslips.forEach((p) => {
      const y = p.mese.slice(0, 4);
      const a = (perAnno[y] = perAnno[y] || { anno: y, Lordo: 0, Netto: 0, mesi: 0 });
      a.Lordo += p.lordo || 0; a.Netto += nettoTotale(p); a.mesi++;
    });
    const anni = Object.values(perAnno)
      .map((a) => ({ ...a, Lordo: Math.round(a.Lordo * 100) / 100, Netto: Math.round(a.Netto * 100) / 100, mediaNetto: a.Netto / a.mesi }))
      .sort((a, b) => a.anno.localeCompare(b.anno));
    const idx = anni.findIndex((a) => a.anno === annoStr);
    const prec = idx > 0 ? anni[idx - 1] : null;
    const cur = anni[idx] || null;
    const crescita = cur && prec && prec.Netto ? ((cur.Netto - prec.Netto) / prec.Netto) * 100 : null;

    /* --- TFR: calcolato dalle buste paga, con override manuali --- */
    const tuttiMesi = [...new Set([...payslips.map((p) => p.mese), ...tfrManuali.map((t) => t.mese)])].sort();
    const tfrSerie = [];
    let cumulato = 0;
    tuttiMesi.forEach((mk) => {
      const manuale = tfrManuali.find((t) => t.mese === mk);
      const p = payslips.find((x) => x.mese === mk);
      const job = p ? jobById[p.jobId] : jobs[0];
      const baseAnnua = p?.ral > 0 ? p.ral : p ? (p.lordo || 0) * 12 : job?.ral || 0;
      const maturato = manuale?.manuale ? manuale.maturato
        : p?.tfr > 0 ? p.tfr                                   // valore scritto nella busta paga
        : Math.round(tfrMensile(baseAnnua) * 100) / 100;
      const riv = manuale?.rivalutazione ?? Math.round((cumulato * (TFR_RIVAL_BASE / 12)) * 100) / 100;
      const anticipo = manuale?.anticipo || 0;
      const liquidazione = manuale?.liquidazione || 0;
      cumulato = cumulato + maturato + riv - anticipo - liquidazione;
      tfrSerie.push({ mk, mese: labelMkShort(mk), maturato, rivalutazione: riv, anticipo, liquidazione, totale: Math.round(cumulato * 100) / 100, manuale: !!manuale?.manuale });
    });
    const tfrTotale = cumulato;
    const tfrAnno = tfrSerie.filter((t) => t.mk.startsWith(annoStr));
    const tfrMaturatoAnno = Math.round(tfrAnno.reduce((s, t) => s + t.maturato, 0) * 100) / 100;
    const tfrAnticipi = tfrSerie.reduce((s, t) => s + t.anticipo + t.liquidazione, 0);

    /* stima a fine anno in corso, sulla base della media mensile */
    const mediaTfrMese = tfrSerie.length ? tfrSerie.slice(-12).reduce((s, t) => s + t.maturato, 0) / Math.min(12, tfrSerie.length) : 0;
    const proiezione = Array.from({ length: 5 }, (_, i) => {
      const y = new Date().getFullYear() + i;
      return { anno: String(y), Stimato: Math.round(tfrTotale + mediaTfrMese * 12 * i * (1 + TFR_RIVAL_BASE) ) };
    });

    const anniDisponibili = [...new Set([...payslips.map((p) => +p.mese.slice(0, 4)), new Date().getFullYear()])].sort((a, b) => b - a);
    return { jobs, jobById, payslips, mesiAnno, conDati, totLordo, totNetto, mediaNetto, mediaLordo, totBonus, mediaBonus, totStraordinari, totRimborsi, totTrattenute, tasseStimate, aliquota, anni, cur, prec, crescita, tfrSerie, tfrTotale, tfrMaturatoAnno, tfrAnticipi, mediaTfrMese, proiezione, anniDisponibili, tfrAnno };
  }, [data, anno]);
};

export function useCareerStats(jobs, events, inflazione) {
  return useMemo(() => {
    const ordinati = [...(jobs || [])].sort((a, b) => (a.assunzione || "").localeCompare(b.assunzione || ""));
    const attuale = ordinati.filter((j) => !j.fine).pop() || ordinati[ordinati.length - 1] || null;
    const annoCorr = new Date().getFullYear();

    /* RAL per anno: parte dai contratti e applica gli aumenti registrati */
    const perAnno = {};
    ordinati.forEach((j) => {
      const y0 = +(j.assunzione || `${annoCorr}`).slice(0, 4);
      const y1 = j.fine ? +String(j.fine).slice(0, 4) : annoCorr;
      for (let y = y0; y <= y1; y++) perAnno[y] = { anno: String(y), RAL: j.ral, azienda: j.azienda, Netto: j.netto * (j.mensilita || 13), Bonus: 0 };
    });
    (events || []).forEach((e) => {
      const y = +String(e.data || "").slice(0, 4);
      if (!y) return;
      if (!perAnno[y]) return;
      if (e.tipo === "aumento" && e.ralDopo) {
        for (let k = y; k <= annoCorr; k++) if (perAnno[k]) perAnno[k].RAL = e.ralDopo;
      } else perAnno[y].Bonus += e.importo;
    });
    const serie = Object.values(perAnno).sort((a, b) => a.anno.localeCompare(b.anno))
      .map((r) => ({ ...r, RAL: Math.round(r.RAL), Netto: Math.round(r.Netto), Bonus: Math.round(r.Bonus), Totale: Math.round(r.RAL + r.Bonus) }));

    const primo = serie[0], ultimo = serie[serie.length - 1];
    const crescitaTot = primo && ultimo && primo.RAL ? ((ultimo.RAL - primo.RAL) / primo.RAL) * 100 : 0;
    const anni = serie.length > 1 ? serie.length - 1 : 0;
    const cagr = primo?.RAL && ultimo?.RAL && anni ? (Math.pow(ultimo.RAL / primo.RAL, 1 / anni) - 1) * 100 : 0;
    const precedente = serie[serie.length - 2];
    const varAnno = precedente?.RAL ? ((ultimo.RAL - precedente.RAL) / precedente.RAL) * 100 : 0;
    const bonusAnno = ultimo?.Bonus || 0;
    const aumenti = (events || []).filter((e) => e.tipo === "aumento").sort((a, b) => b.data.localeCompare(a.data));
    /* la RAL da usare è quella aggiornata dagli aumenti, non quella del contratto originale */
    const ralCorrente = ultimo?.RAL || attuale?.ral || 0;
    const jobsAggiornati = (jobs || []).map((j) => (attuale && j.id === attuale.id ? { ...j, ral: ralCorrente } : j));
    const tfr = simulaTfr(jobsAggiornati, inflazione);
    const tfrOggi = tfr.length ? tfr[tfr.length - 1].Montante : 0;
    /* proiezione a 5 anni con la RAL attuale */
    const proiezione = [...tfr];
    if (attuale) {
      let m = tfrOggi;
      for (let i = 1; i <= 5; i++) {
        const q = quotaTfrAnnua(ralCorrente);
        m = m * (1 + (1.5 + 0.75 * inflazione) / 100) + q;
        proiezione.push({ anno: String(annoCorr + i), Quota: Math.round(q), Montante: Math.round(m), stima: true });
      }
    }
    const mesiTotali = ordinati.reduce((s, j) => {
      const a = new Date(j.assunzione + "T12:00"), b = j.fine ? new Date(j.fine + "T12:00") : new Date();
      return s + Math.max(0, (b - a) / 86400000 / 30.44);
    }, 0);
    return { ordinati, attuale, ralCorrente, serie, crescitaTot, cagr, varAnno, bonusAnno, aumenti, tfr, tfrOggi, proiezione, anniCarriera: mesiTotali / 12 };
  }, [jobs, events, inflazione]);
};

function simulaTfr(jobs, inflazione = INFLAZIONE_DEFAULT, finoAnno = new Date().getFullYear()) {
  const attivi = (jobs || []).filter((j) => j.assunzione && j.tfrInAzienda !== false);
  if (!attivi.length) return [];
  const primoAnno = attivi.length ? Math.min(...attivi.map((j) => +String(j.assunzione || annoCorr).slice(0, 4))) : annoCorr;
  const righe = [];
  let montante = 0;
  for (let y = primoAnno; y <= finoAnno; y++) {
    /* rivalutazione sul montante di fine anno precedente */
    const tassoRival = 1.5 + 0.75 * inflazione;
    const rivalutazione = montante * (tassoRival / 100);
    let quota = 0;
    attivi.forEach((j) => {
      const inizio = new Date(j.assunzione + "T12:00");
      const fine = j.fine ? new Date(j.fine + "T12:00") : null;
      const gen = new Date(y, 0, 1), dic = new Date(y, 11, 31);
      const da = inizio > gen ? inizio : gen;
      const a = fine && fine < dic ? fine : dic;
      if (a < da) return;
      const mesi = Math.max(0, Math.round((a - da) / 86400000) / 30.44);
      quota += quotaTfrAnnua(j.ral) * Math.min(12, mesi) / 12;
    });
    montante += quota + rivalutazione;
    righe.push({ anno: String(y), Quota: Math.round(quota), Rivalutazione: Math.round(rivalutazione), Montante: Math.round(montante) });
  }
  return righe;
}