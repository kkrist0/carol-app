import { ACCOUNT_ICON_BY_TYPE,STORAGE_KEY } from '../config/constants';
import { n, s } from '../utils/helpers';
import { storage } from './storage';
import { createClient } from '@supabase/supabase-js';

const SHEET_SCHEMA = {
  transactions: {
    sheet: "Movimenti",
    headers: ["ID", "Data", "Tipo", "Categoria", "Sottocategoria", "Importo", "Conto", "ContoDestinazione", "Metodo", "Descrizione", "Tag", "Gruppo", "EliminatoIl"],
    pack: (st) => st.transactions.map((t) => [t.id, t.data, t.tipo, s(t.categoria), s(t.sottocategoria), t.importo, s(t.conto), s(t.contoDest), s(t.metodo), s(t.note), (t.tags || []).join("|"), s(t.gruppo), s(t.deletedAt)]),
    unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => {
      const t = { id: s(r[0]), data: s(r[1]).slice(0, 10), tipo: s(r[2]) || "spesa", categoria: s(r[3]) || null, sottocategoria: s(r[4]), importo: n(r[5]), conto: s(r[6]), contoDest: s(r[7]) || undefined, metodo: s(r[8]), note: s(r[9]), tags: s(r[10]) ? s(r[10]).split("|").filter(Boolean) : [], gruppo: s(r[11]) || undefined };
      if (s(r[12])) t.deletedAt = s(r[12]);
      return t;
    }),
  },
  accounts: {
    sheet: "Conti",
    headers: ["ID", "Nome", "Tipo", "Icona", "Colore", "SaldoIniziale"],
    pack: (st) => st.accounts.map((a) => [a.id, a.nome, a.tipo, a.icona, a.colore, a.saldoIniziale]),
    unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), nome: s(r[1]), tipo: s(r[2]) || "Altro", icona: s(r[3]) || "💼", colore: s(r[4]) || "#8B9DF9", saldoIniziale: n(r[5]) })),
  },
  accountTypes: {
    sheet: "TipiConto",
    headers: ["Tipo", "Icona"],
    pack: (st) => (st.accountTypes || []).map((a) => [a.tipo, a.icona || ""]),
    unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ tipo: s(r[0]), icona: s(r[1]) || ACCOUNT_ICON_BY_TYPE[s(r[0])] || "💼" })),
  },
  categories: {
    sheet: "Categorie",
    headers: ["ID", "Nome", "Gruppo", "Icona", "Colore", "Sottocategorie", "Ordine"],
    pack: (st) => st.categories.map((c) => [c.id, c.nome, c.gruppo, c.icona, c.colore, (c.sottocategorie || []).join("|"), c.ordine]),
    unpack: (rows) => rows.filter((r) => s(r[0])).map((r, i) => ({ id: s(r[0]), nome: s(r[1]), gruppo: s(r[2]) || "Wants", icona: s(r[3]) || "✨", colore: s(r[4]) || "#8B9DF9", sottocategorie: s(r[5]) ? s(r[5]).split("|").filter(Boolean) : [], ordine: r[6] === "" || r[6] == null ? i : n(r[6]) })),
  },
  budgets: {
    sheet: "Budget",
    headers: ["ID", "Categoria", "BudgetMensile"],
    pack: (st) => Object.entries(st.budgets || {}).map(([k, v]) => [k, k, v]),
    unpack: (rows) => { const o = {}; rows.filter((r) => s(r[0])).forEach((r) => { const v = n(r[2]); if (v > 0) o[s(r[0])] = v; }); return o; },
  },
  goals: {
    sheet: "Obiettivi",
    headers: ["ID", "Nome", "Target", "Salvato", "Colore"],
    pack: (st) => (st.goals || []).map((g) => [g.id, g.nome, g.target, g.salvato, g.colore]),
    unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), nome: s(r[1]), target: n(r[2]), salvato: n(r[3]), colore: s(r[4]) || "#5EEAD4" })),
  },
  groups: {
    sheet: "Gruppi",
    headers: ["Nome"],
    pack: (st) => (st.groups || []).map((g) => [g]),
    unpack: (rows) => rows.map((r) => s(r[0])).filter(Boolean),
  },
};

SHEET_SCHEMA.trips = {
  sheet: "Viaggi",
  headers: ["ID", "Nome", "Paese", "Citta", "Lat", "Lon", "Partenza", "Ritorno", "Persone", "Descrizione", "Colore", "Icona", "Copertina", "Foto", "BudgetPrevisto", "Valuta", "SyncFinanza", "Note"],
  pack: (st) => (st.trips || []).map((t) => [t.id, t.nome, t.paese, t.citta, t.lat, t.lon, t.partenza, t.ritorno, t.persone, s(t.descrizione), t.colore, t.icona, s(t.cover), (t.foto || []).join("|"), t.budget, s(t.valuta) || "EUR", t.syncFinanza ? "SI" : "NO", s(t.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({
    id: s(r[0]), nome: s(r[1]), paese: s(r[2]), citta: s(r[3]), lat: n(r[4]), lon: n(r[5]),
    partenza: s(r[6]).slice(0, 10), ritorno: s(r[7]).slice(0, 10), persone: n(r[8]) || 1,
    descrizione: s(r[9]), colore: s(r[10]) || "#8B9DF9", icona: s(r[11]) || "✈️", cover: s(r[12]),
    foto: s(r[13]) ? s(r[13]).split("|").filter(Boolean) : [], budget: n(r[14]), valuta: s(r[15]) || "EUR",
    syncFinanza: s(r[16]).toUpperCase() === "SI", note: s(r[17]),
  })),
};
SHEET_SCHEMA.tripExpenses = {
  sheet: "SpeseViaggio",
  headers: ["ID", "ViaggioID", "Data", "Categoria", "Importo", "Descrizione", "Metodo", "Conto", "Note", "Ricevuta"],
  pack: (st) => (st.tripExpenses || []).map((e) => [e.id, e.tripId, e.data, e.categoria, e.importo, s(e.descrizione), s(e.metodo), s(e.conto), s(e.note), s(e.ricevuta)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), tripId: s(r[1]), data: s(r[2]).slice(0, 10), categoria: s(r[3]) || "altro", importo: n(r[4]), descrizione: s(r[5]), metodo: s(r[6]) || "Carta", conto: s(r[7]), note: s(r[8]), ricevuta: s(r[9]) })),
};
SHEET_SCHEMA.wishlist = {
  sheet: "Wishlist",
  headers: ["ID", "Nome", "Paese", "Citta", "Lat", "Lon", "Priorita", "CostoStimato", "Note", "Link", "Foto"],
  pack: (st) => (st.wishlist || []).map((w) => [w.id, w.nome, w.paese, s(w.citta), w.lat, w.lon, w.priorita, w.costo, s(w.note), s(w.link), s(w.foto)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), nome: s(r[1]), paese: s(r[2]), citta: s(r[3]), lat: n(r[4]), lon: n(r[5]), priorita: s(r[6]) || "media", costo: n(r[7]), note: s(r[8]), link: s(r[9]), foto: s(r[10]) })),
};
SHEET_SCHEMA.jobs = {
  sheet: "Lavoro",
  headers: ["ID", "Azienda", "Ruolo", "CCNL", "Livello", "Assunzione", "Fine", "RAL", "Mensilita", "NettoMensile", "LordoMensile", "TfrInAzienda", "Note"],
  pack: (st) => (st.jobs || []).map((j) => [j.id, j.azienda, j.ruolo, s(j.ccnl), s(j.livello), j.assunzione, s(j.fine), j.ral, j.mensilita, j.netto, j.lordo, j.tfrInAzienda ? "SI" : "NO", s(j.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({
    id: s(r[0]), azienda: s(r[1]), ruolo: s(r[2]), ccnl: s(r[3]), livello: s(r[4]),
    assunzione: s(r[5]).slice(0, 10), fine: s(r[6]).slice(0, 10), ral: n(r[7]), mensilita: n(r[8]) || 13,
    netto: n(r[9]), lordo: n(r[10]), tfrInAzienda: s(r[11]).toUpperCase() !== "NO", note: s(r[12]),
  })),
};
SHEET_SCHEMA.salaryEvents = {
  sheet: "Retribuzioni",
  headers: ["ID", "LavoroID", "Data", "Tipo", "Importo", "RALDopo", "Descrizione"],
  pack: (st) => (st.salaryEvents || []).map((e) => [e.id, s(e.jobId), e.data, e.tipo, e.importo, e.ralDopo || "", s(e.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), jobId: s(r[1]), data: s(r[2]).slice(0, 10), tipo: s(r[3]) || "bonus", importo: n(r[4]), ralDopo: n(r[5]), note: s(r[6]) })),
};
SHEET_SCHEMA.assets = {
  sheet: "Investimenti",
  headers: ["ID", "Nome", "Ticker", "ISIN", "Tipo", "Mercato", "Valuta", "Broker", "Area", "Settore", "Note"],
  pack: (st) => (st.assets || []).map((a) => [a.id, a.nome, a.ticker, s(a.isin), a.tipo || "ETF", s(a.mercato), a.valuta || "EUR", s(a.broker), s(a.area), s(a.settore), s(a.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), nome: s(r[1]), ticker: s(r[2]).toUpperCase(), isin: s(r[3]).toUpperCase(), tipo: s(r[4]) || "ETF", mercato: s(r[5]), valuta: s(r[6]) || "EUR", broker: s(r[7]), area: s(r[8]), settore: s(r[9]), note: s(r[10]) })),
};
SHEET_SCHEMA.trades = {
  sheet: "Operazioni",
  headers: ["ID", "AssetID", "Data", "Tipo", "Quantita", "Prezzo", "Commissioni", "Note"],
  pack: (st) => (st.trades || []).map((t) => [t.id, t.assetId, t.data, t.tipo, t.quantita, t.prezzo, t.commissioni || 0, s(t.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), assetId: s(r[1]), data: s(r[2]).slice(0, 10), tipo: s(r[3]) || "acquisto", quantita: n(r[4]), prezzo: n(r[5]), commissioni: n(r[6]), note: s(r[7]) })),
};
SHEET_SCHEMA.quotes = {
  sheet: "Quotazioni",
  headers: ["AssetID", "Prezzo", "Variazione", "Aggiornato", "Fonte"],
  pack: (st) => Object.entries(st.quotes || {}).map(([k, q]) => [k, q.prezzo, q.varGiorno ?? "", q.ts || "", q.fonte || "manuale"]),
  unpack: (rows) => { const o = {}; rows.filter((r) => s(r[0])).forEach((r) => { o[s(r[0])] = { prezzo: n(r[1]), varGiorno: r[2] === "" ? null : n(r[2]), ts: s(r[3]), fonte: s(r[4]) || "manuale" }; }); return o; },
};
SHEET_SCHEMA.portfolioSnapshots = {
  sheet: "StoricoInvestimenti",
  headers: ["Mese", "Valore", "Note"],
  pack: (st) => (st.portfolioSnapshots || []).map((s) => [s.mese, s.valore || 0, s.note || ""]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ mese: s(r[0]), valore: n(r[1]), note: s(r[2]) })),
};
SHEET_SCHEMA.payslips = {
  sheet: "Buste paga",
  headers: ["ID", "LavoroID", "Mese", "RALPeriodo", "Lordo", "Netto", "Bonus", "Straordinari", "Rimborsi", "Premio", "Tredicesima", "Quattordicesima", "AltreCompetenze", "Trattenute", "TFRMese", "Generata", "Cedolino", "CedolinoNome", "Note", "DriveFileId", "DataCaricamento"],
  pack: (st) => (st.payslips || []).map((p) => [p.id, s(p.jobId), p.mese, p.ral, p.lordo, p.netto, p.bonus, p.straordinari, p.rimborsi, p.premio, p.tredicesima, p.quattordicesima, p.altre, p.trattenute, p.tfr, p.auto ? "SI" : "NO", s(p.cedolino?.url), s(p.cedolino?.nome), s(p.note), s(p.cedolino?.driveFileId), s(p.cedolino?.dataCaricamento)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => {
    const url = s(r[16]), nome = s(r[17]);
    return {
      id: s(r[0]), jobId: s(r[1]), mese: s(r[2]).slice(0, 7), ral: n(r[3]), lordo: n(r[4]), netto: n(r[5]),
      bonus: n(r[6]), straordinari: n(r[7]), rimborsi: n(r[8]), premio: n(r[9]),
      tredicesima: n(r[10]), quattordicesima: n(r[11]), altre: n(r[12]), trattenute: n(r[13]),
      tfr: n(r[14]), auto: s(r[15]).toUpperCase() === "SI",
      cedolino: (() => {
        const driveId = s(r[19]);
        if (driveId) return { tipo: "drive", driveFileId: driveId, nome: nome || "cedolino", url, dataCaricamento: s(r[20]) };
        return url || nome ? { tipo: url ? "link" : "file", url, nome: nome || "cedolino" } : null;
      })(),
      note: s(r[18]),
    };
  }),
};
SHEET_SCHEMA.documenti = {
  sheet: "Documenti",
  headers: ["ID", "Tipo", "Titolo", "NomeFile", "DriveFileId", "Cartella", "Anno", "Mese", "DataCaricamento", "Dimensione", "Mime", "Collegato", "Note"],
  pack: (st) => (st.documenti || []).map((d) => [d.id, d.tipo, s(d.titolo), d.nomeFile, d.driveFileId, s(d.cartella), s(d.anno), s(d.mese), s(d.dataCaricamento), d.dimensione, s(d.mime), s(d.collegatoA), s(d.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({
    id: s(r[0]), tipo: s(r[1]) || "altro", titolo: s(r[2]), nomeFile: s(r[3]), driveFileId: s(r[4]),
    cartella: s(r[5]), anno: s(r[6]), mese: s(r[7]), dataCaricamento: s(r[8]),
    dimensione: n(r[9]), mime: s(r[10]), collegatoA: s(r[11]), note: s(r[12]),
  })),
};
SHEET_SCHEMA.tfrEntries = {
  sheet: "TFR",
  headers: ["ID", "Mese", "Maturato", "Rivalutazione", "Anticipo", "Liquidazione", "Manuale", "Note"],
  pack: (st) => (st.tfrEntries || []).map((t) => [t.id, t.mese, t.maturato, t.rivalutazione, t.anticipo, t.liquidazione, t.manuale ? "SI" : "NO", s(t.note)]),
  unpack: (rows) => rows.filter((r) => s(r[0])).map((r) => ({ id: s(r[0]), mese: s(r[1]).slice(0, 7), maturato: n(r[2]), rivalutazione: n(r[3]), anticipo: n(r[4]), liquidazione: n(r[5]), manuale: s(r[6]).toUpperCase() === "SI", note: s(r[7]) })),
};

export class SyncError extends Error {
  constructor(message, { retriable = true, hint = "" } = {}) { super(message); this.name = "SyncError"; this.retriable = retriable; this.hint = hint; }
}

const googleSheetsService = {
  /** Chiamata all'endpoint Apps Script. text/plain evita il preflight CORS. */
  async call(url, payload, { timeout = 20000 } = {}) {
    if (!url || !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      throw new SyncError("URL dell'app web non valido.", { retriable: false, hint: "Deve iniziare con https://script.google.com/macros/s/…" });
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new SyncError("Nessuna connessione a internet.", { hint: "Le modifiche restano salvate in locale e verranno inviate al ritorno online." });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(url, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new SyncError("Tempo scaduto: il foglio non ha risposto in tempo.", { hint: "Riprova tra qualche istante." });
      throw new SyncError("Impossibile raggiungere il foglio.", { hint: "Verifica la connessione e che l'app web sia pubblicata per \"Chiunque\"." });
    }
    clearTimeout(timer);
    if (res.status === 401 || res.status === 403) throw new SyncError("Accesso negato dallo script.", { retriable: false, hint: "Ripubblica l'app web con accesso \"Chiunque\" e verifica il token." });
    if (res.status === 404) throw new SyncError("Endpoint non trovato.", { retriable: false, hint: "Controlla l'URL: forse lo script è stato ripubblicato con un nuovo indirizzo." });
    if (res.status === 429) throw new SyncError("Troppe richieste: limite di Google raggiunto.", { hint: "Attendi un minuto e riprova." });
    if (!res.ok) throw new SyncError(`Errore del server (${res.status}).`);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new SyncError("Risposta non valida dallo script.", { retriable: false, hint: "Di solito significa che l'app web chiede il login: ripubblicala con accesso \"Chiunque\"." }); }
    if (json.ok === false) throw new SyncError(json.error || "Lo script ha segnalato un errore.", { retriable: false, hint: json.hint || "" });
    return json;
  },
  read: (cfg) => googleSheetsService.call(cfg.url, { action: "read", token: cfg.token, sheets: SCHEMA_KEYS.map((k) => SHEET_SCHEMA[k].sheet) }),
  write: (cfg, sheets) => googleSheetsService.call(cfg.url, { action: "write", token: cfg.token, sheets }, { timeout: 30000 }),
  ping: (cfg) => googleSheetsService.call(cfg.url, { action: "ping", token: cfg.token }, { timeout: 12000 }),
};
class DataProvider {
  get id() { return "abstract"; }
  async read() { throw new Error("not implemented"); }
  async write() { throw new Error("not implemented"); } // <-- Errore _state risolto
  async ping() { throw new Error("not implemented"); }
}

class LocalProvider extends DataProvider {
  get id() { return "local"; }
  async read() { 
    try { 
      const r = await storage.get(STORAGE_KEY); // <-- window rimosso
      return r?.value ? JSON.parse(r.value) : null; 
    } catch { 
      return null; 
    } 
  }
  async write(state) { 
    await storage.set(STORAGE_KEY, JSON.stringify(state)); // <-- window rimosso
    return true; 
  }
  async ping() { return true; }
}
class GoogleSheetsProvider extends DataProvider {
  constructor(cfg) { super(); this.cfg = cfg; }
  get id() { return "sheets"; }
  async ping() { const r = await googleSheetsService.ping(this.cfg); return { ok: true, title: r.title || "" }; }
  /** @returns {Promise<AppState|null>} null se il foglio è ancora vuoto */
  async read() {
    const res = await googleSheetsService.read(this.cfg);
    const sheets = res.sheets || {};
    const out = {};
    let totalRows = 0;
    SCHEMA_KEYS.forEach((k) => {
      const def = SHEET_SCHEMA[k];
      const raw = sheets[def.sheet];
      /* Foglio ASSENTE ≠ foglio vuoto: se manca del tutto (per esempio perché è una
         sezione nuova non ancora inviata) la chiave viene omessa, così il successivo
         merge non azzera i dati che esistono solo in locale. */
      if (raw == null) return;
      const body = raw.length && String(raw[0][0]).toLowerCase() === String(def.headers[0]).toLowerCase() ? raw.slice(1) : raw;
      totalRows += body.length;
      out[k] = def.unpack(body);
    });
    return totalRows === 0 ? null : out;
  }
  async write(state) {
    const sheets = SCHEMA_KEYS.map((k) => { const def = SHEET_SCHEMA[k]; return { name: def.sheet, rows: [def.headers, ...def.pack(state)] }; });
    const r = await googleSheetsService.write(this.cfg, sheets);
    return r.ts || new Date().toISOString();
  }
};
class SupabaseProvider extends DataProvider {
  constructor(cfg) { 
    super(); 
    this.client = createClient(cfg.supabaseUrl, cfg.supabaseKey); // <-- window rimosso
  }
  
  get id() { return "supabase"; }
  
  async ping() { 
    const { error } = await this.client.from('app_state').select('id').limit(1);
    if (error) throw new SyncError("Supabase non raggiungibile", { hint: error.message });
    return { ok: true, title: "Supabase Connesso" }; 
  }
  
  async read() {
    const { data, error } = await this.client.from('app_state').select('data').eq('id', 'carol_main').single();
    if (error && error.code !== 'PGRST116') throw new SyncError("Errore lettura Supabase", { hint: error.message });
    return data ? data.data : null;
  }
  
  async write(state) {
    const { error } = await this.client.from('app_state').upsert({ id: 'carol_main', data: state });
    if (error) throw new SyncError("Errore scrittura Supabase", { hint: error.message });
    return new Date().toISOString();
  }
}
class FinanceRepository {
  constructor() { this.local = new LocalProvider(); this.remote = null; }
  setRemote(cfg) { 
    if (!cfg?.enabled) {
      this.remote = null;
    } else if (cfg.provider === "supabase" && cfg.supabaseUrl && cfg.supabaseKey) {
      this.remote = new SupabaseProvider(cfg);
    } else if ((!cfg.provider || cfg.provider === "sheets") && cfg.url) {
      this.remote = new GoogleSheetsProvider(cfg);
    } else {
      this.remote = null;
    }
  }
  get hasRemote() { return !!this.remote; }
  loadLocal() { return this.local.read(); }
  saveLocal(state) { return this.local.write(state); }
  pull() { if (!this.remote) throw new SyncError("Sincronizzazione non configurata.", { retriable: false }); return this.remote.read(); }
  push(state) { if (!this.remote) throw new SyncError("Sincronizzazione non configurata.", { retriable: false }); return this.remote.write(state); }
  ping() { if (!this.remote) throw new SyncError("Sincronizzazione non configurata.", { retriable: false }); return this.remote.ping(); }
};
export function uniscePreservando(locale, remoto) {
  const out = { ...remoto };
  Object.keys(remoto).forEach((k) => {
    const r = remoto[k], l = locale?.[k];
    if (Array.isArray(r) && r.length === 0 && Array.isArray(l) && l.length > 0) delete out[k];
    if (r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).length === 0 && l && Object.keys(l).length > 0) delete out[k];
  });
  return out;
};
export const syncableState = (d) => ({ transactions: d.transactions, accounts: d.accounts, accountTypes: d.accountTypes, categories: d.categories, budgets: d.budgets, goals: d.goals, groups: d.groups, trips: d.trips || [], tripExpenses: d.tripExpenses || [], wishlist: d.wishlist || [], jobs: d.jobs || [], salaryEvents: d.salaryEvents || [], assets: d.assets || [], trades: d.trades || [], portfolioSnapshots: d.portfolioSnapshots || [], payslips: d.payslips || [], tfrEntries: d.tfrEntries || [], documenti: d.documenti || [], quotes: d.quotes || {} });

export const repository = new FinanceRepository();
export const SCHEMA_KEYS = Object.keys(SHEET_SCHEMA);
export { SHEET_SCHEMA };