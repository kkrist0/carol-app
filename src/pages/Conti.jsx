import { useCallback, useEffect, useMemo, useState } from "react";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { CountEur, EmptyState } from "../components/Typography";
import { eur, uid } from "../utils/helpers";
import { ACCOUNT_ICON_BY_TYPE, COLOR_SET, DEFAULT_ACCOUNT_TYPES } from "../config/constants";
import { Input, Label, Select } from "../components/Forms";
import Modal from "../components/Modal";

export function Conti({ data, balances, update, onTransfer, notify, setConfirmDlg, txsAll }) {
  const [accModal, setAccModal] = useState(null); // null | {} | conto
  const usage = useMemo(() => {
    const m = {};
    (txsAll || []).forEach((t) => { if (t.conto) m[t.conto] = (m[t.conto] || 0) + 1; if (t.contoDest) m[t.contoDest] = (m[t.contoDest] || 0) + 1; });
    return m;
  }, [txsAll]);

  const deleteAcc = (a) => setConfirmDlg({
    msg: usage[a.id]
      ? `"${a.nome}" è collegato a ${usage[a.id]} movimenti: resteranno nello storico ma non conteranno più nel patrimonio. Eliminare il conto?`
      : `Eliminare il conto "${a.nome}"?`,
    onOk: () => { update((d) => { d.accounts = d.accounts.filter((x) => x.id !== a.id); return d; }); notify("Conto eliminato"); },
  });

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-3" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conti</p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Dove vivono i tuoi soldi</h1>
        </div>
        <div className="flex gap-2">
          <BtnGhost onClick={onTransfer}>⇄ Trasferisci</BtnGhost>
          <BtnPrimary onClick={() => setAccModal({})}>+ Nuovo</BtnPrimary>
        </div>
      </header>
      <p className="text-xs text-slate-500 mb-4" style={{ animation: "fadeUp .5s both", animationDelay: "60ms" }}>Tocca un conto per modificarlo: nome, tipo, icona, colore e saldo iniziale. Ogni modifica si riflette subito su saldi, patrimonio e movimenti.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {data.accounts.map((a, i) => (
          <Card key={a.id} className="p-5 relative overflow-hidden cursor-pointer" delay={60 + i * 70}>
            <div onClick={() => setAccModal(a)}>
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full opacity-15 blur-2xl" style={{ background: a.colore }} />
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: a.colore + "1f", border: `1px solid ${a.colore}33` }}>{a.icona}</span>
                <div>
                  <p className="text-white leading-tight">{a.nome}</p>
                  <p className="text-[11px] text-slate-500">{a.tipo}{usage[a.id] ? ` · ${usage[a.id]} movimenti` : ""}</p>
                </div>
              </div>
              <CountEur value={balances[a.id] || 0} cls="font-display text-2xl mt-3 block text-white tabular-nums" />
              <p className="text-[11px] text-slate-600 mt-0.5">Saldo iniziale {eur(a.saldoIniziale)}</p>
            </div>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); setAccModal(a); }} className="text-xs text-slate-500 hover:text-white transition-colors">Modifica</button>
              <button onClick={(e) => { e.stopPropagation(); deleteAcc(a); }} className="text-xs text-slate-600 hover:text-rose-300 transition-colors">Elimina</button>
            </div>
          </Card>
        ))}
        {data.accounts.length === 0 && <EmptyState text='Nessun conto: creane uno con "+ Nuovo".' />}
      </div>
      <AccountModal open={!!accModal} acc={accModal} onClose={() => setAccModal(null)} update={update} notify={notify} accountTypes={data.accountTypes} />
    </div>
  );
};

export function AccountModal({ open, acc, onClose, update, notify, accountTypes }) {
  const isEdit = !!acc?.id;
  const ICONS = ["🏦", "💳", "💵", "🏛️", "📈", "🪙", "💼", "🐖", "🧧", "📱", "🌍", "🔒"];
  const types = (accountTypes && accountTypes.length ? accountTypes : DEFAULT_ACCOUNT_TYPES); // Assicurati di importare DEFAULT_ACCOUNT_TYPES e ACCOUNT_ICON_BY_TYPE da constants.js

  // 1. Stabilizziamo la funzione con useCallback
  const iconForType = useCallback((tipo) => {
    const type = types.find((t) => t.tipo === tipo);
    return type?.icona || ACCOUNT_ICON_BY_TYPE[tipo] || "💼";
  }, [types]);

  const [f, setF] = useState(null);

  // 2. Rendiamo l'aggiornamento asincrono con setTimeout
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setF({ 
          nome: acc?.nome || "", 
          tipo: acc?.tipo || types[0].tipo, 
          icona: acc?.icona || iconForType(acc?.tipo || types[0].tipo), 
          colore: acc?.colore || "#8B9DF9", 
          saldoIniziale: acc?.saldoIniziale ?? "" 
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, acc, types, iconForType]);

  if (!open || !f) return null;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!f.nome.trim()) return;
    update((d) => {
      if (isEdit) {
        const a = d.accounts.find((x) => x.id === acc.id);
        Object.assign(a, { nome: f.nome.trim(), tipo: f.tipo, icona: f.icona, colore: f.colore, saldoIniziale: Number(f.saldoIniziale) || 0 });
      } else {
        d.accounts.push({ id: uid(), nome: f.nome.trim(), tipo: f.tipo, icona: f.icona, colore: f.colore, saldoIniziale: Number(f.saldoIniziale) || 0 }); // Assicurati di importare uid()
      }
      return d;
    });
    notify(isEdit ? "Conto aggiornato" : `Conto "${f.nome.trim()}" creato`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Modifica conto" : "Nuovo conto"}>
      <div className="space-y-3">
        <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="es. Conto Intesa" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Tipo</Label><Select value={f.tipo} onChange={(e) => { set("tipo", e.target.value); if (!isEdit) set("icona", iconForType(e.target.value)); }}>{types.map((t) => <option key={t.tipo}>{t.tipo}</option>)}</Select></div>
          <div><Label>Saldo iniziale €</Label><Input type="number" inputMode="decimal" step="0.01" value={f.saldoIniziale} onChange={(e) => set("saldoIniziale", e.target.value)} placeholder="0,00" /></div>
        </div>
        <div><Label>Icona</Label>
          <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5">
            {ICONS.map((e) => (
              <button key={e} onClick={() => set("icona", e)} className={`aspect-square rounded-xl grid place-items-center text-base transition-all ${f.icona === e ? "bg-indigo-400/25 border border-indigo-400/60" : "bg-white/5 border border-white/10 hover:bg-white/10"}`}>{e}</button>
            ))}
            <input value={f.icona} onChange={(e) => set("icona", e.target.value)} maxLength={4} className="aspect-square rounded-xl bg-white/5 border border-white/10 text-center text-base outline-none focus:border-indigo-400/60 min-w-0" title="Emoji personalizzata" />
          </div>
        </div>
        <div><Label>Colore</Label>
          <div className="grid grid-cols-9 sm:grid-cols-17 gap-1.5 items-center">
            {COLOR_SET.map((c) => ( // Assicurati di importare COLOR_SET
              <button key={c} onClick={() => set("colore", c)} className={`aspect-square rounded-full transition-transform ${f.colore === c ? "scale-110 ring-2 ring-white/70" : "hover:scale-110"}`} style={{ background: c }} />
            ))}
            <input type="color" value={f.colore} onChange={(e) => set("colore", e.target.value)} className="aspect-square w-full rounded-lg bg-transparent border border-white/10 cursor-pointer p-0" />
          </div>
        </div>
        {isEdit && <p className="text-[11px] text-slate-500 leading-snug">Cambiando il saldo iniziale, saldo attuale e patrimonio si ricalcolano su tutto lo storico.</p>}
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={save}>{isEdit ? "Salva modifiche" : "Crea conto"}</BtnPrimary>
      </div>
    </Modal>
  );
};