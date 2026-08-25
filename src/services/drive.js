/* eslint-disable no-empty */
import { parseMk, todayISO } from '../utils/helpers';
import { DRIVE_SCOPE_BASE, DRIVE_SCOPE_LETTURA, DRIVE_ROOT, CEDOLINO_PREFIX } from '../config/constants';
import { storage } from './storage';

/* Aggiungere un tipo di documento significa aggiungere una riga qui:
   la cartella su Drive, la pagina e i filtri si adeguano da soli. */
const DOC_CATEGORIE = [
  { id: "cedolini", nome: "Cedolini", cartella: "Cedolini", icona: "💼", colore: "#8B9DF9", perAnno: true, prefisso: "Cedolino" },
  { id: "cu", nome: "CU", cartella: "CU", icona: "📑", colore: "#5EEAD4", perAnno: true, prefisso: "CU" },
  { id: "m730", nome: "Modello 730", cartella: "730", icona: "🧾", colore: "#FBBF24", perAnno: true, prefisso: "730" },
  { id: "f24", nome: "F24", cartella: "F24", icona: "🏛️", colore: "#F472B6", perAnno: true, prefisso: "F24" },
  { id: "estratti", nome: "Estratti conto", cartella: "Estratti Conto", icona: "🏦", colore: "#38BDF8", perAnno: true, prefisso: "Estratto" },
  { id: "investimenti", nome: "Investimenti", cartella: "Investimenti", icona: "📈", colore: "#A78BFA", perAnno: true, prefisso: "Investimento" },
  { id: "fatture", nome: "Fatture e ricevute", cartella: "Fatture", icona: "🧮", colore: "#86EFAC", perAnno: true, prefisso: "Fattura" },
  { id: "assicurazioni", nome: "Assicurazioni", cartella: "Assicurazioni", icona: "🛡️", colore: "#FDBA74", perAnno: false, prefisso: "Polizza" },
  { id: "auto", nome: "Auto", cartella: "Auto", icona: "🚗", colore: "#C4B5FD", perAnno: false, prefisso: "Auto" },
  { id: "altro", nome: "Altro", cartella: "Altro", icona: "📂", colore: "#94A3B8", perAnno: false, prefisso: "Documento" },
];
const docCat = (id) => DOC_CATEGORIE.find((c) => c.id === id) || DOC_CATEGORIE[DOC_CATEGORIE.length - 1];

function nomeFileDocumento({ tipo, mese, anno, originale }) {
  const cat = docCat(tipo);
  const est = (originale || "").match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || ".pdf";
  if (mese) {
    const { y, m } = parseMk(mese);
    const nomeMese = MESI_ESTESI[m];
    return `${cat.prefisso}_${nomeMese}_${y}${est}`;
  }
  if (anno) return `${cat.prefisso}_${anno}${est}`;
  return `${cat.prefisso}_${todayISO()}${est}`;
};

function meseDaNomeFile(nome) {
  const n = (nome || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  let anno = null, mese = null;
  const isoDiretto = n.match(/(20\d{2})[-_ ](0[1-9]|1[0-2])/);
  if (isoDiretto) return `${isoDiretto[1]}-${isoDiretto[2]}`;
  const annoM = n.match(/(20\d{2})/);
  if (annoM) anno = annoM[1];
  for (let i = 0; i < 12; i++) if (n.includes(MESI_NOME[i])) { mese = String(i + 1).padStart(2, "0"); break; }
  if (!mese) {
    const num = n.match(/(?:^|[^0-9])(0[1-9]|1[0-2])(?:[^0-9]|$)/);
    if (num && anno) mese = num[1];
  }
  return anno && mese ? `${anno}-${mese}` : null;
};

const MESI_NOME = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MESI_ESTESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

/** l'origine da registrare in Google Cloud: schema + dominio, senza percorso */
export function origineCorrente() {
  try { return window.location.origin; } catch { return ""; }
}

class DriveError extends Error {
  constructor(tipo, messaggio, { suggerimento = "" } = {}) { super(messaggio); this.tipo = tipo; this.suggerimento = suggerimento; }
}
const driveService = {
  clientId: "",
  token: null,           // { access_token, scadenza }
  _tokenClient: null,
  _cartelle: new Map(),  // percorso → id, per non ricrearle a ogni caricamento
  _blob: new Map(),      // fileId → object URL già scaricato

  configura(cfg) {
    if (cfg.clientId !== this.clientId) { this.clientId = cfg.clientId || ""; this._tokenClient = null; }
    this.letturaEsterna = !!cfg.letturaEsterna;
  },
  get collegato() { return !!this.token?.access_token && Date.now() < (this.token.scadenza || 0); },
  get scope() { return this.letturaEsterna ? `${DRIVE_SCOPE_BASE} ${DRIVE_SCOPE_LETTURA}` : DRIVE_SCOPE_BASE; },

  /** carica la libreria di Google una sola volta */
  async _caricaGis() {
    if (window.google?.accounts?.oauth2) return window.google;
    if (!this._gisPromise) {
      this._gisPromise = new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = "https://accounts.google.com/gsi/client";
        sc.async = true; sc.defer = true;
        sc.onload = () => (window.google?.accounts?.oauth2 ? res(window.google) : rej(new DriveError("libreria", "Libreria Google non disponibile.")));
        sc.onerror = () => rej(new DriveError("rete", "Impossibile caricare la libreria Google.", { suggerimento: "Serve una connessione attiva." }));
        document.head.appendChild(sc);
      });
    }
    return this._gisPromise;
  },

  /** chiede il consenso e ottiene un token valido circa un'ora */
  async collega({ silenzioso = false } = {}) {
    if (!this.clientId) throw new DriveError("config", "Manca l'ID client OAuth.", { suggerimento: "Impostalo in Impostazioni → Google Drive." });
    if (location.protocol === "file:") {
      throw new DriveError("origine", "Google non consente l'accesso da un file aperto localmente.",
        { suggerimento: "Pubblica l'app su un indirizzo https (per esempio GitHub Pages) e autorizza quell'origine." });
    }
    const google = await this._caricaGis();
    return new Promise((res, rej) => {
      this._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        prompt: silenzioso ? "" : "consent",
        callback: (r) => {
          if (r.error) {
            const testo = `${r.error} ${r.error_description || ""}`;
            if (/invalid_client|unregistered|origin/i.test(testo)) {
              return rej(new DriveError("origine", "Google non riconosce questa origine.",
                { suggerimento: `Aggiungi ${origineCorrente()} tra le "Origini JavaScript autorizzate" del tuo ID client, senza percorso finale.` }));
            }
            return rej(new DriveError("consenso", "Autorizzazione non concessa.", { suggerimento: r.error_description || "" }));
          }
          this.token = { access_token: r.access_token, scadenza: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000 };
          res(this.token);
        },
        error_callback: (e) => {
          const t = `${e?.type || ""} ${e?.message || ""}`;
          if (/invalid_client|origin|idpiframe/i.test(t)) {
            return rej(new DriveError("origine", "Google non riconosce questa origine.",
              { suggerimento: `Aggiungi ${origineCorrente()} tra le "Origini JavaScript autorizzate" del tuo ID client.` }));
          }
          rej(new DriveError("consenso", "Finestra di autorizzazione chiusa prima di concedere l'accesso.", { suggerimento: "Riprova e completa i passaggi nella finestra di Google." }));
        },
      });
      this._tokenClient.requestAccessToken({ prompt: silenzioso ? "" : "consent" });
    });
  },

  scollega() {
    try { if (this.token?.access_token) window.google?.accounts?.oauth2?.revoke(this.token.access_token, () => {}); } catch {}
    this.token = null; this._cartelle.clear();
    this._blob.forEach((u) => URL.revokeObjectURL(u)); this._blob.clear();
  },

  /** rinnova il token in silenzio quando sta per scadere */
  async _assicuraToken() {
    if (this.collegato) return this.token.access_token;
    await this.collega({ silenzioso: true });
    return this.token.access_token;
  },

  async _api(url, opts = {}, tentativo = 0) {
    const tk = await this._assicuraToken();
    const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tk}`, ...(opts.headers || {}) } });
    if (r.status === 401 && tentativo === 0) { this.token = null; return this._api(url, opts, 1); }   // token scaduto: uno e un solo nuovo tentativo
    if (r.status === 403) {
      const t = await r.text();
      if (/rateLimit|userRateLimit|quota/i.test(t)) throw new DriveError("limite", "Google ha applicato un limite temporaneo.", { suggerimento: "Riprova tra un minuto." });
      throw new DriveError("permessi", "Permesso negato da Google Drive.", { suggerimento: "Verifica gli ambiti concessi durante l'autorizzazione." });
    }
    if (r.status === 404) throw new DriveError("nonTrovato", "File o cartella non trovati su Drive.");
    if (!r.ok) throw new DriveError("api", `Errore Google Drive (${r.status}).`);
    return r;
  },

  /** crea la cartella se non esiste e ne restituisce l'identificativo */
  async _cartella(nome, genitore) {
    const chiave = `${genitore || "root"}/${nome}`;
    if (this._cartelle.has(chiave)) return this._cartelle.get(chiave);
    const q = [`name='${nome.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", "trashed=false", genitore ? `'${genitore}' in parents` : "'root' in parents"].join(" and ");
    const r = await this._api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
    const j = await r.json();
    let id = j.files?.[0]?.id;
    if (!id) {
      const c = await this._api("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: genitore ? [genitore] : undefined }),
      });
      id = (await c.json()).id;
    }
    this._cartelle.set(chiave, id);
    return id;
  },

  /** Finance Manager / Documenti / <categoria> [/ <anno>] */
  async percorso(categoria, anno) {
    let padre = null;
    const parti = [...DRIVE_ROOT, categoria];
    if (anno) parti.push(String(anno));
    for (const nome of parti) padre = await this._cartella(nome, padre);
    return padre;
  },

  /** carica un file mantenendo l'originale su Drive (multipart: metadati + contenuto) */
  async carica(file, { categoria = "Cedolini", anno, nomeFile }) {
    const parent = await this.percorso(categoria, anno);
    const meta = { name: nomeFile || file.name, parents: [parent] };
    const bordo = "C.A.R.O.L." + Math.random().toString(36).slice(2);
    const corpo = new Blob([
      `--${bordo}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${bordo}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      file, `\r\n--${bordo}--`,
    ]);
    const r = await this._api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${bordo}` }, body: corpo,
    });
    const j = await r.json();
    return { driveFileId: j.id, nomeFile: j.name, mime: j.mimeType, dimensione: Number(j.size) || file.size, webViewLink: j.webViewLink, dataCaricamento: (j.createdTime || new Date().toISOString()).slice(0, 10) };
  },

  /** scarica il contenuto e ne crea un indirizzo temporaneo: nessun file reso pubblico */
  async contenuto(fileId) {
    if (this._blob.has(fileId)) return this._blob.get(fileId);
    const r = await this._api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    const url = URL.createObjectURL(await r.blob());
    this._blob.set(fileId, url);
    return url;
  },

  /** sostituisce il contenuto conservando lo stesso file su Drive: il riferimento resta valido */
  async sostituisci(fileId, file, nuovoNome) {
    const r = await this._api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,size,modifiedTime`, {
      method: "PATCH", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
    });
    const j = await r.json();
    if (nuovoNome && nuovoNome !== j.name) {
      await this._api(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nuovoNome }),
      });
    }
    this._blob.delete(fileId);   // l'anteprima in cache non è più valida
    return { driveFileId: fileId, nomeFile: nuovoNome || j.name, mime: j.mimeType, dimensione: Number(j.size) || file.size, dataCaricamento: (j.modifiedTime || new Date().toISOString()).slice(0, 10) };
  },

  /** verifica che il file esista ancora su Drive (stato della sincronizzazione) */
  async verifica(fileId) {
    try {
      const r = await this._api(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,modifiedTime,trashed`);
      const j = await r.json();
      return j.trashed ? { stato: "cestinato" } : { stato: "ok", nome: j.name, dimensione: Number(j.size) || 0, modificato: j.modifiedTime };
    } catch (e) { return { stato: e.tipo === "nonTrovato" ? "mancante" : "errore", messaggio: e.message }; }
  },

  async elimina(fileId) { try { await this._api(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: "DELETE" }); } catch (e) { if (e.tipo !== "nonTrovato") throw e; } },

  /** cerca una cartella per nome senza crearla; null se non esiste */
  async trovaCartella(nome, genitore) {
    const q = [`name='${nome.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", "trashed=false", genitore ? `'${genitore}' in parents` : "'root' in parents"].join(" and ");
    const r = await this._api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
    return (await r.json()).files?.[0]?.id || null;
  },

  /** percorso già esistente, senza crearne di nuovi */
  async percorsoEsistente(parti) {
    let padre = null;
    for (const nome of parti) {
      padre = await this.trovaCartella(nome, padre);
      if (!padre) return null;
    }
    return padre;
  },

  /** tutti i file di una categoria, comprese le sottocartelle per anno */
  async scansiona(cartellaCategoria) {
    const base = await this.percorsoEsistente([...DRIVE_ROOT, cartellaCategoria]);
    if (!base) return [];
    const dentro = await this.elenca(base);
    const file = dentro.filter((f) => !/folder/.test(f.mimeType)).map((f) => ({ ...f, anno: "" }));
    const sottocartelle = dentro.filter((f) => /folder/.test(f.mimeType));
    for (const c of sottocartelle) {
      const figli = await this.elenca(c.id);
      figli.filter((f) => !/folder/.test(f.mimeType)).forEach((f) => file.push({ ...f, anno: /^20\d{2}$/.test(c.name) ? c.name : "" }));
    }
    return file;
  },

  /** elenca i PDF di una cartella (serve per l'importazione automatica) */
  async elenca(cartellaId) {
    const q = `'${cartellaId}' in parents and trashed=false`;
    const r = await this._api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime)&pageSize=200&orderBy=name`);
    return (await r.json()).files || [];
  },
};
const cedoliniStore = {
  async leggi(payslipId) {
    try { const r = await storage.get(CEDOLINO_PREFIX + payslipId); return r?.value ? JSON.parse(r.value) : null; } catch { return null; }
  },
  async salva(payslipId, file) {
    const dati = await this._prepara(file);
    await storage.set(CEDOLINO_PREFIX + payslipId, JSON.stringify(dati));
    return { tipo: "file", nome: file.name, mime: dati.mime, dimensione: dati.dimensione };
  },
  async elimina(payslipId) { try { await storage.delete(CEDOLINO_PREFIX + payslipId); } catch {} },

  /** le immagini vengono ridotte per non saturare lo spazio; i PDF restano intatti */
  async _prepara(file) {
    const troppoGrande = file.size > 4 * 1024 * 1024;
    if (troppoGrande) throw new Error("Il file supera i 4 MB: caricalo su Drive e incolla il link.");
    if (!file.type.startsWith("image/")) {
      const b64 = await this._base64(file);
      return { mime: file.type || "application/pdf", nome: file.name, dimensione: file.size, dati: b64 };
    }
    const b64 = await this._comprimiImmagine(file);
    return { mime: "image/jpeg", nome: file.name, dimensione: Math.round((b64.length * 3) / 4), dati: b64 };
  },
  _base64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = () => rej(new Error("Impossibile leggere il file."));
      r.readAsDataURL(file);
    });
  },
  _comprimiImmagine(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1800;
          const scala = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * scala); c.height = Math.round(img.height * scala);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.78).split(",")[1]);
        };
        img.onerror = () => rej(new Error("Immagine non leggibile."));
        img.src = String(r.result);
      };
      r.onerror = () => rej(new Error("Impossibile leggere il file."));
      r.readAsDataURL(file);
    });
  },
  dataUrl(d) { return `data:${d.mime};base64,${d.dati}`; },
};

export { driveService, cedoliniStore, DOC_CATEGORIE, docCat, meseDaNomeFile, nomeFileDocumento };