import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";

import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

import {
  eur,
  todayISO,
  monthKey,
  addMonthsMk,
  endOfMonthIso,
  getTxGroup,
  uid,
  getCategoryGroups,
  applyTheme,
  setGlobalCurrency,
} from "./utils/helpers";

import {
  DEFAULT_SYNC_CFG,
  DEFAULT_ACCOUNT_TYPES,
  ACCOUNT_ICON_BY_TYPE,
  STORAGE_KEY,
  BACKUP_PREFIX,
  SYNC_CFG_KEY,
  DATA_VERSION,
  freshData,
  DEFAULT_EXCHANGE_RATES,
} from "./config/constants";

// --- SERVIZI ---
import { repository, syncableState, uniscePreservando } from "./services/repository";

// --- COMPONENTI UI COMUNI ---
import { Logo } from "./components/Logo";
import { BtnPrimary, BtnGhost } from "./components/Buttons";
import Modal from "./components/Modal";
import { CommandPalette } from "./components/CommandPalette";

// --- MODALI ---
import { TxModal } from "./components/shared/TxModal";

// --- PAGINE ---
import { Dashboard } from "./pages/Dashboard";
import { Movimenti } from "./pages/Movimenti";
import { BudgetPage } from "./pages/Budget";
import { CategoriePage, CatModal } from "./pages/Categorie";
import { Conti } from "./pages/Conti";
import { TripExpenseModal, ViaggiPage } from "./pages/Viaggi";
import { InvestimentiPage } from "./pages/Investimenti";
import { CarrieraPage } from "./pages/Carriera";
import { Report } from "./pages/Report";
import { Obiettivi } from "./pages/Obiettivi";
import { ArchivioPage } from "./pages/Archivio";
import { Impostazioni } from "./pages/Impostazioni";
import { storage } from "./services/storage";
import { Spinner } from "./components/Spinner";
import { StyleTag } from "./components/Typography";
import { marketData } from "./services/markets";
import { BriefcaseBusiness, ChartColumnBig, ChartNoAxesCombined, HandCoins, LayoutDashboard, Plane, Plus, Settings, Tags, Target, Trophy, WalletCards } from "lucide-react";

/* ============================================================
   APP PRINCIPALE
   ============================================================ */
export default function App() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [saveState, setSaveState] = useState("saved");
  const [toast, setToast] = useState(null);
  const [txModal, setTxModal] = useState(null); // null | {} | tx
  const [catEditor, setCatEditor] = useState(null); // null | {cat?, prefillName?, prefillGroup?, onDone?}
  const [confirmDlg, setConfirmDlg] = useState(null); // {msg, onOk}
  const [palette, setPalette] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedNavId, setDraggedNavId] = useState(null);
  const [syncCfg, setSyncCfg] = useState(DEFAULT_SYNC_CFG);
  const [syncState, setSyncState] = useState("idle"); // idle | pulling | pushing | ok | error
  const [syncError, setSyncError] = useState(null);
  const [pendingPush, setPendingPush] = useState(false);
  const [quickTripExpense, setQuickTripExpense] = useState(null); // null | { trip }

  const saveTimer = useRef(null);
  const pushTimer = useRef(null);
  const skipSave = useRef(true);
  const skipPush = useRef(true);

  const nowMk = monthKey(new Date());
  const [selMonth, setSelMonth] = useState(nowMk);
  const isCurrentMonth = selMonth === nowMk;

  const [ rates, setRates] = useState(DEFAULT_EXCHANGE_RATES);
  const fetchedRatesRef = useRef(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /* ---------- Normalizzazione / migrazioni ---------- */
  const normalize = useCallback((d) => {
    if (!d.trash) d.trash = [];
    if (!d.settings) d.settings = { theme: "dark", onboarded: false };
    if (!d.groups || !d.groups.length)
      d.groups = [
        ...new Set((d.categories || []).flatMap((c) => getCategoryGroups(c))),
      ];
    (d.categories || []).forEach((c, i) => {
      if (c.ordine == null) c.ordine = i;
      if (!c.sottocategorie) c.sottocategorie = [];
    });
    (d.accounts || []).forEach((a) => {
      if (!a.icona) a.icona = ACCOUNT_ICON_BY_TYPE[a.tipo] || "💼";
    });
    if (!d.budgets) d.budgets = {};
    if (!d.goals) d.goals = [];
    if (!d.trips) d.trips = [];
    if (!d.tripExpenses) d.tripExpenses = [];
    if (!d.wishlist) d.wishlist = [];
    if (
      !d.accountTypes ||
      !Array.isArray(d.accountTypes) ||
      d.accountTypes.length === 0
    )
      d.accountTypes = DEFAULT_ACCOUNT_TYPES;
    else
      d.accountTypes = d.accountTypes.map((t) => ({
        tipo: t.tipo || "",
        icona: t.icona || ACCOUNT_ICON_BY_TYPE[t.tipo] || "💼",
      }));

    if (!d.jobs) d.jobs = [];
    if (!d.payslips) d.payslips = [];
    if (!d.tfrEntries) d.tfrEntries = [];
    if (!d.documenti) d.documenti = [];
    if (!d.salaryEvents) d.salaryEvents = [];
    if (!d.assets) d.assets = [];
    if (!d.trades) d.trades = [];
    if (!d.quotes) d.quotes = {};
    return d;
  }, []);
  /* ---------- Gestione Tema Chiaro / Scuro ---------- */
  useEffect(() => {
    if (data?.settings?.theme) {
      applyTheme(data.settings.theme);
    } else {
      applyTheme('dark');
    }
  }, [data?.settings?.theme]);

  /* ---------- Gestione Cambio Valuta ---------- */
  useEffect(() => {
  if (fetchedRatesRef.current) return;
  fetchedRatesRef.current = true;

  marketData.getExchangeRates().then((liveRates) => {
    if (liveRates && Object.keys(liveRates).length > 0) {
      setRates(liveRates);

      setData((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          _ratesUpdated: Date.now(),
        };
      });
    }
  });
}, []);

useEffect(() => {
  const selectedCurrency = data?.settings?.currency || "EUR";
  setGlobalCurrency(selectedCurrency, rates);
}, [data?.settings?.currency, rates]);
  
  /* ---------- Caricamento: locale subito, poi pull dal foglio ---------- */
  useEffect(() => {
    (async () => {
      let cfg = DEFAULT_SYNC_CFG;
      try {
        const r = await storage?.get(SYNC_CFG_KEY);
        if (r?.value) cfg = { ...DEFAULT_SYNC_CFG, ...JSON.parse(r.value) };
      } catch {
        //ignore the exceptions
      }
      setSyncCfg(cfg);
      repository.setRemote(cfg);

      let d = await repository.loadLocal();
      if (!d) {
        d = freshData(true);
        await repository.saveLocal(d);
      }
      d = normalize(d);
      setData(d);
      if (d.settings?.lastDashboardMonth)
        setSelMonth(d.settings.lastDashboardMonth);
      setTimeout(() => setLoaded(true), 150);

      if (repository.hasRemote) {
        setSyncState("pulling");
        try {
          const remote = await repository.pull();
          if (remote) {
            const merged = normalize({ ...d, ...uniscePreservando(d, remote) });
            setData(merged);
            await repository.saveLocal(merged);
            setSyncState("ok");
            setSyncError(null);
          } else {
            const ts = await repository.push(syncableState(d));
            setSyncState("ok");
            setSyncError(null);
            const next = { ...cfg, lastSync: ts };
            setSyncCfg(next);
            try {
              await storage?.set(SYNC_CFG_KEY, JSON.stringify(next));
            } catch {
              //ignore the exceptions
            }
            notify("Foglio inizializzato con i tuoi dati");
          }
        } catch (e) {
          setSyncState("error");
          setSyncError({
            message: e.message,
            hint: e.hint || "",
            retriable: e.retriable !== false,
          });
        } finally {
          skipPush.current = true;
        }
      }
    })();
  }, [normalize, notify]);

  /* ---------- Config sync ---------- */
  const saveSyncCfg = useCallback(async (cfg) => {
    setSyncCfg(cfg);
    repository.setRemote(cfg);
    try {
      await storage?.set(SYNC_CFG_KEY, JSON.stringify(cfg));
    } catch {
      //ignore the exceptions
    }
  }, []);

  /* ---------- Push / Pull manuali ---------- */
  const pushNow = useCallback(
    async (state, silent) => {
      if (!repository.hasRemote || !state) return;
      setSyncState("pushing");
      try {
        const ts = await repository.push(syncableState(state));
        setSyncState("ok");
        setSyncError(null);
        setPendingPush(false);
        setSyncCfg((c) => {
          const next = { ...c, lastSync: ts };
          storage?.set(SYNC_CFG_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
        if (!silent) notify("Foglio aggiornato");
      } catch (e) {
        setSyncState("error");
        setPendingPush(true);
        setSyncError({
          message: e.message,
          hint: e.hint || "",
          retriable: e.retriable !== false,
        });
        if (!silent) notify("Sincronizzazione non riuscita");
      }
    },
    [notify]
  );

  const pullNow = useCallback(async () => {
    if (!repository.hasRemote) {
      notify("Configura prima il collegamento in Impostazioni");
      return;
    }
    setSyncState("pulling");
    try {
      const remote = await repository.pull();
      if (!remote) {
        notify("Il foglio è vuoto: invia prima i tuoi dati");
        setSyncState("ok");
        return;
      }
      setData((d) => {
        const merged = normalize({ ...d, ...uniscePreservando(d, remote) });
        repository.saveLocal(merged);
        return merged;
      });
      skipPush.current = true;
      setSyncState("ok");
      setSyncError(null);
      setPendingPush(false);
      notify("Dati aggiornati dal foglio");
    } catch (e) {
      setSyncState("error");
      setSyncError({
        message: e.message,
        hint: e.hint || "",
        retriable: e.retriable !== false,
      });
      notify("Lettura dal foglio non riuscita");
    }
  }, [notify, normalize]);

  /* ---------- Autosave + backup rotativi ---------- */
  useEffect(() => {
    if (!data) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const next = {
          ...data,
          saveCount: (data.saveCount || 0) + 1,
          savedAt: new Date().toISOString(),
        };
        await storage?.set(STORAGE_KEY, JSON.stringify(next));
        if (next.saveCount % 8 === 0) {
          const slot = Math.floor(next.saveCount / 8) % 5;
          await storage?.set(
            BACKUP_PREFIX + slot,
            JSON.stringify({ ts: new Date().toISOString(), data: next })
          );
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  /* ---------- Auto-push su Google Sheets ---------- */
  useEffect(() => {
  if (!data || !loaded) return;
  if (skipPush.current) {
    skipPush.current = false;
    return;
  }
  if (!repository.hasRemote || !syncCfg.autoPush) return;
  const setupTimer = setTimeout(() => {
    setPendingPush(true);
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushNow(data, true), 2500);
  }, 0);
  return () => {
    clearTimeout(setupTimer);
    clearTimeout(pushTimer.current);
  };
}, [data, loaded, syncCfg.autoPush, syncCfg.url, pushNow]);

  /* ---------- Ritorno online ---------- */
  useEffect(() => {
    const onOnline = () => {
      if (pendingPush && repository.hasRemote) pushNow(data, true);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pendingPush, data, pushNow]);

  const update = (fn) =>
    setData((d) => {
      if (!d) return d;
      const copy = typeof structuredClone === "function" 
        ? structuredClone(d) 
        : JSON.parse(JSON.stringify(d));
      return fn(copy);
    });

  /* ---------- Derivati ---------- */
  const txs = useMemo(
    () => (data ? data.transactions.filter((t) => !t.deletedAt) : []),
    [data]
  );
  const catById = useMemo(
    () =>
      Object.fromEntries((data?.categories || []).map((c) => [c.id, c])),
    [data]
  );
  const accById = useMemo(
    () => Object.fromEntries((data?.accounts || []).map((a) => [a.id, a])),
    [data]
  );

  const balances = useMemo(() => {
    const b = {};
    (data?.accounts || []).forEach((a) => (b[a.id] = a.saldoIniziale));
    const has = (id) => Object.prototype.hasOwnProperty.call(b, id);
    txs.forEach((t) => {
      if (t.tipo === "entrata") {
        if (has(t.conto)) b[t.conto] += t.importo;
      } else if (t.tipo === "spesa") {
        if (has(t.conto)) b[t.conto] -= t.importo;
      } else if (t.tipo === "trasferimento") {
        if (has(t.conto)) b[t.conto] -= t.importo;
        if (has(t.contoDest)) b[t.contoDest] += t.importo;
      }
    });
    return b;
  }, [txs, data]);

  const patrimonio = useMemo(
    () => Object.values(balances).reduce((s, v) => s + v, 0),
    [balances]
  );

  const investito = useMemo(
    () =>
      txs
        .filter(
          (t) =>
            t.tipo === "spesa" &&
            getTxGroup(t, catById) === "Investimenti"
        )
        .reduce((s, t) => s + t.importo, 0),
    [txs, catById]
  );

  useEffect(() => {
  if (!loaded || !data) return;
  if (data.settings?.lastDashboardMonth !== selMonth) {
    const timer = setTimeout(() => {
      update((d) => {
        if (!d.settings) d.settings = {};
        d.settings.lastDashboardMonth = selMonth;
        return d;
      });
    }, 0);
    return () => clearTimeout(timer);
  }
}, [selMonth, loaded, data]);

  const monthStats = useCallback(
    (mk) => {
      const mt = txs.filter((t) => monthKey(t.data) === mk);
      const entrate = mt
        .filter((t) => t.tipo === "entrata")
        .reduce((s, t) => s + t.importo, 0);
      const uscite = mt
        .filter(
          (t) =>
            t.tipo === "spesa" &&
            getTxGroup(t, catById) !== "Investimenti"
        )
        .reduce((s, t) => s + t.importo, 0);
      const inv = mt
        .filter(
          (t) =>
            t.tipo === "spesa" &&
            getTxGroup(t, catById) === "Investimenti"
        )
        .reduce((s, t) => s + t.importo, 0);
      return { entrate, uscite, inv, risparmio: entrate - uscite - inv, mt };
    },
    [txs, catById]
  );

  const cur = monthStats(selMonth);
  const prev = monthStats(addMonthsMk(selMonth, -1));

  const base0 = useMemo(
    () => (data?.accounts || []).reduce((s, a) => s + a.saldoIniziale, 0),
    [data]
  );

  const patAt = useCallback(
    (iso) =>
      base0 +
      txs
        .filter((t) => t.data <= iso)
        .reduce(
          (s, t) =>
            s +
            (t.tipo === "entrata"
              ? t.importo
              : t.tipo === "spesa"
              ? -t.importo
              : 0),
          0
        ),
    [base0, txs]
  );

  const anchorIso = isCurrentMonth ? todayISO() : endOfMonthIso(selMonth);
  const patrimonioShown = isCurrentMonth ? patrimonio : patAt(anchorIso);

  const wealthSeries = useCallback(
    (days, endIso) => {
      const start0 = (data?.accounts || []).reduce(
        (s, a) => s + a.saldoIniziale,
        0
      );
      const events = [...txs]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((t) => ({
          d: t.data,
          delta:
            t.tipo === "entrata"
              ? t.importo
              : t.tipo === "spesa"
              ? -t.importo
              : 0,
        }));
      const end = new Date(endIso + "T12:00:00");
      const out = [];
      let run = start0,
        ei = 0;
      for (let i = days; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
        while (ei < events.length && events[ei].d <= iso)
          run += events[ei++].delta;
        out.push({
          giorno: d.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
          }),
          iso,
          valore: Math.round(run),
        });
      }
      return out.filter(
        (_, i) =>
          days <= 40 ||
          i % Math.ceil(days / 40) === 0 ||
          i === out.length - 1
      );
    },
    [txs, data]
  );

  const [chartRange, setChartRange] = useState(30);

  const actualDays = useMemo(() => {
    if (chartRange === "all") {
      if (!txs || txs.length === 0) return 30;
      const oldestDate = new Date(txs[txs.length - 1].data);
      const endDate = new Date(anchorIso);
      const diffDays = Math.ceil(
        (endDate - oldestDate) / (1000 * 60 * 60 * 24)
      );
      return Math.max(diffDays, 30);
    }
    return chartRange;
  }, [chartRange, txs, anchorIso]);

  const series = useMemo(
    () => wealthSeries(actualDays, anchorIso),
    [wealthSeries, actualDays, anchorIso]
  );
  const deltaMese = cur.risparmio + cur.inv;

  /* ---------- Modalità Viaggio Rapida ---------- */
  const currentTrip = useMemo(() => {
    if (!data?.settings?.travelMode || !data?.trips) return null;
    const oggi = new Date().toISOString().slice(0, 10);
    return data.trips.find(
      (t) => t.partenza <= oggi && (!t.ritorno || t.ritorno >= oggi)
    );
  }, [data]);

  const saveQuickTripExp = (e) => {
    const id = uid();
    const trip = quickTripExpense.trip;
    update((d) => {
      if (!d.tripExpenses) d.tripExpenses = [];
      const rec = { ...e, id, tripId: trip.id };
      d.tripExpenses.push(rec);

      if (trip.syncFinanza) {
        const catId =
          d.categories.find((c) => c.nome.toLowerCase() === "viaggi")?.id ||
          (() => {
            const nid = uid();
            d.categories.push({
              id: nid,
              nome: "Viaggi",
              gruppo: "Wants",
              icona: "✈️",
              colore: "#FDBA74",
              sottocategorie: [],
              ordine: Math.max(-1, ...d.categories.map((c) => c.ordine)) + 1,
            });
            return nid;
          })();

        const tx = {
          id: uid(),
          tipo: "spesa",
          importo: rec.importo,
          data: rec.data,
          categoria: catId,
          sottocategoria: rec.categoria,
          conto: rec.conto || d.accounts[0]?.id,
          metodo: rec.metodo,
          note: `${trip.nome}: ${rec.descrizione || rec.categoria}`,
          tags: ["viaggio"],
          tripExpenseId: id,
          tripId: trip.id,
        };
        d.transactions.unshift(tx);
        d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      }
      return d;
    });
    setQuickTripExpense(null);
    notify("Spesa di viaggio aggiunta!");
  };

  /* ---------- Insight ---------- */
  const insights = useMemo(() => {
    const out = [];
    const spendBy = (stats) => {
      const m = {};
      stats.mt
        .filter((t) => t.tipo === "spesa")
        .forEach((t) => (m[t.categoria] = (m[t.categoria] || 0) + t.importo));
      return m;
    };
    const c = spendBy(cur),
      p = spendBy(prev);
    let best = null;
    Object.keys(c).forEach((k) => {
      if (p[k] > 20) {
        const diff = ((c[k] - p[k]) / p[k]) * 100;
        if (!best || Math.abs(diff) > Math.abs(best.diff))
          best = { k, diff };
      }
    });
    if (best)
      out.push(
        best.diff > 0
          ? `Hai speso il ${Math.round(best.diff)}% in più in ${
              catById[best.k]?.nome
            } rispetto al mese precedente.`
          : `Ottimo: −${Math.round(-best.diff)}% in ${
              catById[best.k]?.nome
            } rispetto al mese precedente.`
      );
    if (cur.entrate > 0)
      out.push(
        `Tasso di risparmio del mese: ${Math.round(
          ((cur.risparmio + cur.inv) / cur.entrate) * 100
        )}% delle entrate.`
      );
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    if (top)
      out.push(
        `${catById[top[0]]?.icona || ""} ${
          catById[top[0]]?.nome
        } è la categoria più costosa del mese (${eur(top[1])}).`
      );
    return out;
  }, [cur, prev, catById]);

  /* ---------- Azioni ---------- */
  const saveTx = (tx) => {
    update((d) => {
      if (tx.id) {
        const i = d.transactions.findIndex((t) => t.id === tx.id);
        if (i >= 0) d.transactions[i] = tx;
        else d.transactions.unshift(tx);
      } else {
        tx.id = uid();
        d.transactions.unshift(tx);
      }
      d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      return d;
    });
    setTxModal(null);
    notify(
      tx.tipo === "trasferimento"
        ? "Trasferimento salvato"
        : tx.tipo === "entrata"
        ? "Entrata salvata"
        : "Spesa salvata"
    );
  };

  const softDelete = (id, onSuccess) => {
    const doDelete = () => {
      update((d) => {
        const t = d.transactions.find((x) => x.id === id);
        if (t) t.deletedAt = new Date().toISOString();
        return d;
      });
      notify("Spostato nel cestino");
      if (onSuccess) onSuccess();
    };

    const isIOS =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    if (isIOS) {
      if (
        window.confirm(
          "Spostare questo movimento nel cestino? Potrai ripristinarlo in qualsiasi momento."
        )
      ) {
        doDelete();
      }
    } else {
      setConfirmDlg({
        msg: "Spostare questo movimento nel cestino? Potrai ripristinarlo in qualsiasi momento.",
        onOk: doDelete,
      });
    }
  };

  const restoreTx = (id) => {
    update((d) => {
      const t = d.transactions.find((x) => x.id === id);
      if (t) delete t.deletedAt;
      return d;
    });
    notify("Movimento ripristinato");
  };

  const hardDelete = (id) => {
    const doDelete = () => {
      update((d) => {
        d.transactions = d.transactions.filter((x) => x.id !== id);
        return d;
      });
      notify("Eliminato definitivamente");
    };

    const isIOS =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    const messaggio =
      "Eliminare definitivamente? Questa azione non è reversibile.";

    if (isIOS) {
      if (window.confirm(messaggio)) {
        doDelete();
      }
    } else {
      setConfirmDlg({
        msg: messaggio,
        onOk: doDelete,
      });
    }
  };

  /* ---------- Backup / Export / Import ---------- */
  const [backups, setBackups] = useState([]);
  const loadBackups = useCallback(async () => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      try {
        const r = await storage?.get(BACKUP_PREFIX + i);
        if (r?.value) {
          const b = JSON.parse(r.value);
          out.push({
            slot: i,
            ts: b.ts,
            n: b.data.transactions.length,
          });
        }
      } catch {
        //ignore the exceptions
      }
    }
    setBackups(out.sort((a, b) => b.ts.localeCompare(a.ts)));
  }, []);

  useEffect(() => {
  if (page === "impostazioni") {
    const timer = setTimeout(() => {
      loadBackups();
    }, 0);

    return () => clearTimeout(timer);
  }
}, [page, loadBackups]);

  const manualBackup = async () => {
    try {
      const slot = ((data.saveCount || 0) + 1) % 5;
      await storage?.set(
        BACKUP_PREFIX + slot,
        JSON.stringify({ ts: new Date().toISOString(), data })
      );
      notify("Backup creato");
      loadBackups();
    } catch {
      notify("Errore durante il backup");
    }
  };

  const restoreBackup = (slot) =>
    setConfirmDlg({
      msg: "Ripristinare questo backup? I dati attuali verranno sostituiti.",
      onOk: async () => {
        try {
          const r = await storage?.get(BACKUP_PREFIX + slot);
          const b = JSON.parse(r.value);
          setData(b.data);
          notify("Backup ripristinato");
        } catch {
          notify("Impossibile leggere il backup");
        }
      },
    });

  const download = (name, content, type) => {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportJSON = () =>
    download(
      `C.A.R.O.L.-backup-${todayISO()}.json`,
      JSON.stringify(data, null, 2),
      "application/json"
    );

  const exportCSV = () => {
    const rows = [
      [
        "Data",
        "Tipo",
        "Categoria",
        "Conto",
        "Importo",
        "Metodo",
        "Note",
        "Tag",
      ],
    ];
    txs.forEach((t) =>
      rows.push([
        t.data,
        t.tipo,
        catById[t.categoria]?.nome || "",
        accById[t.conto]?.nome || "",
        String(t.importo).replace(".", ","),
        t.metodo || "",
        (t.note || "").replace(/;/g, ","),
        (t.tags || []).join("|"),
      ])
    );
    download(
      `C.A.R.O.L.-movimenti-${todayISO()}.csv`,
      "\uFEFF" + rows.map((r) => r.join(";")).join("\n"),
      "text/csv"
    );
  };

  const exportXLSX = () => {
    if (typeof window.XLSX === "undefined") {
      notify("Libreria XLSX non ancora caricata");
      return;
    }
    const wb = window.XLSX.utils.book_new();
    const movRows = txs.map((t) => ({
      Data: t.data,
      Tipo: t.tipo,
      Categoria: catById[t.categoria]?.nome || "",
      Gruppo: getTxGroup(t, catById) || "",
      Conto: accById[t.conto]?.nome || "",
      Importo: t.tipo === "spesa" ? -t.importo : t.importo,
      Metodo: t.metodo || "",
      Note: t.note || "",
    }));
    window.XLSX.utils.book_append_sheet(
      wb,
      window.XLSX.utils.json_to_sheet(movRows),
      "Movimenti"
    );
    const contiRows = (data.accounts || []).map((a) => ({
      Conto: a.nome,
      Tipo: a.tipo,
      "Saldo iniziale": a.saldoIniziale,
      "Saldo attuale": Math.round((balances[a.id] || 0) * 100) / 100,
    }));
    window.XLSX.utils.book_append_sheet(
      wb,
      window.XLSX.utils.json_to_sheet(contiRows),
      "Conti"
    );
    const months = [...new Set(txs.map((t) => monthKey(t.data)))].sort();
    const riep = months.map((mk) => {
      const s = monthStats(mk);
      return {
        Mese: mk,
        Entrate: s.entrate,
        Uscite: s.uscite,
        Investimenti: s.inv,
        Risparmio: s.risparmio,
      };
    });
    window.XLSX.utils.book_append_sheet(
      wb,
      window.XLSX.utils.json_to_sheet(riep),
      "Riepilogo"
    );
    const out = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
    download(
      `C.A.R.O.L.-report-${todayISO()}.xlsx`,
      new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.transactions)) throw new Error();
        setConfirmDlg({
          msg: `Importare ${parsed.transactions.length} movimenti? I dati attuali verranno sostituiti (viene creato un backup automatico prima).`,
          onOk: async () => {
            await manualBackup();
            setData({ ...freshData(false), ...parsed, version: DATA_VERSION });
            notify("Dati importati");
          },
        });
      } catch {
        notify("File non valido: atteso un backup JSON di C.A.R.O.L.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /* ---------- Command palette Shortcuts ---------- */
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const NAV = useMemo(() => [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4"/> },
    { id: "movimenti", label: "Movimenti", icon: <HandCoins className="w-4 h-4"/> },
    { id: "budget", label: "Budget", icon: <Target className="w-4 h-4"/> },
    { id: "categorie", label: "Categorie", icon: <Tags className="w-4 h-4"/> },
    { id: "conti", label: "Conti", icon: <WalletCards className="w-4 h-4"/> },
    { id: "viaggi", label: "Viaggi", icon: <Plane className="w-4 h-4"/> },
    { id: "investimenti", label: "Investimenti", icon: <ChartNoAxesCombined className="w-4 h-4"/> },
    { id: "carriera", label: "Stipendio", icon: <BriefcaseBusiness className="w-4 h-4"/> },
    { id: "report", label: "Report", icon: <ChartColumnBig className="w-4 h-4"/> },
    { id: "obiettivi", label: "Obiettivi", icon: <Trophy className="w-4 h-4"/> },
    { id: "archivio", label: "Archivio", icon: <HandCoins className="w-4 h-4"/> },
    { id: "impostazioni", label: "Impostazioni", icon: <Settings className="w-4 h-4"/> },
  ], []);

  const orderedNav = useMemo(() => {
    const saved = (data?.settings?.navOrder || []).filter((id) =>
      NAV.some((n) => n.id === id)
    );
    const missing = NAV.filter((n) => !saved.includes(n.id)).map((n) => n.id);
    return [...saved, ...missing]
      .map((id) => NAV.find((n) => n.id === id))
      .filter(Boolean);
  }, [data, NAV]);

  const moveNavItem = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const ids = orderedNav.map((n) => n.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    update((d) => {
      if (!d.settings) d.settings = {};
      d.settings.navOrder = next;
      return d;
    });
    setDraggedNavId(null);
  };

  const mainRef = useRef(null);

  const handleDragEnd = (result) => {
  if (!result.destination) return;
  
  const sourceId = result.draggableId;
  const targetId = orderedNav[result.destination.index]?.id;
  
  if (sourceId && targetId && sourceId !== targetId) {
    moveNavItem(sourceId, targetId);
  }
};

  useEffect(() => {
    mainRef.current?.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [page]);

  /* ---------- Skeleton loading ---------- */
  if (!data) {
    return (
      <div className="min-h-screen bg-[#0A0C12] p-4 pt-[max(1rem,env(safe-area-inset-top))] md:p-8">
        <StyleTag />
        <div className="w-full max-w-[2400px] mx-auto md:pl-56">
          <div className="skeleton h-4 w-24 rounded-md mb-2" />
          <div className="skeleton h-8 w-72 rounded-lg mb-6" />
          <div className="skeleton h-64 w-full rounded-2xl mb-5" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton h-20 rounded-2xl"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div className="grid lg:grid-cols-5 gap-5">
            <div className="skeleton lg:col-span-3 h-72 rounded-2xl" />
            <div className="skeleton lg:col-span-2 h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0C12] text-slate-200 font-body overflow-x-hidden">
      <StyleTag />
      {/* C.A.R.O.L. ambientale */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute -top-40 -left-40 w-140 h-140 rounded-full opacity-25 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, #6366F1, transparent 70%)",
            animation: "drift 26s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/3 -right-52 w-130 h-130 rounded-full opacity-20 blur-[130px]"
          style={{
            background:
              "radial-gradient(circle, #2DD4BF, transparent 70%)",
            animation: "drift 32s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,157,249,0.06), transparent)",
          }}
        />
      </div>

      <div className="relative flex h-screen overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 p-5 gap-1 border-r border-white/5 h-screen overflow-hidden transition-colors">
          <div
            className="flex items-center gap-2.5 mb-4 px-1"
            style={{ animation: "fadeUp .5s both" }}
          >
            <Logo size={34} />
            <div>
              <span className="font-display text-lg text-white tracking-tight leading-none block">
                C.A.R.O.L
              </span>
              <span className="text-[9px] uppercase tracking-[0.22em] text-slate-500">
                Assistant
              </span>
            </div>
          </div>
          {orderedNav.map((n, i) => (
            <button
              key={n.id}
              draggable={reorderMode}
              onClick={() => {
                if (reorderMode) return;
                setPage(n.id);
              }}
              onDragStart={() => setDraggedNavId(n.id)}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={() => moveNavItem(draggedNavId, n.id)}
              onDragEnd={() => setDraggedNavId(null)}
              className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                page === n.id
                  ? "bg-white/8 text-white font-medium active-nav-btn"
                : "text-slate-400 hover:text-white hover:bg-white/5 hover:translate-x-0.5"
              } ${reorderMode ? "cursor-grab" : "cursor-pointer"}`}
              style={{
                animation: `fadeUp .5s both`,
                animationDelay: `${60 + i * 40}ms`,
              }}
            >
              {page === n.id && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-4 rounded-full bg-linear-to-b from-indigo-300 to-teal-300"
                  style={{ animation: "fadeIn .25s both" }}
                />
              )}
              {reorderMode && <span className="text-slate-500 text-sm">⋮⋮</span>}
              <span
                className={`text-base transition-opacity ${
                  page === n.id ? "opacity-100" : "opacity-60"
                }`}
              >
                {n.icon}
              </span>
              {n.label}
            </button>
          ))}
          <button
            onClick={() => setReorderMode((v) => !v)}
            className="mt-3 px-2 py-1 rounded-full text-[8px] uppercase tracking-[0.28em] text-slate-500/70 hover:text-slate-300 hover:bg-white/5 transition-all self-center w-fit"
          >
            {reorderMode ? "confirm" : "change order"}
          </button>
          <div className="mt-auto px-2">
            <button
              onClick={() => setPalette(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 hover:bg-white/10 transition-all"
            >
              <span>Cerca ovunque</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px]">
                ⌘K
              </kbd>
            </button>
            <div className="mt-3 space-y-2">
              <div
                className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                  saveState === "error" ? "text-rose-400" : "text-slate-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    saveState === "saving"
                      ? "bg-amber-400 animate-pulse"
                      : saveState === "error"
                      ? "bg-rose-400"
                      : "bg-emerald-400"
                  }`}
                />
                {saveState === "saving"
                  ? "Salvataggio…"
                  : saveState === "error"
                  ? "Errore di salvataggio"
                  : "Salvato in locale"}
              </div>
              {repository.hasRemote && (
                <button
                  onClick={() => pullNow()}
                  disabled={
                    syncState === "pulling" || syncState === "pushing"
                  }
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60 transition-all"
                  title="Rileggi tutto dal foglio"
                >
                  {syncState === "pulling" || syncState === "pushing" ? (
                    <Spinner />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        syncState === "error"
                          ? "bg-rose-400"
                          : pendingPush
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }`}
                    />
                  )}
                  <span
                    className={
                      syncState === "error" ? "text-rose-300" : "text-slate-400"
                    }
                  >
                    {syncState === "pulling"
                      ? "Lettura foglio…"
                      : syncState === "pushing"
                      ? "Invio al foglio…"
                      : syncState === "error"
                      ? "Sync non riuscita"
                      : pendingPush
                      ? "In attesa di invio"
                      : "Sincronizzato"}
                  </span>
                  <span className="ml-auto text-slate-600">⟳</span>
                </button>
              )}
            </div>
          </div>
        </aside>
        {/* Notch / Dynamic Island Blur Overlay */}
        <div className="md:hidden fixed top-0 inset-x-0 h-[env(safe-area-inset-top,20px)] bg-[#0A0C12]/80 backdrop-blur-md z-50 pointer-events-none" />
        {/* Main Content Area */}
        <main
          ref={mainRef}
          className="main-pad flex-1 min-w-0 h-screen overflow-y-auto overflow-x-hidden p-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:p-8 md:pt-8"
        >
          {/* Topbar Mobile */}
          <div className="md:hidden flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2 min-w-0">
              <Logo size={26} />
              <span className="font-display text-white truncate">
                {NAV.find((n) => n.id === page)?.label || "C.A.R.O.L"}
              </span>
            </div>
            <button
              onClick={() => setPalette(true)}
              aria-label="Cerca"
              className="w-10 h-10 shrink-0 grid place-items-center text-2xl text-slate-400 hover:text-white active:scale-95 transition-all"
            >
              ⌕
            </button>
          </div>

          <div
            key={page}
            style={{ animation: "pageIn .32s cubic-bezier(.22,1,.36,1)" }}
          >
            {syncError && (
              <div
                className="mb-4 rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] p-4 flex flex-wrap items-center gap-3"
                style={{ animation: "fadeUp .35s both" }}
              >
                <span className="text-lg">⚠</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-rose-200">{syncError.message}</p>
                  {syncError.hint && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {syncError.hint}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">
                    I tuoi dati restano al sicuro in locale: nulla è andato
                    perso.
                  </p>
                </div>
                <div className="flex gap-2">
                  {syncError.retriable && (
                    <BtnGhost
                      onClick={() => pushNow(data)}
                      disabled={syncState === "pushing"}
                      className="py-1.5! text-xs!"
                    >
                      {syncState === "pushing" ? "Invio…" : "Riprova"}
                    </BtnGhost>
                  )}
                  <button
                    onClick={() => setSyncError(null)}
                    className="text-xs text-slate-500 hover:text-white px-2 transition-colors"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            )}

            {page === "dashboard" && (
              <Dashboard
                {...{
                  patrimonio: patrimonioShown,
                  isCurrentMonth,
                  selMonth,
                  setSelMonth,
                  deltaMese,
                  cur,
                  prev,
                  series,
                  chartRange,
                  setChartRange,
                  txs,
                  catById,
                  accById,
                  insights,
                  investito,
                  data,
                  update,
                  setTxModal,
                  softDelete,
                  setPage,
                }}
              />
            )}
            {page === "movimenti" && (
              <Movimenti
                {...{ txs, catById, accById, data, setTxModal, softDelete }}
              />
            )}
            {page === "budget" && (
              <BudgetPage {...{ data, update, cur, catById, notify }} />
            )}
            {page === "categorie" && (
              <CategoriePage
                {...{
                  data,
                  update,
                  notify,
                  setConfirmDlg,
                  txs,
                  setCatEditor,
                }}
              />
            )}
            {page === "conti" && (
              <Conti
                {...{ data, balances, update, notify, setConfirmDlg }}
                txsAll={txs}
                onTransfer={() => setTxModal({ tipo: "trasferimento" })}
              />
            )}
            {page === "viaggi" && (
              <ViaggiPage
                {...{ data, update, notify, setConfirmDlg, catById }}
              />
            )}
            {page === "investimenti" && (
              <InvestimentiPage
                {...{ data, update, notify, setConfirmDlg }}
              />
            )}
            {page === "carriera" && (
              <CarrieraPage
                {...{ data, update, notify, setConfirmDlg }}
              />
            )}
            {page === "report" && (
              <Report
                {...{ txs, catById, monthStats, patrimonio, data, update }}
              />
            )}
            {page === "obiettivi" && (
              <Obiettivi {...{ data, update, notify, setConfirmDlg }} />
            )}
            {page === "archivio" && (
              <ArchivioPage
                {...{ data, update, notify, setConfirmDlg }}
              />
            )}
            {page === "impostazioni" && (
              <Impostazioni
                {...{
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
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Drawer Mobile con Drag and Drop nativo per Touch */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-85">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            style={{ animation: "fadeIn .2s both" }}
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 w-68 max-w-[85vw] glass-strong border-r border-white/10 flex flex-col p-5 overflow-y-auto"
            style={{
              animation: "drawerIn .3s cubic-bezier(.22,1,.36,1) both",
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <Logo size={32} />
                <div>
                  <span className="font-display text-lg text-white tracking-tight leading-none block">
                    C.A.R.O.L
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Chiudi"
                className="w-9 h-9 rounded-full bg-white/5 text-slate-300 hover:bg-white/10 transition-all grid place-items-center"
              >
                ✕
              </button>
            </div>

            {/* Navigazione con Drag & Drop touch-friendly */}
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="mobile-drawer-nav">
                {(provided) => (
                  <nav
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-col gap-1"
                  >
                    {orderedNav.map((n, i) => (
                      <Draggable
                        key={n.id}
                        draggableId={n.id}
                        index={i}
                        isDragDisabled={!reorderMode}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onClick={() => {
                              if (reorderMode) return;
                              setPage(n.id);
                              setMenuOpen(false);
                            }}
                            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all select-none ${
                              page === n.id
                                ? "bg-white/9 text-white"
                                : "text-slate-400 active:bg-white/5"
                            } ${
                              snapshot.isDragging
                                ? "bg-indigo-500/20 border border-indigo-400/40 shadow-xl"
                                : ""
                            }`}
                            style={{
                              ...provided.draggableProps.style,
                              animation: snapshot.isDragging
                                ? "none"
                                : "fadeUp .35s both",
                              animationDelay: `${40 + i * 30}ms`,
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {page === n.id && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-5 rounded-full bg-linear-to-b from-indigo-300 to-teal-300" />
                              )}
                              <span
                                className={`text-base shrink-0 ${
                                  page === n.id ? "opacity-100" : "opacity-60"
                                }`}
                              >
                                {n.icon}
                              </span>
                              <span className="truncate">{n.label}</span>
                            </div>

                            {/* Maniglia di drag per mobile e PC */}
                            {reorderMode && (
                              <div
                                {...provided.dragHandleProps}
                                className="p-1 text-slate-400 hover:text-white touch-none cursor-grab active:cursor-grabbing text-sm"
                              >
                                ⋮⋮
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </nav>
                )}
              </Droppable>
            </DragDropContext>

            <button
              onClick={() => setReorderMode((v) => !v)}
              className="mt-3 px-2 py-1 rounded-full text-[8px] uppercase tracking-[0.28em] text-slate-500/70 hover:text-slate-300 hover:bg-white/5 transition-all self-center w-fit"
            >
              {reorderMode ? "confirm" : "change order"}
            </button>

            <div className="mt-auto pt-5">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setPalette(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 active:bg-white/10 transition-all"
              >
                Cerca ovunque <span className="text-slate-600">⌕</span>
              </button>
              <div
                className={`mt-3 flex items-center gap-1.5 text-[11px] ${
                  saveState === "error" ? "text-rose-400" : "text-slate-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    saveState === "saving"
                      ? "bg-amber-400 animate-pulse"
                      : saveState === "error"
                      ? "bg-rose-400"
                      : "bg-emerald-400"
                  }`}
                />
                {saveState === "saving"
                  ? "Salvataggio…"
                  : saveState === "error"
                  ? "Errore di salvataggio"
                  : "Salvato in locale"}
              </div>
              {repository.hasRemote && (
                <button
                  onClick={() => {
                    pullNow();
                    setMenuOpen(false);
                  }}
                  className="w-full mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] bg-white/5 border border-white/10 active:bg-white/10 transition-all"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      syncState === "error"
                        ? "bg-rose-400"
                        : pendingPush
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                  />
                  <span className="text-slate-400">
                    {syncState === "error"
                      ? "Sync non riuscita"
                      : pendingPush
                      ? "In attesa di invio"
                      : "Sincronizzato"}
                  </span>
                  <span className="ml-auto text-slate-600">⟳</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Contenitore Inferiore Mobile (Stile Card + High Blur) */}
      <div
        className="md:hidden fixed left-0 right-0 w-full px-6 z-40 flex gap-2.5 items-stretch transition-all"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Nav Bassa Mobile (80% larghezza) */}
        <nav className="flex-1 h-14 bg-white/3 border border-white/10 backdrop-blur-xl rounded-full flex justify-around items-center px-2">
          {orderedNav.slice(0,4)
            .map((n) => (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                aria-label={n.label}
                className={`flex-1 h-10 rounded-full grid place-items-center transition-all ${
                  page === n.id
                    ? "bg-white/10 text-teal-300 border border-white/15 shadow-sm scale-105"
                    : "text-slate-400 hover:text-white hover:bg-white/5 active:scale-90"
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center">
                  {n.icon}
                </span>
              </button>
            ))}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="flex-1 h-10 rounded-full grid place-items-center text-slate-400 hover:text-white hover:bg-white/5 active:scale-90 transition-all"
          >
            <span className="w-5 h-5 flex items-center justify-center">☰</span>
          </button>
        </nav>

        {/* FAB Dinamico (Stile Card + High Blur) */}
        {currentTrip ? (
          /* FAB Viaggio Rapido */
          <button
            onClick={() => setQuickTripExpense({ trip: currentTrip })}
            className="w-14 h-14 rounded-full bg-teal-500/15 border border-teal-400/30 backdrop-blur-xl text-teal-300 shadow-xl shadow-teal-500/10 hover:bg-teal-500/25 active:scale-95 transition-all grid place-items-center shrink-0 px-2"
            title={`Aggiungi spesa a ${currentTrip.nome}`}
          >
            <Plane className="w-5 h-5 stroke-[2.2]" />
          </button>
        ) : (
          /* FAB Principale (Standard) */
          <button
            onClick={() => setTxModal({})}
            className="w-14 h-14 rounded-full bg-indigo-500/15 border border-indigo-400/30 backdrop-blur-xl text-indigo-300 shadow-xl shadow-indigo-500/10 hover:bg-indigo-500/25 active:scale-95 transition-all grid place-items-center shrink-0 px-2"
            title="Nuovo movimento"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* FAB Standalone per Desktop (Visibile solo da md in su) */}
      <div className="hidden md:block fixed right-8 bottom-8 z-40">
        {currentTrip ? (
          <button
            onClick={() => setQuickTripExpense({ trip: currentTrip })}
            className="w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-400/30 backdrop-blur-xl text-teal-300 shadow-xl shadow-teal-500/20 hover:bg-teal-500/25 hover:scale-105 active:scale-95 transition-all grid place-items-center"
            title={`Aggiungi spesa a ${currentTrip.nome}`}
          >
            <Plane className="w-6 h-6 stroke-[2.2]" />
          </button>
        ) : (
          <button
            onClick={() => setTxModal({})}
            className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-400/30 backdrop-blur-xl text-indigo-300 shadow-xl shadow-indigo-500/20 hover:bg-indigo-500/25 hover:scale-105 active:scale-95 transition-all grid place-items-center"
            title="Nuovo movimento"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Toast Notifiche */}
      {toast && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-120 glass-strong rounded-xl px-4 py-2.5 text-sm text-white flex items-center gap-2 shadow-xl"
          style={{
            animation: "slideDown .35s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}

      {/* Modali Globali */}
      {quickTripExpense && (
        <TripExpenseModal
          open={!!quickTripExpense}
          exp={null}
          trip={quickTripExpense.trip}
          accounts={data?.accounts || []}
          onClose={() => setQuickTripExpense(null)}
          onSave={saveQuickTripExp}
        />
      )}

      <TxModal
        open={!!txModal}
        tx={txModal}
        onClose={() => setTxModal(null)}
        onSave={saveTx}
        data={data}
        setCatEditor={setCatEditor}
        onDelete={softDelete}
      />

      <CatModal
        open={!!catEditor}
        cat={catEditor?.cat}
        prefillName={catEditor?.prefillName}
        prefillGroup={catEditor?.prefillGroup}
        onClose={() => setCatEditor(null)}
        data={data}
        update={update}
        notify={notify}
        setConfirmDlg={setConfirmDlg}
        onSaved={(id) => {
          catEditor?.onDone?.(id);
          setCatEditor(null);
        }}
      />

      <Modal
        open={!!confirmDlg}
        onClose={() => setConfirmDlg(null)}
        title="Conferma"
      >
        <p className="text-sm text-slate-300 mb-5">{confirmDlg?.msg}</p>
        <div className="modal-actions flex gap-3 justify-end">
          <BtnGhost onClick={() => setConfirmDlg(null)}>Annulla</BtnGhost>
          <BtnPrimary
            autoFocus
            onClick={() => {
              confirmDlg.onOk();
              setConfirmDlg(null);
            }}
          >
            Conferma
          </BtnPrimary>
        </div>
      </Modal>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        nav={orderedNav}
        setPage={setPage}
        txs={txs}
        catById={catById}
        onNew={() => setTxModal({})}
      />
    </div>
  );
}