import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function Modal({ open, onClose, title, children, wide }) {
  /* Altezza calcolata in JS: non dipende né dalle classi generate a runtime
     né dal supporto a dvh, quindi il popup non può mai sforare lo schermo. */
  const [maxH, setMaxH] = useState(null);
  useEffect(() => {
    if (!open) return;
    const misura = () => {
      const vv = window.visualViewport;              // su iOS tiene conto delle barre
      const h = Math.round(vv?.height || window.innerHeight || 600);
      const margine = window.innerWidth < 640 ? 8 : 24;
      setMaxH(Math.max(220, h - margine));
    };
    misura();
    window.addEventListener("resize", misura);
    window.visualViewport?.addEventListener("resize", misura);
    return () => { window.removeEventListener("resize", misura); window.visualViewport?.removeEventListener("resize", misura); };
  }, [open]);

  /* blocca lo scroll di fondo, porta il focus dentro il dialogo e lo trattiene */
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const attivoPrima = document.activeElement;
    document.body.style.overflow = "hidden";
    const focusabili = () => [...(panelRef.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') || [])].filter((el) => el.offsetParent !== null || el.getClientRects().length);
    const t = setTimeout(() => {
      const el = focusabili();
      /* primo campo di testo se c'è, altrimenti il pannello: niente focus su "Elimina" */
      (el.find((x) => /^(INPUT|TEXTAREA)$/.test(x.tagName)) || panelRef.current)?.focus?.();
    }, 60);
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      const el = focusabili();
      if (!el.length) return;
      const primo = el[0], ultimo = el[el.length - 1];
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      attivoPrima?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
 
  return createPortal(
    <>
      {/* velo sempre a tutto schermo, indipendente dallo scroll del contenuto */}
      <div className="fixed inset-0 z-100 bg-black/65 backdrop-blur-sm" style={{ animation: "fadeIn .2s both" }} onClick={onClose} />
      {/* wrapper scrollabile: se anche il contenuto fosse più alto, si scorre invece di tagliarsi.
          La chiusura scatta solo se si preme davvero sull'area vuota attorno al popup: usare
          onClick generico chiuderebbe il popup anche cliccando elementi interni che spariscono
          subito dopo (per esempio un suggerimento in un elenco a discesa). */}
      <div className="fixed inset-0 z-101 overflow-y-auto overscroll-contain"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div className="min-h-full flex items-end sm:items-center justify-center p-0 sm:p-3"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
            className={`modal-sheet relative glass-strong w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-t-3xl sm:rounded-2xl flex flex-col outline-none`}
            style={{ animation: "sheetIn .32s cubic-bezier(.22,1,.36,1) both", maxHeight: maxH ? `${maxH}px` : "88vh" }}>
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0"><span className="w-10 h-1 rounded-full bg-white/20" /></div>
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 shrink-0 border-b border-white/6">
              <h3 className="font-display text-base sm:text-lg text-white truncate">{title}</h3>
              <button onClick={onClose} aria-label="Chiudi" className="w-9 h-9 shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-all hover:rotate-90">✕</button>
            </div>
            {/* min-h-0: senza, un figlio flex non si restringe sotto il proprio contenuto e trabocca */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 overflow-y-auto overscroll-contain flex-1 min-h-0" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}