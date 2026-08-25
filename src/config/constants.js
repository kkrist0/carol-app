import { uid } from '../utils/helpers'; // Esempio di come importare uid ora che è in un altro file

export const STORAGE_KEY = "C.A.R.O.L.:data";
export const BACKUP_PREFIX = "C.A.R.O.L.:backup:";
export const DATA_VERSION = 1;
export const YEAR_MIN = 2024;
export const YEAR_MAX = Math.max(2028, new Date().getFullYear() + 1);
export const ACCOUNT_TYPES = [ 'Conto corrente', 'Carta di credito', 'Conto virtuale', 'Contanti', 'Altro'];
export const ACCOUNT_ICON_BY_TYPE = { "Conto corrente": "🏦", "Carta di credito": "💳", "Conto virtuale": "📲", "Contanti": "💵", "Altro": "💼" };
export const DEFAULT_ACCOUNT_TYPES = [
  { tipo: 'Conto corrente', icona: '🏦' },
  { tipo: 'Carta di credito', icona: '💳' },
  { tipo: 'Conto virtuale', icona: '📲' },
  { tipo: 'Contanti', icona: '💵' },
  { tipo: 'Altro', icona: '💼' },
];
export const DEFAULT_ACCOUNTS = [];
export const DEFAULT_CATEGORIES = [];
export const TRIP_CATS = [
  { id: "volo", nome: "Volo", icona: "✈️", colore: "#93C5FD" },
  { id: "hotel", nome: "Hotel", icona: "🛏️", colore: "#A5B4FC" },
  { id: "treno", nome: "Treno", icona: "🚆", colore: "#7DD3FC" },
  { id: "auto", nome: "Auto", icona: "🚗", colore: "#C4B5FD" },
  { id: "carburante", nome: "Carburante", icona: "⛽", colore: "#FDBA74" },
  { id: "taxi", nome: "Taxi", icona: "🚕", colore: "#FDE68A" },
  { id: "pedaggi", nome: "Pedaggi", icona: "🛣️", colore: "#FCD34D" },
  { id: "parcheggi", nome: "Parcheggi", icona: "🅿️", colore: "#94A3B8" },
  { id: "ristoranti", nome: "Ristoranti", icona: "🍽️", colore: "#FCA5A5" },
  { id: "bar", nome: "Bar", icona: "☕", colore: "#F9A8D4" },
  { id: "musei", nome: "Musei", icona: "🏛️", colore: "#67E8F9" },
  { id: "escursioni", nome: "Escursioni", icona: "🥾", colore: "#86EFAC" },
  { id: "shopping", nome: "Shopping", icona: "🛍️", colore: "#F0ABFC" },
  { id: "souvenir", nome: "Souvenir", icona: "🎁", colore: "#5EEAD4" },
  { id: "altro", nome: "Altro", icona: "•", colore: "#94A3B8" },
];
export const tripCat = (id) => TRIP_CATS.find((c) => c.id === id) || TRIP_CATS[TRIP_CATS.length - 1];
export const TRIP_ICONS = ["✈️", "🏖️", "🏔️", "🏛️", "🗺️", "🎒", "🚗", "🚢", "🏝️", "🌋", "🎡", "⛩️", "🏕️", "🌍"];

export function seedTransactions() {
  const txs = [];
  const now = new Date();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let m = 4; m >= 0; m--) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const ym = (day) => new Date(base.getFullYear(), base.getMonth(), day).toISOString().slice(0, 10);
    txs.push({ id: uid(), tipo: "entrata", importo: 1850, data: ym(27), categoria: "stipendio", conto: "cc", metodo: "Bonifico", note: "Stipendio mensile", tags: ["ricorrente"] });
    txs.push({ id: uid(), tipo: "spesa", importo: 620, data: ym(3), categoria: "affitto", conto: "cc", metodo: "Bonifico", note: "Affitto", tags: ["ricorrente"] });
    txs.push({ id: uid(), tipo: "spesa", importo: 55 + Math.round(Math.random() * 40), data: ym(8), categoria: "bollette", conto: "cc", metodo: "Addebito", note: "Luce e gas", tags: [] });
    for (let i = 0; i < 4; i++) txs.push({ id: uid(), tipo: "spesa", importo: 28 + Math.round(Math.random() * 45), data: ym(4 + i * 6), categoria: "spesa", conto: pick(["cc", "carta"]), metodo: "Carta", note: "Supermercato", tags: [] });
    txs.push({ id: uid(), tipo: "spesa", importo: 45 + Math.round(Math.random() * 35), data: ym(11), categoria: "ristoranti", conto: "carta", metodo: "Carta", note: "Cena fuori", tags: [] });
    txs.push({ id: uid(), tipo: "spesa", importo: 30 + Math.round(Math.random() * 25), data: ym(15), categoria: "benzina", conto: "carta", metodo: "Carta", note: "Rifornimento", tags: [] });
    txs.push({ id: uid(), tipo: "spesa", importo: 200, data: ym(28), categoria: "etf", conto: "cc", metodo: "Bonifico", note: "PAC mensile", tags: ["investimento", "ricorrente"] });
    if (m % 2 === 0) txs.push({ id: uid(), tipo: "spesa", importo: 60 + Math.round(Math.random() * 90), data: ym(18), categoria: "shopping", conto: "carta", metodo: "Carta", note: "Acquisti online", tags: [] });
    if (m === 1) txs.push({ id: uid(), tipo: "entrata", importo: 240, data: ym(20), categoria: "freelance", conto: "cc", metodo: "Bonifico", note: "Progetto extra", tags: [] });
  }
  return txs.filter((t) => new Date(t.data) <= now).sort((a, b) => b.data.localeCompare(a.data));
};
export function freshData(withDemo) {
  return {
    version: DATA_VERSION,
    createdAt: new Date().toISOString(),
    transactions: withDemo ? seedTransactions() : [],
    accounts: DEFAULT_ACCOUNTS,
    accountTypes: DEFAULT_ACCOUNT_TYPES,
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, ordine: i, sottocategorie: [] })),
    groups: ["Needs", "Wants", "Investimenti", "Entrate"],
    budgets: { affitto: 650, spesa: 220, ristoranti: 150, benzina: 120, shopping: 120, bollette: 110 },
    goals: [
      { id: uid(), nome: "Fondo emergenza", target: 5000, salvato: 2600, colore: "#5EEAD4" },
    ],
    trips: [],
    tripExpenses: [],
    wishlist: [],
    jobs: [],
    salaryEvents: [],
    payslips: [],
    tfrEntries: [],
    documenti: [],
    assets: [],
    trades: [],
    quotes: {},
    portfolioSnapshots: [],
    trash: [],
    settings: { theme: "dark", onboarded: false, patrimonioToggles: { liquidi: true, investimenti: false, tfr: false } },
    saveCount: 0,
  };
};
export const APPS_SCRIPT_CODE = `// ===== C.A.R.O.L. · backend Google Sheets =====
// 1. Apri il tuo foglio → Estensioni → Apps Script
// 2. Incolla questo codice, sostituisci il TOKEN con una parola tua
// 3. Distribuisci → Nuova distribuzione → Tipo: App web
//    Esegui come: Me · Chi ha accesso: Chiunque
// 4. Copia l'URL e incollalo in C.A.R.O.L. → Impostazioni

const TOKEN = 'cambia-questo-token';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out({ ok: false, error: 'Token non corrispondente' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (req.action === 'ping') return out({ ok: true, title: ss.getName() });

    if (req.action === 'read') {
      const sheets = {};
      (req.sheets || []).forEach(function (name) {
        const sh = ss.getSheetByName(name);
        sheets[name] = sh && sh.getLastRow() > 0
          ? sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues()
          : [];
      });
      return out({ ok: true, sheets: sheets });
    }

    if (req.action === 'write') {
      (req.sheets || []).forEach(function (s) {
        let sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
        sh.clear();
        if (s.rows && s.rows.length) {
          sh.getRange(1, 1, s.rows.length, s.rows[0].length).setValues(s.rows);
          sh.setFrozenRows(1);
          sh.getRange(1, 1, 1, s.rows[0].length).setFontWeight('bold');
        }
      });
      return out({ ok: true, ts: new Date().toISOString() });
    }
    return out({ ok: false, error: 'Azione sconosciuta' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export const CEDOLINO_PREFIX = "C.A.R.O.L.:cedolino:";
export const DRIVE_CFG_KEY = "C.A.R.O.L.:drive";
export const DRIVE_SCOPE_BASE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_SCOPE_LETTURA = "https://www.googleapis.com/auth/drive.readonly";
export const DRIVE_ROOT = ["Finance Manager", "Documenti"];
export const MARKET_CFG_KEY = "C.A.R.O.L.:market";

export const SYNC_CFG_KEY = "C.A.R.O.L.:sync";
export const DEFAULT_SYNC_CFG = { 
  enabled: false, 
  provider: "sheets", // "sheets" o "supabase"
  url: "", 
  token: "", 
  supabaseUrl: "", 
  supabaseKey: "", 
  autoPush: true, 
  lastSync: null 
};

export const TFR_DIVISORE = 13.5;      // quota annua di TFR = retribuzione / 13,5
export const TFR_CONTRIBUTO = 0.005;   // 0,5% trattenuto per il fondo di garanzia INPS
export const TFR_RIVAL_BASE = 0.015;   // rivalutazione annua: 1,5% fisso + 75% dell'inflazione

export const VOCI_BUSTA = [
  { k: "lordo", l: "Lordo", tone: "#93C5FD" },
  { k: "netto", l: "Netto", tone: "#5EEAD4" },
  { k: "bonus", l: "Bonus", tone: "#FBBF24" },
  { k: "straordinari", l: "Straordinari", tone: "#A78BFA" },
  { k: "rimborsi", l: "Rimborsi spese", tone: "#38BDF8" },
  { k: "premio", l: "Premio", tone: "#F472B6" },
  { k: "tredicesima", l: "Tredicesima", tone: "#86EFAC" },
  { k: "quattordicesima", l: "Quattordicesima", tone: "#FDBA74" },
  { k: "altre", l: "Altre competenze", tone: "#C4B5FD" },
  { k: "trattenute", l: "Trattenute", tone: "#FB7185" },
];

export const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export const INFLAZIONE_DEFAULT = 2.0;

export const HOME_BASE = [45.32, 8.86]; // Vigevano

export const LOGO_GRAD = ["#8B9DF9", "#A78BFA", "#5EEAD4"];

export const metodiSpesa = ["Carta di Debito", "Bonifico", "Contanti", "SDD", "Carta di Credito", "Wallet Digitale", "Carta Prepagata", "Altro"];
export const metodiEntrata = ["Bonifico", "Accredito", "Contanti", "Altro"];

export const EMOJI_SET = ["🏠", "💡", "🛒", "⛽", "🛡️", "❤️", "🚆", "🍜", "☕", "✈️", "🛍️", "👟", "🎮", "🎾", "🎬", "🎵", "💿", "📚", "🐾", "💊", "📈", "📊", "🪙", "💼", "🎁", "↩️", "🧑‍💻", "🏋️", "🚗", "📱", "🎓", "🍺"];
export const COLOR_SET = ["#8B9DF9", "#A5B4FC", "#C4B5FD", "#F0ABFC", "#F9A8D4", "#FDA4AF", "#FCA5A5", "#FDBA74", "#FDE68A", "#86EFAC", "#5EEAD4", "#67E8F9", "#7DD3FC", "#93C5FD", "#94A3B8", "#E2E8F0"];
export const PALETTE = ["#8B9DF9", "#A78BFA", "#F472B6", "#FB7185", "#38BDF8", "#4ADE80", "#FBBF24", "#F87171", "#94A3B8", "#2DD4BF"];

export const EVENT_TYPES = [
  { id: "aumento", l: "Aumento RAL", icona: "📈", colore: "#5EEAD4" },
  { id: "bonus", l: "Bonus", icona: "🎁", colore: "#FBBF24" },
  { id: "premio", l: "Premio di risultato", icona: "🏆", colore: "#A78BFA" },
  { id: "tredicesima", l: "Tredicesima", icona: "🎄", colore: "#86EFAC" },
  { id: "quattordicesima", l: "Quattordicesima", icona: "☀️", colore: "#FDBA74" },
  { id: "unatantum", l: "Una tantum", icona: "✨", colore: "#93C5FD" },
];
export const evType = (id) => EVENT_TYPES.find((e) => e.id === id) || EVENT_TYPES[1];