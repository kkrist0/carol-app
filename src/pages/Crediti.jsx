import { useMemo, useState } from "react";
import { ArrowDownRight, ChevronDown, CircleCheck, Mail, Plus, Trash2, UserRound } from "lucide-react";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { Input, Label, Select } from "../components/Forms";
import Modal from "../components/Modal";
import { eur, fmtDate, todayISO, uid } from "../utils/helpers";

const amountLabel = (amount) => Number(amount).toLocaleString("it-IT", { maximumFractionDigits: 2 });

function splitAmount(total, count) {
  const totalCents = Math.round((Number(total) || 0) * 100);
  const baseCents = Math.floor(totalCents / count);
  const extraCents = totalCents % count;
  return Array.from({ length: count }, (_, index) => (baseCents + (index < extraCents ? 1 : 0)) / 100);
}

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
  const [openCreditsOpen, setOpenCreditsOpen] = useState(true);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const expenses = useMemo(
    () => (data.transactions || []).filter((transaction) => transaction.tipo === "spesa" && !transaction.deletedAt),
    [data.transactions]
  );
  const credits = useMemo(
    () => [...(data.credits || [])].sort((a, b) => (a.scadenza || "9999-12-31").localeCompare(b.scadenza || "9999-12-31")),
    [data.credits]
  );
  const openCredits = credits.filter((credit) => credit.importo > credit.riscosso);
  const archivedCredits = credits.filter((credit) => credit.importo <= credit.riscosso);
  const personSummaries = useMemo(() => {
    const byPerson = new Map();
    credits.forEach((credit) => {
      const remaining = Math.max(0, credit.importo - credit.riscosso);
      if (!remaining) return;
      const name = credit.persona.trim();
      const key = name.toLocaleLowerCase("it-IT");
      const summary = byPerson.get(key) || { name, amount: 0, count: 0 };
      summary.amount += remaining;
      summary.count += 1;
      byPerson.set(key, summary);
    });
    return [...byPerson.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "it-IT"));
  }, [credits]);
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
          let category = d.categories.find((item) => item.nome.trim().toLocaleLowerCase("it-IT") === "arrotondamento credito");
          if (!category) {
            category = {
              id: uid(),
              nome: "Arrotondamento Credito",
              gruppo: "Entrate",
              icona: "↗️",
              colore: "#34D399",
              sottocategorie: [],
              ordine: Math.max(-1, ...d.categories.map((item) => item.ordine ?? -1)) + 1,
            };
            d.categories.push(category);
          }
          d.transactions.unshift({
            id: uid(),
            tipo: "entrata",
            importo: amount - appliedToExpense,
            data: form.data,
            categoria: category.id,
            conto: form.conto || linkedTransaction.conto || d.accounts[0]?.id || "",
            metodo: "Bonifico",
            note: `Arrotondamento Credito · ${current.persona}`,
            tags: [],
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

  const renderCreditCards = (entries) => entries.map((credit, index) => {
    const remaining = Math.max(0, credit.importo - credit.riscosso);
    const excessReceived = Math.max(0, credit.riscosso - credit.importo);
    const paid = remaining === 0;
    const reimbursementAccount = data.accounts.find((account) => account.id === credit.contoRimborso) || data.accounts.find((account) => account.iban?.trim());
    const canSendReminder = Boolean(credit.email?.trim() && reimbursementAccount?.iban?.trim() && remaining > 0);
    const emailSubject = `Promemoria rimborso${credit.descrizione ? ` · ${credit.descrizione}` : ""}`;
    const emailBody = [
      `Ciao ${credit.persona},`,
      "",
      `ti scrivo per ricordarti l'importo ancora da rimborsare${credit.descrizione ? ` per ${credit.descrizione}` : ""}: ${eur(remaining)}.`,
      "",
      `Puoi effettuare il bonifico a questo IBAN: ${reimbursementAccount?.iban || ""}`,
      "",
      "Grazie!",
    ].join("\n");
    const mailto = `mailto:${encodeURIComponent(credit.email || "")}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(credit.email || "")}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
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
            <p className="text-xs text-slate-500">{excessReceived > 0 ? "Eccedenza ricevuta" : "Da ricevere"}</p>
            <p className={`font-display text-2xl tabular-nums ${paid ? "text-emerald-200" : "text-white"}`}>{eur(excessReceived || remaining)}</p>
          </div>
          <p className="text-xs text-slate-500 text-right">Totale {eur(credit.importo)}<br />Ricevuto {eur(credit.riscosso)}</p>
        </div>
        {credit.scadenza && <p className="text-xs text-slate-500 mt-3">Scadenza · {fmtDate(credit.scadenza)}</p>}
        {credit.movimentoId && (
          <p className="text-xs text-indigo-300 mt-2 truncate">
            Movimento · {data.transactions.find((transaction) => transaction.id === credit.movimentoId)?.note || "Spesa collegata"}
          </p>
        )}
        {credit.email && <p className="text-xs text-slate-500 mt-2 truncate">{credit.email}</p>}
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
          {canSendReminder ? (
            <a
              href={mailto}
              onClick={(event) => {
                if (window.matchMedia("(pointer: coarse)").matches) return;
                event.preventDefault();
                window.open(gmailComposeUrl, "_blank", "noopener,noreferrer");
              }}
              className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <Mail className="w-3.5 h-3.5 inline mr-1" />Prepara email
            </a>
          ) : credit.email && !paid ? (
            <span className="text-[11px] text-slate-500 py-2">Aggiungi un IBAN ai conti per preparare l’email</span>
          ) : null}
          <BtnGhost onClick={() => setEditing(credit)} className="px-3! py-1.5! text-xs!">Modifica</BtnGhost>
          <button onClick={() => deleteCredit(credit)} aria-label={`Elimina credito di ${credit.persona}`} className="ml-auto text-slate-600 hover:text-rose-300 p-1">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </Card>
    );
  });

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
      <section className="mb-8 rounded-2xl border border-indigo-300/15 bg-indigo-400/[0.035] p-4 sm:p-5" aria-label="Riepilogo crediti per persona">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-white">Totale da ricevere per persona</h2>
          <p className="text-xs text-slate-400 mt-1">Somma dei crediti ancora aperti per ciascuna persona.</p>
        </div>
        {personSummaries.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {personSummaries.map((person) => (
              <Card key={person.name.toLocaleLowerCase("it-IT")} className="p-4 flex items-center justify-between gap-3" hover={false}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl grid place-items-center bg-amber-300/10 text-amber-200 shrink-0"><UserRound className="w-4 h-4" /></span>
                  <div className="min-w-0">
                    <p className="text-white truncate">{person.name}</p>
                    <p className="text-xs text-slate-500">{person.count} {person.count === 1 ? "credito aperto" : "crediti aperti"}</p>
                  </div>
                </div>
                <p className="font-display text-lg text-amber-200 tabular-nums shrink-0">{eur(person.amount)}</p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-slate-500" hover={false}>Non ci sono crediti aperti.</Card>
        )}
      </section>
      <section className="mb-8" aria-label="Crediti aperti">
        <button
          type="button"
          aria-expanded={openCreditsOpen}
          aria-controls="open-credit-list"
          onClick={() => setOpenCreditsOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 rounded-xl p-3 -mx-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <div>
            <h2 className="font-display text-lg text-white">Crediti aperti</h2>
          </div>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-amber-200 bg-amber-400/10 rounded-full px-2.5 py-1">{openCredits.length}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openCreditsOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        <div id="open-credit-list" hidden={!openCreditsOpen} className="mt-3">
          {openCredits.length ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{renderCreditCards(openCredits)}</div>
          ) : (
            <Card className="p-5 text-sm text-slate-500" hover={false}>Non ci sono crediti aperti.</Card>
          )}
        </div>
      </section>
      <section aria-label="Crediti archiviati">
        <button
          type="button"
          aria-expanded={archivedOpen}
          aria-controls="archived-credit-list"
          onClick={() => setArchivedOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 rounded-xl p-3 -mx-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <div>
            <h2 className="font-display text-lg text-white">Crediti archiviati</h2>
          </div>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-emerald-200 bg-emerald-400/10 rounded-full px-2.5 py-1">{archivedCredits.length}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${archivedOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        <div id="archived-credit-list" hidden={!archivedOpen} className="mt-3">
          {archivedCredits.length ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{renderCreditCards(archivedCredits)}</div>
          ) : (
            <Card className="p-5 text-sm text-slate-500" hover={false}>Non ci sono crediti archiviati.</Card>
          )}
        </div>
      </section>
      {editing && (
        <CreditModal
          key={editing.id || "new"}
          entry={editing}
          expenses={expenses}
          accounts={data.accounts}
          onClose={() => setEditing(null)}
          onSave={(creditsToSave) => {
            const creditsToSaveList = Array.isArray(creditsToSave) ? creditsToSave : [creditsToSave];
            const replacedIds = new Set(creditsToSaveList.map((credit) => credit.id));
            const previousCredit = data.credits.find((current) => current.id === creditsToSaveList[0].id);
            const movementId = creditsToSaveList[0].movimentoId;
            if (movementId) {
              const movement = data.transactions.find((transaction) => transaction.id === movementId && !transaction.deletedAt && transaction.tipo === "spesa");
              if (!movement) {
                notify("Seleziona una spesa disponibile da collegare");
                return;
              }
              const linkedCredits = data.credits.filter((current) => current.movimentoId === movementId && !replacedIds.has(current.id));
              const amountAlreadyCredited = linkedCredits.reduce((sum, current) => sum + current.importo, 0);
              const alreadyReceived = linkedCredits.reduce((sum, current) => sum + current.riscosso, 0);
              const originalAmount = movement.importo + alreadyReceived + (previousCredit?.movimentoId === movementId ? previousCredit.riscosso : 0);
              const amountToCredit = creditsToSaveList.reduce((sum, credit) => sum + credit.importo, 0);
              if (amountAlreadyCredited + amountToCredit > originalAmount) {
                notify("L'importo dei crediti collegati supera la spesa registrata");
                return;
              }
            }
            update((d) => {
              creditsToSaveList.forEach((credit) => {
                const index = d.credits.findIndex((current) => current.id === credit.id);
                const previous = index >= 0 ? d.credits[index] : null;
                if (index >= 0) d.credits[index] = credit;
                else d.credits.push(credit);
                if (previous?.movimentoId) refreshCreditTag(d, previous.movimentoId);
                if (credit.movimentoId) refreshCreditTag(d, credit.movimentoId);
              });
              return d;
            });
            notify(editing.id ? "Credito aggiornato" : creditsToSaveList.length === 1 ? "Credito creato" : `${creditsToSaveList.length} crediti creati`);
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

function CreditModal({ entry, expenses, accounts, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    descrizione: entry?.descrizione || "",
    scadenza: entry?.scadenza || "",
    note: entry?.note || "",
    movimentoId: entry?.movimentoId || "",
    contoRimborso: entry?.contoRimborso || accounts.find((account) => account.iban?.trim())?.id || "",
  }));
  const [people, setPeople] = useState(() => [{
    persona: entry?.persona || "",
    importo: entry?.importo ?? "",
    email: entry?.email || "",
  }]);
  const [amountMode, setAmountMode] = useState("individual");
  const [totalAmount, setTotalAmount] = useState("");
  if (!entry) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const distributedAmounts = splitAmount(totalAmount, people.length);
  const setPerson = (index, key, value) => setPeople((current) => current.map((person, personIndex) => (
    personIndex === index ? { ...person, [key]: value } : person
  )));
  const save = (event) => {
    event.preventDefault();
    const credits = people.map((person, index) => ({
      id: entry.id || uid(),
      ...form,
      persona: person.persona.trim(),
      descrizione: form.descrizione.trim(),
      importo: !entry.id && amountMode === "equal" ? distributedAmounts[index] : Number(person.importo),
      riscosso: entry?.riscosso ?? 0,
      note: form.note.trim(),
      movimentoId: form.movimentoId || null,
      email: person.email.trim(),
      contoRimborso: form.contoRimborso || null,
    }));
    if (!credits.every((credit) => credit.persona && credit.importo > 0)) return;
    onSave(credits);
  };
  return (
    <Modal open onClose={onClose} title={entry.id ? "Modifica credito" : "Nuovi crediti"}>
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-3">
          <div>
            <Label>Persone e importi</Label>
            {!entry.id && (
              <div className="flex gap-2 rounded-xl bg-white/[0.03] p-1">
                <button type="button" aria-pressed={amountMode === "individual"} onClick={() => setAmountMode("individual")} className={`flex-1 rounded-lg px-3 py-2 text-xs transition-colors ${amountMode === "individual" ? "bg-indigo-400/20 text-indigo-100" : "text-slate-400 hover:text-white"}`}>
                  Importo per persona
                </button>
                <button type="button" aria-pressed={amountMode === "equal"} onClick={() => setAmountMode("equal")} className={`flex-1 rounded-lg px-3 py-2 text-xs transition-colors ${amountMode === "equal" ? "bg-indigo-400/20 text-indigo-100" : "text-slate-400 hover:text-white"}`}>
                  Dividi il totale
                </button>
              </div>
            )}
            {!entry.id && amountMode === "equal" && (
              <div className="mt-3">
                <Label>Importo totale €</Label>
                <Input required type="number" min={(people.length / 100).toFixed(2)} step="0.01" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} />
                <p className="text-[11px] text-slate-500 mt-1">Le quote sono uguali al centesimo; gli eventuali centesimi residui vengono distribuiti per mantenere il totale esatto.</p>
              </div>
            )}
            {people.map((person, index) => (
              <div key={index} className="mt-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Persona</Label><Input required autoFocus={index === 0} value={person.persona} onChange={(event) => setPerson(index, "persona", event.target.value)} placeholder="Es. Marco" /></div>
                  {entry.id || amountMode === "individual" ? (
                    <div><Label>Importo €</Label><Input required type="number" min="0.01" step="0.01" value={person.importo} onChange={(event) => setPerson(index, "importo", event.target.value)} /></div>
                  ) : (
                    <div>
                      <Label>Quota €</Label>
                      <div className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-amber-200 tabular-nums">
                        {totalAmount ? eur(distributedAmounts[index]) : "Inserisci il totale"}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-2 mt-3">
                  <div className="flex-1"><Label>Email (facoltativa)</Label><Input type="email" autoComplete="email" value={person.email} onChange={(event) => setPerson(index, "email", event.target.value)} placeholder="nome@esempio.it" /></div>
                  {!entry.id && people.length > 1 && (
                    <button type="button" onClick={() => setPeople((current) => current.filter((_, personIndex) => personIndex !== index))} aria-label={`Rimuovi ${person.persona || "persona"}`} className="mb-0.5 rounded-xl border border-white/10 p-2 text-slate-400 hover:text-rose-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!entry.id && (
            <BtnGhost type="button" onClick={() => setPeople((current) => [...current, { persona: "", importo: "", email: "" }])} className="w-full">
              <Plus className="w-4 h-4 inline mr-1" />Aggiungi persona
            </BtnGhost>
          )}
          {!entry.id && <p className="text-[11px] text-slate-500">Motivo, scadenza, note e spesa collegata saranno condivisi; l’email è specifica per ogni persona.</p>}
        </div>
        <div><Label>Motivo</Label><Input value={form.descrizione} onChange={(event) => set("descrizione", event.target.value)} placeholder="Es. Cena, viaggio, prestito…" /></div>
        <div>
          <Label>Conto per il rimborso</Label>
          <Select value={form.contoRimborso} onChange={(event) => set("contoRimborso", event.target.value)}>
            <option value="">Seleziona un conto</option>
            {accounts.filter((account) => account.iban?.trim()).map((account) => (
              <option key={account.id} value={account.id}>{account.nome} · {account.iban}</option>
            ))}
          </Select>
          {!accounts.some((account) => account.iban?.trim()) && <p className="text-[11px] text-slate-500 mt-1">Inserisci prima l’IBAN nelle impostazioni di un conto per includerlo nell’email.</p>}
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
