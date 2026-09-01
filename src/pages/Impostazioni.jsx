import { useState, useEffect, useRef } from "react";
import { eur } from "../utils/helpers";
import { setGlobalLogoDevKey } from "../utils/logoDev";
import { driveService, origineCorrente } from "../services/drive";
import { marketData, viaPonte } from "../services/markets";
import { Card } from "../components/Card";
import { BtnPrimary, BtnGhost } from "../components/Buttons";
import { Input, Select, Label } from "../components/Forms";
import { freshData, SUPPORTED_CURRENCIES } from "../config/constants";
import { Spinner } from "../components/Spinner";

export function Impostazioni({
  data,
  update,
  backups,
  manualBackup,
  restoreBackup,
  exportJSON,
  exportCSV,
  exportXLSX,
  importJSON,
  restoreTx,
  hardDelete,
  catById,
  notify,
  setConfirmDlg,
  setData,
  syncCfg,
  saveSyncCfg,
  syncState,
  pushNow,
  pullNow,
  pendingPush,
}) {
  const trash = data.transactions.filter((t) => t.deletedAt);
  const fileRef = useRef(null);

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5" style={{ animation: "fadeUp .5s both" }}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Impostazioni
        </p>
        <h1 className="font-display text-xl sm:text-2xl text-white mt-1">
          Dati, backup e sicurezza
        </h1>
      </header>

      <PreferenzeSettings data={data} update={update} notify={notify} />
      <SyncSettings data={data} syncCfg={syncCfg} saveSyncCfg={saveSyncCfg} syncState={syncState} pushNow={pushNow} pullNow={pullNow} pendingPush={pendingPush} />
      <DriveSettings data={data} update={update} notify={notify} />
      <LogoDevSettings data={data} update={update} notify={notify} />
      <QuotesSettings data={data} update={update} notify={notify} />

      <Card className="p-5 mb-4" hover={false} delay={60}>
        <h2 className="font-display text-white mb-1">Esporta e importa</h2>
        <p className="text-xs text-slate-500 mb-4">
          Tutti i tuoi dati, sempre tuoi. Il salvataggio è comunque automatico e
          persistente.
        </p>
        <div className="flex flex-wrap gap-3">
          <BtnPrimary onClick={exportXLSX}>Excel (.xlsx)</BtnPrimary>
          <BtnGhost onClick={exportCSV}>CSV</BtnGhost>
          <BtnGhost onClick={exportJSON}>Backup JSON</BtnGhost>
          <BtnGhost onClick={() => fileRef.current?.click()}>
            Importa JSON
          </BtnGhost>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={importJSON}
          />
        </div>
      </Card>

      <Card className="p-5 mb-4" hover={false} delay={120}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-white">Backup automatici</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Creati periodicamente durante l'uso. Ripristino con un clic.
            </p>
          </div>
          <BtnGhost onClick={manualBackup}>Crea ora</BtnGhost>
        </div>
        <div className="space-y-2">
          {backups.map((b) => (
            <div
              key={b.slot}
              className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/6"
            >
              <div>
                <p className="text-sm text-white">
                  {new Date(b.ts).toLocaleString("it-IT")}
                </p>
                <p className="text-xs text-slate-500">{b.n} movimenti</p>
              </div>
              <BtnGhost
                onClick={() => restoreBackup(b.slot)}
                className="py-1.5! text-xs!"
              >
                Ripristina
              </BtnGhost>
            </div>
          ))}
          {backups.length === 0 && (
            <p className="text-xs text-slate-500">
              Nessun backup ancora: verranno creati automaticamente mentre usi
              l'app.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-5 mb-4" hover={false} delay={180}>
        <h2 className="font-display text-white mb-1">Cestino</h2>
        <p className="text-xs text-slate-500 mb-3">
          I movimenti eliminati restano qui finché non decidi tu.
        </p>
        <div className="space-y-2">
          {trash.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/6"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">
                  {t.note || catById[t.categoria]?.nome} · {eur(t.importo)}
                </p>
                <p className="text-xs text-slate-500">
                  Eliminato il{" "}
                  {new Date(t.deletedAt).toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <BtnGhost
                  onClick={() => restoreTx(t.id)}
                  className="py-1.5! text-xs!"
                >
                  Ripristina
                </BtnGhost>
                <button
                  onClick={() => hardDelete(t.id)}
                  className="text-xs text-rose-300/80 hover:text-rose-300 px-2 transition-colors"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
          {trash.length === 0 && (
            <p className="text-xs text-slate-500">Il cestino è vuoto.</p>
          )}
        </div>
      </Card>

      <Card className="p-5" hover={false} delay={240}>
        <h2 className="font-display text-white mb-1">Zona rossa</h2>
        <p className="text-xs text-slate-500 mb-3">
          Azioni irreversibili, con doppia conferma.
        </p>
        <BtnGhost
          onClick={() =>
            setConfirmDlg({
              msg: "Azzerare TUTTI i dati e ripartire da zero? Viene creato un backup automatico prima dell'azzeramento.",
              onOk: async () => {
                await manualBackup();
                setData(freshData(false));
                notify("Dati azzerati (backup disponibile)");
              },
            })
          }
          className="text-rose-300! hover:bg-rose-500/10!"
        >
          Azzera tutti i dati
        </BtnGhost>
      </Card>
    </div>
  );
}

export function PreferenzeSettings({ data, update, notify }) {
  const currentTheme = data?.settings?.theme || "dark";
  const currentCurrency = data?.settings?.currency || "EUR";

  return (
    <Card className="p-5 mb-4" hover={false} delay={45}>
      <h2 className="font-display text-white mb-1">Preferenze</h2>
      <p className="text-xs text-slate-500 mb-4">
        Personalizza l'aspetto visivo e la valuta di visualizzazione dell'applicazione.
      </p>

      <div className="space-y-4 pt-1">
        {/* --- SELETTORE TEMA --- */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-white/5">
          <div>
            <span className="text-sm font-medium text-white block">
              Tema dell'interfaccia
            </span>
            <span className="text-xs text-slate-400">
              Scegli tra la modalità scura (consigliata) o chiara.
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                update((d) => {
                  if (!d.settings) d.settings = {};
                  d.settings.theme = "dark";
                  return d;
                });
                notify("Tema Scuro attivato");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                currentTheme === "dark"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>🌙</span> Scuro
            </button>

            <button
              type="button"
              onClick={() => {
                update((d) => {
                  if (!d.settings) d.settings = {};
                  d.settings.theme = "light";
                  return d;
                });
                notify("Tema Chiaro attivato");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                currentTheme === "light"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>☀️</span> Chiaro
            </button>
          </div>
        </div>

        {/* --- SELETTORE VALUTA --- */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div>
            <span className="text-sm font-medium text-white block">
              Valuta di visualizzazione
            </span>
            <span className="text-xs text-slate-400">
              I dati restano salvati in Euro. Scegli la valuta di conversione a schermo.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl">
            {SUPPORTED_CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  update((d) => {
                    if (!d.settings) d.settings = {};
                    d.settings.currency = c.code;
                    return d;
                  });
                  notify(`Valuta impostata su ${c.name} (${c.symbol})`);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentCurrency === c.code
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {c.code} ({c.symbol})
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SyncSettings({ data, syncCfg, saveSyncCfg, syncState, pushNow, pullNow, pendingPush }) {
  return (
    <Card className="p-5 mb-4" hover={false} delay={30}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-display text-white">Sincronizzazione Cloud</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Salva i dati su Google Sheets o Supabase.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={syncCfg.enabled}
            onChange={(e) =>
              saveSyncCfg({ ...syncCfg, enabled: e.target.checked })
            }
          />
          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-400"></div>
        </label>
      </div>

      {syncCfg.enabled && (
        <div
          className="space-y-3 mt-4 pt-4 border-t border-white/5"
          style={{ animation: "fadeIn .3s both" }}
        >
          <div>
            <Label>Database Remoto</Label>
            <Select
              value={syncCfg.provider || "sheets"}
              onChange={(e) =>
                saveSyncCfg({ ...syncCfg, provider: e.target.value })
              }
            >
              <option value="sheets">Google Sheets (Apps Script)</option>
              <option value="supabase">Supabase (PostgreSQL)</option>
            </Select>
          </div>

          {!syncCfg.provider || syncCfg.provider === "sheets" ? (
            <div
              className="grid sm:grid-cols-2 gap-3"
              style={{ animation: "fadeIn .2s both" }}
            >
              <div>
                <Label>URL App Web (Google)</Label>
                <Input
                  value={syncCfg.url || ""}
                  onChange={(e) =>
                    saveSyncCfg({ ...syncCfg, url: e.target.value })
                  }
                  placeholder="https://script.google.com/..."
                />
              </div>
              <div>
                <Label>Token Sicurezza</Label>
                <Input
                  type="password"
                  value={syncCfg.token || ""}
                  onChange={(e) =>
                    saveSyncCfg({ ...syncCfg, token: e.target.value })
                  }
                  placeholder="Il tuo token segreto"
                />
              </div>
            </div>
          ) : (
            <div
              className="grid sm:grid-cols-2 gap-3"
              style={{ animation: "fadeIn .2s both" }}
            >
              <div>
                <Label>Supabase Project URL</Label>
                <Input
                  value={syncCfg.supabaseUrl || ""}
                  onChange={(e) =>
                    saveSyncCfg({ ...syncCfg, supabaseUrl: e.target.value })
                  }
                  placeholder="https://xyz.supabase.co"
                />
              </div>
              <div>
                <Label>Anon Public Key</Label>
                <Input
                  type="password"
                  value={syncCfg.supabaseKey || ""}
                  onChange={(e) =>
                    saveSyncCfg({ ...syncCfg, supabaseKey: e.target.value })
                  }
                  placeholder="eyJh..."
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  syncState === "error"
                    ? "bg-rose-400"
                    : pendingPush
                    ? "bg-amber-400"
                    : syncState === "ok"
                    ? "bg-emerald-400"
                    : "bg-slate-500"
                }`}
              ></span>
              {syncState === "pulling"
                ? "Lettura..."
                : syncState === "pushing"
                ? "Scrittura..."
                : syncState === "error"
                ? "Errore di sync"
                : pendingPush
                ? "In attesa..."
                : syncCfg.lastSync
                ? `Sincronizzato (${new Date(
                    syncCfg.lastSync
                  ).toLocaleDateString("it-IT")} ${new Date(
                    syncCfg.lastSync
                  ).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })})`
                : "Mai sincronizzato"}
            </div>
            <div className="flex gap-2">
              <BtnGhost
                onClick={pullNow}
                disabled={syncState === "pulling" || syncState === "pushing"}
                className="py-1.5! text-xs!"
              >
                ⬇ Ricevi
              </BtnGhost>
              <BtnPrimary
                onClick={() => pushNow(data, false)}
                disabled={syncState === "pulling" || syncState === "pushing"}
                className="py-1.5! text-xs!"
              >
                ⬆ Invia
              </BtnPrimary>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-2 w-max">
            <input
              type="checkbox"
              className="rounded border-white/10 bg-white/5 text-indigo-400 focus:ring-indigo-400/30"
              checked={syncCfg.autoPush !== false}
              onChange={(e) =>
                saveSyncCfg({ ...syncCfg, autoPush: e.target.checked })
              }
            />
            <span className="text-xs text-slate-400">
              Invia automaticamente le modifiche al database (Auto-Push)
            </span>
          </label>
        </div>
      )}
    </Card>
  );
}

function DriveSettings({ data, update, notify }) {
  const cfg = data.settings?.drive || {
    clientId: "",
    letturaEsterna: false,
    cartellaImport: "",
  };
  const [f, setF] = useState(cfg);
  const [stato, setStato] = useState(
    driveService.collegato ? "collegato" : "scollegato"
  );
  const [msg, setMsg] = useState(null);
  const [lavoro, setLavoro] = useState(false);

  useEffect(() => {
  const settingsDrive = data.settings?.drive || {};
  driveService.configura(settingsDrive);
  const timer = setTimeout(() => {
    setF(settingsDrive);
  }, 0);
  return () => clearTimeout(timer);
}, [data.settings?.drive]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const salva = () => {
    update((d) => {
      d.settings.drive = f;
      return d;
    });
    driveService.configura(f);
    notify("Configurazione Drive salvata");
  };

  const collega = async () => {
    setLavoro(true);
    setMsg(null);
    driveService.configura(f);
    try {
      await driveService.collega();
      setStato("collegato");
      setMsg({
        ok: true,
        t: "Account collegato. I documenti verranno salvati nel tuo Drive.",
      });
    } catch (e) {
      setStato("scollegato");
      setMsg({ ok: false, t: e.message, hint: e.suggerimento });
    }
    setLavoro(false);
  };

  const scollega = () => {
    driveService.scollega();
    setStato("scollegato");
    setMsg({
      ok: true,
      t: "Account scollegato. I file restano nel tuo Drive.",
    });
  };

  const daFile = typeof location !== "undefined" && location.protocol === "file:";

  return (
    <Card className="p-5 mb-4" hover={false} delay={70}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display text-white">Documenti su Google Drive</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cedolini e altri documenti restano nel tuo Drive, in{" "}
            <b className="text-slate-400">Finance Manager › Documenti</b>. L'app
            salva solo il riferimento, così li ritrovi da PC e da telefono.
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
            stato === "collegato"
              ? "text-emerald-200 border-emerald-400/30 bg-emerald-400/10"
              : "text-slate-500 border-white/10"
          }`}
        >
          {stato === "collegato" ? "collegato" : "non collegato"}
        </span>
      </div>

      {daFile && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 my-3">
          <p className="text-xs text-amber-200">
            Aprendo l'app come file locale, Google non consente l'accesso.
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Pubblica il file su un indirizzo https — per esempio GitHub Pages — e
            autorizza quell'origine nel progetto Google Cloud.
          </p>
        </div>
      )}

      <div className="space-y-3 mt-3">
        <div>
          <Label>ID client OAuth</Label>
          <Input
            placeholder="123456-abc.apps.googleusercontent.com"
            value={f.clientId || ""}
            onChange={(e) => set("clientId", e.target.value.trim())}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Da Google Cloud → Credenziali → ID client OAuth di tipo{" "}
            <b className="text-slate-400">Applicazione web</b>. Non serve alcun
            segreto: l'app non lo usa e non lo conserva.
          </p>
        </div>

        <div className="rounded-xl border border-indigo-400/25 bg-indigo-400/[0.07] p-3">
          <p className="text-[11px] uppercase tracking-wider text-indigo-200/80 mb-1.5">
            Origine da autorizzare in Google Cloud
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-sm text-white bg-black/30 rounded-lg px-2.5 py-1.5">
              {origineCorrente() || "—"}
            </code>
            <BtnGhost
              className="py-1.5! text-xs! shrink-0"
              onClick={() => {
                navigator.clipboard?.writeText(origineCorrente());
                notify("Origine copiata");
              }}
            >
              Copia
            </BtnGhost>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Incollala in{" "}
            <b className="text-slate-300">Origini JavaScript autorizzate</b>{" "}
            (non in "URI di reindirizzamento"). Deve essere solo schema e
            dominio: niente cartelle, niente barra finale.
            {typeof window !== "undefined" &&
              window.location?.pathname &&
              window.location.pathname !== "/" && (
                <span className="block mt-1 text-amber-300/80">
                  Attenzione: il tuo indirizzo contiene il percorso{" "}
                  <code>{window.location.pathname}</code>, che <b>non</b> va
                  incluso.
                </span>
              )}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Dopo il salvataggio su Google possono servire alcuni minuti prima
            che la modifica abbia effetto.
          </p>
        </div>
        <button
          onClick={() => set("letturaEsterna", !f.letturaEsterna)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
            f.letturaEsterna
              ? "bg-indigo-400/10 border-indigo-400/40"
              : "bg-white/5 border-white/10"
          }`}
        >
          <span
            className={`w-10 rounded-full transition-all relative shrink-0 ${
              f.letturaEsterna
                ? "bg-linear-to-r from-indigo-400 to-violet-400"
                : "bg-white/10"
            }`}
            style={{ height: 22 }}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                f.letturaEsterna ? "left-5.5" : "left-0.5"
              }`}
            />
          </span>
          <span className="text-xs text-slate-300 text-left">
            Consenti anche la lettura di cartelle esistenti
            <span className="block text-slate-500 mt-0.5">
              Serve solo per importare cedolini già presenti nel tuo Drive.
              Senza, l'app vede unicamente i file che crea lei.
            </span>
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <BtnPrimary onClick={salva}>Salva</BtnPrimary>
          {stato === "collegato" ? (
            <BtnGhost onClick={scollega}>Scollega</BtnGhost>
          ) : (
            <BtnGhost onClick={collega} disabled={lavoro || !f.clientId}>
              {lavoro ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Autorizzo…
                </span>
              ) : (
                "Collega Google Drive"
              )}
            </BtnGhost>
          )}
        </div>
        {msg && (
          <div
            className={`rounded-xl p-3 text-xs border ${
              msg.ok
                ? "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-200"
                : "border-amber-400/25 bg-amber-500/[0.07] text-amber-200"
            }`}
            style={{ animation: "fadeUp .3s both" }}
          >
            {msg.ok ? "✓ " : "ⓘ "}
            {msg.t}
            {msg.hint && <p className="text-slate-400 mt-1">{msg.hint}</p>}
          </div>
        )}
        <div className="rounded-xl bg-white/3 border border-white/6 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
            Come vengono trattati i documenti
          </p>
          <ul className="text-[11px] text-slate-400 space-y-1">
            <li>
              · L'ambito richiesto è il più ristretto: l'app accede solo ai
              file che ha creato.
            </li>
            <li>
              · I PDF non vengono mai resi pubblici: si aprono scaricandoli con
              la tua autorizzazione.
            </li>
            <li>
              · L'autorizzazione dura circa un'ora e si rinnova da sola finché
              la usi.
            </li>
            <li>
              · Scollegando, i file restano nel tuo Drive e l'app perde
              l'accesso.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function LogoDevSettings({ data, update, notify }) {
  const currentKey = data.settings?.logoDevKey || "";
  const [key, setKey] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [testLogo, setTestLogo] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const k = data.settings?.logoDevKey || "";
    const timer = setTimeout(() => {
      setKey(k);
    }, 0);
    return () => clearTimeout(timer);
  }, [data.settings?.logoDevKey]);

  const isConfigured = !!(currentKey && currentKey.trim());

  const salva = () => {
    const cleanKey = key.trim();
    update((d) => {
      if (!d.settings) d.settings = {};
      d.settings.logoDevKey = cleanKey;
      return d;
    });
    setGlobalLogoDevKey(cleanKey);
    notify(cleanKey ? "Chiave Logo.dev salvata" : "Chiave Logo.dev rimossa");
  };

  const rimuovi = () => {
    setKey("");
    update((d) => {
      if (!d.settings) d.settings = {};
      d.settings.logoDevKey = "";
      return d;
    });
    setGlobalLogoDevKey("");
    setTestLogo(null);
    notify("Chiave Logo.dev rimossa");
  };

  const testaChiave = () => {
    const k = key.trim();
    if (!k) {
      setTestLogo({ ok: false, msg: "Inserisci prima una chiave API." });
      return;
    }
    setIsTesting(true);
    setTestLogo(null);
    
    const testUrl = `https://img.logo.dev/name/Netflix?token=${encodeURIComponent(k)}&size=64&format=png&fallback=404`;
    const img = new Image();
    img.onload = () => {
      setIsTesting(false);
      setTestLogo({ ok: true, msg: "Chiave valida! Connessione a Logo.dev riuscita.", url: testUrl });
    };
    img.onerror = () => {
      setIsTesting(false);
      setTestLogo({ ok: false, msg: "Impossibile recuperare il logo. Verifica che la chiave sia corretta." });
    };
    img.src = testUrl;
  };

  return (
    <Card className="p-5 mb-4" hover={false} delay={80}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display text-white">Loghi aziendali (Logo.dev)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mostra automaticamente i loghi ufficiali delle compagnie (es. Amazon, Netflix, Esselunga) nei tuoi movimenti.
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
            isConfigured
              ? "text-emerald-200 border-emerald-400/30 bg-emerald-400/10"
              : "text-slate-500 border-white/10"
          }`}
        >
          {isConfigured ? "configurata" : "non configurata"}
        </span>
      </div>

      <div className="space-y-3 mt-3">
        <div>
          <Label>Chiave API pubblicabile (Publishable Key)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="pk_..."
                value={key}
                onChange={(e) => setKey(e.target.value.trim())}
                className="pr-16 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
                title={showKey ? "Nascondi chiave" : "Mostra chiave"}
              >
                {showKey ? "Nascondi" : "Mostra"}
              </button>
            </div>
            <BtnPrimary onClick={salva}>Salva</BtnPrimary>
            {isConfigured && (
              <BtnGhost onClick={rimuovi} className="text-rose-400 hover:text-rose-300">
                Rimuovi
              </BtnGhost>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Puoi ottenere gratuitamente una chiave registrandoti su{" "}
            <a
              href="https://www.logo.dev"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:underline"
            >
              Logo.dev
            </a>
            . La chiave pubblicabile (<code className="text-slate-400">pk_...</code>) è sicura da usare nel client e viene salvata solo nelle tue impostazioni.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <BtnGhost onClick={testaChiave} disabled={isTesting || !key.trim()}>
            {isTesting ? "Verifica in corso…" : "Testa chiave"}
          </BtnGhost>
          {testLogo && (
            <div className="flex items-center gap-2 text-xs">
              {testLogo.ok ? (
                <>
                  {testLogo.url && (
                    <img
                      src={testLogo.url}
                      alt="Test Logo"
                      className="w-5 h-5 rounded object-contain bg-white/10"
                    />
                  )}
                  <span className="text-emerald-300">{testLogo.msg}</span>
                </>
              ) : (
                <span className="text-rose-400">{testLogo.msg}</span>
              )}
            </div>
          )}
        </div>

        {!isConfigured && (
          <div className="rounded-xl bg-white/3 border border-white/6 p-3">
            <p className="text-[11px] text-slate-400">
              💡 <b>Nota:</b> Senza la chiave API configurata, il campo "Compagnia" nel modal dei movimenti resterà nascosto e verranno utilizzate esclusivamente le icone delle categorie.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function QuotesSettings({ data, update, notify }) {
  const cfg = data.settings?.market || {
    twelvedata: "",
    finnhub: "",
    alphavantage: "",
    proxy: "",
  };
  const [f, setF] = useState(cfg);
  const [prova, setProva] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
  const settingsMarket = data.settings?.market || {};
  const timer = setTimeout(() => {
    setF(settingsMarket);
  }, 0);

  return () => clearTimeout(timer);
}, [data.settings?.market]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const salva = () => {
    update((d) => {
      d.settings.market = f;
      return d;
    });
    marketData.configura(f);
    notify("Impostazioni quotazioni salvate");
  };

  const testa = async () => {
    setTesting(true);
    setProva(null);
    marketData.configura(f);
    const campione = {
      nome: "Vanguard FTSE All-World",
      ticker: "VWCE",
      isin: "IE00BK5BQT80",
      tipo: "ETF",
      valuta: "EUR",
      mercato: "Xetra",
    };
    try {
      const q = await marketData.quote(campione, { forza: true });
      setProva({
        ok: true,
        msg: `VWCE a ${eur(q.prezzo)} · fonte: ${q.fonte}`,
      });
    } catch (e) {
      setProva({ ok: false, msg: e.message, hint: e.suggerimento });
    }
    setTesting(false);
  };

  return (
    <Card className="p-5 mb-4" hover={false} delay={90}>
      <h2 className="font-display text-white mb-1">
        Quotazioni degli investimenti
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        L'app prova più fonti in sequenza e usa la prima che risponde. Senza
        configurare nulla funzionano già le criptovalute; per gli ETF serve una
        chiave gratuita o un ponte per le richieste.
      </p>

      <div className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Twelve Data</Label>
            <Input
              type="password"
              placeholder="chiave (facoltativa)"
              value={f.twelvedata || ""}
              onChange={(e) => set("twelvedata", e.target.value.trim())}
            />
          </div>
          <div>
            <Label>Alpha Vantage</Label>
            <Input
              type="password"
              placeholder="chiave (facoltativa)"
              value={f.alphavantage || ""}
              onChange={(e) => set("alphavantage", e.target.value.trim())}
            />
          </div>
          <div>
            <Label>Finnhub</Label>
            <Input
              type="password"
              placeholder="chiave (facoltativa)"
              value={f.finnhub || ""}
              onChange={(e) => set("finnhub", e.target.value.trim())}
            />
          </div>
        </div>
        <div>
          <Label>Ponte per Yahoo e Stooq (facoltativo)</Label>
          <Input
            placeholder="https://corsproxy.io/?{url}"
            value={f.proxy || ""}
            onChange={(e) => set("proxy", e.target.value.trim())}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Yahoo e Stooq non permettono chiamate dirette dal browser. Con un
            servizio ponte diventano utilizzabili, anche per gli ETF europei e
            lo storico dei prezzi.
          </p>
          {f.proxy?.trim() && (
            <p className="text-[11px] mt-1 text-slate-400">
              Verrà chiamato così:{" "}
              <code className="text-indigo-300 break-all">
                {viaPonte(
                  f.proxy,
                  "https://query1.finance.yahoo.com/…"
                ).slice(0, 90)}
                …
              </code>
              {!f.proxy.includes("{url}") && (
                <span className="block text-amber-300/80 mt-0.5">
                  Suggerimento: la forma più chiara è terminare con{" "}
                  <code>?url={" {url} "}</code>.
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <BtnPrimary onClick={salva}>Salva</BtnPrimary>
          <BtnGhost onClick={testa} disabled={testing}>
            {testing ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Provo…
              </span>
            ) : (
              "Prova con VWCE"
            )}
          </BtnGhost>
        </div>
        {prova && (
          <div
            className={`rounded-xl p-3 text-xs border ${
              prova.ok
                ? "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-200"
                : "border-amber-400/25 bg-amber-500/[0.07] text-amber-200"
            }`}
            style={{ animation: "fadeUp .3s both" }}
          >
            {prova.ok ? "✓ " : "ⓘ "}
            {prova.msg}
            {prova.hint && <p className="text-slate-400 mt-1">{prova.hint}</p>}
            {!prova.ok && (
              <p className="text-slate-500 mt-1">
                Puoi comunque aggiornare i prezzi a mano: il portafoglio resta
                accurato.
              </p>
            )}
          </div>
        )}
        <div className="rounded-xl bg-white/3 border border-white/6 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
            Ordine con cui vengono provate le fonti
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["CoinGecko", "crypto · sempre attivo"],
              ["Twelve Data", f.twelvedata ? "pronto" : "senza chiave"],
              ["Yahoo", f.proxy ? "pronto" : "serve il ponte"],
              ["Stooq", f.proxy ? "pronto" : "serve il ponte"],
              ["Alpha Vantage", f.alphavantage ? "pronto" : "senza chiave"],
              ["Finnhub", f.finnhub ? "pronto" : "senza chiave"],
            ].map(([nome, stato], i) => (
              <span
                key={nome}
                className={`text-[11px] px-2 py-1 rounded-lg border ${
                  /pronto|sempre/.test(stato)
                    ? "text-emerald-200 border-emerald-400/25 bg-emerald-400/10"
                    : "text-slate-500 border-white/10"
                }`}
              >
                {i + 1}. {nome} · {stato}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};