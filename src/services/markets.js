const ETF_CATALOG = [
  { t: "VWCE", isin: "IE00BK5BQT80", nome: "Vanguard FTSE All-World UCITS ETF (USD) Acc", borsa: "Borsa italiana", val: "EUR", em: "Vanguard", cat: "Azionario globale", area: "Globale", settore: "Diversificato", y: "VWCE.MI", s: "vwce.uk" },
  { t: "VFEA", isin: "IE00BK5BR733", nome: "Vanguard FTSE Emerging Markets UCITS ETF (USD) Acc", borsa: "Borsa italiana", val: "EUR", em: "Vanguard", cat: "Azionario emergenti", area: "Globale", settore: "Diversificato", y: "VFEA.MI", s: "vfea.uk" },
  { t: "VHVE", isin: "IE00BK5BQV03", nome: "Vanguard FTSE Developed World UCITS ETF (USD) Acc", borsa: "Borsa italiana", val: "EUR", em: "Vanguard", cat: "Azionario paesi sviluppati", area: "Globale", settore: "Diversificato", y: "VHVE.MI", s: "vhve.uk" },
  { t: "VWRL", isin: "IE00B3RBWM25", nome: "Vanguard FTSE All-World UCITS ETF Dist", borsa: "Borsa Italiana", val: "EUR", em: "Vanguard", cat: "Azionario globale", area: "Globale", settore: "Diversificato", y: "VWRL.MI", s: "vwrl.uk" },
  { t: "SWDA", isin: "IE00B4L5Y983", nome: "iShares Core MSCI World UCITS ETF USD (Acc)", borsa: "Borsa Italiana", val: "EUR", em: "iShares", cat: "Azionario paesi sviluppati", area: "Globale", settore: "Diversificato", y: "SWDA.MI", s: "swda.uk" },
  { t: "VUSA", isin: "IE00B3XXRP09", nome: "Vanguard S&P 500 UCITS ETF Dist", borsa: "Borsa Italiana", val: "EUR", em: "Vanguard", cat: "Azionario USA", area: "USA", settore: "Diversificato", y: "VUSA.MI", s: "vusa.uk" },
  { t: "EIMI", isin: "IE00BKM4GZ66", nome: "iShares Core MSCI EM IMI UCITS ETF Acc", borsa: "Borsa Italiana", val: "EUR", em: "iShares", cat: "Azionario emergenti", area: "Emergenti", settore: "Diversificato", y: "EIMI.MI", s: "eimi.uk" },
  { t: "VFEM", isin: "IE00B3VVMM84", nome: "Vanguard FTSE Emerging Markets UCITS ETF", borsa: "Borsa Italiana", val: "EUR", em: "Vanguard", cat: "Azionario emergenti", area: "Emergenti", settore: "Diversificato", y: "VFEM.MI", s: "vfem.uk" },
  { t: "XEON", isin: "LU0290358497", nome: "Xtrackers II EUR Overnight Rate Swap UCITS ETF 1C", borsa: "Borsa Italiana", val: "EUR", em: "Xtrackers", cat: "Monetario euro", area: "Europa", settore: "Monetario", y: "XEON.MI", s: "xeon.uk" },
  { t: "VHYL", isin: "IE00B8GKDB10", nome: "Vanguard FTSE All-World High Dividend Yield UCITS ETF", borsa: "Borsa Italiana", val: "EUR", em: "Vanguard", cat: "Azionario dividendi", area: "Globale", settore: "Diversificato", y: "VHYL.MI", s: "vhyl.uk" },
  { t: "BTC", isin: "", nome: "Bitcoin", borsa: "Crypto", val: "EUR", em: "—", cat: "Criptovaluta", area: "Globale", settore: "Crypto", cg: "bitcoin", tipo: "Crypto" },
  { t: "ETH", isin: "", nome: "Ethereum", borsa: "Crypto", val: "EUR", em: "—", cat: "Criptovaluta", area: "Globale", settore: "Crypto", cg: "ethereum", tipo: "Crypto" },
];

const catalogoDi = (a) => ETF_CATALOG.find((e) => e.isin && a.isin && e.isin === a.isin && (!a.mercato || e.borsa === a.mercato)) || ETF_CATALOG.find((e) => e.t === (a.ticker || "").toUpperCase());
const simboloPer = (a, campo) => a[`sym_${campo}`] || catalogoDi(a)?.[campo] || null;
const ASSET_TYPES = ["ETF", "Azione", "Obbligazione", "Fondo", "Crypto", "Altro"];
const AREE = ["Globale", "USA", "Europa", "Emergenti", "Asia", "Italia", "Altro"];
const SETTORI = ["Diversificato", "Tecnologia", "Finanza", "Salute", "Energia", "Industriale", "Consumi", "Immobiliare", "Altro"];
const PALETTE = ["#8B9DF9", "#5EEAD4", "#FBBF24", "#F472B6", "#A78BFA", "#38BDF8", "#86EFAC", "#FB7185", "#FDBA74", "#67E8F9"];
const pct = (v, d = 2) => `${v >= 0 ? "+" : ""}${(v ?? 0).toFixed(d)}%`;

class MarketError extends Error {
  constructor(tipo, messaggio, { suggerimento = "" } = {}) { super(messaggio); this.tipo = tipo; this.suggerimento = suggerimento; }
};
const fetchConTimeout = async (url, ms = 9000, opts = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (r.status === 429) throw new MarketError("limite", "Troppe richieste al provider.", { suggerimento: "Attendi qualche minuto o inserisci una chiave personale." });
    if (r.status === 401 || r.status === 403) throw new MarketError("chiave", "Chiave non valida o accesso negato.", { suggerimento: "Controlla la chiave nelle impostazioni." });
    if (r.status === 404) throw new MarketError("nonTrovato", "Simbolo non trovato su questo provider.");
    if (!r.ok) throw new MarketError("rete", `Risposta del server: ${r.status}.`);
    return r;
  } catch (e) {
    if (e instanceof MarketError) throw e;
    if (e.name === "AbortError") throw new MarketError("timeout", "Il provider non ha risposto in tempo.");
    throw new MarketError("rete", "Provider non raggiungibile dal browser.", { suggerimento: "Molte API finanziarie bloccano le chiamate dirette dal browser (CORS)." });
  } finally { clearTimeout(t); }
};
export function viaPonte(proxy, url) {
  const p = (proxy || "").trim();
  if (!p) return url;
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(url));
  if (/[?&](url|u|q|target)=$/.test(p)) return p + encodeURIComponent(url);
  if (/[?&](url|u|q|target)=https?:\/\//.test(p)) {
    /* l'utente ha incollato anche un indirizzo di esempio: lo sostituiamo */
    return p.replace(/([?&](?:url|u|q|target)=).*$/, `$1${encodeURIComponent(url)}`);
  }
  if (p.endsWith("=")) return p + encodeURIComponent(url);
  if (p.endsWith("/")) return p + url;
  return p + (p.includes("?") ? "&url=" : "?url=") + encodeURIComponent(url);
};
/** Interfaccia comune a tutti i provider. */
class MarketDataProvider {
  get id() { return "abstract"; } get nome() { return "—"; } get richiedeChiave() { return false; }
  supporta() { return false; }
  async quote() { throw new MarketError("rete", "non implementato"); }
  async history() { return null; }
};
/** Crypto: nessuna chiave, CORS aperto — funziona sempre. */
class CoinGeckoProvider extends MarketDataProvider {
  get id() { return "coingecko"; } get nome() { return "CoinGecko"; }
  supporta(a) { return a.tipo === "Crypto" || !!catalogoDi(a)?.cg; }
  async quote(a) {
    const id = catalogoDi(a)?.cg || a.ticker.toLowerCase();
    const val = (a.valuta || "EUR").toLowerCase();
    const r = await fetchConTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${val}&include_24hr_change=true`);
    const j = await r.json();
    const d = j[id];
    if (!d) throw new MarketError("nonTrovato", "Criptovaluta non trovata.");
    return { prezzo: d[val], variazione: d[`${val}_24h_change`] ?? null, valuta: (a.valuta || "EUR"), fonte: this.nome };
  }
  async history(a, giorni = 180) {
    const id = catalogoDi(a)?.cg || a.ticker.toLowerCase();
    const r = await fetchConTimeout(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${(a.valuta || "eur").toLowerCase()}&days=${giorni}`);
    const j = await r.json();
    return (j.prices || []).map(([ts, p]) => ({ data: new Date(ts).toISOString().slice(0, 10), prezzo: p }));
  }
};
/** Twelve Data: chiave gratuita, CORS aperto. Il piano free copre soprattutto i mercati USA. */
class TwelveDataProvider extends MarketDataProvider {
  constructor(key) { super(); this.key = key; }
  get id() { return "twelvedata"; } get nome() { return "Twelve Data"; } get richiedeChiave() { return true; }
  supporta(a) { return !!this.key && a.tipo !== "Crypto"; }
  async quote(a) {
    const sym = simboloPer(a, "y") || a.ticker;
    const r = await fetchConTimeout(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${this.key}`);
    const j = await r.json();
    if (j.status === "error" || j.code) {
      if (/limit/i.test(j.message || "")) throw new MarketError("limite", "Limite giornaliero del provider raggiunto.");
      throw new MarketError("nonTrovato", j.message || "Simbolo non disponibile nel piano in uso.", { suggerimento: "Il piano gratuito copre soprattutto i mercati USA." });
    }
    const p = Number(j.close ?? j.price);
    if (!p) throw new MarketError("vuoto", "Risposta senza prezzo.");
    return { prezzo: p, variazione: Number(j.percent_change) || null, valuta: j.currency || a.valuta, fonte: this.nome };
  }
  async history(a, giorni = 180) {
    const sym = simboloPer(a, "y") || a.ticker;
    const r = await fetchConTimeout(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=${Math.min(giorni, 500)}&apikey=${this.key}`);
    const j = await r.json();
    if (!j.values) return null;
    return j.values.map((v) => ({ data: v.datetime, prezzo: Number(v.close) })).reverse();
  }
};
/** Finnhub: chiave gratuita, CORS aperto. */
class FinnhubProvider extends MarketDataProvider {
  constructor(key) { super(); this.key = key; }
  get id() { return "finnhub"; } get nome() { return "Finnhub"; } get richiedeChiave() { return true; }
  supporta(a) { return !!this.key && a.tipo !== "Crypto"; }
  async quote(a) {
    const r = await fetchConTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.ticker)}&token=${this.key}`);
    const j = await r.json();
    if (!j.c) throw new MarketError("vuoto", "Nessun prezzo per questo simbolo.");
    return { prezzo: j.c, variazione: j.dp ?? null, valuta: a.valuta, fonte: this.nome };
  }
};
/** Alpha Vantage: chiave gratuita, CORS aperto, 25 richieste al giorno. */
class AlphaVantageProvider extends MarketDataProvider {
  constructor(key) { super(); this.key = key; }
  get id() { return "alphavantage"; } get nome() { return "Alpha Vantage"; } get richiedeChiave() { return true; }
  supporta(a) { return !!this.key && a.tipo !== "Crypto"; }
  async quote(a) {
    const sym = simboloPer(a, "y") || a.ticker;
    const r = await fetchConTimeout(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${this.key}`);
    const j = await r.json();
    if (j.Note || j.Information) throw new MarketError("limite", "Limite giornaliero di Alpha Vantage raggiunto.");
    const q = j["Global Quote"] || {};
    const p = Number(q["05. price"]);
    if (!p) throw new MarketError("nonTrovato", "Simbolo non trovato.");
    return { prezzo: p, variazione: parseFloat(q["10. change percent"]) || null, valuta: a.valuta, fonte: this.nome };
  }
};
/** Yahoo e Stooq non inviano CORS: raggiungibili solo tramite un ponte pubblico,
    che l'utente attiva consapevolmente dalle impostazioni. */
class YahooProvider extends MarketDataProvider {
  constructor(proxy) { super(); this.proxy = proxy; }
  get id() { return "yahoo"; } get nome() { return "Yahoo Finance"; }
  supporta(a) { return !!this.proxy && a.tipo !== "Crypto"; }
  _url(u) { return viaPonte(this.proxy, u); }
  /* una sola richiesta porta a casa prezzo, variazione e serie storica:
     è il modo più efficace per non esaurire i limiti dei provider */
  async quote(a) {
    const sym = simboloPer(a, "y") || a.ticker;
    const r = await fetchConTimeout(this._url(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=3mo&interval=1d`), 11000);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) throw new MarketError("nonTrovato", "Simbolo non trovato su Yahoo.");
    const meta = res.meta || {};
    const p = meta.regularMarketPrice;
    if (!p) throw new MarketError("vuoto", "Risposta senza prezzo.");
    const prec = meta.chartPreviousClose || meta.previousClose;
    const chiusure = res.indicators?.quote?.[0]?.close || [];
    const storico = (res.timestamp || []).map((ts, i) => ({ data: new Date(ts * 1000).toISOString().slice(0, 10), prezzo: chiusure[i] })).filter((x) => x.prezzo != null);
    return { prezzo: p, variazione: prec ? ((p - prec) / prec) * 100 : null, valuta: meta.currency || a.valuta, fonte: this.nome, storico };
  }
  async history(a, giorni = 180) {
    const sym = simboloPer(a, "y") || a.ticker;
    const range = giorni <= 35 ? "1mo" : giorni <= 100 ? "3mo" : giorni <= 200 ? "6mo" : giorni <= 400 ? "1y" : "5y";
    const r = await fetchConTimeout(this._url(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`), 12000);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return null;
    const chiusure = res.indicators?.quote?.[0]?.close || [];
    return (res.timestamp || []).map((ts, i) => ({ data: new Date(ts * 1000).toISOString().slice(0, 10), prezzo: chiusure[i] })).filter((x) => x.prezzo != null);
  }
};
class StooqProvider extends MarketDataProvider {
  constructor(proxy) { super(); this.proxy = proxy; }
  get id() { return "stooq"; } get nome() { return "Stooq"; }
  supporta(a) { return !!this.proxy && !!simboloPer(a, "s"); }
  async quote(a) {
    const sym = simboloPer(a, "s");
    const r = await fetchConTimeout(viaPonte(this.proxy, `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`));
    const testo = await r.text();
    const righe = testo.trim().split("\n");
    if (righe.length < 2) throw new MarketError("vuoto", "Nessun dato da Stooq.");
    const c = righe[1].split(",");
    const p = Number(c[6]);
    if (!p || Number.isNaN(p)) throw new MarketError("nonTrovato", "Simbolo non quotato su Stooq.");
    const apertura = Number(c[3]);
    return { prezzo: p, variazione: apertura ? ((p - apertura) / apertura) * 100 : null, valuta: a.valuta, fonte: this.nome };
  }
};
class MarketDataService {
  constructor() {
    this.cfg = { twelvedata: "", finnhub: "", alphavantage: "", proxy: "" };
    this.cache = new Map();
    this.sospesi = new Map();   // provider → istante fino al quale non va interrogato
  }
  configura(cfg) { this.cfg = { ...this.cfg, ...cfg }; this.sospesi.clear(); }
  /** un provider che ha appena rifiutato non va richiamato per ogni simbolo successivo */
  _sospendi(id, tipo) {
    const durata = tipo === "chiave" ? 60 * 60000 : tipo === "limite" ? 10 * 60000 : 60000;
    this.sospesi.set(id, Date.now() + durata);
  }
  _attivo(p) { const fino = this.sospesi.get(p.id); return !fino || Date.now() > fino; }
  get statoProvider() {
    return this.providers.map((p) => ({ id: p.id, nome: p.nome, sospesoFino: this.sospesi.get(p.id) || null }));
  }
  get providers() {
    return [
      new CoinGeckoProvider(),
      new TwelveDataProvider(this.cfg.twelvedata),
      new YahooProvider(this.cfg.proxy),
      new StooqProvider(this.cfg.proxy),
      new AlphaVantageProvider(this.cfg.alphavantage),
      new FinnhubProvider(this.cfg.finnhub),
    ];
  }
  /** @returns {Promise<{prezzo:number,variazione:number|null,fonte:string}>} */
  _chiave(a) { return `q:${a.isin || ""}|${(a.ticker || "").toUpperCase()}|${a.mercato || ""}`; }
  async quote(asset, { forza = false } = {}) {
    const key = this._chiave(asset);
    const inCache = this.cache.get(key);
    if (!forza && inCache && Date.now() - inCache.ts < 15 * 60000) return inCache.val;
    const errori = [];
    let sospesiOra = 0;
    for (const p of this.providers) {
      if (!p.supporta(asset)) continue;
      if (!this._attivo(p)) { sospesiOra++; continue; }        // salta chi ha appena rifiutato
      try {
        const val = await p.quote(asset);
        if (val?.prezzo) { this.cache.set(key, { ts: Date.now(), val }); return val; }
      } catch (e) {
        errori.push(`${p.nome}: ${e.message}`);
        if (e.tipo === "limite" || e.tipo === "chiave") this._sospendi(p.id, e.tipo);
      }
    }
    const dettaglio = errori[0] || (sospesiOra ? "Tutti i provider disponibili sono momentaneamente in pausa per aver superato il limite." : "Aggiungi una chiave o inserisci il prezzo a mano.");
    throw new MarketError("nessunProvider", "Nessun provider ha risposto.", { suggerimento: dettaglio });
  }
  async history(asset, giorni = 180) {
    /* se la quotazione in cache porta già la serie, non serve un'altra richiesta */
    const inCache = this.cache.get(this._chiave(asset));
    if (inCache?.val?.storico?.length > 1) return inCache.val.storico;
    for (const p of this.providers) {
      if (!p.supporta(asset) || !this._attivo(p)) continue;
      try { const h = await p.history(asset, giorni); if (h?.length) return h; }
      catch (e) { if (e.tipo === "limite" || e.tipo === "chiave") this._sospendi(p.id, e.tipo); }
    }
    return null;
  }
  /** Ricerca: prima il catalogo locale (sempre disponibile), poi eventuali provider online. */
  cerca(q) {
    const s = (q || "").trim().toUpperCase();
    if (s.length < 2) return [];
    return ETF_CATALOG.filter((e) => e.t.includes(s) || e.isin.includes(s) || e.nome.toUpperCase().includes(s) || e.em.toUpperCase().includes(s)).slice(0, 8);
  }
};

export const marketData = new MarketDataService();
export { ETF_CATALOG, ASSET_TYPES, AREE, SETTORI, PALETTE, pct };