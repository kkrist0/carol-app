import { useState, useRef, useMemo } from "react";
import { fmtDate, labelMk, mkOf, uid } from "../utils/helpers";
import { DOC_CATEGORIE, docCat, driveService, meseDaNomeFile, nomeFileDocumento } from "../services/drive";
import { Card } from "../components/Card";
import { BtnPrimary, BtnGhost } from "../components/Buttons";
import { Input, Select } from "../components/Forms";
import { EmptyState } from "../components/Typography";
import { Spinner } from "../components/Spinner";
import { VisoreCedolino } from "./Carriera";

export function ArchivioPage({ data, update, notify, setConfirmDlg }) {
  const documenti = useMemo(() => data.documenti || [], [data.documenti]);

  const daBustePaga = useMemo(
    () =>
      (data.payslips || [])
        .filter((p) => p.cedolino?.driveFileId)
        .map((p) => ({
          id: "busta:" + p.id,
          tipo: "cedolini",
          titolo: `Cedolino ${labelMk(p.mese)}`,
          nomeFile: p.cedolino.nome,
          driveFileId: p.cedolino.driveFileId,
          cartella: "Cedolini",
          anno: p.mese.slice(0, 4),
          mese: p.mese,
          dataCaricamento: p.cedolino.dataCaricamento || "",
          dimensione: p.cedolino.dimensione || 0,
          mime: p.cedolino.mime || "application/pdf",
          daBusta: true,
        })),
    [data.payslips]
  );

  // ... resto del codice invariato

  const [categoria, setCategoria] = useState(null);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [cerca, setCerca] = useState("");
  const [aperto, setAperto] = useState(null);
  const [caricando, setCaricando] = useState(null);
  const [verifiche, setVerifiche] = useState({});
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const sostituisciRef = useRef(null);
  const [daSostituire, setDaSostituire] = useState(null);

  const collegato = driveService.collegato;
  const perCategoria = useMemo(() => {
    const m = {};
    DOC_CATEGORIE.forEach((c) => (m[c.id] = []));
    const idNoti = new Set();
    [...documenti, ...daBustePaga].forEach((d) => {
      if (idNoti.has(d.driveFileId)) return;
      idNoti.add(d.driveFileId);
      (m[d.tipo] = m[d.tipo] || []).push(d);
    });
    return m;
  }, [documenti, daBustePaga]);

  const elenco = useMemo(() => {
    const idNoti = new Set(documenti.map((d) => d.driveFileId));
    const tutti = [
      ...documenti,
      ...daBustePaga.filter((d) => !idNoti.has(d.driveFileId)),
    ];
    let l = categoria ? tutti.filter((d) => d.tipo === categoria) : tutti;
    if (categoria && docCat(categoria).perAnno)
      l = l.filter((d) => !d.anno || String(d.anno) === String(anno));
    const q = cerca.trim().toLowerCase();
    if (q)
      l = l.filter((d) =>
        `${d.titolo} ${d.nomeFile} ${d.note}`.toLowerCase().includes(q)
      );
    return [...l].sort((a, b) =>
      (b.dataCaricamento || "").localeCompare(a.dataCaricamento || "")
    );
  }, [categoria, documenti, daBustePaga, anno, cerca]);

  const carica = async (file, tipo) => {
    if (!file) return;
    if (!collegato) {
      notify("Collega Google Drive in Impostazioni per archiviare i documenti");
      return;
    }
    const cat = docCat(tipo);
    setCaricando({ nome: file.name, stato: "invio" });
    try {
      const meseRif =
        cat.id === "cedolini" ? mkOf(anno, new Date().getMonth()) : null;
      const nomeFile = nomeFileDocumento({
        tipo: cat.id,
        mese: meseRif,
        anno: cat.perAnno ? anno : null,
        originale: file.name,
      });
      const doc = await driveService.carica(file, {
        categoria: cat.cartella,
        anno: cat.perAnno ? anno : null,
        nomeFile,
      });
      update((d) => {
        if (!d.documenti) d.documenti = [];
        d.documenti.push({
          id: uid(),
          tipo: cat.id,
          titolo: file.name.replace(/\.[a-z0-9]+$/i, ""),
          nomeFile: doc.nomeFile,
          driveFileId: doc.driveFileId,
          cartella: cat.cartella,
          anno: cat.perAnno ? String(anno) : "",
          mese: meseRif || "",
          dataCaricamento: doc.dataCaricamento,
          dimensione: doc.dimensione,
          mime: doc.mime,
          collegatoA: "",
          note: "",
        });
        return d;
      });
      setCaricando({ nome: file.name, stato: "ok" });
      notify(`"${doc.nomeFile}" archiviato su Drive`);
      setTimeout(() => setCaricando(null), 1800);
    } catch (e) {
      setCaricando({
        nome: file.name,
        stato: "errore",
        messaggio: e.suggerimento || e.message,
      });
    }
  };

  const sostituisci = async (doc, file) => {
    if (!file) return;
    setCaricando({ nome: file.name, stato: "invio" });
    try {
      const agg = await driveService.sostituisci(
        doc.driveFileId,
        file,
        doc.nomeFile
      );
      update((d) => {
        const x = d.documenti.find((y) => y.id === doc.id);
        if (x)
          Object.assign(x, {
            dimensione: agg.dimensione,
            mime: agg.mime,
            dataCaricamento: agg.dataCaricamento,
          });
        return d;
      });
      setCaricando({ nome: file.name, stato: "ok" });
      notify("Documento sostituito, il riferimento resta lo stesso");
      setTimeout(() => setCaricando(null), 1800);
    } catch (e) {
      setCaricando({
        nome: file.name,
        stato: "errore",
        messaggio: e.suggerimento || e.message,
      });
    }
  };

  const elimina = (doc) =>
    setConfirmDlg({
      msg: `Eliminare "${doc.titolo || doc.nomeFile}"? Verrà rimosso anche dal tuo Google Drive.`,
      onOk: async () => {
        try {
          await driveService.elimina(doc.driveFileId);
        } catch {
            //ignore the exception
        }
        update((d) => {
          d.documenti = d.documenti.filter((x) => x.id !== doc.id);
          return d;
        });
        notify("Documento eliminato");
      },
    });

  const scarica = async (doc) => {
    try {
      const url = await driveService.contenuto(doc.driveFileId);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nomeFile;
      a.click();
    } catch (e) {
      notify(e.suggerimento || "Impossibile scaricare il documento");
    }
  };

  const [recupero, setRecupero] = useState(null);
  const recuperaDaDrive = async () => {
    if (!collegato) {
      notify("Collega prima Google Drive");
      return;
    }
    const categorie = categoria ? [docCat(categoria)] : DOC_CATEGORIE;
    setRecupero({ fase: "lettura", nuovi: 0 });
    let nuovi = 0;
    try {
      for (const cat of categorie) {
        setRecupero({ fase: "lettura", corrente: cat.nome, nuovi });
        const file = await driveService.scansiona(cat.cartella);
        if (!file.length) continue;
        update((d) => {
          if (!d.documenti) d.documenti = [];
          const noti = new Set(d.documenti.map((x) => x.driveFileId));
          (d.payslips || []).forEach(
            (p) => p.cedolino?.driveFileId && noti.add(p.cedolino.driveFileId)
          );
          file.forEach((f) => {
            if (noti.has(f.id)) return;
            const mese = meseDaNomeFile(f.name);
            d.documenti.push({
              id: uid(),
              tipo: cat.id,
              titolo: f.name.replace(/\.[a-z0-9]+$/i, ""),
              nomeFile: f.name,
              driveFileId: f.id,
              cartella: cat.cartella,
              anno: f.anno || (mese ? mese.slice(0, 4) : ""),
              mese: mese || "",
              dataCaricamento: (f.createdTime || "").slice(0, 10),
              dimensione: Number(f.size) || 0,
              mime: f.mimeType,
              collegatoA: "",
              note: "Recuperato da Drive",
            });
            nuovi++;
          });
          return d;
        });
      }
      setRecupero({ fase: "fatto", nuovi });
      notify(
        nuovi
          ? `${nuovi} documenti recuperati da Drive`
          : "Nessun documento nuovo su Drive"
      );
      setTimeout(() => setRecupero(null), 2500);
    } catch (e) {
      setRecupero({
        fase: "errore",
        messaggio: e.suggerimento || e.message,
      });
    }
  };

  const verificaTutti = async () => {
    const out = {};
    for (const d of elenco.slice(0, 30))
      out[d.id] = await driveService.verifica(d.driveFileId);
    setVerifiche(out);
    const problemi = Object.values(out).filter((v) => v.stato !== "ok").length;
    notify(
      problemi
        ? `${problemi} documenti non trovati su Drive`
        : "Tutti i documenti sono al loro posto"
    );
  };

  const anni = useMemo(() => {
    const s = new Set(documenti.map((d) => d.anno).filter(Boolean));
    s.add(String(new Date().getFullYear()));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [documenti]);

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header
        className="mb-5 flex items-end justify-between gap-3 flex-wrap"
        style={{ animation: "fadeUp .5s both" }}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Archivio
          </p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">
            I tuoi documenti
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            I file vivono nel tuo Google Drive, in Finance Manager › Documenti.
            Qui resta solo il riferimento.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] px-2.5 py-1 rounded-full border ${
              collegato
                ? "text-emerald-200 border-emerald-400/30 bg-emerald-400/10"
                : "text-amber-200 border-amber-400/30 bg-amber-400/10"
            }`}
          >
            {collegato ? "☁️ Drive collegato" : "Drive non collegato"}
          </span>
          {collegato && (
            <BtnGhost onClick={recuperaDaDrive} className="py-1.5! text-xs!">
              ⟳ Recupera da Drive
            </BtnGhost>
          )}
          {collegato && documenti.length > 0 && (
            <BtnGhost onClick={verificaTutti} className="py-1.5! text-xs!">
              Verifica archivio
            </BtnGhost>
          )}
        </div>
      </header>

      {!collegato && (
        <Card className="p-4 mb-4 border-amber-400/25" hover={false}>
          <p className="text-sm text-amber-200">
            Per archiviare i documenti serve il collegamento a Google Drive.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Vai in Impostazioni → Documenti su Google Drive. Ricorda che Google non
            consente l'accesso se apri l'app come file locale: serve un indirizzo
            https.
          </p>
        </Card>
      )}

      {recupero && (
        <Card
          className={`p-3.5 mb-4 ${
            recupero.fase === "errore" ? "border-rose-400/30" : ""
          }`}
          hover={false}
        >
          <div className="flex items-center gap-3">
            {recupero.fase === "lettura" ? (
              <Spinner size={16} />
            ) : (
              <span>{recupero.fase === "fatto" ? "✅" : "⚠"}</span>
            )}
            <p className="text-sm text-slate-200 flex-1 min-w-0">
              {recupero.fase === "lettura"
                ? `Leggo il tuo Drive${
                    recupero.corrente ? ` · ${recupero.corrente}` : ""
                  }…`
                : recupero.fase === "fatto"
                ? recupero.nuovi
                  ? `${recupero.nuovi} documenti aggiunti all'archivio`
                  : "Archivio già allineato con Drive"
                : recupero.messaggio}
            </p>
            {recupero.fase !== "lettura" && (
              <button
                onClick={() => setRecupero(null)}
                className="text-xs text-slate-500 hover:text-white transition-colors"
              >
                Chiudi
              </button>
            )}
          </div>
        </Card>
      )}

      {caricando && (
        <Card
          className={`p-3.5 mb-4 ${
            caricando.stato === "errore"
              ? "border-rose-400/30"
              : caricando.stato === "ok"
              ? "border-emerald-400/30"
              : ""
          }`}
          hover={false}
        >
          <div className="flex items-center gap-3">
            {caricando.stato === "invio" ? (
              <Spinner size={16} />
            ) : (
              <span>{caricando.stato === "ok" ? "✅" : "⚠"}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">{caricando.nome}</p>
              <p className="text-[11px] text-slate-400">
                {caricando.stato === "invio"
                  ? "Caricamento su Google Drive…"
                  : caricando.stato === "ok"
                  ? "Caricato correttamente"
                  : caricando.messaggio}
              </p>
            </div>
            {caricando.stato !== "invio" && (
              <button
                onClick={() => setCaricando(null)}
                className="text-xs text-slate-500 hover:text-white transition-colors"
              >
                Chiudi
              </button>
            )}
          </div>
        </Card>
      )}

      {!categoria ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {DOC_CATEGORIE.map((c, i) => {
            const n = (perCategoria[c.id] || []).length;
            return (
              <button
                key={c.id}
                onClick={() => setCategoria(c.id)}
                className="glass rounded-2xl card-hover p-4 text-left group"
                style={{
                  animation: "fadeUp .5s both",
                  animationDelay: `${i * 35}ms`,
                }}
              >
                <span
                  className="w-10 h-10 rounded-xl grid place-items-center text-lg mb-2"
                  style={{
                    background: c.colore + "1f",
                    border: `1px solid ${c.colore}33`,
                  }}
                >
                  {c.icona}
                </span>
                <p className="text-sm text-white truncate">{c.nome}</p>
                <p className="text-[11px] text-slate-500">
                  {n === 0
                    ? "nessun documento"
                    : `${n} document${n === 1 ? "o" : "i"}`}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setCategoria(null)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              ‹ Tutte le categorie
            </button>
            <span className="text-slate-600">·</span>
            <span className="text-sm text-white">
              {docCat(categoria).icona} {docCat(categoria).nome}
            </span>
            <div className="flex-1" />
            {docCat(categoria).perAnno && (
              <Select
                value={anno}
                onChange={(e) => setAnno(Number(e.target.value))}
                className="w-28!"
              >
                {anni.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
            <Input
              placeholder="Cerca…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              className="w-36!"
            />
            <BtnPrimary
              onClick={() => inputRef.current?.click()}
              disabled={!collegato}
            >
              + Carica
            </BtnPrimary>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              carica(e.dataTransfer.files?.[0], categoria);
            }}
            className={`rounded-2xl border border-dashed p-4 mb-4 text-center transition-all ${
              drag
                ? "border-indigo-400/70 bg-indigo-400/10"
                : "border-white/12"
            }`}
          >
            <p className="text-xs text-slate-400">
              Trascina qui un documento per archiviarlo in{" "}
              <b className="text-slate-300">
                {docCat(categoria).cartella}
                {docCat(categoria).perAnno ? ` › ${anno}` : ""}
              </b>
            </p>
          </div>

          <div className="space-y-2">
            {elenco.map((d, i) => {
              const v = verifiche[d.id];
              return (
                <Card
                  key={d.id}
                  className="p-3.5"
                  delay={Math.min(i, 10) * 30}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-xl grid place-items-center text-lg shrink-0"
                      style={{
                        background: docCat(d.tipo).colore + "1f",
                        border: `1px solid ${docCat(d.tipo).colore}33`,
                      }}
                    >
                      {/pdf/i.test(d.mime)
                        ? "📄"
                        : /image/i.test(d.mime)
                        ? "🖼️"
                        : "📎"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {d.titolo || d.nomeFile}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {d.nomeFile} ·{" "}
                        {d.dimensione
                          ? `${(d.dimensione / 1024).toFixed(0)} KB`
                          : "—"}
                        {d.dataCaricamento
                          ? ` · ${fmtDate(d.dataCaricamento)}`
                          : ""}
                        {d.daBusta && (
                          <span className="text-indigo-300">
                            {" "}
                            · collegato alla busta paga
                          </span>
                        )}
                        {v && (
                          <span
                            className={
                              v.stato === "ok"
                                ? " text-emerald-300"
                                : " text-amber-300"
                            }
                          >
                            {" "}
                            ·{" "}
                            {v.stato === "ok"
                              ? "presente su Drive ✅"
                              : v.stato === "cestinato"
                              ? "nel cestino di Drive"
                              : "non trovato su Drive"}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => setAperto(d)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-all"
                      >
                        Apri
                      </button>
                      <button
                        onClick={() => scarica(d)}
                        title="Scarica"
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 transition-all"
                      >
                        ⭳
                      </button>
                      <button
                        onClick={() => {
                          setDaSostituire(d);
                          setTimeout(
                            () => sostituisciRef.current?.click(),
                            0
                          );
                        }}
                        title="Sostituisci"
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 transition-all"
                      >
                        ⇄
                      </button>
                      {!d.daBusta && (
                        <button
                          onClick={() => elimina(d)}
                          title="Elimina"
                          className="w-8 h-8 rounded-lg text-[11px] text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
            {!elenco.length && (
              <Card className="p-6" hover={false}>
                <EmptyState
                  text={
                    collegato
                      ? "Nessun documento in questa categoria. Trascinane uno qui sopra."
                      : "Collega Google Drive per iniziare ad archiviare."
                  }
                />
              </Card>
            )}
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          carica(e.target.files?.[0], categoria);
          e.target.value = "";
        }}
      />
      <input
        ref={sostituisciRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (daSostituire) sostituisci(daSostituire, e.target.files?.[0]);
          setDaSostituire(null);
          e.target.value = "";
        }}
      />
      {aperto && (
        <VisoreCedolino
          valore={{
            tipo: "drive",
            driveFileId: aperto.driveFileId,
            nome: aperto.nomeFile,
          }}
          dati={null}
          onClose={() => setAperto(null)}
        />
      )}
    </div>
  );
}