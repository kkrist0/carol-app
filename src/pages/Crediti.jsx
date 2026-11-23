import { useMemo, useState } from "react";
import { ArrowDownRight, CircleCheck, Plus, Trash2, UserRound } from "lucide-react";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { Input, Label, Select } from "../components/Forms";
import Modal from "../components/Modal";
import { eur, fmtDate, todayISO, uid } from "../utils/helpers";

const amountLabel = (amount) => Number(amount).toLocaleString("it-IT", { maximumFractionDigits: 2 });

function refreshCreditTag(data, movementId) {
  const movement = data.transactions.find((transaction) => transaction.id === movementId);
  if (!movement) return;
  const outstanding = data.credits
    .filter((credit) => credit.movimentoId === movementId)
    .reduce((sum, credit) => sum + Math.max(0, credit.importo - credit.riscosso), 0);
  movement.tags = (movement.tags || []).filter((tag) => !tag.startsWith("Da prendere "));
  if (outstanding > 0) movement.tags.push(`Da prendere ${amountLabel(outstanding)} euro`);
}

export function Crediti({ data, update, notify, setConfirmDlg }) {
  const [editing, setEditing] = useState(null);
  const [collecting, setCollecting] = useState(null);
  const expenses = useMemo(
    () => (data.transactions || []).filter((transaction) => transaction.tipo === "spesa" && !transaction.deletedAt),
    [data.transactions]
  );
  const credits = useMemo(
    () => [...(data.credits || [])].sort((a, b) => (a.scadenza || "9999-12-31").localeCompare(b.scadenza || "9999-12-31")),
    [data.credits]
  );
  const outstanding = credits.reduce((sum, credit) => sum + Math.max(0, credit.importo - credit.riscosso), 0);
  const collected = credits.reduce((sum, credit) => sum + credit.riscosso, 0);

  const deleteCredit = (credit) => setConfirmDlg({
    msg: `Eliminare il credito di "${credit.persona}"?`,
    onOk: () => {
      update((d) => {
        d.credits = d.credits.filter((entry) => entry.id !== credit.id);
        if (credit.movimentoId) refreshCreditTag(d, credit.movimentoId);
        return d;
      });
      notify("Credito eliminato");
    },
  });

  const recordCollection = (credit, form) => {
    const linkedTransaction = credit.movimentoId
      ? data.transactions.find((transaction) => transaction.id === credit.movimentoId)
      : null;
    if (credit.movimentoId && (!linkedTransaction || linkedTransaction.tipo !== "spesa")) {
      notify("Il movimento collegato non è disponibile: modifica il credito prima di registrare il rimborso");
      return;
    }
    update((d) => {
      const current = d.credits.find((entry) => entry.id === credit.id);
      if (!current) return d;
      const amount = Number(form.importo);
      current.riscosso += amount;
      if (current.movimentoId) {
        const transaction = d.transactions.find((item) => item.id === current.movimentoId);
        const appliedToExpense = Math.min(amount, transaction?.importo || 0);
        if (transaction && appliedToExpense > 0) {
          transaction.importo = Math.max(0, transaction.importo - appliedToExpense);
          if (transaction.importo === 0) transaction.deletedAt = new Date().toISOString();
        }
        refreshCreditTag(d, current.movimentoId);
        if (amount > appliedToExpense) {
          d.transactions.unshift({
            id: uid(),
            tipo: "entrata",
            importo: amount - appliedToExpense,
            data: form.data,
            categoria: null,
            conto: form.conto || linkedTransaction.conto || d.accounts[0]?.id || "",
            metodo: "Bonifico",
            note: `Arrotondamento Credito · ${current.persona}`,
            tags: ["credito"],
          });
          d.transactions.sort((a, b) => b.data.localeCompare(a.data));
        }
      } else {
        d.transactions.unshift({
          id: uid(),
          tipo: "entrata",
          importo: amount,
          data: form.data,
          categoria: null,
          conto: form.conto,
          metodo: "Bonifico",
          note: `Rimborso da ${current.persona}${current.descrizione ? `: ${current.descrizione}` : ""}`,
          tags: ["credito"],
        });
        d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      }
      return d;
    });
    notify(credit.movimentoId ? "Rimborso scalato dal movimento collegato" : "Rimborso registrato nei movimenti");
    setCollecting(null);
  };

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Soldi da ricevere</p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Crediti</h1>
        </div>
        <BtnPrimary onClick={() => setEditing({})}><Plus className="w-4 h-4 inline mr-1" />Nuovo</BtnPrimary>
      </header>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="p-4" hover={false}>
          <p className="text-xs text-slate-400">Ancora da ricevere</p>
          <p className="font-display text-xl text-amber-200 mt-1 tabular-nums">{eur(outstanding)}</p>
        </Card>
        <Card className="p-4" hover={false}>
          <p className="text-xs text-slate-400">Già ricevuti</p>
          <p className="font-display text-xl text-emerald-200 mt-1 tabular-nums">{eur(collected)}</p>
        </Card>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {credits.map((credit, index) => {
          const remaining = Math.max(0, credit.importo - credit.riscosso);
          const paid = remaining === 0;
          return (
            <Card key={credit.id} className="p-5 relative overflow-hidden" delay={60 + index * 50}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl grid place-items-center bg-amber-300/10 text-amber-200 shrink-0"><UserRound className="w-4 h-4" /></span>
                  <div className="min-w-0">
                    <p className="text-white truncate">{credit.persona}</p>
                    <p className="text-xs text-slate-500 truncate">{credit.descrizione || "Credito personale"}</p>
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 shrink-0 ${paid ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
                  {paid ? "Saldato" : "Aperto"}
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Da ricevere</p>
                  <p className={`font-display text-2xl tabular-nums ${paid ? "text-emerald-200" : "text-white"}`}>{eur(remaining)}</p>
                </div>
                <p className="text-xs text-slate-500 text-right">Totale {eur(credit.importo)}<br />Ricevuto {eur(credit.riscosso)}</p>
              </div>
              {credit.scadenza && <p className="text-xs text-slate-500 mt-3">Scadenza · {fmtDate(credit.scadenza)}</p>}
              {credit.movimentoId && (
                <p className="text-xs text-indigo-300 mt-2 truncate">
                  Movimento · {data.transactions.find((transaction) => transaction.id === credit.movimentoId)?.note || "Spesa collegata"}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {(!paid || credit.movimentoId) && (!credit.movimentoId || data.transactions.some((transaction) => transaction.id === credit.movimentoId && transaction.tipo === "spesa")) && (
                  <BtnPrimary onClick={() => setCollecting(credit)} className="px-3! py-1.5! text-xs!">
                    <ArrowDownRight className="w-3.5 h-3.5 inline mr-1" />Registra rimborso
                  </BtnPrimary>
                )}
                {!paid && credit.movimentoId && !data.transactions.some((transaction) => transaction.id === credit.movimentoId && transaction.tipo === "spesa") && (
                  <span className="text-xs text-rose-300 px-2 py-2">Movimento non disponibile</span>
                )}
                {paid && <span className="text-xs text-emerald-300 px-2 py-2"><CircleCheck className="w-3.5 h-3.5 inline mr-1" />Credito saldato</span>}
                <BtnGhost onClick={() => setEditing(credit)} className="px-3! py-1.5! text-xs!">Modifica</BtnGhost>
                <button onClick={() => deleteCredit(credit)} aria-label={`Elimina credito di ${credit.persona}`} className="ml-auto text-slate-600 hover:text-rose-300 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          );
        })}
        {!credits.length && (
          <Card className="p-6 sm:col-span-2 xl:col-span-3 text-center" hover={false}>
            <ArrowDownRight className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-300">Nessun credito registrato</p>
            <p className="text-xs text-slate-500 mt-1">Tieni traccia dei prestiti e delle spese che devono rimborsarti.</p>
          </Card>
        )}
      </div>
      {editing && (
        <CreditModal
          key={editing.id || "new"}
          entry={editing}
          expenses={expenses}
          onClose={() => setEditing(null)}
          onSave={(credit) => {
            const previousCredit = data.credits.find((current) => current.id === credit.id);
            if (credit.movimentoId) {
              const movement = data.transactions.find((transaction) => transaction.id === credit.movimentoId && !transaction.deletedAt && transaction.tipo === "spesa");
              if (!movement) {
                notify("Seleziona una spesa disponibile da collegare");
                return;
              }
              const linkedCredits = data.credits.filter((current) => current.movimentoId === credit.movimentoId && current.id !== credit.id);
              const amountAlreadyCredited = linkedCredits.reduce((sum, current) => sum + current.importo, 0);
              const alreadyReceived = linkedCredits.reduce((sum, current) => sum + current.riscosso, 0);
              const originalAmount = movement.importo + alreadyReceived + (previousCredit?.movimentoId === credit.movimentoId ? previousCredit.riscosso : 0);
              if (amountAlreadyCredited + credit.importo > originalAmount) {
                notify("L'importo dei crediti collegati supera la spesa registrata");
                return;
              }
            }
            update((d) => {
              const index = d.credits.findIndex((current) => current.id === credit.id);
              const previous = index >= 0 ? d.credits[index] : null;
              if (index >= 0) d.credits[index] = credit;
              else d.credits.push(credit);
              if (previous?.movimentoId) refreshCreditTag(d, previous.movimentoId);
              if (credit.movimentoId) refreshCreditTag(d, credit.movimentoId);
              return d;
            });
            notify(editing.id ? "Credito aggiornato" : "Credito creato");
            setEditing(null);
          }}
        />
      )}
      {collecting && (
        <CollectionModal
          key={collecting.id}
          credit={collecting}
          accounts={data.accounts}
          onClose={() => setCollecting(null)}
          onSave={(form) => recordCollection(collecting, form)}
        />
      )}
    </div>
  );
}

function CreditModal({ entry, expenses, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    persona: entry?.persona || "",
    descrizione: entry?.descrizione || "",
    importo: entry?.importo ?? "",
    riscosso: entry?.riscosso ?? 0,
    scadenza: entry?.scadenza || "",
    note: entry?.note || "",
    movimentoId: entry?.movimentoId || "",
  }));
  if (!entry) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    if (!form.persona.trim() || Number(form.importo) <= 0) return;
    if (form.movimentoId && Number(form.riscosso) !== (entry?.riscosso || 0)) return;
    onSave({
      id: entry.id || uid(),
      ...form,
      persona: form.persona.trim(),
      descrizione: form.descrizione.trim(),
      importo: Number(form.importo),
      riscosso: Number(form.riscosso) || 0,
      note: form.note.trim(),
      movimentoId: form.movimentoId || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={entry.id ? "Modifica credito" : "Nuovo credito"}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Persona</Label><Input required autoFocus value={form.persona} onChange={(event) => set("persona", event.target.value)} placeholder="Es. Marco" /></div>
        <div><Label>Motivo</Label><Input value={form.descrizione} onChange={(event) => set("descrizione", event.target.value)} placeholder="Es. Cena, viaggio, prestito…" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Importo totale €</Label><Input required type="number" min="0.01" step="0.01" value={form.importo} onChange={(event) => set("importo", event.target.value)} /></div>
          <div><Label>Già ricevuto €</Label><Input type="number" min="0" step="0.01" value={form.riscosso} disabled={!!form.movimentoId} onChange={(event) => set("riscosso", event.target.value)} /></div>
        </div>
        <div>
          <Label>Collega a una spesa (facoltativo)</Label>
          <Select
            value={form.movimentoId}
            disabled={Number(entry?.riscosso) > 0}
            onChange={(event) => set("movimentoId", event.target.value)}
          >
            <option value="">Nessun movimento collegato</option>
            {form.movimentoId && !expenses.some((transaction) => transaction.id === form.movimentoId) && (
              <option value={form.movimentoId}>Movimento non disponibile</option>
            )}
            {expenses.map((transaction) => (
              <option key={transaction.id} value={transaction.id}>{fmtDate(transaction.data)} · {transaction.note || "Spesa"} · {eur(transaction.importo)}</option>
            ))}
          </Select>
          {form.movimentoId && <p className="text-[11px] text-slate-500 mt-1">I rimborsi ridurranno l'importo di questa spesa e aggiorneranno il tag “Da prendere”.</p>}
          {!form.movimentoId && Number(entry?.riscosso) > 0 && <p className="text-[11px] text-slate-500 mt-1">Non puoi collegare una spesa dopo aver registrato rimborsi non collegati.</p>}
        </div>
        <div><Label>Scadenza (facoltativa)</Label><Input type="date" value={form.scadenza} onChange={(event) => set("scadenza", event.target.value)} /></div>
        <div><Label>Note (facoltative)</Label><Input value={form.note} onChange={(event) => set("note", event.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <BtnGhost type="button" onClick={onClose}>Annulla</BtnGhost>
          <BtnPrimary type="submit">Salva</BtnPrimary>
        </div>
      </form>
    </Modal>
  );
}

function CollectionModal({ credit, accounts, onClose, onSave }) {
  const remaining = credit ? Math.max(0, credit.importo - credit.riscosso) : 0;
  const [form, setForm] = useState(() => ({
    importo: remaining || "",
    data: todayISO(),
    conto: accounts[0]?.id || "",
  }));
  if (!credit) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    const amount = Number(form.importo);
    if ((!credit.movimentoId && !form.conto) || amount <= 0 || !form.data) return;
    onSave({ ...form, importo: amount });
  };
  return (
    <Modal open onClose={onClose} title={`Rimborso da ${credit.persona}`}>
      {credit.movimentoId || accounts.length ? (
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs text-slate-400">Residuo da ricevere: <span className="text-white">{eur(remaining)}</span></p>
          <div><Label>Importo ricevuto €</Label><Input required type="number" min="0.01" step="0.01" value={form.importo} onChange={(event) => set("importo", event.target.value)} /></div>
          <div><Label>Data</Label><Input required type="date" value={form.data} onChange={(event) => set("data", event.target.value)} /></div>
          {credit.movimentoId
            ? <p className="text-xs text-indigo-300">L'importo ridurrà la spesa collegata; l'eventuale eccedenza sarà registrata come entrata "Arrotondamento Credito".</p>
            : <div><Label>Accredita su</Label><Select required value={form.conto} onChange={(event) => set("conto", event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}</Select></div>}
          <div className="flex justify-end gap-2 pt-2">
            <BtnGhost type="button" onClick={onClose}>Annulla</BtnGhost>
            <BtnPrimary type="submit">Registra</BtnPrimary>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Aggiungi un conto prima di registrare il rimborso nei movimenti.</p>
          <div className="flex justify-end"><BtnGhost onClick={onClose}>Chiudi</BtnGhost></div>
        </div>
      )}
    </Modal>
  );
}
