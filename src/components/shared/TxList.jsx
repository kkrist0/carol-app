import { TxRow } from "./TxRow";
import { fmtDate } from "../../utils/helpers";

export function TxList({ txs, catById, accById, onEdit, onDelete, compact }) {
  let previousDate = null;

  return (
    <div>
      {txs.map((t, i) => {
        const date = fmtDate(t.data);
        const showDate = date !== previousDate;
        previousDate = date;

        return (
          <div key={t.id}>
            {showDate && (
              <div className={`flex items-center gap-3 ${i === 0 ? "" : "pt-4"} pb-1`}>
                <span className="text-xs font-medium text-slate-400">{date}</span>
                <span className="h-px flex-1 bg-white/8" />
              </div>
            )}
            <TxRow t={t} c={catById[t.categoria]} contoNome={accById[t.conto]?.nome} contoDestNome={accById[t.contoDest]?.nome} onEdit={onEdit} onDelete={onDelete} compact={compact} i={i} />
          </div>
        );
      })}
    </div>
  );
}