import { useState, useEffect, useRef, useMemo } from "react";
import { eur, getCategoryGroups, uid } from "../utils/helpers";
import { EMOJI_SET, COLOR_SET } from "../config/constants";
import { Card } from "../components/Card";
import { BtnPrimary, BtnGhost } from "../components/Buttons";
import { Input, Label } from "../components/Forms";
import Modal from "../components/Modal";

export function CategoriePage({
  data,
  update,
  notify,
  setConfirmDlg,
  txs,
  setCatEditor,
}) {
  const [newGroup, setNewGroup] = useState("");
  const dragId = useRef(null);
  const dragModeRef = useRef("move");
  const [dragOver, setDragOver] = useState(null);

  const usage = useMemo(() => {
    const m = {};
    txs.forEach((t) => {
      if (t.categoria) m[t.categoria] = (m[t.categoria] || 0) + 1;
    });
    return m;
  }, [txs]);

  const byGroup = useMemo(() => {
    const m = {};
    data.groups.forEach((g) => (m[g] = []));
    [...data.categories]
      .sort((a, b) => a.ordine - b.ordine)
      .forEach((c) => {
        const groups = getCategoryGroups(c);
        groups.forEach((g) => {
          (m[g] = m[g] || []).push(c);
        });
      });
    return m;
  }, [data]);

  const onDrop = (targetId, targetGroup) => {
    const id = dragId.current;
    const mode = dragModeRef.current;
    dragId.current = null;
    dragModeRef.current = "move";
    setDragOver(null);
    if (!id || id === targetId) return;
    update((d) => {
      const ordered = [...d.categories].sort((a, b) => a.ordine - b.ordine);
      const dragged = ordered.find((c) => c.id === id);
      if (!dragged) return d;
      const rest = ordered.filter((c) => c.id !== id);
      const groups = getCategoryGroups(dragged).filter(Boolean);
      const nextGroups =
        mode === "copy"
          ? [...new Set([...groups, targetGroup].filter(Boolean))]
          : groups.includes(targetGroup)
          ? groups.filter((g) => g !== targetGroup && g !== "")
          : [targetGroup];
      dragged.gruppo = nextGroups.join("|");
      const idx = targetId
        ? rest.findIndex((c) => c.id === targetId)
        : rest.length;
      rest.splice(idx < 0 ? rest.length : idx, 0, dragged);
      rest.forEach((c, i) => {
        const orig = d.categories.find((x) => x.id === c.id);
        orig.ordine = i;
        orig.gruppo = c.gruppo;
      });
      return d;
    });
  };

  const removeCatFromGroup = (c, g) => {
    const groups = getCategoryGroups(c).filter((x) => x !== g);
    const msg = groups.length
      ? `Rimuovere "${c.nome}" solo dal gruppo "${g}"? Rimarrà disponibile nei gruppi: ${groups.join(", ")}.`
      : `Rimuovere "${c.nome}" da "${g}"? Non resterà in nessun gruppo, quindi verrà eliminata completamente.`;
    setConfirmDlg({
      msg,
      onOk: () => {
        update((d) => {
          const cat = d.categories.find((x) => x.id === c.id);
          if (!cat) return d;
          const nextGroups = getCategoryGroups(cat).filter((x) => x !== g);
          if (nextGroups.length) {
            cat.gruppo = nextGroups.join("|");
          } else {
            d.categories = d.categories.filter((x) => x.id !== c.id);
            delete d.budgets[c.id];
          }
          return d;
        });
        notify(
          groups.length ? `Categoria rimossa da "${g}"` : `Categoria eliminata`
        );
      },
    });
  };

  const deleteGroup = (g) => {
    if ((byGroup[g] || []).length) {
      notify("Sposta o elimina prima le categorie del gruppo");
      return;
    }
    setConfirmDlg({
      msg: `Eliminare il gruppo vuoto "${g}"?`,
      onOk: () =>
        update((d) => {
          d.groups = d.groups.filter((x) => x !== g);
          return d;
        }),
    });
  };

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header
        className="mb-5 flex items-end justify-between"
        style={{ animation: "fadeUp .5s both" }}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Categorie
          </p>
          <h1 className="font-display text-xl sm:text-2xl text-white mt-1">
            La tua struttura, le tue regole
          </h1>
        </div>
        <BtnPrimary onClick={() => setCatEditor({})}>+ Nuova</BtnPrimary>
      </header>
      <p
        className="text-xs text-slate-500 mb-4"
        style={{ animation: "fadeUp .5s both", animationDelay: "60ms" }}
      >
        Trascina la scheda per spostarla in un altro gruppo; trascina l'icona ⧉
        per duplicarla in un altro gruppo. Tocca una categoria per modificarla.
      </p>

      {data.groups.map((g, gi) => (
        <Card key={g} className="p-4 mb-4" hover={false} delay={80 + gi * 60}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-white text-sm uppercase tracking-wider">
              {g}
            </h2>
            <button
              onClick={() => deleteGroup(g)}
              className="text-[11px] text-slate-600 hover:text-rose-300 transition-colors"
            >
              Elimina gruppo
            </button>
          </div>
          <div
            className="space-y-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(null, g)}
          >
            {(byGroup[g] || []).map((c) => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  dragId.current = c.id;
                  dragModeRef.current = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(c.id);
                }}
                onDragLeave={() =>
                  setDragOver((x) => (x === c.id ? null : x))
                }
                onDrop={(e) => {
                  e.stopPropagation();
                  onDrop(c.id, g);
                }}
                onClick={() => setCatEditor({ cat: c })}
                className={`group flex items-center gap-3 p-2 rounded-xl cursor-grab active:cursor-grabbing transition-all border ${
                  dragOver === c.id
                    ? "border-indigo-400/60 bg-indigo-400/10"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <span className="text-slate-600 text-xs select-none">⠿</span>
                <span
                  className="w-8 h-8 rounded-lg grid place-items-center text-base"
                  style={{
                    background: c.colore + "1f",
                    border: `1px solid ${c.colore}33`,
                  }}
                >
                  {c.icona}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{c.nome}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {[
                      c.sottocategorie.length
                        ? `${c.sottocategorie.length} sottocategorie`
                        : null,
                      data.budgets[c.id]
                        ? `budget ${eur(data.budgets[c.id])}`
                        : null,
                      usage[c.id]
                        ? `${usage[c.id]} movimenti`
                        : "mai usata",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: c.colore }}
                />
                <span
                  draggable
                  title="Trascina per aggiungere questo gruppo"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragId.current = c.id;
                    dragModeRef.current = "copy";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(c.id);
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    onDrop(c.id, g);
                  }}
                  className="w-7 h-7 rounded-lg grid place-items-center text-xs text-slate-400 opacity-70 hover:opacity-100 hover:bg-white/10 transition-all cursor-copy"
                >
                  ⧉
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCatFromGroup(c, g);
                  }}
                  className="w-7 h-7 rounded-lg text-xs text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 hover:text-rose-300 transition-all"
                  title={`Rimuovi da ${g}`}
                >
                  🗑
                </button>
              </div>
            ))}
            {(byGroup[g] || []).length === 0 && (
              <p className="text-xs text-slate-600 py-2 px-2">
                Gruppo vuoto: trascina qui una categoria.
              </p>
            )}
          </div>
        </Card>
      ))}

      <Card className="p-4" hover={false} delay={200}>
        <p className="text-sm text-white mb-3">Nuovo gruppo</p>
        <div className="flex gap-3">
          <Input
            placeholder="es. Famiglia, Auto, Business…"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <BtnPrimary
            onClick={() => {
              const g = newGroup.trim();
              if (!g || data.groups.includes(g)) return;
              update((d) => {
                d.groups.push(g);
                return d;
              });
              setNewGroup("");
              notify(`Gruppo "${g}" creato`);
            }}
          >
            Crea
          </BtnPrimary>
        </div>
      </Card>
    </div>
  );
}

export function CatModal({
  open,
  cat,
  prefillName,
  prefillGroup,
  onClose,
  data,
  update,
  notify,
  setConfirmDlg,
  onSaved,
}) {
  const isEdit = !!cat?.id;
  const [f, setF] = useState(null);
  const [subInput, setSubInput] = useState("");

  useEffect(() => {
  if (open) {
    const timer = setTimeout(() => {
      const initialGroups = getCategoryGroups(cat).length
        ? getCategoryGroups(cat)
        : prefillGroup
        ? [prefillGroup]
        : data.groups[0]
        ? [data.groups[0]]
        : [];
      setF({
        nome: cat?.nome || prefillName || "",
        gruppi: initialGroups,
        icona: cat?.icona || "✨",
        colore: cat?.colore || "#8B9DF9",
        sottocategorie: [...(cat?.sottocategorie || [])],
        budget:
          cat?.id && data.budgets[cat.id]
            ? String(data.budgets[cat.id])
            : "",
      });
      setSubInput("");
    }, 0);
    return () => clearTimeout(timer);
  }
}, [open, cat, prefillName, prefillGroup, data]);

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const addSub = () => {
    const s = subInput.trim();
    if (!s || f.sottocategorie.includes(s)) return;
    set("sottocategorie", [...f.sottocategorie, s]);
    setSubInput("");
  };

  const save = () => {
    if (!f.nome.trim()) return;
    let id = cat?.id;
    update((d) => {
      const gruppi = (f.gruppi || []).filter(Boolean);
      if (isEdit) {
        const c = d.categories.find((x) => x.id === id);
        Object.assign(c, {
          nome: f.nome.trim(),
          gruppo: gruppi.join("|"),
          icona: f.icona,
          colore: f.colore,
          sottocategorie: f.sottocategorie,
        });
      } else {
        id = uid();
        d.categories.push({
          id,
          nome: f.nome.trim(),
          gruppo: gruppi.join("|"),
          icona: f.icona,
          colore: f.colore,
          sottocategorie: f.sottocategorie,
          ordine:
            Math.max(-1, ...d.categories.map((c) => c.ordine)) + 1,
        });
      }
      const b = Number(f.budget);
      if (b > 0) d.budgets[id] = b;
      else delete d.budgets[id];
      return d;
    });
    notify(isEdit ? "Categoria aggiornata" : `Categoria "${f.nome.trim()}" creata`);
    if (onSaved) onSaved(id);
    else onClose();
  };

  const remove = () => {
    const n = data.transactions.filter((t) => t.categoria === cat.id).length;
    setConfirmDlg({
      msg: n
        ? `"${cat.nome}" è usata in ${n} movimenti: resteranno nello storico come "Senza categoria". Eliminare la categoria?`
        : `Eliminare la categoria "${cat.nome}"?`,
      onOk: () => {
        update((d) => {
          d.categories = d.categories.filter((x) => x.id !== cat.id);
          delete d.budgets[cat.id];
          return d;
        });
        notify("Categoria eliminata");
        onClose();
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica categoria" : "Nuova categoria"}
      wide
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Nome</Label>
          <Input
            value={f.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="es. Palestra"
            autoFocus
          />
        </div>
        <div>
          <Label>Gruppi</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {data.groups.map((g) => (
              <label
                key={g}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs transition-all ${
                  f.gruppi.includes(g)
                    ? "border-indigo-400/60 bg-indigo-400/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >
                <input
                  type="checkbox"
                  checked={f.gruppi.includes(g)}
                  onChange={(e) =>
                    set(
                      "gruppi",
                      e.target.checked
                        ? [...f.gruppi, g]
                        : f.gruppi.filter((x) => x !== g)
                    )
                  }
                />
                <span>{g}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Label>Icona</Label>
        <div className="grid grid-cols-8 sm:grid-cols-11 gap-1.5">
          {EMOJI_SET.map((e) => (
            <button
              key={e}
              onClick={() => set("icona", e)}
              className={`aspect-square rounded-xl grid place-items-center text-base transition-all ${
                f.icona === e
                  ? "bg-indigo-400/25 border border-indigo-400/60"
                  : "bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
            >
              {e}
            </button>
          ))}
          <input
            value={f.icona}
            onChange={(e) => set("icona", e.target.value)}
            maxLength={4}
            className="aspect-square rounded-xl bg-white/5 border border-white/10 text-center text-base outline-none focus:border-indigo-400/60 min-w-0"
            title="Emoji personalizzata"
          />
        </div>
      </div>
      <div className="mt-4">
        <Label>Colore</Label>
        <div className="grid grid-cols-9 sm:grid-cols-17 gap-1.5 items-center">
          {COLOR_SET.map((c) => (
            <button
              key={c}
              onClick={() => set("colore", c)}
              className={`aspect-square rounded-full transition-transform ${
                f.colore === c
                  ? "scale-110 ring-2 ring-white/70"
                  : "hover:scale-110"
              }`}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            value={f.colore}
            onChange={(e) => set("colore", e.target.value)}
            className="aspect-square w-full rounded-lg bg-transparent border border-white/10 cursor-pointer p-0"
            title="Colore personalizzato"
          />
        </div>
      </div>
      <div className="mt-4">
        <Label>Sottocategorie</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {f.sottocategorie.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-slate-300"
            >
              {s}
              <button
                onClick={() =>
                  set(
                    "sottocategorie",
                    f.sottocategorie.filter((x) => x !== s)
                  )
                }
                className="text-slate-500 hover:text-rose-300 transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
          {f.sottocategorie.length === 0 && (
            <span className="text-xs text-slate-600">
              Nessuna: aggiungine quante vuoi.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="es. Bollette luce"
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
          />
          <BtnGhost onClick={addSub}>Aggiungi</BtnGhost>
        </div>
      </div>
      <div className="mt-4">
        <Label>Budget mensile (opzionale)</Label>
        <Input
          type="number"
          placeholder="es. 150"
          value={f.budget}
          onChange={(e) => set("budget", e.target.value)}
        />
      </div>
      <div className="modal-actions flex items-center gap-3 mt-6">
        {isEdit && (
          <button
            onClick={remove}
            className="text-xs text-rose-300/80 hover:text-rose-300 transition-colors"
          >
            Elimina categoria
          </button>
        )}
        <div className="flex-1" />
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={save}>
          {isEdit ? "Salva modifiche" : "Crea categoria"}
        </BtnPrimary>
      </div>
    </Modal>
  );
}