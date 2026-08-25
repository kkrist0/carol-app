import { useState } from "react";
import { Card } from "../components/Card";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { eur, uid } from "../utils/helpers";
import { Input } from "../components/Forms";

export function Obiettivi({ data, update, notify, setConfirmDlg }) {
  const [nome, setNome] = useState("");
  const [target, setTarget] = useState("");
  const addTo = (id, amt) => update((d) => { const g = d.goals.find((x) => x.id === id); if (g) g.salvato = Math.max(0, g.salvato + amt); return d; });
  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5" style={{ animation: "fadeUp .5s both" }}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Obiettivi di risparmio</p>
        <h1 className="font-display text-xl sm:text-2xl text-white mt-1">Ogni euro ha una destinazione</h1>
      </header>
      <div className="space-y-4 mb-5">
        {data.goals.map((g, i) => {
          const pct = Math.min(100, (g.salvato / g.target) * 100);
          return (
            <Card key={g.id} className="p-5" delay={60 + i * 70}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white">{g.nome}</p>
                <span className="text-xs text-slate-400 tabular-nums">{eur(g.salvato)} / {eur(g.target)} · {Math.round(pct)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${g.colore},#A5B4FC)` }}>
                  <div className="absolute inset-0 opacity-40" style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)", animation: "shimmer 2.2s linear infinite" }} />
                </div>
              </div>
              <div className="flex gap-2">
                {[50, 100, 250].map((a) => <BtnGhost key={a} onClick={() => { addTo(g.id, a); notify(`+${eur(a)} verso ${g.nome}`); }} className="px-3! py-1.5! text-xs!">+{a}€</BtnGhost>)}
                <button onClick={() => setConfirmDlg({ msg: `Eliminare l'obiettivo "${g.nome}"?`, onOk: () => update((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); return d; }) })} className="ml-auto text-xs text-slate-600 hover:text-rose-300 transition-colors">Elimina</button>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="p-4" hover={false} delay={260}>
        <p className="text-sm text-white mb-3">Nuovo obiettivo</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input placeholder="Nome (es. Viaggio in Giappone)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input type="number" placeholder="Traguardo €" value={target} onChange={(e) => setTarget(e.target.value)} />
          <BtnPrimary onClick={() => { if (!nome || !target) return; update((d) => { d.goals.push({ id: uid(), nome, target: Number(target), salvato: 0, colore: "#5EEAD4" }); return d; }); setNome(""); setTarget(""); notify("Obiettivo creato"); }}>Crea</BtnPrimary>
        </div>
      </Card>
    </div>
  );
}