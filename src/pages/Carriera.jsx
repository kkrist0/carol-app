import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { ResponsiveContainer, ComposedChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { eur, fmtDate, todayISO, monthKey, labelMk, parseMk, mkOf, uid } from "../utils/helpers";
import { driveService, cedoliniStore, nomeFileDocumento, docCat } from "../services/drive";
import { Card } from "../components/Card";
import { BtnPrimary, BtnGhost } from "../components/Buttons";
import { Input, Select, Label } from "../components/Forms";
import { Chip, EmptyState } from "../components/Typography";
import Modal from "../components/Modal";
import ImportDriveModal from "../components/shared/ImportDriveModal";
import { EVENT_TYPES, MESI } from "../config/constants";
import { ChartTip } from "../components/charts/ChartTip";
import { Spinner } from "../components/Spinner";
import { nettoTotale, quotaTfrAnnua, useCarrieraStats } from "../hooks/useCarriera";

export function CarrieraPage({ data, update, notify, setConfirmDlg }) {
  const [tab, setTab] = useState("stipendio");
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [bustaEdit, setBustaEdit] = useState(null);
  const [jobEdit, setJobEdit] = useState(null);
  const [tfrEdit, setTfrEdit] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const st = useCarrieraStats(data, anno);
  const jobAttivo = st.jobs.find((j) => !j.fine) || st.jobs[0];

  const salvaBusta = (b) => {
    update((d) => {
      if (!d.payslips) d.payslips = [];
      const i = d.payslips.findIndex((x) => x.id === b.id);
      if (i >= 0) d.payslips[i] = b;
      else d.payslips.push({ ...b, id: b.id || uid() });
      d.payslips.sort((a, x) => a.mese.localeCompare(x.mese));
      return d;
    });
    setBustaEdit(null);
    notify(`Busta paga di ${labelMk(b.mese).toLowerCase()} salvata`);
  };

  const eliminaBusta = (b) =>
    setConfirmDlg({
      msg: `Eliminare la busta paga di ${labelMk(b.mese).toLowerCase()}?`,
      onOk: () => {
        cedoliniStore.elimina(b.id);
        update((d) => {
          d.payslips = d.payslips.filter((x) => x.id !== b.id);
          return d;
        });
        notify("Busta paga eliminata");
      },
    });

  const generaAnno = ({ jobId, ral, mensilita, netto, sovrascrivi }) => {
    update((d) => {
      if (!d.payslips) d.payslips = [];
      const lordoMese = ral / mensilita;
      const oggi = new Date();
      for (let m = 0; m < 12; m++) {
        const mk = mkOf(anno, m);
        if (anno === oggi.getFullYear() && m > oggi.getMonth()) continue;
        const esistente = d.payslips.find((p) => p.mese === mk);
        if (esistente && !sovrascrivi) continue;
        if (esistente && !esistente.auto && !sovrascrivi) continue;
        const rec = {
          id: esistente?.id || uid(),
          jobId,
          mese: mk,
          auto: true,
          ral,
          lordo: Math.round(lordoMese * 100) / 100,
          netto: Math.round(netto * 100) / 100,
          tfr: 0,
          cedolino: esistente?.cedolino || null,
          bonus: 0,
          straordinari: 0,
          rimborsi: 0,
          premio: 0,
          tredicesima:
            mensilita >= 13 && m === 11 ? Math.round(netto * 100) / 100 : 0,
          quattordicesima:
            mensilita >= 14 && m === 5 ? Math.round(netto * 100) / 100 : 0,
          altre: 0,
          trattenute: 0,
          note: "Generata automaticamente",
        };
        if (esistente) Object.assign(esistente, rec);
        else d.payslips.push(rec);
      }
      d.payslips.sort((a, x) => a.mese.localeCompare(x.mese));
      return d;
    });
    setGenOpen(false);
    notify(`Mesi del ${anno} generati · puoi modificarli uno per uno`);
  };

  const onImporta = (abbinamenti) => {
    update((d) => {
      if (!d.payslips) d.payslips = [];
      abbinamenti.forEach(({ mese, file }) => {
        let p = d.payslips.find((x) => x.mese === mese);
        if (!p) {
          p = {
            id: uid(),
            jobId: d.jobs?.[0]?.id || "",
            mese,
            ral: 0,
            lordo: 0,
            netto: 0,
            bonus: 0,
            straordinari: 0,
            rimborsi: 0,
            premio: 0,
            tredicesima: 0,
            quattordicesima: 0,
            altre: 0,
            trattenute: 0,
            tfr: 0,
            auto: false,
            note: "Creata dall'importazione",
          };
          d.payslips.push(p);
        }
        p.cedolino = {
          tipo: "drive",
          driveFileId: file.id,
          nome: file.name,
          mime: file.mimeType,
          dimensione: Number(file.size) || 0,
          dataCaricamento: (file.createdTime || "").slice(0, 10),
        };
      });
      d.payslips.sort((a, x) => a.mese.localeCompare(x.mese));
      return d;
    });
    notify(`${abbinamenti.length} cedolini collegati`);
  };

  const salvaTfr = (t) => {
    update((d) => {
      if (!d.tfrEntries) d.tfrEntries = [];
      const i = d.tfrEntries.findIndex((x) => x.mese === t.mese);
      const rec = { ...t, id: t.id || uid(), manuale: true };
      if (i >= 0) d.tfrEntries[i] = rec;
      else d.tfrEntries.push(rec);
      d.tfrEntries.sort((a, x) => a.mese.localeCompare(x.mese));
      return d;
    });
    setTfrEdit(null);
    notify("Dato TFR aggiornato");
  };

  const salvaJob = (j) => {
    update((d) => {
      if (!d.jobs) d.jobs = [];
      const i = d.jobs.findIndex((x) => x.id === j.id);
      if (i >= 0) d.jobs[i] = j;
      else d.jobs.push({ ...j, id: j.id || uid() });
      return d;
    });
    setJobEdit(null);
    notify("Contratto salvato");
  };

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header
        className="mb-5 flex items-end justify-between gap-3 flex-wrap"
        style={{ animation: "fadeUp .5s both" }}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Carriera
          </p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">
            Stipendio e TFR
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sezione informativa: non modifica in alcun modo conti e patrimonio.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[
              { v: "stipendio", l: "Stipendio" },
              { v: "tfr", l: "TFR" },
              { v: "contratti", l: "Contratti" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                  tab === t.v
                    ? "bg-white/15 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div
        className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 mb-4 w-fit flex-wrap"
        style={{ animation: "fadeUp .5s both", animationDelay: "40ms" }}
      >
        <button
          onClick={() => setAnno((y) => y - 1)}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          ◀
        </button>
        {st.anniDisponibili
          .slice(0, 5)
          .sort((a, b) => a - b)
          .map((y) => (
            <button
              key={y}
              onClick={() => setAnno(y)}
              className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                anno === y
                  ? "bg-white/15 text-white"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              {y}
            </button>
          ))}
        <button
          onClick={() => setAnno((y) => y + 1)}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          ▶
        </button>
      </div>

      {tab === "stipendio" && (
        <SezioneStipendio
          {...{
            st,
            anno,
            setBustaEdit,
            eliminaBusta,
            setGenOpen,
            jobAttivo,
            onImporta,
          }}
        />
      )}
      {tab === "tfr" && <SezioneTfr {...{ st, anno, setTfrEdit }} />}
      {tab === "contratti" && (
        <SezioneContratti
          {...{ st, setJobEdit, setConfirmDlg, update, notify }}
        />
      )}

      <BustaModal
        open={!!bustaEdit}
        busta={bustaEdit}
        jobs={st.jobs}
        anno={anno}
        onClose={() => setBustaEdit(null)}
        onSave={salvaBusta}
        notify={notify}
      />
      <GeneraAnnoModal
        open={genOpen}
        anno={anno}
        jobs={st.jobs}
        jobAttivo={jobAttivo}
        onClose={() => setGenOpen(false)}
        onGenera={generaAnno}
      />
      <TfrModal
        open={!!tfrEdit}
        voce={tfrEdit}
        onClose={() => setTfrEdit(null)}
        onSave={salvaTfr}
      />
      <JobModal
        open={!!jobEdit}
        job={jobEdit}
        onClose={() => setJobEdit(null)}
        onSave={salvaJob}
      />
    </div>
  );
}

function SezioneStipendio({
  st,
  anno,
  setBustaEdit,
  eliminaBusta,
  setGenOpen,
  jobAttivo,
  onImporta,
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [vista, setVista] = useState("mensile");
  const [cedolinoAperto, setCedolinoAperto] = useState(null);

  const apriCedolino = async (b) => {
    const dati =
      b.cedolino?.tipo === "file" ? await cedoliniStore.leggi(b.id) : null;
    setCedolinoAperto({
      valore: {
        ...b.cedolino,
        nome: b.cedolino?.nome || `Cedolino ${labelMk(b.mese)}`,
      },
      dati,
    });
  };

  const chartDataMesi = useMemo(() => {
    return st.mesiAnno.map((m) => {
      const b = m.busta;
      if (!b)
        return {
          ...m,
          nettoBase: 0,
          nettoExtra: 0,
          trattBase: 0,
          trattExtra: 0,
        };

      const lordoBase = b.lordo || 0;
      const lordoExtraTassabile =
        (b.bonus || 0) +
        (b.straordinari || 0) +
        (b.premio || 0) +
        (b.tredicesima || 0) +
        (b.quattordicesima || 0) +
        (b.altre || 0);
      const rimborsi = b.rimborsi || 0;

      const lordoTotaleTassabile = lordoBase + lordoExtraTassabile;
      const trattenute = b.trattenute || 0;

      let trattBase = 0,
        trattExtra = 0;
      if (lordoTotaleTassabile > 0) {
        trattBase = (lordoBase / lordoTotaleTassabile) * trattenute;
        trattExtra = (lordoExtraTassabile / lordoTotaleTassabile) * trattenute;
      }

      return {
        ...m,
        nettoBase: Math.round((lordoBase - trattBase) * 100) / 100,
        nettoExtra:
          Math.round((lordoExtraTassabile - trattExtra + rimborsi) * 100) / 100,
        trattBase: Math.round(trattBase * 100) / 100,
        trattExtra: Math.round(trattExtra * 100) / 100,
      };
    });
  }, [st.mesiAnno]);

  const chartDataAnni = useMemo(() => {
    const map = {};
    (st.payslips || []).forEach((b) => {
      const y = b.mese.slice(0, 4);
      if (!map[y])
        map[y] = {
          anno: y,
          lordoBase: 0,
          lordoExtra: 0,
          rimborsi: 0,
          trattenute: 0,
        };

      map[y].lordoBase += b.lordo || 0;
      map[y].lordoExtra +=
        (b.bonus || 0) +
        (b.straordinari || 0) +
        (b.premio || 0) +
        (b.tredicesima || 0) +
        (b.quattordicesima || 0) +
        (b.altre || 0);
      map[y].rimborsi += b.rimborsi || 0;
      map[y].trattenute += b.trattenute || 0;
    });

    return Object.values(map)
      .sort((a, b) => a.anno.localeCompare(b.anno))
      .map((y) => {
        const lordoTotaleTassabile = y.lordoBase + y.lordoExtra;
        let trattBase = 0,
          trattExtra = 0;
        if (lordoTotaleTassabile > 0) {
          trattBase = (y.lordoBase / lordoTotaleTassabile) * y.trattenute;
          trattExtra = (y.lordoExtra / lordoTotaleTassabile) * y.trattenute;
        }

        return {
          anno: y.anno,
          nettoBase: Math.round((y.lordoBase - trattBase) * 100) / 100,
          nettoExtra:
            Math.round((y.lordoExtra - trattExtra + y.rimborsi) * 100) / 100,
          trattExtra: Math.round(trattExtra * 100) / 100,
          trattBase: Math.round(trattBase * 100) / 100,
        };
      });
  }, [st.payslips]);

  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {[
          {
            l: `Totale percepito ${anno}`,
            v: eur(st.totNetto),
            sub: `${st.conDati.length} mesi registrati`,
            tone: "text-teal-300",
          },
          {
            l: `Lordo ${anno}`,
            v: eur(st.totLordo),
            sub: st.cur ? `media ${eur(st.mediaLordo)}/mese` : "—",
            tone: "text-sky-300",
          },
          {
            l: "Netto medio",
            v: eur(st.mediaNetto),
            sub: "per mese registrato",
            tone: "text-white",
          },
          {
            l: "Rispetto all'anno prima",
            v:
              st.crescita != null
                ? `${st.crescita >= 0 ? "+" : ""}${st.crescita.toFixed(1)}%`
                : "—",
            sub: st.prec
              ? `${anno - 1}: ${eur(st.prec.Netto)}`
              : "nessun confronto",
            tone: st.crescita >= 0 ? "text-emerald-300" : "text-rose-300",
          },
          {
            l: "Bonus e premi",
            v: eur(st.totBonus),
            sub:
              st.mediaBonus > 0
                ? `media ${eur(st.mediaBonus)} quando c'è`
                : "nessuno quest'anno",
            tone: "text-amber-300",
          },
          {
            l: "Straordinari",
            v: eur(st.totStraordinari),
            sub:
              st.totRimborsi > 0
                ? `+ ${eur(st.totRimborsi)} di rimborsi`
                : "nessun rimborso",
            tone: "text-violet-300",
          },
          {
            l: "Tasse e contributi stimati",
            v: eur(st.tasseStimate),
            sub: `circa il ${st.aliquota.toFixed(0)}% del lordo`,
            tone: "text-rose-300",
          },
          {
            l: "TFR maturato nell'anno",
            v: eur(st.tfrMaturatoAnno),
            sub: `totale ${eur(st.tfrTotale)}`,
            tone: "text-emerald-300",
          },
        ].map((s, i) => (
          <Card key={s.l} className="p-4" delay={i * 45}>
            <p className="text-xs text-slate-400">{s.l}</p>
            <p
              className={`font-display text-lg sm:text-xl mt-1 tabular-nums ${s.tone}`}
            >
              {s.v}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5 mb-4" hover={false} delay={120}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display text-white">
            {vista === "mensile" ? `Andamento ${anno}` : "Confronto tra anni"}
          </h2>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[
              { v: "mensile", l: "Mese per mese" },
              { v: "anni", l: "Per anno" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setVista(t.v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                  vista === t.v ? "bg-white/15 text-white" : "text-slate-400"
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            {vista === "mensile" ? (
              <ComposedChart data={chartDataMesi}>
                <defs>
                  <linearGradient id="gNettoBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gNettoExtra" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5EEAD4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#5EEAD4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTrattExtra" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FDA4AF" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#FDA4AF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTrattBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FB7185" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#FB7185" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis
                  dataKey="mese"
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={<ChartTip />}
                  cursor={{ fill: "rgba(255,255,255,.04)" }}
                />

                <Area
                  type="monotone"
                  dataKey="nettoBase"
                  name="Netto base"
                  stackId="1"
                  stroke="#38BDF8"
                  strokeWidth={2}
                  fill="url(#gNettoBase)"
                  animationDuration={800}
                />
                <Area
                  type="monotone"
                  dataKey="nettoExtra"
                  name="Extra netti"
                  stackId="1"
                  stroke="#5EEAD4"
                  strokeWidth={2}
                  fill="url(#gNettoExtra)"
                  animationDuration={800}
                />
                <Area
                  type="monotone"
                  dataKey="trattExtra"
                  name="Tratt. su extra"
                  stackId="1"
                  stroke="#FDA4AF"
                  strokeWidth={2}
                  fill="url(#gTrattExtra)"
                  animationDuration={800}
                />
                <Area
                  type="monotone"
                  dataKey="trattBase"
                  name="Tratt. base"
                  stackId="1"
                  stroke="#FB7185"
                  strokeWidth={2}
                  fill="url(#gTrattBase)"
                  animationDuration={800}
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={chartDataAnni}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis
                  dataKey="anno"
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={<ChartTip />}
                  cursor={{ fill: "rgba(255,255,255,.04)" }}
                />

                <Bar
                  dataKey="nettoBase"
                  name="Netto base"
                  fill="#38BDF8"
                  fillOpacity={0.9}
                  maxBarSize={32}
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
                <Bar
                  dataKey="nettoExtra"
                  name="Extra netti"
                  fill="#5EEAD4"
                  fillOpacity={0.9}
                  maxBarSize={32}
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
                <Bar
                  dataKey="trattExtra"
                  name="Tratt. su extra"
                  fill="#FDA4AF"
                  fillOpacity={0.9}
                  maxBarSize={32}
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
                <Bar
                  dataKey="trattBase"
                  name="Tratt. base"
                  fill="#FB7185"
                  fillOpacity={0.9}
                  maxBarSize={32}
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 sm:p-5 mb-4" hover={false} delay={150}>
        <h2 className="font-display text-white mb-3">
          Da cosa è composto il {anno}
        </h2>
        <div className="space-y-2">
          {[
            {
              l: "Stipendio netto base",
              v:
                st.totNetto -
                st.totBonus -
                st.totStraordinari -
                st.totRimborsi,
              c: "#5EEAD4",
            },
            { l: "Bonus e premi", v: st.totBonus, c: "#FBBF24" },
            { l: "Straordinari", v: st.totStraordinari, c: "#A78BFA" },
            { l: "Rimborsi spese", v: st.totRimborsi, c: "#38BDF8" },
            { l: "Tasse e contributi", v: st.tasseStimate, c: "#FB7185" },
          ]
            .filter((x) => x.v > 0)
            .map((x) => {
              const max = Math.max(1, st.totLordo);
              return (
                <div key={x.l} className="flex items-center gap-2.5">
                  <span className="text-xs text-slate-300 w-32 sm:w-40 truncate shrink-0">
                    {x.l}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(x.v / max) * 100}%`, background: x.c }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums w-20 text-right shrink-0">
                    {eur(x.v)}
                  </span>
                </div>
              );
            })}
          {st.totLordo === 0 && (
            <EmptyState text="Nessuna busta paga registrata per quest'anno." />
          )}
        </div>
      </Card>

      {importOpen && (
        <ImportDriveModal
          anno={anno}
          payslips={st.payslips}
          onClose={() => setImportOpen(false)}
          onImporta={onImporta}
        />
      )}
      {cedolinoAperto && (
        <VisoreCedolino
          valore={cedolinoAperto.valore}
          dati={cedolinoAperto.dati}
          onClose={() => setCedolinoAperto(null)}
        />
      )}

      <Card className="p-4 sm:p-5" hover={false} delay={180}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display text-white">Buste paga {anno}</h2>
          <div className="flex gap-2">
            <BtnGhost onClick={() => setGenOpen(true)} className="py-1.5! text-xs!">
              ⚡ Genera anno
            </BtnGhost>
            {driveService.collegato && (
              <BtnGhost
                onClick={() => setImportOpen(true)}
                className="py-1.5! text-xs!"
              >
                ☁️ Importa da Drive
              </BtnGhost>
            )}
            <BtnPrimary
              onClick={() =>
                setBustaEdit({
                  mese: mkOf(anno, new Date().getMonth()),
                  jobId: jobAttivo?.id || "",
                })
              }
              className="py-1.5! text-xs!"
            >
              + Mese
            </BtnPrimary>
          </div>
        </div>
        <div className="space-y-1.5">
          {st.mesiAnno.map((m, i) => {
            const b = m.busta;
            return (
              <div
                key={m.mk}
                className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  b
                    ? "bg-white/4 border-white/[0.07] hover:bg-white/[0.07] cursor-pointer"
                    : m.futuro
                    ? "border-transparent opacity-40"
                    : "border-dashed border-white/10 hover:border-indigo-400/40 cursor-pointer"
                }`}
                onClick={() =>
                  !m.futuro &&
                  setBustaEdit(b || { mese: m.mk, jobId: st.jobs[0]?.id || "" })
                }
                style={{
                  animation: "fadeUp .35s both",
                  animationDelay: `${Math.min(i, 12) * 25}ms`,
                }}
              >
                <span className="w-16 sm:w-24 text-sm text-slate-300 shrink-0">
                  {labelMk(m.mk).split(" ")[0]}
                </span>
                {b ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">
                        <span className="text-slate-500 text-[11px] mr-1.5">
                          Netto:
                        </span>
                        <b className="tabular-nums font-display text-base">
                          {eur(nettoTotale(b))}
                        </b>
                        {b.lordo > 0 && (
                          <span className="text-[11px] text-slate-500 ml-2">
                            lordo {eur(b.lordo)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {b.cedolino ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              apriCedolino(b);
                            }}
                            className="text-emerald-300/90 hover:text-emerald-200 transition-colors"
                          >
                            Cedolino disponibile ✅
                          </button>
                        ) : (
                          <span className="text-slate-600">Nessun cedolino</span>
                        )}
                        {(b.bonus > 0 || b.premio > 0) && (
                          <span className="text-amber-300/80">
                            · bonus {eur(b.bonus + b.premio)}
                          </span>
                        )}
                        {b.tredicesima > 0 && (
                          <span className="text-emerald-300/70">· 13ª</span>
                        )}
                        {b.quattordicesima > 0 && (
                          <span className="text-emerald-300/70">· 14ª</span>
                        )}
                        {b.straordinari > 0 && (
                          <span className="text-violet-300/70">
                            · straord. {eur(b.straordinari)}
                          </span>
                        )}
                        {b.auto && <span className="text-slate-600">· generata</span>}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBustaEdit(b);
                        }}
                        title="Modifica"
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition-all"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          eliminaBusta(b);
                        }}
                        title="Elimina"
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 text-xs hover:text-rose-300 transition-all"
                      >
                        🗑
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-slate-600">
                    {m.futuro ? "—" : "tocca per inserire"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SezioneTfr({ st, anno, setTfrEdit }) {
  const serieAnno = st.tfrSerie.filter((t) => t.mk.startsWith(String(anno)));
  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {[
          {
            l: "TFR accantonato",
            v: eur(st.tfrTotale),
            sub: "al netto di anticipi",
            tone: "text-teal-300",
          },
          {
            l: `Maturato nel ${anno}`,
            v: eur(st.tfrMaturatoAnno),
            sub: `${serieAnno.length} mesi`,
            tone: "text-sky-300",
          },
          {
            l: "Media mensile",
            v: eur(st.mediaTfrMese),
            sub: "ultimi 12 mesi",
            tone: "text-white",
          },
          {
            l: "Anticipi e liquidazioni",
            v: eur(st.tfrAnticipi),
            sub: st.tfrAnticipi > 0 ? "già percepiti" : "nessuno",
            tone: "text-amber-300",
          },
        ].map((s, i) => (
          <Card key={s.l} className="p-4" delay={i * 45}>
            <p className="text-xs text-slate-400">{s.l}</p>
            <p
              className={`font-display text-lg sm:text-xl mt-1 tabular-nums ${s.tone}`}
            >
              {s.v}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5 mb-4" hover={false} delay={120}>
        <h2 className="font-display text-white mb-1">Crescita del TFR</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Quota annua = retribuzione ÷ 13,5, meno lo 0,5% per l'INPS, con
          rivalutazione dell'1,5%. Ogni mese resta modificabile a mano.
        </p>
        <div className="h-52 sm:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={st.tfrSerie.slice(-36)}>
              <defs>
                <linearGradient id="gTfr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5EEAD4" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#5EEAD4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
              <XAxis
                dataKey="mese"
                tick={{ fill: "#64748B", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fill: "#64748B", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<ChartTip />} />
              <Area
                type="monotone"
                dataKey="totale"
                name="TFR accumulato"
                stroke="#5EEAD4"
                strokeWidth={2.5}
                fill="url(#gTfr)"
                animationDuration={1000}
              />
              <Bar
                dataKey="maturato"
                name="Maturato nel mese"
                fill="#A78BFA"
                fillOpacity={0.75}
                maxBarSize={16}
                radius={[4, 4, 0, 0]}
                animationDuration={800}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 sm:p-5" hover={false} delay={160}>
          <h2 className="font-display text-white mb-3">Proiezione</h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={st.proiezione}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis
                  dataKey="anno"
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={<ChartTip />}
                  cursor={{ fill: "rgba(255,255,255,.04)" }}
                />
                <Bar
                  dataKey="Stimato"
                  fill="#8B9DF9"
                  fillOpacity={0.85}
                  maxBarSize={40}
                  radius={[6, 6, 0, 0]}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Stima basata sulla media degli ultimi 12 mesi: indicativa, non una
            previsione contrattuale.
          </p>
        </Card>

        <Card className="p-4 sm:p-5" hover={false} delay={200}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-white">Mese per mese · {anno}</h2>
            <BtnGhost
              onClick={() =>
                setTfrEdit({ mese: mkOf(anno, new Date().getMonth()) })
              }
              className="py-1.5! text-xs!"
            >
              + Correggi mese
            </BtnGhost>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {serieAnno.map((t) => (
              <div
                key={t.mk}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() =>
                  setTfrEdit({
                    mese: t.mk,
                    maturato: t.maturato,
                    rivalutazione: t.rivalutazione,
                    anticipo: t.anticipo,
                    liquidazione: t.liquidazione,
                  })
                }
              >
                <span className="w-16 text-xs text-slate-400 shrink-0">
                  {t.mese}
                </span>
                <span className="text-xs text-slate-300 tabular-nums flex-1">
                  +{eur(t.maturato)}
                </span>
                {t.anticipo > 0 && <Chip tone="down">−{eur(t.anticipo)}</Chip>}
                {t.manuale && (
                  <span className="text-[10px] text-indigo-300">manuale</span>
                )}
                <span className="text-xs text-white tabular-nums">
                  {eur(t.totale)}
                </span>
              </div>
            ))}
            {!serieAnno.length && (
              <EmptyState text="Nessun dato per quest'anno: inserisci le buste paga o correggi un mese." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SezioneContratti({ st, setJobEdit, setConfirmDlg, update, notify }) {
  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-400">
          {st.jobs.length} contratti registrati
        </p>
        <BtnPrimary onClick={() => setJobEdit({})}>+ Contratto</BtnPrimary>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {st.jobs.map((j, i) => (
          <Card key={j.id} className="p-4" delay={i * 50}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white truncate">{j.azienda}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {j.ruolo}
                  {j.livello ? ` · ${j.livello}` : ""}
                  {j.ccnl ? ` · ${j.ccnl}` : ""}
                </p>
              </div>
              {!j.fine && <Chip tone="up">in corso</Chip>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div>
                <p className="text-slate-500">RAL</p>
                <p className="text-white tabular-nums">{eur(j.ral)}</p>
              </div>
              <div>
                <p className="text-slate-500">Mensilità</p>
                <p className="text-white">{j.mensilita}</p>
              </div>
              <div>
                <p className="text-slate-500">Dal</p>
                <p className="text-white">
                  {j.assunzione ? fmtDate(j.assunzione) : "—"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setJobEdit(j)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Modifica
              </button>
              <button
                onClick={() =>
                  setConfirmDlg({
                    msg: `Eliminare il contratto con ${j.azienda}? Le buste paga restano.`,
                    onOk: () => {
                      update((d) => {
                        d.jobs = d.jobs.filter((x) => x.id !== j.id);
                        return d;
                      });
                      notify("Contratto eliminato");
                    },
                  })
                }
                className="text-xs text-slate-600 hover:text-rose-300 transition-colors"
              >
                Elimina
              </button>
            </div>
          </Card>
        ))}
        {!st.jobs.length && (
          <Card className="p-6 sm:col-span-2" hover={false}>
            <EmptyState text="Nessun contratto. Aggiungine uno per usare la generazione automatica dei mesi." />
          </Card>
        )}
      </div>
    </div>
  );
}

function CedolinoBox({ payslipId, valore, onChange, notify, mese }) {
  const [suDrive, setSuDrive] = useState(driveService.collegato);
  const [drag, setDrag] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState("");
  const [anteprima, setAnteprima] = useState(null);
  const [visore, setVisore] = useState(false);
  const inputRef = useRef(null);
  const [modoLink, setModoLink] = useState(valore?.tipo === "link");
  const [link, setLink] = useState(valore?.url || "");

  useEffect(() => {
  let vivo = true;
  let timer;

  if (valore?.tipo === "file" && payslipId) {
    cedoliniStore.leggi(payslipId).then((d) => {
      if (vivo) setAnteprima(d);
    });
  } else {
    timer = setTimeout(() => {
      if (vivo) setAnteprima(null);
    }, 0);
  }

  return () => {
    vivo = false;
    if (timer) clearTimeout(timer);
  };
}, [valore, payslipId]);

  const gestisciFile = async (file) => {
    if (!file) return;
    setErrore("");
    setCaricando(true);
    try {
      if (suDrive && driveService.collegato) {
        const meseRif = mese || monthKey(new Date());
        const nomeFile = nomeFileDocumento({
          tipo: "cedolini",
          mese: meseRif,
          originale: file.name,
        });
        const doc = await driveService.carica(file, {
          categoria: docCat("cedolini").cartella,
          anno: meseRif.slice(0, 4),
          nomeFile,
        });
        onChange({ tipo: "drive", ...doc, nome: doc.nomeFile });
        notify?.("Cedolino salvato su Google Drive");
      } else {
        const meta = await cedoliniStore.salva(payslipId, file);
        onChange(meta);
        notify?.("Cedolino allegato su questo dispositivo");
      }
    } catch (e) {
      setErrore(e.suggerimento ? `${e.message} ${e.suggerimento}` : e.message);
    }
    setCaricando(false);
  };

  const rimuovi = async () => {
    if (valore?.tipo === "drive" && valore.driveFileId) {
      try {
        await driveService.elimina(valore.driveFileId);
      } catch {
        //ignore the exception
      }
    }
    await cedoliniStore.elimina(payslipId);
    onChange(null);
    setAnteprima(null);
    setLink("");
  };

  const vuoto = !valore;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <label className="text-xs uppercase tracking-wider text-slate-400">
          Cedolino
        </label>
        <div className="flex items-center gap-2">
          {driveService.collegato && !modoLink && (
            <button
              type="button"
              onClick={() => setSuDrive((v) => !v)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                suDrive
                  ? "text-emerald-200 border-emerald-400/40 bg-emerald-400/10"
                  : "text-slate-500 border-white/10"
              }`}
            >
              {suDrive ? "su Google Drive" : "su questo dispositivo"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setModoLink((v) => !v)}
            className="text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors"
          >
            {modoLink ? "carica un file" : "usa un link"}
          </button>
        </div>
      </div>

      {modoLink ? (
        <div className="flex gap-2">
          <Input
            placeholder="https://drive.google.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <BtnGhost
            onClick={() => {
              const u = link.trim();
              if (u) {
                onChange({ tipo: "link", url: u, nome: "Cedolino" });
                notify?.("Collegamento salvato");
              }
            }}
          >
            Salva
          </BtnGhost>
        </div>
      ) : vuoto ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            gestisciFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border border-dashed p-4 text-center cursor-pointer transition-all ${
            drag
              ? "border-indigo-400/70 bg-indigo-400/10"
              : "border-white/15 hover:border-white/30 hover:bg-white/3"
          }`}
        >
          {caricando ? (
            <span className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <Spinner size={14} />
              Carico il file…
            </span>
          ) : (
            <>
              <p className="text-sm text-slate-300">Trascina qui il cedolino</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                PDF o immagine · oppure tocca per sceglierlo
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white/4 border border-white/8 p-3 flex items-center gap-3">
          <span className="w-11 h-11 rounded-lg grid place-items-center text-lg shrink-0 overflow-hidden bg-white/5 border border-white/10">
            {anteprima?.mime?.startsWith("image/") ? (
              <img
                src={cedoliniStore.dataUrl(anteprima)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : valore.tipo === "drive" ? (
              "☁️"
            ) : valore.tipo === "link" ? (
              "🔗"
            ) : (
              "📄"
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white truncate">
              {valore.nome || "Cedolino"}
            </p>
            <p className="text-[11px] text-slate-500">
              {valore.tipo === "drive"
                ? `Google Drive${
                    valore.dataCaricamento
                      ? " · " + fmtDate(valore.dataCaricamento)
                      : ""
                  }${
                    valore.dimensione
                      ? " · " + (valore.dimensione / 1024).toFixed(0) + " KB"
                      : ""
                  }`
                : valore.tipo === "link"
                ? "collegamento esterno"
                : anteprima
                ? `${(anteprima.dimensione / 1024).toFixed(
                    0
                  )} KB · solo su questo dispositivo`
                : "in caricamento…"}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setVisore(true)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-all"
            >
              Apri
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 transition-all"
            >
              Sostituisci
            </button>
            <button
              type="button"
              onClick={rimuovi}
              className="px-2 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-rose-300 transition-all"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          gestisciFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {errore && <p className="text-[11px] text-amber-300 mt-1.5">{errore}</p>}
      {!modoLink && vuoto && (
        <p className="text-[11px] text-slate-500 mt-1.5">
          {suDrive && driveService.collegato
            ? "Il file viene salvato nel tuo Google Drive, in Finance Manager › Documenti › Cedolini. Nel foglio finisce solo il riferimento."
            : "Il file resta su questo dispositivo. Collega Google Drive in Impostazioni per ritrovarlo anche da telefono."}
        </p>
      )}
      {visore && (
        <VisoreCedolino
          valore={valore}
          dati={anteprima}
          onClose={() => setVisore(false)}
        />
      )}
    </div>
  );
}

export function VisoreCedolino({ valore, dati, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [daDrive, setDaDrive] = useState(null);
  const [setErroreDrive] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    let vivo = true;
    if (valore?.tipo === "drive" && valore.driveFileId) {
      driveService
        .contenuto(valore.driveFileId)
        .then((u) => vivo && setDaDrive(u))
        .catch((e) => vivo && setErroreDrive(e.suggerimento || e.message));
    }
    return () => {
      vivo = false;
    };
  }, [valore, setErroreDrive]);

  const isImg =
    dati?.mime?.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(valore?.nome || "");
  const src =
    valore?.tipo === "drive"
      ? daDrive
      : valore?.tipo === "link"
      ? valore.url
      : dati
      ? cedoliniStore.dataUrl(dati)
      : null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const scarica = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = valore.nome || "cedolino";
    a.target = valore.tipo === "link" ? "_blank" : "";
    a.rel = "noreferrer";
    a.click();
  };

  const handleMouseDown = (e) => {
      if (isImg && zoom > 1) {
        drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        setIsDragging(true);
      }
    };

    const handleMouseMove = (e) => {
      if (drag.current) {
        setPos({
          x: e.clientX - drag.current.x,
          y: e.clientY - drag.current.y,
        });
      }
    };

    const handleMouseUp = () => {
      drag.current = null;
      setIsDragging(false);
    };

    const handleMouseLeave = () => {
      drag.current = null;
      setIsDragging(false);
    };

  return createPortal(
    <div
      className="fixed inset-0 z-118 flex flex-col"
      style={{ background: "rgba(6,8,13,.97)", animation: "fadeIn .2s both" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <p className="text-sm text-white truncate min-w-0">
          {valore?.nome || "Cedolino"}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {isImg && (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
              >
                −
              </button>
              <span className="text-[11px] text-slate-400 w-12 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
              >
                +
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPos({ x: 0, y: 0 });
                }}
                className="px-2.5 h-9 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 transition-all"
              >
                Adatta
              </button>
            </div>
          )}
          <button
            onClick={scarica}
            className="hidden sm:block px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-all"
          >
            Scarica
          </button>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-white/10 border border-white/15 text-slate-200 hover:bg-white/20 active:scale-95 transition-all text-lg"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        className="flex-1 min-h-0 overflow-hidden grid place-items-center p-3"
        onWheel={(e) => {
          if (isImg) {
            e.preventDefault();
            setZoom((z) =>
              Math.max(0.5, Math.min(5, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
            );
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {!src ? (
          <p>Caricamento...</p>
        ) : isImg ? (
          <img
            src={src}
            alt="Cedolino"
            draggable={false}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              transition: isDragging ? "none" : "transform .18s ease", // <--- Usa lo stato
            }}
            className="max-w-full max-h-full object-contain select-none rounded-lg"
          />
        ) : (
          <iframe title="Cedolino" src={src} className="..." />
        )}
      </div>
      <div
        className="sm:hidden shrink-0 border-t border-white/10 px-3 pt-2.5 flex items-center gap-2"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.625rem)",
        }}
      >
        {isImg && (
          <>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="w-12 h-11 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-lg active:scale-95 transition-all"
            >
              −
            </button>
            <span className="text-[11px] text-slate-400 w-12 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
              className="w-12 h-11 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-lg active:scale-95 transition-all"
            >
              +
            </button>
          </>
        )}
        <button
          onClick={scarica}
          className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-200 active:scale-95 transition-all"
        >
          Scarica
        </button>
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-xl bg-linear-to-r from-indigo-400 to-violet-400 text-slate-950 text-sm font-semibold active:scale-95 transition-all"
        >
          Chiudi
        </button>
      </div>
      <p className="hidden sm:block text-[11px] text-slate-600 text-center py-2 shrink-0">
        {isImg
          ? "Rotella per zoomare, trascina per spostare"
          : "Se il PDF non compare, usa Scarica per aprirlo"}
      </p>
    </div>,
    document.body
  );
}

function BustaModal({ open, busta, jobs, anno, onClose, onSave, notify }) {
  const [f, setF] = useState(null);
  const [showExtra, setShowExtra] = useState(false);

  useEffect(() => {
  if (!open) {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowExtra(false);
    return;
  }
  const timer = setTimeout(() => {
    const b = busta || {};
    
    setF({
      id: b.id || uid(),
      jobId: b.jobId || jobs[0]?.id || "",
      mese: b.mese || mkOf(anno, new Date().getMonth()),
      ral: b.ral ?? "",
      tfr: b.tfr ?? "",
      cedolino: b.cedolino || null,
      lordo: b.lordo ?? "",
      netto: b.netto ?? "",
      bonus: b.bonus ?? "",
      straordinari: b.straordinari ?? "",
      rimborsi: b.rimborsi ?? "",
      premio: b.premio ?? "",
      tredicesima: b.tredicesima ?? "",
      quattordicesima: b.quattordicesima ?? "",
      altre: b.altre ?? "",
      trattenute: b.trattenute ?? "",
      note: b.note || "",
      auto: false,
    });
    if (
      b.bonus ||
      b.straordinari ||
      b.rimborsi ||
      b.tredicesima ||
      b.quattordicesima
    ) {
      setShowExtra(true);
    }
  }, 0);
  return () => clearTimeout(timer);
}, [open, busta, jobs, anno]);

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => Number(v) || 0;

  const nettoCalcolato = num(f.lordo) - num(f.trattenute);
  const totale =
    nettoCalcolato +
    num(f.bonus) +
    num(f.straordinari) +
    num(f.rimborsi) +
    num(f.premio) +
    num(f.tredicesima) +
    num(f.quattordicesima) +
    num(f.altre);

  const { y, m } = parseMk(f.mese);

  const campo = (k, label) => (
    <div key={k}>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="0,00"
        value={f[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        busta?.id ? `Busta paga · ${labelMk(f.mese)}` : "Nuova busta paga"
      }
      wide
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mese</Label>
            <Select
              value={m}
              onChange={(e) => set("mese", mkOf(y, Number(e.target.value)))}
            >
              {MESI.map((l, i) => (
                <option key={i} value={i}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Anno</Label>
            <Select
              value={y}
              onChange={(e) => set("mese", mkOf(Number(e.target.value), m))}
            >
              {Array.from(
                { length: 12 },
                (_, i) => new Date().getFullYear() - 8 + i
              ).map((yy) => (
                <option key={yy} value={yy}>
                  {yy}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {jobs.length > 1 && (
          <div>
            <Label>Contratto</Label>
            <Select
              value={f.jobId}
              onChange={(e) => set("jobId", e.target.value)}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.azienda} · {j.ruolo}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>RAL del periodo</Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="es. 34000"
            value={f.ral}
            onChange={(e) => set("ral", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {campo("lordo", "Stipendio lordo")}
          {campo("trattenute", "Trattenute")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            {campo("tfr", "TFR maturato nel mese")}
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              Se vuoto, calcolato in automatico.
            </p>
          </div>
          <div>
            <Label>Note</Label>
            <Input
              placeholder="es. permessi non retribuiti"
              value={f.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowExtra(!showExtra)}
            className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors w-full text-left outline-none"
          >
            <span
              className="transition-transform duration-300"
              style={{
                transform: showExtra ? "rotate(0deg)" : "rotate(-90deg)",
              }}
            >
              ▼
            </span>
            Voci aggiuntive
          </button>

          <div
            className={`grid transition-all duration-600 ease-in-out ${
              showExtra
                ? "grid-rows-[1fr] opacity-100 mt-3"
                : "grid-rows-[0fr] opacity-0 mt-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 pb-1">
                {campo("bonus", "Bonus")}
                {campo("straordinari", "Straordinari")}
                {campo("rimborsi", "Rimborso spese")}
                {campo("tredicesima", "Tredicesima")}
                {campo("quattordicesima", "Quattordicesima")}
              </div>
            </div>
          </div>
        </div>

        <CedolinoBox
          payslipId={f.id}
          valore={f.cedolino}
          onChange={(c) => set("cedolino", c)}
          notify={notify}
          mese={f.mese}
        />

        <div className="rounded-xl bg-white/4 border border-white/[0.07] p-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Totale percepito nel mese
          </span>
          <span className="font-display text-lg text-teal-300 tabular-nums">
            {eur(totale)}
          </span>
        </div>
      </div>

      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary
          onClick={() =>
            onSave({
              id: f.id,
              jobId: f.jobId,
              mese: f.mese,
              auto: false,
              note: f.note,
              ral: num(f.ral),
              tfr: num(f.tfr),
              cedolino: f.cedolino,
              lordo: num(f.lordo),
              netto: nettoCalcolato,
              bonus: num(f.bonus),
              straordinari: num(f.straordinari),
              rimborsi: num(f.rimborsi),
              premio: num(f.premio),
              tredicesima: num(f.tredicesima),
              quattordicesima: num(f.quattordicesima),
              altre: num(f.altre),
              trattenute: num(f.trattenute),
            })
          }
        >
          {busta?.id ? "Salva modifiche" : "Aggiungi"}
        </BtnPrimary>
      </div>
    </Modal>
  );
}

function GeneraAnnoModal({ open, anno, jobs, jobAttivo, onClose, onGenera }) {
  const [f, setF] = useState(null);
  useEffect(() => {
  if (!open) return;
  const handle = requestAnimationFrame(() => {
    const j = jobAttivo || jobs[0];
    setF({
      jobId: j?.id || "",
      ral: j?.ral || "",
      mensilita: j?.mensilita || 14,
      netto: j?.netto || "",
      sovrascrivi: false,
    });
  });
  return () => cancelAnimationFrame(handle);
}, [open, jobAttivo, jobs]);
  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const lordoMese = (Number(f.ral) || 0) / (Number(f.mensilita) || 1);
  return (
    <Modal open={open} onClose={onClose} title={`Genera i mesi del ${anno}`}>
      <p className="text-xs text-slate-400 mb-4">
        Crea in un colpo solo le buste paga dell'anno. Restano tutte modificabili:
        quelle che hai già inserito a mano non vengono toccate.
      </p>
      <div className="space-y-3">
        {jobs.length > 1 && (
          <div>
            <Label>Contratto</Label>
            <Select
              value={f.jobId}
              onChange={(e) => set("jobId", e.target.value)}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.azienda}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>RAL</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="es. 34000"
              value={f.ral}
              onChange={(e) => set("ral", e.target.value)}
            />
          </div>
          <div>
            <Label>Mensilità</Label>
            <Select
              value={f.mensilita}
              onChange={(e) => set("mensilita", Number(e.target.value))}
            >
              {[12, 13, 14, 15, 16].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Netto medio mensile</Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="es. 1850"
            value={f.netto}
            onChange={(e) => set("netto", e.target.value)}
          />
        </div>
        <div className="rounded-xl bg-white/4 border border-white/[0.07] p-3 text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Lordo per mensilità</span>
            <b className="text-white tabular-nums">{eur(lordoMese)}</b>
          </div>
          {Number(f.mensilita) >= 13 && (
            <div className="flex justify-between">
              <span>Tredicesima a dicembre</span>
              <b className="text-white tabular-nums">
                {eur(Number(f.netto) || 0)}
              </b>
            </div>
          )}
          {Number(f.mensilita) >= 14 && (
            <div className="flex justify-between">
              <span>Quattordicesima a giugno</span>
              <b className="text-white tabular-nums">
                {eur(Number(f.netto) || 0)}
              </b>
            </div>
          )}
        </div>
        <button
          onClick={() => set("sovrascrivi", !f.sovrascrivi)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
            f.sovrascrivi
              ? "bg-rose-400/10 border-rose-400/40"
              : "bg-white/5 border-white/10"
          }`}
        >
          <span
            className={`w-10 rounded-full transition-all relative shrink-0 ${
              f.sovrascrivi ? "bg-rose-400" : "bg-white/10"
            }`}
            style={{ height: 22 }}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                f.sovrascrivi ? "left-5.5" : "left-0.5"
              }`}
            />
          </span>
          <span className="text-xs text-slate-300 text-left">
            Sovrascrivi anche i mesi che ho modificato a mano
          </span>
        </button>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary
          onClick={() => {
            if (Number(f.ral) > 0)
              onGenera({
                ...f,
                ral: Number(f.ral),
                mensilita: Number(f.mensilita),
                netto: Number(f.netto) || 0,
              });
          }}
        >
          Genera {anno}
        </BtnPrimary>
      </div>
    </Modal>
  );
}

function TfrModal({ open, voce, onClose, onSave }) {
  const [f, setF] = useState(null);
  useEffect(() => {
  if (!open) return;
  const timer = setTimeout(() => {
    const v = voce || {};
    setF({
      mese: v.mese || monthKey(new Date()),
      maturato: v.maturato ?? "",
      rivalutazione: v.rivalutazione ?? "",
      anticipo: v.anticipo ?? "",
      liquidazione: v.liquidazione ?? "",
      note: v.note || "",
    });
  }, 0);
  return () => clearTimeout(timer);
}, [open, voce]);
  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const { y, m } = parseMk(f.mese);
  return (
    <Modal open={open} onClose={onClose} title="TFR del mese">
      <p className="text-xs text-slate-400 mb-4">
        Quello che scrivi qui sostituisce il calcolo automatico per questo mese.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mese</Label>
            <Select
              value={m}
              onChange={(e) => set("mese", mkOf(y, Number(e.target.value)))}
            >
              {MESI.map((l, i) => (
                <option key={i} value={i}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Anno</Label>
            <Select
              value={y}
              onChange={(e) => set("mese", mkOf(Number(e.target.value), m))}
            >
              {Array.from(
                { length: 12 },
                (_, i) => new Date().getFullYear() - 8 + i
              ).map((yy) => (
                <option key={yy} value={yy}>
                  {yy}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Maturato</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={f.maturato}
              onChange={(e) => set("maturato", e.target.value)}
            />
          </div>
          <div>
            <Label>Rivalutazione</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={f.rivalutazione}
              onChange={(e) => set("rivalutazione", e.target.value)}
            />
          </div>
          <div>
            <Label>Anticipo richiesto</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={f.anticipo}
              onChange={(e) => set("anticipo", e.target.value)}
            />
          </div>
          <div>
            <Label>Liquidazione</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={f.liquidazione}
              onChange={(e) => set("liquidazione", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Note</Label>
          <Input
            value={f.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="es. anticipo per acquisto casa"
          />
        </div>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary
          onClick={() =>
            onSave({
              mese: f.mese,
              maturato: Number(f.maturato) || 0,
              rivalutazione: Number(f.rivalutazione) || 0,
              anticipo: Number(f.anticipo) || 0,
              liquidazione: Number(f.liquidazione) || 0,
              note: f.note,
            })
          }
        >
          Salva
        </BtnPrimary>
      </div>
    </Modal>
  );
}

function JobModal({ open, job, onClose, onSave }) {
  const [f, setF] = useState(null);
  useEffect(() => {
  if (!open) return;
  const timer = setTimeout(() => {
    const j = job || {};
    setF({
      id: j.id,
      azienda: j.azienda || "",
      ruolo: j.ruolo || "",
      ccnl: j.ccnl || "",
      livello: j.livello || "",
      assunzione: j.assunzione || todayISO(),
      fine: j.fine || "",
      ral: j.ral ?? "",
      mensilita: j.mensilita ?? 13,
      netto: j.netto ?? "",
      lordo: j.lordo ?? "",
      tfrInAzienda: j.tfrInAzienda !== false,
      note: j.note || "",
    });
  }, 0);
  return () => clearTimeout(timer);
}, [open, job]);
  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ralNum = Number(f.ral) || 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={f.id ? "Modifica contratto" : "Nuovo contratto"}
      wide
    >
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Azienda</Label>
            <Input
              value={f.azienda}
              onChange={(e) => set("azienda", e.target.value)}
              placeholder="es. Reply"
              autoFocus
            />
          </div>
          <div>
            <Label>Ruolo</Label>
            <Input
              value={f.ruolo}
              onChange={(e) => set("ruolo", e.target.value)}
              placeholder="es. Full Stack Developer"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>CCNL</Label>
            <Input
              value={f.ccnl}
              onChange={(e) => set("ccnl", e.target.value)}
              placeholder="es. Metalmeccanico"
            />
          </div>
          <div>
            <Label>Livello</Label>
            <Input
              value={f.livello}
              onChange={(e) => set("livello", e.target.value)}
              placeholder="es. D2"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assunzione</Label>
            <Input
              type="date"
              value={f.assunzione}
              onChange={(e) => set("assunzione", e.target.value)}
            />
          </div>
          <div>
            <Label>Fine (se conclusa)</Label>
            <Input
              type="date"
              value={f.fine}
              onChange={(e) => set("fine", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>RAL</Label>
            <Input
              type="number"
              value={f.ral}
              onChange={(e) => set("ral", e.target.value)}
              placeholder="30000"
            />
          </div>
          <div>
            <Label>Mensilità</Label>
            <Select
              value={f.mensilita}
              onChange={(e) => set("mensilita", Number(e.target.value))}
            >
              {[12, 13, 14, 15, 16].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Netto mensile</Label>
            <Input
              type="number"
              value={f.netto}
              onChange={(e) => set("netto", e.target.value)}
              placeholder="1650"
            />
          </div>
          <div>
            <Label>Lordo mensile</Label>
            <Input
              type="number"
              value={f.lordo}
              onChange={(e) => set("lordo", e.target.value)}
              placeholder="2300"
            />
          </div>
        </div>
        {ralNum > 0 && (
          <p className="text-[11px] text-slate-500">
            Accantonamento TFR stimato:{" "}
            <b className="text-teal-300">{eur(quotaTfrAnnua(ralNum))}</b>{" "}
            l'anno, circa {eur(quotaTfrAnnua(ralNum) / 12)} al mese.
          </p>
        )}
        <button
          onClick={() => set("tfrInAzienda", !f.tfrInAzienda)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
            f.tfrInAzienda
              ? "bg-indigo-400/10 border-indigo-400/40"
              : "bg-white/5 border-white/10"
          }`}
        >
          <span
            className={`w-10 rounded-full transition-all relative shrink-0 ${
              f.tfrInAzienda
                ? "bg-linear-to-r from-indigo-400 to-violet-400"
                : "bg-white/10"
            }`}
            style={{ height: 22 }}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                f.tfrInAzienda ? "left-5.5" : "left-0.5"
              }`}
            />
          </span>
          <span className="text-sm text-slate-300 text-left">
            TFR lasciato in azienda (se destinato a un fondo pensione,
            disattiva)
          </span>
        </button>
        <div>
          <Label>Note</Label>
          <Input
            value={f.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="benefit, welfare, smart working…"
          />
        </div>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary
          onClick={() => {
            if (!f.azienda.trim() || !f.ruolo.trim()) return;
            onSave({
              ...f,
              id: f.id || uid(),
              azienda: f.azienda.trim(),
              ruolo: f.ruolo.trim(),
              ral: Number(f.ral) || 0,
              netto: Number(f.netto) || 0,
              lordo: Number(f.lordo) || 0,
            });
          }}
        >
          {f.id ? "Salva" : "Aggiungi"}
        </BtnPrimary>
      </div>
    </Modal>
  );
};

export function SalaryEventModal({ open, ev, jobs, onClose, onSave }) {
  const [f, setF] = useState(null);
  useEffect(() => {
  if (!open) return;
  const timer = setTimeout(() => {
    const e = ev || {};
    setF({
      id: e.id,
      jobId: e.jobId || jobs[jobs.length - 1]?.id || "",
      data: e.data || todayISO(),
      tipo: e.tipo || "bonus",
      importo: e.importo ?? "",
      ralDopo: e.ralDopo ?? "",
      note: e.note || "",
    });
  }, 0);
  return () => clearTimeout(timer);
}, [open, ev, jobs]);
  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title={f.id ? "Modifica voce" : "Aumento, bonus o premio"}>
      <div className="space-y-3">
        <div><Label>Tipo</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button key={t.id} onClick={() => set("tipo", t.id)} className={`px-2 py-2 rounded-xl text-[11px] border transition-all ${f.tipo === t.id ? "text-white bg-indigo-400/15 border-indigo-400/60" : "text-slate-400 bg-white/5 border-white/10"}`}>{t.icona} {t.l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Data</Label><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
          <div><Label>Importo lordo</Label><Input type="number" value={f.importo} onChange={(e) => set("importo", e.target.value)} placeholder="1500" /></div>
        </div>
        {f.tipo === "aumento" && (
          <div style={{ animation: "fadeUp .25s both" }}><Label>Nuova RAL dopo l'aumento</Label><Input type="number" value={f.ralDopo} onChange={(e) => set("ralDopo", e.target.value)} placeholder="34000" /></div>
        )}
        {jobs.length > 1 && (
          <div><Label>Contratto</Label><Select value={f.jobId} onChange={(e) => set("jobId", e.target.value)}>{jobs.map((j) => <option key={j.id} value={j.id}>{j.azienda} · {j.ruolo}</option>)}</Select></div>
        )}
        <div><Label>Descrizione</Label><Input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="es. premio di risultato 2026" /></div>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={() => onSave({ ...f, id: f.id || uid(), importo: Number(f.importo) || 0, ralDopo: Number(f.ralDopo) || 0 })}>{f.id ? "Salva" : "Aggiungi"}</BtnPrimary>
      </div>
    </Modal>
  );
};