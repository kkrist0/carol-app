import { useState } from "react";
import { driveService, meseDaNomeFile } from "../../services/drive";
import Modal from "../Modal";
import { Input, Label, Select } from "../Forms";
import { labelMk, mkOf } from "../../utils/helpers";
import { EmptyState } from "../Typography";
import { BtnGhost, BtnPrimary } from "../Buttons";
import { Spinner } from "../Spinner";

function estraiIdCartella(v) {
  const s = (v || "").trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

export default function ImportDriveModal({ anno, payslips, onClose, onImporta }) {
  const [passo, setPasso] = useState("cartella");   // cartella | risultati
  const [idCartella, setIdCartella] = useState("");
  const [file, setFile] = useState([]);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState("");
  const [scelti, setScelti] = useState({});

  const analizza = async () => {
    setCaricando(true); setErrore("");
    try {
      const id = estraiIdCartella(idCartella);
      const elenco = await driveService.elenca(id);
      const documenti = elenco.filter((f) => !/folder/.test(f.mimeType));
      const abbinati = documenti.map((f) => ({ file: f, mese: meseDaNomeFile(f.name) }));
      setFile(abbinati);
      setScelti(Object.fromEntries(abbinati.filter((a) => a.mese).map((a) => [a.file.id, a.mese])));
      setPasso("risultati");
    } catch (e) { setErrore(e.suggerimento ? `${e.message} ${e.suggerimento}` : e.message); }
    setCaricando(false);
  };

  const conferma = () => {
    const abbinamenti = Object.entries(scelti).filter(([, m]) => m).map(([fileId, mese]) => ({ mese, file: file.find((x) => x.file.id === fileId).file }));
    if (abbinamenti.length) onImporta(abbinamenti);
    onClose();
  };

  const conCedolino = new Set(payslips.filter((p) => p.cedolino).map((p) => p.mese));

  return (
    <Modal open onClose={onClose} title="Importa cedolini da Google Drive" wide>
      {passo === "cartella" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Incolla il collegamento della cartella di Drive che contiene i cedolini. L'app riconosce il mese dal nome del file, per esempio <code className="text-indigo-300">Cedolino_Luglio_2026.pdf</code> o <code className="text-indigo-300">BustaPaga_07_2026.pdf</code>.</p>
          <div><Label>Cartella di Drive</Label><Input placeholder="https://drive.google.com/drive/folders/… oppure l'identificativo" value={idCartella} onChange={(e) => setIdCartella(e.target.value)} autoFocus /></div>
          {!driveService.letturaEsterna && (
            <p className="text-[11px] text-amber-300/80">Per leggere una cartella che non ha creato l'app, attiva "lettura di cartelle esistenti" in Impostazioni e ricollega l'account.</p>
          )}
          {errore && <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 text-xs text-amber-200">{errore}</div>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">{file.filter((f) => f.mese).length} documenti riconosciuti su {file.length} trovati. Controlla gli abbinamenti prima di confermare.</p>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {file.map(({ file: f, mese }) => {
              const scelto = scelti[f.id] || "";
              const sovrascrive = scelto && conCedolino.has(scelto);
              return (
                <div key={f.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/4 border border-white/[0.07]">
                  <span className="text-base shrink-0">📄</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{f.name}</p>
                    <p className="text-[11px] text-slate-500">{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""}{sovrascrive ? " · sostituirà quello già presente" : ""}</p>
                  </div>
                  <Select value={scelto} onChange={(e) => setScelti((s) => ({ ...s, [f.id]: e.target.value }))} className="w-36! shrink-0">
                    <option value="">non importare</option>
                    {Array.from({ length: 12 }, (_, m) => mkOf(anno, m)).map((mk) => <option key={mk} value={mk}>{labelMk(mk)}</option>)}
                    {mese && !mese.startsWith(String(anno)) && <option value={mese}>{labelMk(mese)}</option>}
                  </Select>
                </div>
              );
            })}
            {!file.length && <EmptyState text="Nessun documento nella cartella." />}
          </div>
        </div>
      )}
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        {passo === "cartella"
          ? <BtnPrimary onClick={analizza} disabled={caricando || !idCartella.trim()}>{caricando ? <span className="flex items-center gap-2"><Spinner />Leggo…</span> : "Analizza cartella"}</BtnPrimary>
          : <BtnPrimary onClick={conferma}>Collega {Object.values(scelti).filter(Boolean).length} cedolini</BtnPrimary>}
      </div>
    </Modal>
  );
}