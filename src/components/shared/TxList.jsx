import { TxRow } from "./TxRow";

export function TxList({ txs, catById, accById, onEdit, onDelete, compact }) {
  return (
    <div className="divide-y divide-white/5">
      {txs.map((t, i) => (
        <TxRow key={t.id} t={t} c={catById[t.categoria]} contoNome={accById[t.conto]?.nome} contoDestNome={accById[t.contoDest]?.nome} onEdit={onEdit} onDelete={onDelete} compact={compact} i={i} />
      ))}
    </div>
  );
}