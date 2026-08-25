import { useState } from "react";
import { eur, getCategoryGroups } from "../utils/helpers";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Forms";
import { BtnPrimary } from "../components/Buttons";
import { EmptyState } from "../components/Typography";

export function BudgetPage({ data, update, cur, catById, notify }) {
  const [editCat, setEditCat] = useState("");
  const [editVal, setEditVal] = useState("");
  const spentFor = (k) => cur.mt.filter((t) => t.tipo === "spesa" && t.categoria === k).reduce((s, t) => s + t.importo, 0);
  const entries = Object.entries(data.budgets || {});
  const spendCats = data.categories.filter((c) => !getCategoryGroups(c).includes("Entrate"));

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5" style={{ animation: "fadeUp .5s both" }}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Budget mensili</p>
        <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Limiti sotto controllo</h1>
      </header>
      <Card className="p-4 mb-5" hover={false} delay={60}>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={editCat} onChange={(e) => setEditCat(e.target.value)} className="flex-1"><option value="">Scegli categoria…</option>{spendCats.map((c) => <option key={c.id} value={c.id}>{c.icona} {c.nome}</option>)}</Select>
          <Input type="number" placeholder="Limite €" value={editVal} onChange={(e) => setEditVal(e.target.value)} className="sm:w-36" />
          <BtnPrimary onClick={() => { if (!editCat || !editVal) return; update((d) => { d.budgets[editCat] = Number(editVal); return d; }); setEditCat(""); setEditVal(""); notify("Budget aggiornato"); }}>Imposta</BtnPrimary>
        </div>
      </Card>
      <div className="space-y-3">
        {entries.map(([k, limite], i) => {
          const speso = spentFor(k);
          const pct = Math.min(100, (speso / limite) * 100);
          const over = speso > limite;
          const c = catById[k];
          return (
            <Card key={k} className="p-4" delay={100 + i * 60}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{c?.icona}</span>
                  <span className="text-sm text-white">{c?.nome}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 tabular-nums">{eur(speso)} / {eur(limite)}</span>
                  <button onClick={() => update((d) => { delete d.budgets[k]; return d; })} className="text-slate-600 hover:text-rose-300 text-xs transition-colors">✕</button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, background: over ? "linear-gradient(90deg,#FB7185,#F43F5E)" : pct > 80 ? "linear-gradient(90deg,#FBBF24,#F59E0B)" : `linear-gradient(90deg,${c?.colore || "#8B9DF9"},#8B9DF9)` }} />
              </div>
              <p className={`text-xs mt-1.5 ${over ? "text-rose-300" : "text-slate-500"}`}>{over ? `Superato di ${eur(speso - limite)}` : `Restano ${eur(limite - speso)}`}</p>
            </Card>
          );
        })}
        {entries.length === 0 && <EmptyState text="Nessun budget impostato. Scegli una categoria qui sopra." />}
      </div>
    </div>
  );
}