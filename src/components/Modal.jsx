import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function Modal({ open, onClose, title, children, wide }) {
  const titleId = useId();
  const [maxH, setMaxH] = useState(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const misura = () => {
      const vv = window.visualViewport;
      const h = Math.round(vv?.height || window.innerHeight || 600);
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-area-top")) || 0;
      const isMobile = window.innerWidth < 640;
      const top = Math.max(0, Math.round(vv?.offsetTop || 0)) + (isMobile ? safeTop : 0);
      const height = Math.max(0, h - (isMobile ? safeTop : 0));
      setViewport({ top, height });
      setMaxH(Math.max(120, height - (isMobile ? 8 : 24)));
    };
    misura();
    window.addEventListener("resize", misura);
    window.addEventListener("orientationchange", misura);
    window.visualViewport?.addEventListener("resize", misura);
    window.visualViewport?.addEventListener("scroll", misura);
    return () => {
      window.removeEventListener("resize", misura);
      window.removeEventListener("orientationchange", misura);
      window.visualViewport?.removeEventListener("resize", misura);
      window.visualViewport?.removeEventListener("scroll", misura);
    };
  }, [open]);

  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    const attivoPrima = document.activeElement;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    const focusabili = () => [...(panelRef.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') || [])].filter((el) => el.offsetParent !== null || el.getClientRects().length);
    const t = setTimeout(() => {
      const el = focusabili();
      const explicitFocus = panelRef.current?.querySelector("[autofocus]");
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      (explicitFocus || (!isMobile && el.find((x) => /^(INPUT|TEXTAREA)$/.test(x.tagName))) || panelRef.current)?.focus?.();
    }, 60);
    const onKey = (e) => {
      if (e.key === "Escape") { onCloseRef.current?.(); return; }
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
      Object.entries(previousStyles).forEach(([key, value]) => { body.style[key] = value; });
      window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", onKey);
      attivoPrima?.focus?.();
    };
  }, [open]);

  if (!open) return null;
 
  return createPortal(
    <>
      {/* velo sempre a tutto schermo, indipendente dallo scroll del contenuto */}
      <div className="fixed inset-0 z-100 bg-black/65 backdrop-blur-sm" style={{ animation: "fadeIn .2s both" }} onClick={onClose} />
      {/* wrapper scrollabile: se anche il contenuto fosse più alto, si scorre invece di tagliarsi.
          La chiusura scatta solo se si preme davvero sull'area vuota attorno al popup: usare
          onClick generico chiuderebbe il popup anche cliccando elementi interni che spariscono
          subito dopo (per esempio un suggerimento in un elenco a discesa). */}
      <div className="modal-viewport fixed inset-x-0 z-101 overflow-y-auto overscroll-contain"
        style={viewport.height ? { top: `${viewport.top}px`, height: `${viewport.height}px` } : undefined}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div className="min-h-full flex items-end sm:items-center justify-center p-0 sm:p-3"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            className={`modal-sheet relative glass-strong w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-t-3xl sm:rounded-2xl flex flex-col outline-none`}
            style={{ animation: "sheetIn .32s cubic-bezier(.22,1,.36,1) both", maxHeight: maxH ? `${maxH}px` : "88vh" }}>
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0"><span className="w-10 h-1 rounded-full bg-white/20" /></div>
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 shrink-0 border-b border-white/6">
              <h3 id={titleId} className="font-display text-base sm:text-lg text-white truncate">{title}</h3>
              <button onClick={onClose} aria-label="Chiudi" className="modal-close-button w-11 h-11 shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-all hover:rotate-90">✕</button>
            </div>
            <div className="modal-sheet-content px-5 sm:px-6 py-4 sm:py-5 overflow-y-auto overscroll-contain flex-1 min-h-0" style={{ WebkitOverflowScrolling: "touch" }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}