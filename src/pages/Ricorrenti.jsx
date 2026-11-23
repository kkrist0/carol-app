import { useMemo, useState } from "react";
import { CalendarClock, Check, Pause, Play, Plus, Trash2 } from "lucide-react";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { Input, Label, Select } from "../components/Forms";
import Modal from "../components/Modal";
import { eur, fmtDate, todayISO, uid } from "../utils/helpers";

const FREQUENCIES = [
  { value: "weekly", label: "Ogni settimana" },
  { value: "every28Days", label: "Ogni 28 giorni" },
  { value: "monthly", label: "Ogni mese" },
  { value: "quarterly", label: "Ogni 3 mesi" },
  { value: "yearly", label: "Ogni anno" },
];

function nextOccurrence(date, frequency) {
  const next = new Date(`${date}T12:00:00`);
  if (frequency === "weekly" || frequency === "every28Days") {
    next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 28));
  } else {
    const months = frequency === "quarterly" ? 3 : frequency === "yearly" ? 12 : 1;
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + months);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export function Ricorrenti({ data, update, notify, setConfirmDlg }) {
  const [editing, setEditing] = useState(null);
  const items = useMemo(
    () => [...(data.recurringPayments || [])].sort((a, b) => a.prossimaData.localeCompare(b.prossimaData)),
    [data.recurringPayments]
  );
  const activeItems = items.filter((item) => item.attivo);
  const monthlyTotal = activeItems.reduce((sum, item) => {
    const monthlyAmount = item.frequenza === "weekly" ? item.importo * 52 / 12
      : item.frequenza === "every28Days" ? item.importo * 365 / 28 / 12
      : item.frequenza === "quarterly" ? item.importo / 3
      : item.frequenza === "yearly" ? item.importo / 12
      : item.importo;
    return sum + monthlyAmount;
  }, 0);

  const recordPayment = (item) => {
    if (!data.accounts.length) {
      notify("Aggiungi un conto prima di registrare il pagamento");
      return;
    }
    update((d) => {
      const current = d.recurringPayments.find((entry) => entry.id === item.id);
      if (!current) return d;
      d.transactions.unshift({
        id: uid(),
        tipo: "spesa",
        importo: current.importo,
        data: todayISO(),
        categoria: current.categoria || null,
        conto: current.conto || d.accounts[0].id,
        metodo: "Addebito",
        note: `Pagamento ricorrente: ${current.nome}`,
        tags: ["ricorrente"],
      });
      d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      current.prossimaData = nextOccurrence(current.prossimaData, current.frequenza);
      return d;
    });
    notify(`Pagamento di ${item.nome} registrato`);
  };

  const toggleActive = (item) => update((d) => {
    const current = d.recurringPayments.find((entry) => entry.id === item.id);
    if (current) current.attivo = !current.attivo;
    return d;
  });

  const deleteItem = (item) => setConfirmDlg({
    msg: `Eliminare il pagamento ricorrente "${item.nome}"?`,
    onOk: () => {
      update((d) => {
        d.recurringPayments = d.recurringPayments.filter((entry) => entry.id !== item.id);
        return d;
      });
      notify("Pagamento ricorrente eliminato");
    },
  });

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Spese programmate</p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Pagamenti ricorrenti</h1>
        </div>
        <BtnPrimary onClick={() => setEditing({})}><Plus className="w-4 h-4 inline mr-1" />Nuovo</BtnPrimary>
      </header>
      <Card className="p-4 mb-5 flex items-center justify-between gap-3" hover={false}>
        <div>
          <p className="text-xs text-slate-400">Impegno mensile stimato</p>
          <p className="font-display text-xl text-white mt-1">{eur(monthlyTotal)}</p>
        </div>
        <CalendarClock className="w-6 h-6 text-indigo-300" />
      </Card>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item, index) => {
          const overdue = item.attivo && item.prossimaData < todayISO();
          return (
            <Card key={item.id} className="p-5 relative overflow-hidden" delay={60 + index * 50}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white truncate">{item.nome}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {FREQUENCIES.find((frequency) => frequency.value === item.frequenza)?.label || "Ogni mese"}
                    {" · "}{data.accounts.find((account) => account.id === item.conto)?.nome || "Conto non disponibile"}
                  </p>
                </div>
                <p className="text-white tabular-nums font-medium shrink-0">{eur(item.importo)}</p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className={`text-xs ${overdue ? "text-rose-300" : "text-slate-400"}`}>
                  {item.attivo ? `${overdue ? "Scaduto · " : "Prossimo · "}${fmtDate(item.prossimaData)}` : "In pausa"}
                </p>
                {!item.attivo && <span className="text-[10px] uppercase tracking-wider text-slate-500">Sospeso</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {item.attivo && (
                  <BtnPrimary onClick={() => recordPayment(item)} className="px-3! py-1.5! text-xs!">
                    <Check className="w-3.5 h-3.5 inline mr-1" />Segna pagato
                  </BtnPrimary>
                )}
                <BtnGhost onClick={() => setEditing(item)} className="px-3! py-1.5! text-xs!">Modifica</BtnGhost>
                <button onClick={() => toggleActive(item)} className="text-xs text-slate-500 hover:text-white px-2">
                  {item.attivo ? <><Pause className="w-3.5 h-3.5 inline mr-1" />Pausa</> : <><Play className="w-3.5 h-3.5 inline mr-1" />Riattiva</>}
                </button>
                <button onClick={() => deleteItem(item)} aria-label={`Elimina ${item.nome}`} className="ml-auto text-slate-600 hover:text-rose-300 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          );
        })}
        {!items.length && (
          <Card className="p-6 sm:col-span-2 xl:col-span-3 text-center" hover={false}>
            <CalendarClock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-300">Nessun pagamento ricorrente</p>
            <p className="text-xs text-slate-500 mt-1">Aggiungi abbonamenti, bollette o altre spese periodiche.</p>
          </Card>
        )}
      </div>
      {editing && (
        <RecurringModal
          key={editing.id || "new"}
          entry={editing}
          categories={data.categories}
          accounts={data.accounts}
          onClose={() => setEditing(null)}
          onSave={(entry) => {
            update((d) => {
              const index = d.recurringPayments.findIndex((current) => current.id === entry.id);
              if (index >= 0) d.recurringPayments[index] = entry;
              else d.recurringPayments.push(entry);
              return d;
            });
            notify(editing.id ? "Pagamento aggiornato" : "Pagamento ricorrente creato");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RecurringModal({ entry, categories, accounts, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    nome: entry?.nome || "",
    importo: entry?.importo ?? "",
    frequenza: entry?.frequenza || "monthly",
    prossimaData: entry?.prossimaData || todayISO(),
    categoria: entry?.categoria || "",
    conto: entry?.conto || accounts[0]?.id || "",
    attivo: entry?.attivo ?? true,
  }));
  if (!entry) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    if (!form.nome.trim() || Number(form.importo) <= 0 || !form.prossimaData || !form.conto) return;
    onSave({
      id: entry.id || uid(),
      ...form,
      nome: form.nome.trim(),
      importo: Number(form.importo),
      categoria: form.categoria || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={entry.id ? "Modifica pagamento ricorrente" : "Nuovo pagamento ricorrente"}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Nome</Label><Input required autoFocus value={form.nome} onChange={(event) => set("nome", event.target.value)} placeholder="Es. Abbonamento palestra" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Importo €</Label><Input required type="number" min="0.01" step="0.01" value={form.importo} onChange={(event) => set("importo", event.target.value)} /></div>
          <div><Label>Frequenza</Label><Select value={form.frequenza} onChange={(event) => set("frequenza", event.target.value)}>{FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</Select></div>
        </div>
        <div><Label>Prossima scadenza</Label><Input required type="date" value={form.prossimaData} onChange={(event) => set("prossimaData", event.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Categoria</Label><Select value={form.categoria} onChange={(event) => set("categoria", event.target.value)}><option value="">Nessuna</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</Select></div>
          <div><Label>Conto</Label><Select required value={form.conto} onChange={(event) => set("conto", event.target.value)}><option value="">Seleziona</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}</Select></div>
        </div>
        {!accounts.length && <p className="text-xs text-amber-300">Crea prima un conto per poter registrare il pagamento nei movimenti.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <BtnGhost type="button" onClick={onClose}>Annulla</BtnGhost>
          <BtnPrimary type="submit" disabled={!accounts.length}>Salva</BtnPrimary>
        </div>
      </form>
    </Modal>
  );
}
