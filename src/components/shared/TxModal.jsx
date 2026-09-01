import { useEffect, useState, useCallback, useMemo } from "react";
import { getCategoryGroups, todayISO } from "../../utils/helpers";
import { Input, Label, Select } from "../Forms";
import Modal from "../Modal";
import { BtnGhost, BtnPrimary } from "../Buttons";
import { metodiEntrata, metodiSpesa } from "../../config/constants";
import { CompanyAutocomplete } from "./CompanyAutocomplete";

export function TxModal({ open, tx, onClose, onSave, data, onDelete }) {
  const isEdit = !!tx?.id;
  const [form, setForm] = useState(null);

  const getTransferNote = useCallback((contoId, contoDestId) => {
    const nomeOrigine = data.accounts.find((a) => a.id === contoId)?.nome || "";
    const nomeDestinazione = data.accounts.find((a) => a.id === contoDestId)?.nome || "";
    return `Trasferimento: ${nomeOrigine} ➔ ${nomeDestinazione}`;
  }, [data.accounts]);

  const existingCompanies = useMemo(() => {
    return [...new Set((data?.transactions || []).map((t) => t.compagnia).filter(Boolean))];
  }, [data.transactions]);

  useEffect(() => {
    if (open) {
      const initialTipo = tx?.tipo || "spesa";
      const initialConto = tx?.conto || data.accounts[0]?.id || "";
      const initialContoDest = tx?.contoDest || data.accounts[1]?.id || "";
      
      let initialNote = tx?.note || "";
      if (!tx?.id && initialTipo === "trasferimento") {
        initialNote = getTransferNote(initialConto, initialContoDest);
      }

      let defaultMetodo = initialTipo === "entrata" ? metodiEntrata[0] : metodiSpesa[0];
      if (initialTipo === "trasferimento") defaultMetodo = "Trasferimento";

      const timer = setTimeout(() => {
        setForm({ 
          tipo: initialTipo, 
          importo: tx?.importo || "", 
          data: tx?.data || todayISO(),
          categoria: tx?.categoria || "", 
          gruppo: tx?.gruppo || "", 
          sottocategoria: tx?.sottocategoria || "", 
          compagnia: tx?.compagnia || "",
          conto: initialConto, 
          contoDest: initialContoDest, 
          metodo: tx?.metodo || defaultMetodo, 
          note: initialNote, 
          tags: (tx?.tags || []).join(", "), 
          id: tx?.id 
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, tx, data, getTransferNote]);
  
  if (!open || !form) return null;
  
  const isTr = form.tipo === "trasferimento";
  const selCat = data.categories.find((c) => c.id === form.categoria);
  const catGroups = getCategoryGroups(selCat);
  const spendGroups = catGroups.filter((g) => g !== "Entrate");
  const showGroupSelect = !isTr && form.tipo !== "entrata" && spendGroups.length > 1;
  const hasLogoDev = !!(data?.settings?.logoDevKey && data.settings.logoDevKey.trim());
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  let metodiAttuali = form.tipo === "entrata" ? [...metodiEntrata] : [...metodiSpesa];
  
  if (form.metodo && form.metodo !== "Trasferimento" && !metodiAttuali.includes(form.metodo)) {
    metodiAttuali.push(form.metodo);
  }

  const submit = () => {
    const importo = Number(form.importo);
    if (!(importo > 0)) return;
    if (isTr) {
      if (!form.conto || !form.contoDest || form.conto === form.contoDest) return;
      onSave({ id: form.id, tipo: "trasferimento", importo, data: form.data, conto: form.conto, contoDest: form.contoDest, categoria: null, sottocategoria: "", metodo: "Trasferimento", note: form.note, tags: [] });
    } else {
      if (!form.categoria) return;
      const gruppo = form.gruppo || (spendGroups[0] || (form.tipo === "entrata" ? "Entrate" : "Wants"));
      onSave({ ...form, contoDest: undefined, importo, gruppo, compagnia: form.compagnia?.trim() || undefined, tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean) });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Modifica movimento" : "Nuovo movimento"}>
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
        {[{ v: "spesa", l: "Spesa" }, { v: "entrata", l: "Entrata" }, { v: "trasferimento", l: "Trasferimento" }].map((t) => (
          <button 
            key={t.v} 
            onClick={() => {
              const newMetodi = t.v === "entrata" ? metodiEntrata : metodiSpesa;
              setForm((f) => {
                let newNote = f.note;
                if (t.v === "trasferimento") {
                  if (!newNote || newNote.startsWith("Trasferimento:")) {
                    newNote = getTransferNote(f.conto, f.contoDest);
                  }
                } else if (f.tipo === "trasferimento" && newNote.startsWith("Trasferimento:")) {
                  newNote = ""; 
                }

                return { 
                  ...f, 
                  tipo: t.v, 
                  categoria: t.v === f.tipo ? f.categoria : "", 
                  sottocategoria: "",
                  metodo: t.v === "trasferimento" ? "Trasferimento" : (newMetodi.includes(f.metodo) ? f.metodo : newMetodi[0]),
                  note: newNote
                };
              });
            }} 
            className={`flex-1 py-1.5 rounded-lg text-sm transition-all ${form.tipo === t.v ? "bg-white/15 text-white" : "text-slate-400"}`}
          >
            {t.l}
          </button>
        ))}
      </div>
      {isTr && <p className="text-[11px] text-slate-500 mb-3 -mt-1">Sposta denaro tra i tuoi conti: non conta come spesa né come entrata, e il patrimonio totale resta invariato.</p>}
      <div className="space-y-3">
        {/* DESCRIZIONE */}
        <div>
          <Label>Descrizione</Label>
          <Input placeholder="Descrizione spesa…" value={form.note} onChange={(e) => set("note", e.target.value)} autoFocus />
        </div>
        
        {/* IMPORTO E DATA */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0">
            <Label>Importo</Label>
            <Input 
              type="number" 
              inputMode="decimal" 
              step="0.01" 
              placeholder="0,00" 
              value={form.importo} 
              onChange={(e) => set("importo", e.target.value)}
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Label>Data</Label>
            <Input 
              type="date" 
              value={form.data} 
              onChange={(e) => set("data", e.target.value)} 
              style={{ width: "100%", minWidth: 0, paddingLeft: "8px", paddingRight: "8px" }} 
            />
          </div>
        </div>

        {isTr ? (
          <>
            {/* TRASFERIMENTI: CONTI */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label>Dal conto</Label>
                <Select 
                  value={form.conto} 
                  onChange={(e) => {
                    const nuovoConto = e.target.value;
                    setForm((f) => {
                      let nuovoContoDest = f.contoDest;
                      
                      if (nuovoConto === f.contoDest) {
                        nuovoContoDest = data.accounts.find((a) => a.id !== nuovoConto)?.id || "";
                      }
                      
                      return { 
                        ...f, 
                        conto: nuovoConto, 
                        contoDest: nuovoContoDest,
                        note: getTransferNote(nuovoConto, nuovoContoDest) 
                      };
                    });
                  }}
                >
                  {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
              </div>
              <div className="min-w-0">
                <Label>Al conto</Label>
                <Select 
                  value={form.contoDest} 
                  onChange={(e) => {
                    const nuovoContoDest = e.target.value;
                    setForm((f) => ({ ...f, contoDest: nuovoContoDest, note: getTransferNote(f.conto, nuovoContoDest) }));
                  }}
                >
                  {data.accounts.filter((a) => a.id !== form.conto).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* CONTO E METODO AFFIANCATI */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0"><Label>Conto</Label><Select value={form.conto} onChange={(e) => set("conto", e.target.value)}>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Select></div>
              <div className="min-w-0">
                <Label>Metodo</Label>
                <Select value={form.metodo} onChange={(e) => set("metodo", e.target.value)}>
                  {metodiAttuali.map((m) => <option key={m}>{m}</option>)}
                </Select>
              </div>
            </div>
            
            {/* CATEGORIA */}
            <div>
              <Label>Categoria</Label>
              <Select 
                value={form.categoria} 
                onChange={(e) => {
                  const id = e.target.value;
                  const cat = data.categories.find((c) => c.id === id);
                  const groups = cat ? getCategoryGroups(cat) : [];
                  setForm((f) => ({ 
                    ...f, 
                    categoria: id, 
                    sottocategoria: "", 
                    gruppo: groups.includes(f.gruppo) ? f.gruppo : groups[0] || "" 
                  }));
                }}
              >
                <option value="">Seleziona categoria...</option>
                {data.categories
                  .filter((c) => form.tipo === "entrata" ? getCategoryGroups(c).includes("Entrate") : !getCategoryGroups(c).includes("Entrate"))
                  .sort((a, b) => a.ordine - b.ordine)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.icona} {c.nome}</option>
                  ))
                }
              </Select>
            </div>

            {showGroupSelect && (
              <div style={{ animation: "fadeUp .3s both" }}>
                <Label>Gruppo di spesa</Label>
                <Select value={form.gruppo || spendGroups[0]} onChange={(e) => set("gruppo", e.target.value)}>
                  {spendGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
            )}
            
            {selCat?.sottocategorie?.length > 0 && (
              <div style={{ animation: "fadeUp .3s both" }}>
                <Label>Sottocategoria</Label>
                <Select value={form.sottocategoria} onChange={(e) => set("sottocategoria", e.target.value)}>
                  <option value="">Nessuna</option>
                  {selCat.sottocategorie.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            )}

            {hasLogoDev && (
              <div className="min-w-0">
                <CompanyAutocomplete 
                  value={form.compagnia} 
                  onChange={(val) => set("compagnia", val)} 
                  existingCompanies={existingCompanies} 
                  categoryIcon={selCat?.icona || "•"}
                />
              </div>
            )}

            <div className="min-w-0">
              <Label>Tag</Label>
              <Input placeholder="es. vacanza..." value={form.tags} onChange={(e) => set("tags", e.target.value)} />
            </div>
          </>
        )}
      </div>
      {/* SEZIONE PULSANTI */}
      <div className="flex flex-row justify-between items-center mt-6 w-full gap-2">
        <div className="shrink-0">
          {/* Mostra Elimina solo se stiamo modificando un movimento esistente */}
          {isEdit && (
            <button 
              onClick={() => {
                onDelete(tx.id, () => onClose()); 
              }} 
              className="text-sm font-medium text-rose-400 hover:text-rose-300 active:scale-95 transition-all px-1 py-2"
            >
              Elimina
            </button>
          )}
        </div>
        <div className="flex flex-row items-center gap-2 sm:gap-3 shrink-0">
          <BtnGhost onClick={onClose}>Annulla</BtnGhost>
          <BtnPrimary onClick={submit}>{isEdit ? "Salva" : isTr ? "Trasferisci" : "Aggiungi"}</BtnPrimary>
        </div>
      </div>
    </Modal>
  );
}