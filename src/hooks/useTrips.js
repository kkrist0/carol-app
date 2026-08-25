import { useMemo } from "react";
import { countryRegion, haversine } from "../services/geo";
import { HOME_BASE } from "../config/constants";
import { dayCount } from "../utils/helpers";

export function useTripStats(trips, expenses) {
  return useMemo(() => {
    const speseByTrip = {};
    expenses.forEach((e) => { speseByTrip[e.tripId] = (speseByTrip[e.tripId] || 0) + e.importo; });
    const paesi = new Set(), citta = new Set(), continenti = new Set();
    let giorni = 0, km = 0;
    const perPaese = {}, perAnno = {}, perMese = {};
    trips.forEach((t) => {
      if (t.paese) { paesi.add(t.paese); const r = countryRegion(t.paese); if (r) continenti.add(r); }
      if (t.citta) citta.add(t.citta + "·" + t.paese);
      giorni += dayCount(t.partenza, t.ritorno);
      if (t.lat || t.lon) km += haversine(HOME_BASE, [t.lat, t.lon]) * 2;
      if (t.paese) { const p = perPaese[t.paese] || (perPaese[t.paese] = { n: 0, spesa: 0, ultima: "", citta: new Set() }); p.n++; p.spesa += speseByTrip[t.id] || 0; if (t.partenza > p.ultima) p.ultima = t.partenza; if (t.citta) p.citta.add(t.citta); }
      if (t.partenza) { const y = t.partenza.slice(0, 4), m = +t.partenza.slice(5, 7) - 1; perAnno[y] = (perAnno[y] || 0) + 1; perMese[m] = (perMese[m] || 0) + 1; }
    });
    const spesaTot = Object.values(speseByTrip).reduce((s, v) => s + v, 0);
    const top = (o) => Object.entries(o).sort((a, b) => (b[1].n ?? b[1]) - (a[1].n ?? a[1]))[0];
    const cittaCount = {};
    trips.forEach((t) => { if (t.citta) cittaCount[t.citta] = (cittaCount[t.citta] || 0) + 1; });
    const nVoli = expenses.filter((e) => e.categoria === "volo").length;
    const nHotel = expenses.filter((e) => e.categoria === "hotel").length;
    return {
      speseByTrip, spesaTot, paesi: paesi.size, citta: citta.size, continenti: continenti.size,
      giorni, km, perPaese, nViaggi: trips.length,
      mediaViaggio: trips.length ? spesaTot / trips.length : 0,
      mediaGiorno: giorni ? spesaTot / giorni : 0,
      topPaese: top(perPaese), topCitta: Object.entries(cittaCount).sort((a, b) => b[1] - a[1])[0],
      topAnno: Object.entries(perAnno).sort((a, b) => b[1] - a[1])[0],
      topMese: Object.entries(perMese).sort((a, b) => b[1] - a[1])[0],
      nVoli, nHotel,
    };
  }, [trips, expenses]);
}