import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_PATHS, countryFlag, countryLabel, countryRegion, geocodingService, geoToXY, haversine, MAP_H, MAP_W, photoService } from "../services/geo";
import { dayCount, daysTo, eur, fmtDate, todayISO, tripStatus, uid } from "../utils/helpers";
import { useTripStats } from "../hooks/useTrips";
import { BtnGhost, BtnPrimary } from "../components/Buttons";
import { Card } from "../components/Card";
import { COLOR_SET, HOME_BASE, MESI, metodiSpesa, TRIP_CATS, TRIP_ICONS, tripCat } from "../config/constants";
import { Chip, CountEur, EmptyState } from "../components/Typography";
import { createPortal } from "react-dom";
import { Bar, CartesianGrid, Cell, ComposedChart, Label, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip } from "../components/charts/ChartTip";
import Modal from "../components/Modal";
import { Input, Select } from "../components/Forms";
import { Spinner } from "../components/Spinner";

/** hook: copertina automatica della destinazione (con override manuale) */
function useAutoCover(citta, paese, lat, lon, autoAttivo, onFound) {
  const [state, setState] = useState("idle"); // idle | loading | ok | none
  const [soggetto, setSoggetto] = useState("");
  const lastKey = useRef("");
  useEffect(() => {
    const key = `${citta}|${paese}|${lat}`;
    if (!autoAttivo || !citta || key === lastKey.current) return;
    lastKey.current = key;
    let alive = true;
    setState("loading");
    photoService.lookup(citta, paese, lat, lon)
      .then((r) => { if (!alive) return; if (r?.img) { setState("ok"); setSoggetto(r.title || ""); onFound(r.img); } else setState("none"); })
      .catch(() => alive && setState("none"));
    return () => { alive = false; };
  }, [citta, paese, lat, lon, autoAttivo]); // eslint-disable-line
  return { state, soggetto };
};

/** hook: ricerca luoghi con debounce, annullamento e fallback offline */
function usePlaceSearch(query) {
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const q = (query || "").trim();
    
    // CASO 1: Stringa vuota o troppo corta
    if (q.length < 2) { 
      const timer = setTimeout(() => {
        setRes([]); 
        setLoading(false); 
        setOffline(false); 
      }, 0);
      return () => clearTimeout(timer); 
    }
    
    // CASO 2: Ricerca valida
    const localHits = geocodingService.local(q);
    
    // Aggiornamento asincrono dei risultati locali
    const immediateTimer = setTimeout(() => setRes(localHits), 0);
    
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const remote = await geocodingService.search(q, ctrl.signal);
        const seen = new Set(remote.map((r) => r.nome.toLowerCase()));
        setRes([...remote, ...localHits.filter((l) => !seen.has(l.nome.toLowerCase()))].slice(0, 8));
        setOffline(false);
      } catch (e) {
        if (e.name !== "AbortError") { 
          setOffline(true); 
          setRes(localHits); 
        }
      } finally { 
        setLoading(false); 
      }
    }, 450);
    
    // Pulizia dei timer e delle richieste di rete pendenti
    return () => { 
      clearTimeout(immediateTimer);
      clearTimeout(t); 
      ctrl.abort(); 
    };
  }, [query]);

  return { res, loading, offline };
}

const GLOBE_TEX = {
  day: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  topo: "https://unpkg.com/three-globe/example/img/earth-topology.png",
  sky: "https://unpkg.com/three-globe/example/img/night-sky.png",
};

/** carica globe.gl una sola volta e lo tiene in cache */
let globeLibPromise = null;
function loadGlobeLib() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Globe) return Promise.resolve(window.Globe);
  if (globeLibPromise) return globeLibPromise;
  globeLibPromise = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://unpkg.com/globe.gl@2.46.1/dist/globe.gl.min.js";
    sc.async = true;
    sc.onload = () => (window.Globe ? res(window.Globe) : rej(new Error("Globe non disponibile")));
    sc.onerror = () => rej(new Error("Impossibile caricare la libreria del globo"));
    document.head.appendChild(sc);
  });
  return globeLibPromise;
};

/** interpolazione sulla sfera: posizione dell'aereo lungo la rotta */
function slerpLatLng(a, b, t) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const [la1, lo1] = [a[0] * rad, a[1] * rad], [la2, lo2] = [b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return { lat: a[0], lng: a[1] };
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) * deg, lng: Math.atan2(y, x) * deg };
};

function Globe3D({ trips, wishlist = [], onSelectTrip, selectedTripId, height = 470, onFallback }) {
  const holder = useRef(null);
  const globeRef = useRef(null);
  const planeRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [hovered, setHovered] = useState(null);
  const [filtro, setFiltro] = useState([]);
  const [autoRot, setAutoRot] = useState(true);
  const cbRef = useRef({ onSelectTrip });
  useEffect(() => { cbRef.current.onSelectTrip = onSelectTrip; }, [onSelectTrip]);

  const visibili = useMemo(() => (filtro.length ? trips.filter((t) => filtro.includes(countryRegion(t.paese))) : trips).filter((t) => t.lat || t.lon), [trips, filtro]);

  /* cluster per prossimità geografica (gradi) */
  const marker = useMemo(() => {
    const out = [];
    [...visibili].sort((a, b) => (a.partenza || "").localeCompare(b.partenza || "")).forEach((t) => {
      const near = out.find((c) => Math.hypot(c.lat - t.lat, c.lng - t.lon) < 3.5);
      if (near) { near.trips.push(t); near.lat = (near.lat * (near.trips.length - 1) + t.lat) / near.trips.length; near.lng = (near.lng * (near.trips.length - 1) + t.lon) / near.trips.length; }
      else out.push({ id: t.id, lat: t.lat, lng: t.lon, trips: [t] });
    });
    return out.map((c) => ({ ...c, tipo: "viaggio", col: CONTINENT_COLORS[countryRegion(c.trips[0].paese)] || "#8B9DF9" }));
  }, [visibili]);

  const wishMarker = useMemo(() => wishlist.filter((w) => w.lat || w.lon).map((w) => ({ id: "w" + w.id, lat: w.lat, lng: w.lon, tipo: "wish", nome: w.nome, col: "#FCD34D" })), [wishlist]);
  const allMarkers = useMemo(() => [...marker, ...wishMarker], [marker, wishMarker]);

  /* rotte: solo tra viaggi realmente consecutivi nel tempo */
  const archi = useMemo(() => {
    const ord = [...visibili].sort((a, b) => (a.partenza || "").localeCompare(b.partenza || ""));
    const out = [];
    for (let i = 1; i < ord.length; i++) {
      const a = ord[i - 1], b = ord[i];
      if (haversine([a.lat, a.lon], [b.lat, b.lon]) < 60) continue; // stessa zona: nessuna rotta
      out.push({ startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon,
        col: [CONTINENT_COLORS[countryRegion(a.paese)] || "#8B9DF9", CONTINENT_COLORS[countryRegion(b.paese)] || "#5EEAD4"],
        from: [a.lat, a.lon], to: [b.lat, b.lon], label: `${a.citta || countryLabel(a.paese)} → ${b.citta || countryLabel(b.paese)}` });
    }
    return out;
  }, [visibili]);

  /* ---- inizializzazione del globo (una sola volta) ---- */
  useEffect(() => {
    let alive = true, globe = null, planeTimer = null;
    
    // FOTOGRAFIAMO IL RIFERIMENTO AL DOM ATTUALE
    const currentHolder = holder.current;

    loadGlobeLib().then((Globe) => {
      if (!alive || !currentHolder) return; // Usiamo currentHolder
      globe = Globe({ animateIn: true })(currentHolder)
        .globeImageUrl(GLOBE_TEX.day)
        .bumpImageUrl(GLOBE_TEX.topo)
        .backgroundImageUrl(GLOBE_TEX.sky)
        .backgroundColor("rgba(8,11,18,1)")
        .showAtmosphere(true).atmosphereColor("#7DD3FC").atmosphereAltitude(0.17)
        .arcAltitudeAutoScale(0.42).arcStroke(0.5).arcDashLength(0.45).arcDashGap(0.9).arcDashAnimateTime(2600)
        .arcColor("col").arcLabel("label").arcsTransitionDuration(700)
        .pointOfView({ lat: 30, lng: 10, altitude: 2.4 }, 0);
      
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.35;
      globe.controls().enableDamping = true;
      globe.controls().dampingFactor = 0.12;
      globe.controls().minDistance = 130;
      globe.controls().maxDistance = 560;
      globe.controls().addEventListener("start", () => { globe.controls().autoRotate = false; setAutoRot(false); });
      globeRef.current = globe;
      
      /* misura subito e poi di nuovo al frame successivo, quando il layout è assestato */
      const el0 = currentHolder;
      if (el0?.clientWidth) { globe.width(el0.clientWidth); globe.height(el0.clientHeight); }
      requestAnimationFrame(() => {
        const el1 = currentHolder;
        if (globeRef.current && el1?.clientWidth) { globeRef.current.width(el1.clientWidth); globeRef.current.height(el1.clientHeight); }
      });
      setStatus("ready");
    }).catch(() => { if (alive) { setStatus("error"); onFallback?.(); } });

    /* il globo deve seguire esattamente il riquadro che lo contiene, altrimenti
       la tela resta della dimensione iniziale e la Terra appare fuori centro */
    const adatta = () => {
      const g = globeRef.current, el = currentHolder;
      if (!g || !el || !el.clientWidth) return;
      g.width(el.clientWidth);
      g.height(el.clientHeight);
    };
    
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(adatta) : null;
    if (currentHolder && ro) ro.observe(currentHolder);
    window.addEventListener("resize", adatta);
    
    return () => {
      alive = false;
      ro?.disconnect();
      window.removeEventListener("resize", adatta);
      clearInterval(planeTimer);
      try { globeRef.current?._destructor?.(); } catch {
        //ignoriamo le exception
      }
      
      // USIAMO LA VARIABILE FOTOGRAFATA QUI
      if (currentHolder) currentHolder.innerHTML = ""; 
      globeRef.current = null;
    };
  }, []); // eslint-disable-line

  /* riallinea le dimensioni a ogni cambio di stato o altezza */
  useEffect(() => {
    const g = globeRef.current, el = holder.current;
    if (status === "ready" && g && el?.clientWidth) { g.width(el.clientWidth); g.height(el.clientHeight); }
  }, [status, height]);

  /* ---- marker HTML: glow, hover, click ---- */
  useEffect(() => {
    const g = globeRef.current;
    if (status !== "ready" || !g) return;
    g.htmlElementsData(allMarkers)
      .htmlLat("lat").htmlLng("lng").htmlAltitude(0.012)
      .htmlElement((d) => {
        const el = document.createElement("div");
        el.style.cssText = "position:relative;width:0;height:0;pointer-events:auto;cursor:pointer;";
        if (d.tipo === "plane") {
          el.style.pointerEvents = "none";
          el.innerHTML = `<div class="gm-plane">✈</div>`;
          return el;
        }
        const isSel = d.tipo === "viaggio" && d.trips.some((t) => t.id === selectedTripId);
        const many = d.tipo === "viaggio" && d.trips.length > 1;
        const label = d.tipo === "wish" ? "★" : many ? d.trips.length : d.trips[0].icona || "✈";
        el.innerHTML = `
          <div class="gm ${isSel ? "gm-sel" : ""}" style="--c:${d.col}">
            <span class="gm-halo"></span>
            <span class="gm-dot">${label}</span>
          </div>`;
        const inner = el.firstElementChild;
        inner.addEventListener("mouseenter", () => setHovered(d));
        inner.addEventListener("mouseleave", () => setHovered((h) => (h === d ? null : h)));
        inner.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (d.tipo === "wish") return;
          const t = d.trips[0];
          globeRef.current?.pointOfView({ lat: t.lat, lng: t.lon, altitude: many ? 1.1 : 0.75 }, 1200);
          globeRef.current.controls().autoRotate = false; setAutoRot(false);
          cbRef.current.onSelectTrip?.(t);
        });
        return el;
      });
  }, [allMarkers, status, selectedTripId]);

  /* ---- rotte + aereo che percorre la tratta più recente ---- */
  useEffect(() => {
    const g = globeRef.current;
    if (status !== "ready" || !g) return;
    g.arcsData(archi);
    const last = archi[archi.length - 1];
    if (!last) { g.htmlElementsData(allMarkers); return; }
    /* il ciclo dell'aereo riscrive i marker: senza una guardia, il ciclo della
       versione precedente continuerebbe a reinserire i dati vecchi e i viaggi
       eliminati ricomparirebbero sul globo */
    let vivo = true, raf = null, timer = null;
    const t0 = performance.now();
    const step = () => {
      if (!vivo || globeRef.current !== g) return;
      const p = ((performance.now() - t0) / 5200) % 1;
      const pos = slerpLatLng(last.from, last.to, p);
      planeRef.current = { ...pos, p };
      g.htmlElementsData([...allMarkers, { id: "plane", tipo: "plane", lat: pos.lat, lng: pos.lng, col: "#E2E8F0", rot: 0 }]);
      timer = setTimeout(() => { if (vivo) raf = requestAnimationFrame(step); }, 90); // ~11fps: fluido e leggero
    };
    step();
    return () => { vivo = false; if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
  }, [archi, status, allMarkers]);

  /* ---- vola verso il viaggio selezionato ---- */
  useEffect(() => {
    const g = globeRef.current;
    if (status !== "ready" || !g || !selectedTripId) return;
    const t = trips.find((x) => x.id === selectedTripId);
    if (t && (t.lat || t.lon)) g.pointOfView({ lat: t.lat, lng: t.lon, altitude: 0.9 }, 1400);
  }, [selectedTripId, status]); // eslint-disable-line

  const toggleRot = () => {
    const g = globeRef.current; if (!g) return;
    const next = !autoRot; g.controls().autoRotate = next; setAutoRot(next);
  };
  const resetView = () => { globeRef.current?.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 1200); };
  const toggleCont = (c) => setFiltro((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]));

  if (status === "error") return <WorldMap trips={trips} wishlist={wishlist} onSelectTrip={onSelectTrip} onSelectCountry={() => {}} selectedTripId={selectedTripId} height={height} />;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#080B12]" style={{ height }}>
      <div ref={holder} className="absolute inset-0" />

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-sky-400/30 border-t-sky-300" style={{ animation: "spin 1s linear infinite" }} />
            <p className="text-xs text-slate-500 mt-3">Carico il globo terrestre…</p>
          </div>
        </div>
      )}

      {/* legenda continenti */}
      {status === "ready" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-1.5 px-2 max-w-[92%] pointer-events-auto">
          {CONTINENTS.map((c) => {
            const on = !filtro.length || filtro.includes(c);
            return (
              <button key={c} onClick={() => toggleCont(c)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-all ${on ? "text-white border-white/15" : "text-slate-500 border-white/5 opacity-50"}`} style={{ background: on ? "rgba(8,12,20,.8)" : "rgba(8,12,20,.5)", backdropFilter: "blur(10px)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: CONTINENT_COLORS[c] }} />{c}
              </button>
            );
          })}
        </div>
      )}

      {/* preview al passaggio del mouse */}
      {hovered && hovered.tipo !== "plane" && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-64 rounded-xl border border-white/12 p-3 pointer-events-none" style={{ background: "rgba(10,14,22,.94)", backdropFilter: "blur(16px)", animation: "fadeUp .2s both" }}>
          {hovered.tipo === "wish" ? (
            <><p className="text-sm text-amber-200">★ {hovered.nome}</p><p className="text-[11px] text-slate-500">Nella tua wishlist</p></>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-lg">{hovered.trips[0].icona}</span>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{hovered.trips.length > 1 ? `${hovered.trips.length} viaggi` : hovered.trips[0].nome}</p>
                  <p className="text-[11px] text-slate-500 truncate">{countryFlag(hovered.trips[0].paese)} {hovered.trips[0].citta || countryLabel(hovered.trips[0].paese)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">{hovered.trips.map((t) => t.partenza?.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i).join(", ")} · clicca per esplorare</p>
            </>
          )}
        </div>
      )}

      {/* controlli */}
      {status === "ready" && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          <button onClick={toggleRot} title={autoRot ? "Ferma la rotazione" : "Riprendi la rotazione"} className="w-8 h-8 rounded-lg text-sm border border-white/10 hover:bg-white/15 transition-all" style={{ background: "rgba(8,12,20,.85)", backdropFilter: "blur(12px)", color: autoRot ? "#7DD3FC" : "#94A3B8" }}>{autoRot ? "⏸" : "▶"}</button>
          <button onClick={resetView} title="Vista mondo" className="w-8 h-8 rounded-lg text-sm text-slate-300 border border-white/10 hover:bg-white/15 hover:text-white transition-all" style={{ background: "rgba(8,12,20,.85)", backdropFilter: "blur(12px)" }}>⌖</button>
        </div>
      )}
      {status === "ready" && (
        <p className="absolute bottom-3 right-3 text-[10px] text-slate-600 pointer-events-none">{visibili.length} {visibili.length === 1 ? "meta" : "mete"} · trascina per ruotare</p>
      )}
    </div>
  );
};

const CONTINENT_COLORS = { Europa: "#38BDF8", Asia: "#FB7185", America: "#FBBF24", Africa: "#A78BFA", Oceania: "#F472B6", Antartide: "#94A3B8" };
const CONTINENTS = ["Europa", "Asia", "America", "Africa", "Oceania"];
/* tinte terra: ogni continente ha una sua sfumatura, così la mappa si legge a colpo d'occhio */
const CONTINENT_LAND = { Europa: "#1C2A3E", Asia: "#31212D", America: "#312A1E", Africa: "#28213A", Oceania: "#301D2F", Antartide: "#1C222E" };
const PIN_PATH = "M0 0c-4.6-6-6.7-8.6-6.7-11.5a6.7 6.7 0 1 1 13.4 0C6.7-8.6 4.6-6 0 0z";

function WorldMap({ trips, wishlist = [], onSelectTrip, onSelectCountry, selectedCountry, selectedTripId, height = 460, showWishlist = true, showLegend = true, showRoutes = true, compact = false }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoverCountry, setHoverCountry] = useState(null);
  const [hoverPin, setHoverPin] = useState(null);
  const [filtro, setFiltro] = useState([]); // continenti attivi ([] = tutti)
  const svgRef = useRef(null);
  const drag = useRef(null);
  const pinch = useRef(null);

  const visibili = useMemo(() => (filtro.length ? trips.filter((t) => filtro.includes(countryRegion(t.paese))) : trips), [trips, filtro]);

  const visited = useMemo(() => {
    const m = {};
    visibili.forEach((t) => { if (t.paese) m[t.paese] = (m[t.paese] || 0) + 1; });
    return m;
  }, [visibili]);

  const clusters = useMemo(() => {
    const soglia = 30 / view.k;
    const out = [];
    visibili.filter((t) => t.lat || t.lon).forEach((t) => {
      const p = geoToXY(t.lat, t.lon);
      const near = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < soglia);
      if (near) { near.trips.push(t); near.x = (near.x * (near.trips.length - 1) + p.x) / near.trips.length; near.y = (near.y * (near.trips.length - 1) + p.y) / near.trips.length; }
      else out.push({ x: p.x, y: p.y, trips: [t] });
    });
    return out;
  }, [visibili, view.k]);

  const wishPins = useMemo(() => (showWishlist ? wishlist.filter((w) => w.lat || w.lon).map((w) => ({ ...w, ...geoToXY(w.lat, w.lon) })) : []), [wishlist, showWishlist]);

  /* rotte da casa verso le mete più recenti */
  const routes = useMemo(() => {
    if (!showRoutes) return [];
    const ord = [...visibili].filter((t) => t.lat || t.lon).sort((a, b) => (a.partenza || "").localeCompare(b.partenza || ""));
    const out = [];
    for (let i = 1; i < ord.length; i++) {
      const a = ord[i - 1], b = ord[i];
      if (haversine([a.lat, a.lon], [b.lat, b.lon]) < 60) continue;
      const p1 = geoToXY(a.lat, a.lon), p2 = geoToXY(b.lat, b.lon);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.2;
      out.push({ d: `M${p1.x} ${p1.y} Q${mx} ${my} ${p2.x} ${p2.y}`, col: CONTINENT_COLORS[countryRegion(b.paese)] || "#8B9DF9" });
    }
    return out.slice(-8);
  }, [visibili, showRoutes]);

  const clampView = useCallback((v) => {
    const k = Math.max(1, Math.min(9, v.k));
    const maxX = (MAP_W * (k - 1)) / k, maxY = (MAP_H * (k - 1)) / k;
    return { k, x: Math.max(-maxX, Math.min(0, v.x)), y: Math.max(-maxY, Math.min(0, v.y)) };
  }, []);

  const onWheel = (e) => {
    e.preventDefault();
    const r = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * (MAP_W / view.k) - view.x;
    const my = ((e.clientY - r.top) / r.height) * (MAP_H / view.k) - view.y;
    setView((v) => {
      const k = Math.max(1, Math.min(9, v.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      return clampView({ k, x: -(mx - ((e.clientX - r.left) / r.width) * (MAP_W / k)), y: -(my - ((e.clientY - r.top) / r.height) * (MAP_H / k)) });
    });
  };
  const pt = (e) => { const t = e.touches ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; };
  const onDown = (e) => {
    if (e.touches && e.touches.length === 2) { pinch.current = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), k: view.k }; return; }
    const p = pt(e); drag.current = { sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e) => {
    if (pinch.current && e.touches?.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setView((v) => clampView({ ...v, k: pinch.current.k * (d / pinch.current.d) })); return;
    }
    if (!drag.current) return;
    const p = pt(e), r = svgRef.current.getBoundingClientRect();
    const dx = ((p.x - drag.current.sx) / r.width) * MAP_W / view.k;
    const dy = ((p.y - drag.current.sy) / r.height) * MAP_H / view.k;
    if (Math.abs(p.x - drag.current.sx) + Math.abs(p.y - drag.current.sy) > 4) drag.current.moved = true;
    setView((v) => clampView({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }));
  };
  const onUp = () => { drag.current = null; pinch.current = null; };
  const zoomTo = (lat, lon, k = 4) => { const p = geoToXY(lat, lon); setView(clampView({ k, x: MAP_W / (2 * k) - p.x, y: MAP_H / (2 * k) - p.y })); };
  const reset = () => setView({ x: 0, y: 0, k: 1 });
  const toggleCont = (c) => setFiltro((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]));

  const vb = `${-view.x} ${-view.y} ${MAP_W / view.k} ${MAP_H / view.k}`;
  const inv = 1 / view.k;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ height }}>
      <svg ref={svgRef} viewBox={vb} preserveAspectRatio="xMidYMid slice" className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
        <defs>
          <radialGradient id="ocean" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#12233D" /><stop offset="55%" stopColor="#0D1828" /><stop offset="100%" stopColor="#080D16" />
          </radialGradient>
          <filter id="pinGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.8" floodColor="#000" floodOpacity="0.6" />
          </filter>
          <filter id="landShade" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.8" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>
        <rect x="-200" y="-200" width={MAP_W + 400} height={MAP_H + 400} fill="url(#ocean)" />
        {/* paesi colorati per continente */}
        <g filter="url(#landShade)">
          {Object.entries(COUNTRY_PATHS).map(([nm, d]) => {
            const reg = countryRegion(nm);
            const base = CONTINENT_LAND[reg] || "#232A38";
            const isVisited = !!visited[nm];
            const isSel = selectedCountry === nm;
            const isHover = hoverCountry === nm;
            const accent = CONTINENT_COLORS[reg] || "#8B9DF9";
            return (
              <path key={nm} d={d}
                fill={isSel ? accent + "70" : isVisited ? accent + "3D" : isHover ? accent + "26" : base}
                stroke={isSel || isVisited ? accent + "99" : "rgba(148,163,184,0.14)"}
                strokeWidth={(isSel ? 0.9 : 0.35) * inv}
                style={{ transition: "fill .25s ease, stroke .25s ease", cursor: "pointer" }}
                onMouseEnter={() => setHoverCountry(nm)} onMouseLeave={() => setHoverCountry(null)}
                onClick={() => { if (!drag.current?.moved) onSelectCountry?.(nm); }} />
            );
          })}
        </g>

        {/* rotte */}
        {routes.map((r, i) => (
          <path key={i} d={r.d} fill="none" stroke={r.col} strokeWidth={0.9 * inv} strokeDasharray={`${2.5 * inv} ${3 * inv}`} opacity=".45">
            <animate attributeName="stroke-dashoffset" values={`${11 * inv};0`} dur="1.6s" repeatCount="indefinite" />
          </path>
        ))}

        {/* wishlist */}
        {wishPins.map((w) => (
          <g key={"w" + w.id} transform={`translate(${w.x} ${w.y}) scale(${inv})`} style={{ pointerEvents: "none" }}>
            <path d={PIN_PATH} fill="none" stroke="#FCD34D" strokeWidth="1.5" strokeDasharray="2.5 2" opacity=".9" />
          </g>
        ))}

        {/* pin viaggi: segnaposto a goccia colorati per continente */}
        {clusters.map((c, i) => {
          const many = c.trips.length > 1;
          const t0 = c.trips[0];
          const reg = countryRegion(t0.paese);
          const col = CONTINENT_COLORS[reg] || "#8B9DF9";
          const hovered = hoverPin === i;
          const active = !many && selectedTripId === t0.id;
          return (
            <g key={i} transform={`translate(${c.x} ${c.y}) scale(${inv})`} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverPin(i)} onMouseLeave={() => setHoverPin(null)}
              onClick={(e) => { e.stopPropagation(); if (drag.current?.moved) return; if (many) zoomTo(t0.lat, t0.lon, Math.min(9, view.k * 2.4)); else onSelectTrip?.(t0); }}>
              <ellipse cy="1.5" rx={hovered ? 5 : 3.5} ry="1.5" fill="#000" opacity=".35" style={{ transition: "rx .25s" }} />
              {(active || hovered) && <circle cy="-11" r="12" fill={col} opacity=".16"><animate attributeName="r" values="9;15;9" dur="2.6s" repeatCount="indefinite" /></circle>}
              <g filter="url(#pinGlow)" style={{ transition: "transform .28s cubic-bezier(.22,1,.36,1)", transform: hovered || active ? "translateY(-3px) scale(1.16)" : "none" }}>
                <path d={PIN_PATH} fill={col} stroke="rgba(255,255,255,.85)" strokeWidth=".7" />
                <circle cy="-11.5" r="4.4" fill="rgba(10,13,20,.9)" />
                <text y="-9.8" textAnchor="middle" fontSize={many ? "6" : "5.2"} fill={many ? col : "#fff"} fontWeight="700" style={{ userSelect: "none" }}>{many ? c.trips.length : t0.icona || "✈"}</text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* legenda / filtri continenti */}
      {showLegend && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-1.5 px-2 max-w-[92%]">
          {CONTINENTS.map((c) => {
            const on = !filtro.length || filtro.includes(c);
            return (
              <button key={c} onClick={() => toggleCont(c)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-all ${on ? "text-white border-white/15" : "text-slate-500 border-white/5 opacity-50"}`} style={{ background: on ? "rgba(14,17,26,.85)" : "rgba(14,17,26,.5)", backdropFilter: "blur(10px)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: CONTINENT_COLORS[c] }} />{c}
              </button>
            );
          })}
        </div>
      )}

      {hoverCountry && (
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl text-xs pointer-events-none border border-white/10" style={{ background: "rgba(14,17,26,.92)", backdropFilter: "blur(12px)", animation: "fadeIn .15s both" }}>
          <span className="mr-1.5">{countryFlag(hoverCountry)}</span>
          <span className="text-white">{countryLabel(hoverCountry)}</span>
          {visited[hoverCountry] && <span className="ml-2" style={{ color: CONTINENT_COLORS[countryRegion(hoverCountry)] }}>{visited[hoverCountry]} {visited[hoverCountry] === 1 ? "viaggio" : "viaggi"}</span>}
        </div>
      )}

      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        {[["+", () => setView((v) => clampView({ ...v, k: v.k * 1.4 }))], ["−", () => setView((v) => clampView({ ...v, k: v.k / 1.4 }))], ["⤢", reset]].map(([l, fn]) => (
          <button key={l} onClick={fn} className="w-8 h-8 rounded-lg text-sm text-slate-300 border border-white/10 hover:bg-white/15 hover:text-white transition-all" style={{ background: "rgba(14,17,26,.85)", backdropFilter: "blur(12px)" }}>{l}</button>
        ))}
      </div>
      {!compact && (
        <div className="absolute bottom-3 left-3 text-[10px] text-slate-500 pointer-events-none flex gap-3">
          <span>{visibili.length} {visibili.length === 1 ? "viaggio" : "viaggi"}</span>
          {wishPins.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-amber-300" />da visitare</span>}
        </div>
      )}
    </div>
  );
};

export function ViaggiPage({ data, update, notify, setConfirmDlg, catById }) {
  const [tab, setTab] = useState("mappa");
  const [openTrip, setOpenTrip] = useState(null);
  const [editTrip, setEditTrip] = useState(null);
  const [country, setCountry] = useState(null);
  const [sel, setSel] = useState(null);          // viaggio selezionato nel pannello
  const [wishEdit, setWishEdit] = useState(null);

  const trips = useMemo(() => data.trips || [], [data.trips]);
  const expenses = useMemo(() => data.tripExpenses || [], [data.tripExpenses]);
  const wishlist = useMemo(() => data.wishlist || [], [data.wishlist]);
  const st = useTripStats(trips, expenses);
  const sorted = useMemo(() => [...trips].sort((a, b) => (b.partenza || "").localeCompare(a.partenza || "")), [trips]);
  const prossimo = useMemo(() => [...trips].filter((t) => tripStatus(t) !== "passato").sort((a, b) => a.partenza.localeCompare(b.partenza))[0], [trips]);
  const annoCorr = String(new Date().getFullYear());
  const quest = useMemo(() => {
    const tAnno = trips.filter((t) => (t.partenza || "").startsWith(annoCorr));
    const spesa = expenses.filter((e) => e.data.startsWith(annoCorr)).reduce((s, e) => s + e.importo, 0);
    return { viaggi: tAnno.length, paesi: new Set(tAnno.map((t) => t.paese)).size, spesa };
  }, [trips, expenses, annoCorr]);

  /* il pannello mostra: viaggio scelto → altrimenti il prossimo → altrimenti l'ultimo */
  const panelTrip = useMemo(() => (sel && trips.find((t) => t.id === sel)) || prossimo || sorted[0] || null, [sel, trips, prossimo, sorted]);

  const saveTrip = (t) => {
    update((d) => {
      if (!d.trips) d.trips = [];
      const i = d.trips.findIndex((x) => x.id === t.id);
      if (i >= 0) d.trips[i] = t; else d.trips.push({ ...t, id: t.id || uid() });
      return d;
    });
    setEditTrip(null);
    notify(trips.some((x) => x.id === t.id) ? "Viaggio aggiornato" : `"${t.nome}" aggiunto`);
  };
  const removeTrip = (t) => setConfirmDlg({
    msg: `Eliminare il viaggio "${t.nome}" e le sue ${expenses.filter((e) => e.tripId === t.id).length} spese?`,
    onOk: () => { update((d) => { d.trips = d.trips.filter((x) => x.id !== t.id); d.tripExpenses = (d.tripExpenses || []).filter((e) => e.tripId !== t.id); return d; }); setOpenTrip(null); setSel(null); notify("Viaggio eliminato"); },
  });

  const countryInfo = country ? st.perPaese[country] : null;

  // Logica Modalità Viaggio
  const isTravelMode = data?.settings?.travelMode || false;
  
  const toggleTravelMode = () => {
    update((d) => { d.settings = d.settings || {}; d.settings.travelMode = !isTravelMode; return d; });
    notify(isTravelMode ? "Modalità viaggio disattivata" : "Modalità viaggio attivata");
  };

  // Controlliamo se c'è un viaggio in corso proprio oggi
  const oggi = new Date().toISOString().slice(0, 10);
  const isTripActive = trips.some((t) => t.partenza <= oggi && (!t.ritorno || t.ritorno >= oggi));

  // Prepariamo lo stile e il testo in base ai 3 scenari
  let travelBtnText = "Mod. Viaggio: OFF";
  let travelBtnStyle = "text-slate-400 hover:text-white border-transparent"; 

  if (isTravelMode) {
    if (isTripActive) {
      travelBtnText = "Mod. Viaggio: ON";
      travelBtnStyle = "!text-teal-300 !bg-teal-400/10 hover:!bg-teal-400/20";
    } else {
      travelBtnText = "Mod. Viaggio: In attesa";
      travelBtnStyle = "!text-amber-300 !bg-amber-400/10 hover:!bg-amber-400/20";
    }
  }

  return (
    <div className="w-full max-w-[2400px] mx-auto">
      <header className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-4" style={{ animation: "fadeUp .5s both" }}>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Viaggi</p>
          <h1 className="font-display text-2xl md:text-3xl text-white mt-1">Il tuo diario del mondo 🌍</h1>
          <p className="text-sm text-slate-500 mt-1">Esplora i posti che hai visitato e tieni traccia delle tue avventure.</p>
        </div>
        
        {/* Container Pulsanti: in colonna su mobile, in riga su PC */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          
          {/* PRIMA RIGA (Mobile) / DESTRA (PC): Azioni rapide divise a metà (flex-1) */}
          <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto">
            <BtnGhost 
              onClick={toggleTravelMode} 
              title={travelBtnText}
              className={`flex-1 sm:flex-none flex items-center justify-center transition-colors duration-300 whitespace-nowrap sm:w-38.75 px-1! sm:px-3! py-1.5! text-xs! truncate ${travelBtnStyle}`}
            >
              <span className="truncate">✈️ {travelBtnText}</span>
            </BtnGhost>
            
            <BtnPrimary 
              onClick={() => setEditTrip({})} 
              className="flex-1 sm:flex-none flex items-center justify-center px-1! sm:px-3! py-1.5! text-xs! truncate"
            >
              + Nuovo viaggio
            </BtnPrimary>
          </div>

          {/* SECONDA RIGA (Mobile) / SINISTRA (PC): Tab navigazione */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 order-2 sm:order-1 w-full sm:w-auto">
            {[{ v: "mappa", l: "Mappa" }, { v: "statistiche", l: "Statistiche" }, { v: "wishlist", l: "Wishlist" }].map((t) => (
              <button 
                key={t.v} 
                onClick={() => setTab(t.v)} 
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs text-center transition-all ${tab === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {t.l}
              </button>
            ))}
          </div>

        </div>
      </header>

      {tab === "mappa" && (
        <>
          {/* mappa + pannello laterale */}
          <div className="grid lg:grid-cols-[1fr_20rem] gap-4 mb-5" style={{ animation: "fadeUp .5s both", animationDelay: "40ms" }}>
            <Globe3D trips={trips} wishlist={wishlist} selectedTripId={sel} onSelectTrip={(t) => setSel(t.id)} height={typeof window !== "undefined" && window.innerWidth < 640 ? 340 : 470} />
            <TripPanel trip={panelTrip} spesa={panelTrip ? st.speseByTrip[panelTrip.id] || 0 : 0} expenses={expenses}
              onOpen={() => panelTrip && setOpenTrip(panelTrip)} onNew={() => setEditTrip({})} />
          </div>

          {country && (
            <Card className="p-4 mb-4" hover={false}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-display text-white text-lg">{countryFlag(country)} {countryLabel(country)}</p>
                  <p className="text-xs" style={{ color: CONTINENT_COLORS[countryRegion(country)] }}>{countryRegion(country)}</p>
                </div>
                <button onClick={() => setCountry(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Chiudi</button>
              </div>
              {countryInfo ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div><p className="text-[11px] text-slate-500">Viaggi</p><p className="text-white tabular-nums">{countryInfo.n}</p></div>
                  <div><p className="text-[11px] text-slate-500">Spesa totale</p><p className="text-white tabular-nums">{eur(countryInfo.spesa)}</p></div>
                  <div><p className="text-[11px] text-slate-500">Ultima visita</p><p className="text-white">{fmtDate(countryInfo.ultima)}</p></div>
                  <div><p className="text-[11px] text-slate-500">Città</p><p className="text-white truncate">{[...countryInfo.citta].join(", ") || "—"}</p></div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                  <p className="text-sm text-slate-400">Non ci sei ancora stato.</p>
                  <div className="flex gap-2">
                    <BtnGhost onClick={() => { setWishEdit({ paese: country }); setTab("wishlist"); }} className="py-1.5! text-xs!">+ Wishlist</BtnGhost>
                    <BtnPrimary onClick={() => setEditTrip({ paese: country })} className="py-1.5! text-xs!">Pianifica viaggio</BtnPrimary>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* statistiche con delta annuale */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            {[
              { l: "Spesa totale viaggi", v: eur(st.spesaTot), sub: `${eur(quest.spesa)} quest'anno`, icon: "💳", tone: "text-white" },
              { l: "Paesi visitati", v: st.paesi, sub: quest.paesi ? `+${quest.paesi} quest'anno` : "—", icon: "🌍", tone: "text-sky-300" },
              { l: "Viaggi totali", v: st.nViaggi, sub: quest.viaggi ? `+${quest.viaggi} quest'anno` : "—", icon: "🧳", tone: "text-violet-300" },
              { l: "Distanza percorsa", v: `${st.km.toLocaleString("it-IT")} km`, sub: `${st.giorni} giorni fuori`, icon: "✈️", tone: "text-teal-300" },
              { l: "Media a viaggio", v: eur(st.mediaViaggio), sub: `${eur(st.mediaGiorno)} al giorno`, icon: "📊", tone: "text-amber-300" },
            ].map((s, i) => (
              <Card key={s.l} className="p-4" delay={i * 45}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-400 leading-tight">{s.l}</p>
                  <span className="text-sm opacity-70">{s.icon}</span>
                </div>
                <p className={`font-display text-xl mt-1.5 tabular-nums ${s.tone}`}>{s.v}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{s.sub}</p>
              </Card>
            ))}
          </div>

          <h2 className="font-display text-white mb-3" style={{ animation: "fadeUp .4s both" }}>I tuoi viaggi</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sorted.map((t, i) => (
              <TripCard key={t.id} trip={t} spesa={st.speseByTrip[t.id] || 0} active={panelTrip?.id === t.id}
                onOpen={() => setOpenTrip(t)} onHighlight={() => setSel(t.id)} delay={i * 50} />
            ))}
            <button onClick={() => setEditTrip({})} className="rounded-2xl border border-dashed border-white/15 hover:border-indigo-400/50 hover:bg-white/3 transition-all grid place-items-center min-h-52 group" style={{ animation: "fadeUp .5s both", animationDelay: `${sorted.length * 50}ms` }}>
              <div className="text-center">
                <span className="text-3xl text-slate-600 group-hover:text-indigo-300 transition-colors">+</span>
                <p className="text-xs text-slate-500 mt-1 group-hover:text-slate-300 transition-colors">Nuovo viaggio</p>
              </div>
            </button>
          </div>
        </>
      )}

      {tab === "statistiche" && <TripStats st={st} trips={trips} expenses={expenses} />}
      {tab === "wishlist" && <Wishlist {...{ data, update, notify, setConfirmDlg, wishEdit, setWishEdit, onConvert: (w) => { setEditTrip({ nome: w.nome, paese: w.paese, citta: w.citta, lat: w.lat, lon: w.lon, budget: w.costo }); setTab("mappa"); } }} />}

      {openTrip && <TripDetail trip={trips.find((x) => x.id === openTrip.id) || openTrip} {...{ data, update, notify, setConfirmDlg, catById }} onClose={() => setOpenTrip(null)} onEdit={() => { setEditTrip(trips.find((x) => x.id === openTrip.id)); setOpenTrip(null); }} onDelete={() => removeTrip(openTrip)} />}
      <TripModal open={!!editTrip} trip={editTrip} onClose={() => setEditTrip(null)} onSave={saveTrip} />
    </div>
  );
};

/* pannello laterale: dettaglio rapido del viaggio selezionato sulla mappa */
function TripPanel({ trip, spesa, expenses, onOpen, onNew }) {
  const byCat = useMemo(() => {
    if (!trip) return [];
    const m = {};
    expenses.filter((e) => e.tripId === trip.id).forEach((e) => (m[e.categoria] = (m[e.categoria] || 0) + e.importo));
    return Object.entries(m).map(([k, v]) => ({ ...tripCat(k), value: Math.round(v) })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [trip, expenses]);

  if (!trip) return (
    <Card className="p-5 flex flex-col items-center justify-center text-center" hover={false}>
      <span className="text-3xl mb-2">🗺️</span>
      <p className="text-sm text-white">Nessun viaggio ancora</p>
      <p className="text-xs text-slate-500 mt-1 mb-4">Aggiungi il primo e comincia a riempire la mappa.</p>
      <BtnPrimary onClick={onNew}>+ Nuovo viaggio</BtnPrimary>
    </Card>
  );

  const gg = dayCount(trip.partenza, trip.ritorno);
  const status = tripStatus(trip);
  const pct = trip.budget > 0 ? (spesa / trip.budget) * 100 : 0;
  const tot = byCat.reduce((s, c) => s + c.value, 0) || 1;

  return (
    <Card className="overflow-hidden flex flex-col" hover={false} key={trip.id}>
      <div className="h-32 relative shrink-0" style={{ background: `linear-gradient(135deg, ${trip.colore}55, #0F1420)` }}>
        {trip.cover && <img src={trip.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" onError={(e) => (e.currentTarget.style.display = "none")} />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,transparent 40%,rgba(12,15,23,.95))" }} />
        <span className="absolute top-2.5 left-3 text-xl drop-shadow">{trip.icona}</span>
        {status !== "passato" && (
          <span className={`absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full border ${status === "corso" ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/15" : "text-teal-300 border-teal-400/30 bg-teal-400/15"}`}>
            {status === "corso" ? "in corso" : "in programma"}
          </span>
        )}
      </div>
      <div className="p-4 flex-1">
        <p className="text-white font-display flex items-center gap-1.5"><span style={{ color: CONTINENT_COLORS[countryRegion(trip.paese)] }}>◈</span>{trip.citta || trip.nome}</p>
        <p className="text-[11px] text-slate-500">{countryFlag(trip.paese)} {countryLabel(trip.paese)} · {fmtDate(trip.partenza)} → {fmtDate(trip.ritorno)}</p>
        {status === "futuro" && <p className="text-xs text-teal-300 mt-1">tra {daysTo(trip.partenza)} giorni</p>}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-white/4 border border-white/6 p-2.5">
            <p className="text-[10px] text-slate-500">Spesa totale</p>
            <CountEur value={spesa} cls={`font-display text-base tabular-nums ${pct > 100 ? "text-rose-300" : "text-white"}`} />
          </div>
          <div className="rounded-xl bg-white/4 border border-white/6 p-2.5">
            <p className="text-[10px] text-slate-500">Giorni</p>
            <p className="font-display text-base text-white tabular-nums">{gg}</p>
          </div>
        </div>

        {trip.budget > 0 && (
          <div className="mt-2.5">
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "#FB7185" : pct > 80 ? "#FBBF24" : trip.colore }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{Math.round(pct)}% del budget di {eur(trip.budget)}</p>
          </div>
        )}

        {byCat.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Categorie di spesa</p>
            <div className="space-y-1">
              {byCat.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.colore }} />
                  <span className="text-slate-300 truncate flex-1">{c.nome}</span>
                  <span className="text-slate-400 tabular-nums">{eur(c.value)}</span>
                  <span className="text-slate-600 w-9 text-right">{Math.round((c.value / tot) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {trip.descrizione && <p className="text-[11px] text-slate-400 mt-3 line-clamp-3 leading-relaxed">{trip.descrizione}</p>}

        <button onClick={onOpen} className="w-full mt-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-1.5">
          Vedi dettagli viaggio <span className="text-slate-500">›</span>
        </button>
      </div>
    </Card>
  );
};

const TripCard = memo(function TripCard({ trip, spesa, onOpen, onHighlight, active, delay }) {
  const status = tripStatus(trip);
  const gg = dayCount(trip.partenza, trip.ritorno);
  const over = trip.budget > 0 && spesa > trip.budget;
  const badge = { passato: { l: "Completato", c: "text-slate-300 border-white/15 bg-white/10" }, corso: { l: "In corso", c: "text-emerald-300 border-emerald-400/30 bg-emerald-400/15" }, futuro: { l: "In programma", c: "text-teal-300 border-teal-400/30 bg-teal-400/15" } }[status];
  const accent = CONTINENT_COLORS[countryRegion(trip.paese)] || trip.colore;
  return (
    <div className={`glass rounded-2xl overflow-hidden card-hover cursor-pointer group ${active ? "ring-1 ring-indigo-400/50" : ""}`} style={{ animation: "fadeUp .55s cubic-bezier(.22,1,.36,1) both", animationDelay: `${delay}ms` }}
      onMouseEnter={onHighlight} onClick={onOpen}>
      <div className="h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${trip.colore}55, #0F1420)` }}>
        {trip.cover && <img src={trip.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500" onError={(e) => (e.currentTarget.style.display = "none")} />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,12,18,.25) 0%, transparent 45%, rgba(12,15,23,.9))" }} />
        <span className="absolute top-2.5 left-3 text-xl drop-shadow-lg">{trip.icona}</span>
        <span className={`absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full border ${badge.c}`}>{badge.l}</span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
          <p className="text-white text-sm truncate">{trip.citta ? `${trip.citta}, ${countryLabel(trip.paese)}` : trip.nome}</p>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{fmtDate(trip.partenza)} · {gg} {gg === 1 ? "giorno" : "giorni"}{trip.persone > 1 ? ` · ${trip.persone} persone` : ""}</p>
        <div className="flex items-end justify-between gap-2 mt-2">
          <div className="min-w-0 flex-1">
            {trip.budget > 0 && (
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (spesa / trip.budget) * 100)}%`, background: over ? "#FB7185" : accent }} />
              </div>
            )}
          </div>
          <span className={`text-sm tabular-nums font-medium shrink-0 ${over ? "text-rose-300" : "text-white"}`}>{eur(spesa)}</span>
        </div>
      </div>
    </div>
  );
});

/* ---- Mini mappa del dettaglio viaggio: minimal, zoomata sulla destinazione ---- */
function MiniMap({ lat, lon, paese, colore = "#8B9DF9", height = 170 }) {
  const [vbAnim, setVbAnim] = useState(null);
  /* bounding box del paese di destinazione, per inquadrarlo */
  const box = useMemo(() => {
    const d = COUNTRY_PATHS[paese];
    const p = lat != null ? geoToXY(lat, lon) : null;
    if (!d) return p ? { x: p.x - 60, y: p.y - 32, w: 120, h: 64 } : { x: 0, y: 0, w: MAP_W, h: MAP_H };
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
    }
    /* include sempre il marker e mantiene proporzioni gradevoli */
    if (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const pad = Math.max((x1 - x0) * 0.35, (y1 - y0) * 0.35, 8);
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    let w = x1 - x0, h = y1 - y0;
    const ratio = 16 / 9;
    if (w / h < ratio) { const nw = h * ratio; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / ratio; y0 -= (nh - h) / 2; h = nh; }
    return { x: x0, y: y0, w, h };
  }, [paese, lat, lon]);

  /* zoom cinematico: dalla vista larga alla destinazione */
  useEffect(() => {
    const wide = { x: box.x + box.w / 2 - box.w * 2.6, y: box.y + box.h / 2 - box.h * 2.6, w: box.w * 5.2, h: box.h * 5.2 };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    
    // CASO 1: Animazioni disattivate. Differiamo l'aggiornamento asincrono
    if (reduce) { 
      const timer = setTimeout(() => setVbAnim(box), 0);
      return () => clearTimeout(timer); 
    }
    
    // CASO 2: Animazione cinematica zoom
    const t0 = performance.now(), dur = 1100;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVbAnim({ 
        x: wide.x + (box.x - wide.x) * e, 
        y: wide.y + (box.y - wide.y) * e, 
        w: wide.w + (box.w - wide.w) * e, 
        h: wide.h + (box.h - wide.h) * e 
      });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    
    raf = requestAnimationFrame(tick);
    
    return () => cancelAnimationFrame(raf);
  }, [box]);

  const vb = vbAnim || box;
  const pin = lat != null ? geoToXY(lat, lon) : null;
  const scale = vb.w / MAP_W;              // spessore dei bordi proporzionale allo zoom
  const pinScale = Math.max(0.35, vb.h / 105); // marker di dimensione costante a schermo

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10" style={{ height, background: "#0B111C" }}>
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="mmSea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#101A2B" /><stop offset="100%" stopColor="#0A101A" />
          </linearGradient>
        </defs>
        <rect x={vb.x - 500} y={vb.y - 500} width={vb.w + 1000} height={vb.h + 1000} fill="url(#mmSea)" />
        {/* terre emerse in tinta unica: nessun colore casuale, solo contrasto terra/mare */}
        {Object.entries(COUNTRY_PATHS).map(([nm, d]) => (
          <path key={nm} d={d}
            fill={nm === paese ? colore + "3A" : "rgba(148,163,184,0.10)"}
            stroke={nm === paese ? colore + "AA" : "rgba(148,163,184,0.18)"}
            strokeWidth={(nm === paese ? 1.1 : 0.4) * scale}
            style={{ transition: "fill .5s ease" }} />
        ))}
        {pin && (
          <g transform={`translate(${pin.x} ${pin.y}) scale(${pinScale})`}>
            <circle r="16" fill={colore} opacity=".18"><animate attributeName="r" values="10;22;10" dur="2.8s" repeatCount="indefinite" /><animate attributeName="opacity" values=".3;0;.3" dur="2.8s" repeatCount="indefinite" /></circle>
            <path d={PIN_PATH} fill={colore} stroke="rgba(255,255,255,.9)" strokeWidth=".8" />
            <circle cy="-11.5" r="4.2" fill="rgba(10,13,20,.92)" />
          </g>
        )}
      </svg>
      <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] pointer-events-none" style={{ background: "rgba(10,14,22,.85)", backdropFilter: "blur(10px)" }}>
        <span>{countryFlag(paese)}</span><span className="text-slate-200">{countryLabel(paese)}</span>
      </div>
    </div>
  );
};

/* ---- Dettaglio viaggio: hero, budget, spese, timeline, galleria ---- */
function TripDetail({ trip, data, update, notify, setConfirmDlg, onClose, onEdit, onDelete }) {
  const [tab, setTab] = useState("panoramica");
  const [expModal, setExpModal] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const expenses = useMemo(() => (data.tripExpenses || []).filter((e) => e.tripId === trip.id).sort((a, b) => b.data.localeCompare(a.data)), [data.tripExpenses, trip.id]);
  const totale = expenses.reduce((s, e) => s + e.importo, 0);
  const gg = dayCount(trip.partenza, trip.ritorno);
  const pct = trip.budget > 0 ? (totale / trip.budget) * 100 : 0;
  const status = tripStatus(trip);

  const byCat = useMemo(() => {
    const m = {};
    expenses.forEach((e) => (m[e.categoria] = (m[e.categoria] || 0) + e.importo));
    return Object.entries(m).map(([k, v]) => ({ name: tripCat(k).nome, value: Math.round(v), fill: tripCat(k).colore, icona: tripCat(k).icona })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  /* timeline: giorni del viaggio con le spese di quel giorno */
  const timeline = useMemo(() => {
    if (!trip.partenza || !gg) return [];
    return Array.from({ length: Math.min(gg, 60) }, (_, i) => {
      const d = new Date(trip.partenza + "T12:00"); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const day = expenses.filter((e) => e.data === iso);
      return { n: i + 1, iso, label: d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" }), spese: day, tot: day.reduce((s, e) => s + e.importo, 0) };
    });
  }, [trip, gg, expenses]);

  /* salva spesa + eventuale registrazione nel bilancio principale */
  const saveExp = (e) => {
    const isNew = !e.id || !expenses.some((x) => x.id === e.id);
    const id = e.id || uid();
    update((d) => {
      if (!d.tripExpenses) d.tripExpenses = [];
      const i = d.tripExpenses.findIndex((x) => x.id === id);
      const rec = { ...e, id, tripId: trip.id };
      if (i >= 0) d.tripExpenses[i] = rec; else d.tripExpenses.push(rec);
      /* sincronizzazione col modulo Finanza: crea/aggiorna la transazione collegata */
      if (trip.syncFinanza) {
        const catId = d.categories.find((c) => c.nome.toLowerCase() === "viaggi")?.id
          || (() => { const nid = uid(); d.categories.push({ id: nid, nome: "Viaggi", gruppo: "Wants", icona: "✈️", colore: "#FDBA74", sottocategorie: [], ordine: Math.max(-1, ...d.categories.map((c) => c.ordine)) + 1 }); return nid; })();
        const linked = d.transactions.find((t) => t.tripExpenseId === id);
        const tx = { id: linked?.id || uid(), tipo: "spesa", importo: rec.importo, data: rec.data, categoria: catId, sottocategoria: tripCat(rec.categoria).nome, conto: rec.conto || d.accounts[0]?.id, metodo: rec.metodo, note: `${trip.nome}: ${rec.descrizione || tripCat(rec.categoria).nome}`, tags: ["viaggio"], tripExpenseId: id, tripId: trip.id };
        if (linked) { const li = d.transactions.findIndex((t) => t.id === linked.id); d.transactions[li] = tx; }
        else d.transactions.unshift(tx);
        d.transactions.sort((a, b) => b.data.localeCompare(a.data));
      }
      return d;
    });
    setExpModal(null);
    notify(isNew ? "Spesa aggiunta" + (trip.syncFinanza ? " e registrata nel bilancio" : "") : "Spesa aggiornata");
  };

  const delExp = (id) => setConfirmDlg({
    msg: "Eliminare questa spesa del viaggio?" + (trip.syncFinanza ? " Verrà rimossa anche dal bilancio principale." : ""),
    onOk: () => { update((d) => { d.tripExpenses = d.tripExpenses.filter((x) => x.id !== id); d.transactions = d.transactions.filter((t) => t.tripExpenseId !== id); return d; }); notify("Spesa eliminata"); },
  });

  const toggleSync = () => {
    update((d) => { const t = d.trips.find((x) => x.id === trip.id); if (t) t.syncFinanza = !t.syncFinanza; return d; });
    notify(trip.syncFinanza ? "Spese scollegate dal bilancio" : "Le nuove spese verranno registrate nel bilancio");
  };

  return createPortal(
    <div className="fixed inset-0 z-75 overflow-y-auto" style={{ animation: "fadeIn .2s both" }}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-w-3xl mx-auto sm:my-8 rounded-none sm:rounded-3xl overflow-hidden border-0 sm:border border-white/10 min-h-full sm:min-h-0" style={{ background: "rgba(12,15,23,.98)", animation: "popIn .32s cubic-bezier(.22,1,.36,1) both", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* hero */}
        <div className="h-40 sm:h-52 md:h-56 relative" style={{ background: `linear-gradient(135deg, ${trip.colore}55, #0F1420)` }}>
          {trip.cover && <img src={trip.cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-75" onError={(e) => (e.currentTarget.style.display = "none")} />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,12,18,.4) 0%, transparent 35%, rgba(12,15,23,.97))" }} />
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center text-white/90 border border-white/15 hover:bg-white/15 transition-all" style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(8px)" }}>✕</button>
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{trip.icona}</span>
              {status === "corso" && <Chip tone="up">In corso</Chip>}
              {status === "futuro" && <Chip tone="up">Tra {daysTo(trip.partenza)} giorni</Chip>}
            </div>
            <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-white truncate">{trip.nome}</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{countryFlag(trip.paese)} {trip.citta ? trip.citta + " · " : ""}{countryLabel(trip.paese)} · {fmtDate(trip.partenza)} → {fmtDate(trip.ritorno)}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {/* budget */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <Card className="p-3.5" hover={false}><p className="text-[11px] text-slate-500">Speso</p><CountEur value={totale} cls={`font-display text-lg tabular-nums ${pct > 100 ? "text-rose-300" : "text-white"}`} /></Card>
            <Card className="p-3.5" hover={false}><p className="text-[11px] text-slate-500">Budget</p><p className="font-display text-lg text-slate-300 tabular-nums">{trip.budget > 0 ? eur(trip.budget) : "—"}</p></Card>
            <Card className="p-3.5" hover={false}><p className="text-[11px] text-slate-500">{gg} giorni · media</p><p className="font-display text-lg text-indigo-300 tabular-nums">{eur(gg ? totale / gg : 0)}</p></Card>
          </div>
          {trip.budget > 0 && (
            <div className="mb-4">
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "linear-gradient(90deg,#FB7185,#F43F5E)" : pct > 80 ? "linear-gradient(90deg,#FBBF24,#F59E0B)" : `linear-gradient(90deg,${trip.colore},#A5B4FC)` }} />
              </div>
              <p className={`text-[11px] mt-1 ${pct > 100 ? "text-rose-300" : "text-slate-500"}`}>{pct > 100 ? `Budget superato di ${eur(totale - trip.budget)}` : `${Math.round(pct)}% usato · restano ${eur(trip.budget - totale)}`}</p>
            </div>
          )}

          {/* tab */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4 overflow-x-auto">
            {[{ v: "panoramica", l: "Panoramica" }, { v: "spese", l: `Spese (${expenses.length})` }, { v: "timeline", l: "Timeline" }, { v: "album", l: `Album (${(trip.foto || []).length})` }].map((t) => (
              <button key={t.v} onClick={() => setTab(t.v)} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${tab === t.v ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{t.l}</button>
            ))}
          </div>

          {tab === "panoramica" && (
            <div className="space-y-4" style={{ animation: "fadeUp .3s both" }}>
              {trip.descrizione && <p className="text-sm text-slate-300 leading-relaxed">{trip.descrizione}</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="p-4" hover={false}>
                  <p className="text-xs text-slate-400 mb-2">Spese per categoria</p>
                  {byCat.length ? (
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={byCat} dataKey="value" innerRadius="52%" outerRadius="88%" paddingAngle={3} animationDuration={900}>{byCat.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}</Pie><Tooltip content={<ChartTip />} /></PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1 text-xs max-h-24 overflow-y-auto min-w-0">
                        {byCat.slice(0, 6).map((c) => (
                          <div key={c.name} className="flex justify-between gap-2"><span className="text-slate-300 truncate">{c.icona} {c.name}</span><span className="text-slate-400 tabular-nums">{eur(c.value)}</span></div>
                        ))}
                      </div>
                    </div>
                  ) : <EmptyState text="Nessuna spesa registrata." />}
                </Card>
                <Card className="p-4" hover={false}>
                  <p className="text-xs text-slate-400 mb-2">Dove</p>
                  <MiniMap lat={trip.lat} lon={trip.lon} paese={trip.paese} colore={trip.colore} height={170} />
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div><p className="text-slate-500">Persone</p><p className="text-white">{trip.persone || 1}</p></div>
                    <div><p className="text-slate-500">Distanza (a/r)</p><p className="text-white">{trip.lat || trip.lon ? `${(haversine(HOME_BASE, [trip.lat, trip.lon]) * 2).toLocaleString("it-IT")} km` : "—"}</p></div>
                  </div>
                </Card>
              </div>
              {trip.note && <Card className="p-4" hover={false}><p className="text-xs text-slate-400 mb-1">Note</p><p className="text-sm text-slate-300 whitespace-pre-wrap">{trip.note}</p></Card>}
              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-white/4 border border-white/6 cursor-pointer" onClick={toggleSync}>
                <span className={`w-10 h-5.5 rounded-full transition-all relative shrink-0 ${trip.syncFinanza ? "bg-linear-to-r from-indigo-400 to-violet-400" : "bg-white/10"}`} style={{ height: 22 }}>
                  <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${trip.syncFinanza ? "left-5.5" : "left-0.5"}`} />
                </span>
                <span className="text-sm text-slate-300">Registra le spese anche nel bilancio principale</span>
              </label>
            </div>
          )}

          {tab === "spese" && (
            <div style={{ animation: "fadeUp .3s both" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-slate-500">{expenses.length} spese · {eur(totale)}</p>
                <BtnPrimary onClick={() => setExpModal({})} className="py-1.5! text-xs!">+ Spesa</BtnPrimary>
              </div>
              <div className="divide-y divide-white/5">
                {expenses.map((e, i) => {
                  const c = tripCat(e.categoria);
                  return (
                    <div key={e.id} className="group flex items-center gap-3 py-2.5" style={{ animation: "fadeUp .35s both", animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                      <span className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0" style={{ background: c.colore + "1f", border: `1px solid ${c.colore}33` }}>{c.icona}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{e.descrizione || c.nome}</p>
                        <p className="text-xs text-slate-500 truncate">{c.nome} · {fmtDate(e.data)}{e.metodo ? ` · ${e.metodo}` : ""}</p>
                      </div>
                      <span className="text-sm text-slate-200 tabular-nums">{eur(e.importo)}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setExpModal(e)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition-all">✎</button>
                        <button onClick={() => delExp(e.id)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 text-xs hover:text-rose-300 transition-all">🗑</button>
                      </div>
                    </div>
                  );
                })}
                {expenses.length === 0 && <EmptyState text="Nessuna spesa. Aggiungi voli, hotel, ristoranti…" />}
              </div>
            </div>
          )}

          {tab === "timeline" && (
            <div className="space-y-3" style={{ animation: "fadeUp .3s both" }}>
              {timeline.map((d, i) => (
                <div key={d.iso} className="flex gap-3" style={{ animation: "fadeUp .35s both", animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <div className="flex flex-col items-center shrink-0">
                    <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-semibold" style={{ background: trip.colore + "22", border: `1px solid ${trip.colore}55`, color: trip.colore }}>{d.n}</span>
                    {i < timeline.length - 1 && <span className="w-px flex-1 bg-white/10 my-1" />}
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="text-sm text-white capitalize">{d.label}</p>
                      {d.tot > 0 && <span className="text-xs text-slate-400 tabular-nums">{eur(d.tot)}</span>}
                    </div>
                    {d.spese.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {d.spese.map((e) => { const c = tripCat(e.categoria); return (
                          <span key={e.id} className="text-[11px] px-2 py-1 rounded-lg border" style={{ background: c.colore + "14", borderColor: c.colore + "33", color: "#e2e8f0" }}>{c.icona} {e.descrizione || c.nome} · {eur(e.importo)}</span>
                        ); })}
                      </div>
                    ) : <p className="text-[11px] text-slate-600 mt-0.5">Nessuna spesa registrata</p>}
                  </div>
                </div>
              ))}
              {!timeline.length && <EmptyState text="Imposta le date del viaggio per vedere la timeline." />}
            </div>
          )}

          {tab === "album" && (
            <div style={{ animation: "fadeUp .3s both" }}>
              {(trip.foto || []).length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {trip.foto.map((f, i) => (
                    <button key={i} onClick={() => setLightbox(i)} className="aspect-square rounded-xl overflow-hidden border border-white/10 group">
                      <img src={f} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => (e.currentTarget.parentElement.style.display = "none")} />
                    </button>
                  ))}
                </div>
              ) : <EmptyState text="Album vuoto. Aggiungi i link delle foto modificando il viaggio." />}
            </div>
          )}

          <div className="modal-actions flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-white/6">
            <BtnGhost onClick={onEdit}>Modifica</BtnGhost>
            <button onClick={onDelete} className="text-xs text-rose-300/70 hover:text-rose-300 px-2 transition-colors">Elimina</button>
            <div className="flex-1" />
            <BtnPrimary onClick={() => { setTab("spese"); setExpModal({}); }}>+ Spesa</BtnPrimary>
          </div>
        </div>
      </div>

      <TripExpenseModal open={!!expModal} exp={expModal} trip={trip} accounts={data.accounts} onClose={() => setExpModal(null)} onSave={saveExp} />
      {lightbox != null && (
        <div className="fixed inset-0 z-115 bg-black/95 flex items-center justify-center" style={{ animation: "fadeIn .2s both" }} onClick={() => setLightbox(null)}>
          <img src={trip.foto[lightbox]} alt="" className="max-w-[92vw] max-h-[86vh] object-contain rounded-xl" style={{ animation: "popIn .3s cubic-bezier(.22,1,.36,1) both" }} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => (l - 1 + trip.foto.length) % trip.foto.length); }} className="absolute left-4 w-11 h-11 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 transition-all">‹</button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => (l + 1) % trip.foto.length); }} className="absolute right-4 w-11 h-11 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 transition-all">›</button>
          <span className="absolute bottom-6 text-xs text-slate-400">{lightbox + 1} / {trip.foto.length}</span>
        </div>
      )}
    </div>,
    document.body
  );
};

export function TripExpenseModal({ open, exp, trip, accounts, onClose, onSave, onDelete }) {
  const [f, setF] = useState(null);

  useEffect(() => { 
    if (open) {
      const timer = setTimeout(() => {
        setF({ 
          id: exp?.id, 
          data: exp?.data || (tripStatus(trip) === "futuro" ? trip.partenza : todayISO()), // Assicurati di aver importato todayISO()
          categoria: exp?.categoria || "ristoranti", 
          importo: exp?.importo ?? "", 
          descrizione: exp?.descrizione || "", 
          metodo: exp?.metodo || metodiSpesa[0],
          conto: exp?.conto || accounts[0]?.id || "", 
          note: exp?.note || "", 
          ricevuta: exp?.ricevuta || "" 
        }); 
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [open, exp, trip, accounts]);

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  let metodiAttuali = [...metodiSpesa];
  if (f.metodo && !metodiAttuali.includes(f.metodo)) {
    metodiAttuali.push(f.metodo);
  }

  return (
    <Modal open={open} onClose={onClose} title={exp?.id ? "Modifica spesa" : "Nuova spesa di viaggio"}>
      <div className="space-y-3">
        
        {/* DESCRIZIONE (In cima, come nel TxModal) */}
        <div>
          <Label>Descrizione</Label>
          <Input placeholder="es. Cena al ristorante sul porto" value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} autoFocus />
        </div>

        {/* IMPORTO E DATA AFFIANCATI */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0">
            <Label>Importo</Label>
            <Input 
              type="number" 
              inputMode="decimal" 
              step="0.01" 
              placeholder="0,00" 
              value={f.importo} 
              onChange={(e) => set("importo", e.target.value)} 
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Label>Data</Label>
            <Input 
              type="date" 
              value={f.data} 
              min={trip.partenza} 
              max={trip.ritorno} 
              onChange={(e) => set("data", e.target.value)} 
              style={{ width: "100%", minWidth: 0, paddingLeft: "8px", paddingRight: "8px" }}
            />
          </div>
        </div>

        {/* CONTO E METODO AFFIANCATI */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label>Conto</Label>
            <Select value={f.conto} onChange={(e) => set("conto", e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.icona} {a.nome}</option>)}
            </Select>
          </div>
          <div className="min-w-0">
            <Label>Metodo</Label>
            <Select value={f.metodo} onChange={(e) => set("metodo", e.target.value)}>
              {metodiAttuali.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </div>
        </div>

        {/* CATEGORIA */}
        <div>
          <Label>Categoria</Label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-0.5">
            {TRIP_CATS.map((c) => (
              <button key={c.id} onClick={() => set("categoria", c.id)} className={`px-2.5 py-1 rounded-full text-xs border transition-all ${f.categoria === c.id ? "text-white bg-indigo-400/15 border-indigo-400/70" : "text-slate-400 bg-white/5 border-white/10 hover:border-white/25"}`}>{c.icona} {c.nome}</button>
            ))}
          </div>
        </div>

        {/* LINK RICEVUTA */}
        <div>
          <Label>Link ricevuta</Label>
          <Input placeholder="https://… (facoltativo)" value={f.ricevuta} onChange={(e) => set("ricevuta", e.target.value)} />
        </div>

        {trip.syncFinanza && <p className="text-[11px] text-indigo-300/80">Questa spesa verrà registrata anche nel bilancio principale.</p>}
      </div>

      {/* SEZIONE PULSANTI BLINDATA PER MOBILE */}
      <div className="flex flex-row justify-between items-center mt-6 w-full gap-2">
        <div className="shrink-0">
          {/* Se un domani vorrai passare l'onDelete anche qui, lo spazio è già predisposto! */}
          {exp?.id && onDelete && (
            <button 
              onClick={() => { onDelete(exp.id, () => onClose()); }} 
              className="text-sm font-medium text-rose-400 hover:text-rose-300 active:scale-95 transition-all px-1 py-2"
            >
              Elimina
            </button>
          )}
        </div>
        
        <div className="flex flex-row items-center gap-2 sm:gap-3 shrink-0">
          <BtnGhost onClick={onClose}>Annulla</BtnGhost>
          <BtnPrimary onClick={() => { const v = Number(f.importo); if (v > 0) onSave({ ...f, importo: v }); }}>
            {exp?.id ? "Salva" : "Aggiungi"}
          </BtnPrimary>
        </div>
      </div>
    </Modal>
  );
};

/* ---- Editor viaggio con ricerca città (coordinate automatiche) ---- */
function TripModal({ open, trip, onClose, onSave }) {
  const [f, setF] = useState(null);
  const [cityQ, setCityQ] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [fotoInput, setFotoInput] = useState("");
  const boxRef = useRef(null);
  const [alt, setAlt] = useState([]);
  
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        const t = trip || {};
        setAlt([]);
        setF({ 
          id: t.id, 
          nome: t.nome || "", 
          paese: t.paese || "", 
          citta: t.citta || "", 
          lat: t.lat ?? null, 
          lon: t.lon ?? null,
          partenza: t.partenza || todayISO(), // Ricorda l'import di todayISO()
          ritorno: t.ritorno || todayISO(), 
          persone: t.persone || 1, 
          descrizione: t.descrizione || "",
          colore: t.colore || "#8B9DF9", 
          icona: t.icona || "✈️", 
          cover: t.cover || "", 
          foto: [...(t.foto || [])],
          budget: t.budget ?? "", 
          valuta: t.valuta || "EUR", 
          syncFinanza: t.syncFinanza ?? false, 
          note: t.note || "" 
        });
        setCityQ(t.citta || ""); 
        setFotoInput("");
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [open, trip]);
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setCityOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  /* gli hook devono stare PRIMA di qualsiasi return condizionale */
  const { res: matches, loading: searching, offline: geoOffline } = usePlaceSearch(open && cityOpen ? cityQ : "");
  const [autoCover, setAutoCover] = useState(true);
  
  const { state: coverState, soggetto: coverSoggetto } = useAutoCover(open ? f?.citta : "", f?.paese, f?.lat, f?.lon, open && autoCover, (url) => setF((x) => (x && (!x.cover || x.coverAuto) ? { ...x, cover: url, coverAuto: true } : x)));
  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pickCity = (p) => { setF((x) => ({ ...x, citta: p.nome, paese: p.paese, lat: p.lat, lon: p.lon })); setCityQ(p.nome); setCityOpen(false); };
  const gg = dayCount(f.partenza, f.ritorno);

  return (
    <Modal open={open} onClose={onClose} title={f.id ? "Modifica viaggio" : "Nuovo viaggio"} wide>
      <div className="space-y-3">
        <div><Label>Nome del viaggio</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="es. Estate in Grecia" autoFocus /></div>

        <div ref={boxRef} className="relative">
          <Label>Destinazione (le coordinate sono automatiche)</Label>
          <div className="relative">
            <Input value={cityQ} onChange={(e) => { setCityQ(e.target.value); setCityOpen(true); }}
              onFocus={(e) => { setCityOpen(true); setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 320); }}
              placeholder="Cerca un luogo… es. Positano, Monte Bianco" />
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Spinner /></span>}
          </div>
          {cityOpen && matches.length > 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-xl overflow-hidden border border-white/15 shadow-2xl max-h-64 overflow-y-auto" style={{ background: "rgba(14,17,26,.97)", backdropFilter: "blur(20px)", animation: "popIn .18s both" }}>
              {matches.map((p, i) => (
                <button key={p.nome + p.lat + i} onClick={() => pickCity(p)} className="w-full flex items-start gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors border-b border-white/4 last:border-0">
                  <span className="mt-0.5">{countryFlag(p.paese)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-white block truncate">{p.nome}</span>
                    <span className="text-[11px] text-slate-500 block truncate">{p.etichetta || countryLabel(p.paese)}</span>
                  </span>
                  <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{p.tipo}</span>
                </button>
              ))}
            </div>
          )}
          {cityOpen && geoOffline && cityQ.trim().length > 1 && <p className="text-[11px] text-amber-300/70 mt-1">Ricerca online non raggiungibile: mostro solo le località in archivio.</p>}
          {f.paese && <p className="text-[11px] text-slate-500 mt-1">{countryFlag(f.paese)} {countryLabel(f.paese)}{f.lat != null ? ` · ${f.lat.toFixed(2)}, ${f.lon.toFixed(2)} · ${(haversine(HOME_BASE, [f.lat, f.lon])).toLocaleString("it-IT")} km da casa` : ""}</p>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1"><Label>Partenza</Label><Input type="date" value={f.partenza} onChange={(e) => { set("partenza", e.target.value); if (e.target.value > f.ritorno) set("ritorno", e.target.value); }} /></div>
          <div className="col-span-2 sm:col-span-1"><Label>Ritorno</Label><Input type="date" value={f.ritorno} min={f.partenza} onChange={(e) => set("ritorno", e.target.value)} /></div>
          <div className="col-span-2 sm:col-span-1"><Label>Persone</Label><Input type="number" inputMode="numeric" min="1" value={f.persone} onChange={(e) => set("persone", Number(e.target.value) || 1)} /></div>
        </div>
        {gg > 0 && <p className="text-[11px] text-slate-500 -mt-1">{gg} {gg === 1 ? "giorno" : "giorni"} di viaggio</p>}

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Budget previsto</Label><Input type="number" inputMode="decimal" placeholder="es. 1200" value={f.budget} onChange={(e) => set("budget", e.target.value)} /></div>
          <div><Label>Valuta</Label><Select value={f.valuta} onChange={(e) => set("valuta", e.target.value)}>{["EUR", "USD", "GBP", "CHF", "JPY", "THB", "Altro"].map((v) => <option key={v}>{v}</option>)}</Select></div>
        </div>

        <div><Label>Icona</Label>
          <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
            {TRIP_ICONS.map((e) => (
              <button key={e} onClick={() => set("icona", e)} className={`aspect-square rounded-xl grid place-items-center text-base transition-all ${f.icona === e ? "bg-indigo-400/25 border border-indigo-400/60" : "bg-white/5 border border-white/10 hover:bg-white/10"}`}>{e}</button>
            ))}
          </div>
        </div>
        <div><Label>Colore</Label>
          <div className="grid grid-cols-9 sm:grid-cols-17 gap-1.5 items-center">
            {COLOR_SET.map((c) => <button key={c} onClick={() => set("colore", c)} className={`aspect-square rounded-full transition-transform ${f.colore === c ? "scale-110 ring-2 ring-white/70" : "hover:scale-110"}`} style={{ background: c }} />)}
            <input type="color" value={f.colore} onChange={(e) => set("colore", e.target.value)} className="aspect-square w-full rounded-lg bg-transparent border border-white/10 cursor-pointer p-0" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">Foto di copertina</label>
            <button onClick={() => { setAutoCover((v) => !v); }} className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${autoCover ? "text-indigo-200 border-indigo-400/40 bg-indigo-400/10" : "text-slate-500 border-white/10"}`}>
              {autoCover ? "automatica" : "manuale"}
            </button>
          </div>
          <div className="flex gap-2 items-start">
            <div className="w-24 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10 grid place-items-center" style={{ background: `linear-gradient(135deg, ${f.colore}55, #0F1420)` }}>
              {coverState === "loading" ? <Spinner size={16} />
                : f.cover ? <img src={f.cover} alt="" className="w-full h-full object-cover" onError={() => set("cover", "")} />
                : <span className="text-lg opacity-60">{f.icona}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <Input placeholder="Incolla un link, oppure lascia fare all'app" value={f.cover} onChange={(e) => setF((x) => ({ ...x, cover: e.target.value, coverAuto: false }))} />
              {f.citta && (
                <button onClick={async () => {
                  const list = alt.length ? alt : await photoService.candidates(f.citta, f.paese, f.lat, f.lon);
                  if (!list.length) return;
                  setAlt(list);
                  const i = (list.indexOf(f.cover) + 1) % list.length;
                  setF((x) => ({ ...x, cover: list[i], coverAuto: true }));
                }} className="mt-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors">↻ Prova un'altra foto</button>
              )}
              <p className="text-[11px] mt-1 text-slate-500">
                {coverState === "loading" ? "Cerco una foto della destinazione…"
                  : coverState === "ok" && f.coverAuto ? `${coverSoggetto || "Foto"} · scelto automaticamente`
                  : coverState === "none" ? "Nessuna foto trovata: userò un gradiente elegante"
                  : "Si compila da sola quando scegli la destinazione"}
              </p>
            </div>
          </div>
        </div>
        <div><Label>Album fotografico</Label>
          {f.foto.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {f.foto.map((u, i) => (
                <span key={i} className="group relative w-14 h-14 rounded-lg overflow-hidden border border-white/10">
                  <img src={u} alt="" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.opacity = ".2")} />
                  <button onClick={() => set("foto", f.foto.filter((_, j) => j !== i))} className="absolute inset-0 bg-black/70 text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="Incolla il link di una foto" value={fotoInput} onChange={(e) => setFotoInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && fotoInput.trim()) { set("foto", [...f.foto, fotoInput.trim()]); setFotoInput(""); } }} />
            <BtnGhost onClick={() => { if (fotoInput.trim()) { set("foto", [...f.foto, fotoInput.trim()]); setFotoInput(""); } }}>Aggiungi</BtnGhost>
          </div>
        </div>

        <div><Label>Descrizione</Label><Input placeholder="Due righe di ricordo…" value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} /></div>

        <button onClick={() => set("syncFinanza", !f.syncFinanza)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${f.syncFinanza ? "bg-indigo-400/10 border-indigo-400/40" : "bg-white/5 border-white/10"}`}>
          <span className={`w-10 rounded-full transition-all relative shrink-0 ${f.syncFinanza ? "bg-linear-to-r from-indigo-400 to-violet-400" : "bg-white/10"}`} style={{ height: 22 }}>
            <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${f.syncFinanza ? "left-5.5" : "left-0.5"}`} />
          </span>
          <span className="text-sm text-slate-300 text-left">Registra automaticamente le spese nel bilancio principale</span>
        </button>
      </div>
      <div className="modal-actions flex justify-end gap-3 mt-5">
        <BtnGhost onClick={onClose}>Annulla</BtnGhost>
        <BtnPrimary onClick={() => { if (!f.nome.trim() || !f.paese) return; onSave({ ...f, id: f.id || uid(), nome: f.nome.trim(), budget: Number(f.budget) || 0 }); }}>{f.id ? "Salva modifiche" : "Crea viaggio"}</BtnPrimary>
      </div>
    </Modal>
  );
};

/* ---- Statistiche viaggi ---- */
function TripStats({ st, trips, expenses }) {
  const perAnno = useMemo(() => {
    const m = {};
    trips.forEach((t) => { if (!t.partenza) return; const y = t.partenza.slice(0, 4); m[y] = m[y] || { anno: y, Viaggi: 0, Spesa: 0 }; m[y].Viaggi++; });
    expenses.forEach((e) => { const y = e.data.slice(0, 4); if (m[y]) m[y].Spesa += e.importo; });
    return Object.values(m).sort((a, b) => a.anno.localeCompare(b.anno)).map((x) => ({ ...x, Spesa: Math.round(x.Spesa) }));
  }, [trips, expenses]);
  const perCat = useMemo(() => {
    const m = {};
    expenses.forEach((e) => (m[e.categoria] = (m[e.categoria] || 0) + e.importo));
    const arr = Object.entries(m).map(([k, v]) => ({ ...tripCat(k), value: Math.round(v) })).sort((a, b) => b.value - a.value);
    const max = Math.max(1, ...arr.map((a) => a.value));
    return { arr, max };
  }, [expenses]);
  const perContinente = useMemo(() => {
    const m = {};
    trips.forEach((t) => { const r = countryRegion(t.paese) || "Altro"; m[r] = (m[r] || 0) + 1; });
    return Object.entries(m).map(([k, v]) => ({ name: k, value: v, fill: { Europa: "#8B9DF9", Asia: "#5EEAD4", America: "#FCA5A5", Africa: "#FDBA74", Oceania: "#86EFAC" }[k] || "#94A3B8" }));
  }, [trips]);

  const cards = [
    { l: "Paese più visitato", v: st.topPaese ? `${countryFlag(st.topPaese[0])} ${countryLabel(st.topPaese[0])} · ${st.topPaese[1].n}` : "—" },
    { l: "Città più visitata", v: st.topCitta ? `${st.topCitta[0]} · ${st.topCitta[1]}` : "—" },
    { l: "Spesa media a viaggio", v: eur(st.mediaViaggio) },
    { l: "Spesa media giornaliera", v: eur(st.mediaGiorno) },
    { l: "Mese preferito", v: st.topMese ? `${MESI[+st.topMese[0]]} · ${st.topMese[1]} viaggi` : "—" },
    { l: "Anno con più viaggi", v: st.topAnno ? `${st.topAnno[0]} · ${st.topAnno[1]}` : "—" },
    { l: "Voli registrati", v: st.nVoli },
    { l: "Notti / hotel", v: st.nHotel },
  ];

  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {cards.map((c, i) => (
          <Card key={c.l} className="p-4" delay={i * 45}><p className="text-xs text-slate-400">{c.l}</p><p className="font-display text-base text-white mt-1 truncate">{c.v}</p></Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5" hover={false} delay={200}>
          <h2 className="font-display text-white mb-3">Viaggi e spesa per anno</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={perAnno}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="anno" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="Spesa" fill="#8B9DF9" fillOpacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5" hover={false} delay={250}>
          <h2 className="font-display text-white mb-3">Continenti esplorati</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="h-40 sm:h-56 w-full sm:w-1/2 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={perContinente} dataKey="value" innerRadius="50%" outerRadius="82%" paddingAngle={4} animationDuration={1000}>{perContinente.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}</Pie><Tooltip content={<ChartTip />} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-1.5 text-xs flex-1">
              {perContinente.map((c) => (
                <div key={c.name} className="flex justify-between gap-2"><span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full" style={{ background: c.fill }} />{c.name}</span><span className="text-slate-400 tabular-nums">{c.value}</span></div>
              ))}
              {!perContinente.length && <p className="text-slate-500">Nessun viaggio.</p>}
            </div>
          </div>
        </Card>
      </div>
      <Card className="p-5 mt-5" hover={false} delay={300}>
        <h2 className="font-display text-white mb-3">Dove finiscono i soldi in viaggio</h2>
        <div className="space-y-2">
          {perCat.arr.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5">
              <span className="w-6 text-center">{c.icona}</span>
              <span className="text-xs text-slate-300 w-24 truncate shrink-0">{c.nome}</span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.value / perCat.max) * 100}%`, background: c.colore }} />
              </div>
              <span className="text-xs text-slate-400 tabular-nums w-20 text-right shrink-0">{eur(c.value)}</span>
            </div>
          ))}
          {!perCat.arr.length && <EmptyState text="Nessuna spesa di viaggio registrata." />}
        </div>
      </Card>
    </div>
  );
};

function Wishlist({ data, update, notify, setConfirmDlg, wishEdit, setWishEdit, onConvert }) {
  const list = data.wishlist || [];
  const [f, setF] = useState(null);
  const [cityQ, setCityQ] = useState("");
useEffect(() => { 
    if (wishEdit) { 
      const timer = setTimeout(() => {
        setF({ 
          nome: wishEdit.nome || "", 
          paese: wishEdit.paese || "", 
          citta: "", 
          lat: null, 
          lon: null, 
          priorita: "media", 
          costo: "", 
          note: "", 
          link: "", 
          foto: "", 
          ...wishEdit 
        }); 
        setCityQ(wishEdit.citta || ""); 
      }, 0);
      
      return () => clearTimeout(timer);
    } 
  }, [wishEdit]);  const PRIO = { alta: { l: "Alta", c: "#FB7185" }, media: { l: "Media", c: "#FBBF24" }, bassa: { l: "Bassa", c: "#94A3B8" } };
  const { res: matches } = usePlaceSearch(cityQ);

  const save = () => {
    if (!f?.nome?.trim() || !f.paese) return;
    update((d) => { if (!d.wishlist) d.wishlist = []; const rec = { ...f, id: f.id || uid(), nome: f.nome.trim(), costo: Number(f.costo) || 0 }; const i = d.wishlist.findIndex((x) => x.id === rec.id); if (i >= 0) d.wishlist[i] = rec; else d.wishlist.push(rec); return d; });
    setWishEdit(null); setF(null); notify("Salvato nella wishlist");
  };

  return (
    <div style={{ animation: "fadeUp .4s both" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{list.length} luoghi da visitare</p>
        <BtnPrimary onClick={() => setWishEdit({})}>+ Aggiungi</BtnPrimary>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((w, i) => (
          <Card key={w.id} className="overflow-hidden" delay={i * 50}>
            {w.foto && <div className="h-24 overflow-hidden"><img src={w.foto} alt="" loading="lazy" className="w-full h-full object-cover opacity-80" onError={(e) => (e.currentTarget.parentElement.style.display = "none")} /></div>}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white truncate">{w.nome}</p>
                  <p className="text-[11px] text-slate-500 truncate">{countryFlag(w.paese)} {w.citta ? w.citta + " · " : ""}{countryLabel(w.paese)}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0" style={{ color: PRIO[w.priorita]?.c, borderColor: PRIO[w.priorita]?.c + "55", background: PRIO[w.priorita]?.c + "14" }}>{PRIO[w.priorita]?.l}</span>
              </div>
              {w.costo > 0 && <p className="text-xs text-slate-400 mt-2 tabular-nums">Stima: {eur(w.costo)}</p>}
              {w.note && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{w.note}</p>}
              <div className="flex gap-2 mt-3 flex-wrap">
                <BtnPrimary onClick={() => onConvert(w)} className="py-1.5! text-xs!">Trasforma in viaggio</BtnPrimary>
                <button onClick={() => { setWishEdit(w); }} className="text-xs text-slate-400 hover:text-white px-1 transition-colors">Modifica</button>
                <button onClick={() => setConfirmDlg({ msg: `Rimuovere "${w.nome}" dalla wishlist?`, onOk: () => update((d) => { d.wishlist = d.wishlist.filter((x) => x.id !== w.id); return d; }) })} className="text-xs text-slate-600 hover:text-rose-300 px-1 transition-colors">Elimina</button>
                {w.link && <a href={w.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200 px-1 transition-colors">Link ↗</a>}
              </div>
            </div>
          </Card>
        ))}
        {!list.length && <Card className="p-6 sm:col-span-2 lg:col-span-3" hover={false}><EmptyState text="Nessun luogo in wishlist. Aggiungi i posti che sogni di visitare." /></Card>}
      </div>

      <Modal open={!!wishEdit} onClose={() => { setWishEdit(null); setF(null); }} title={f?.id ? "Modifica luogo" : "Nuovo luogo da visitare"}>
        {f && (
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="es. C.A.R.O.L. boreale in Lapponia" autoFocus /></div>
            <div className="relative">
              <Label>Destinazione</Label>
              <Input value={cityQ} onChange={(e) => setCityQ(e.target.value)} placeholder="Cerca una città…" />
              {matches.length > 0 && cityQ !== f.citta && (
                <div className="absolute z-30 mt-1 w-full rounded-xl overflow-hidden border border-white/15" style={{ background: "rgba(14,17,26,.97)" }}>
                  {matches.map((p, i) => (
                    <button key={p.nome + i} onClick={() => { setF({ ...f, citta: p.nome, paese: p.paese, lat: p.lat, lon: p.lon }); setCityQ(p.nome); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors">
                      <span>{countryFlag(p.paese)}</span><span className="text-white truncate">{p.nome}</span><span className="text-xs text-slate-500 truncate">{countryLabel(p.paese)}</span>
                    </button>
                  ))}
                </div>
              )}
              {f.paese && <p className="text-[11px] text-slate-500 mt-1">{countryFlag(f.paese)} {countryLabel(f.paese)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priorità</Label><Select value={f.priorita} onChange={(e) => setF({ ...f, priorita: e.target.value })}><option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option></Select></div>
              <div><Label>Costo stimato</Label><Input type="number" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} placeholder="es. 1500" /></div>
            </div>
            <div><Label>Foto (link)</Label><Input value={f.foto} onChange={(e) => setF({ ...f, foto: e.target.value })} placeholder="https://…" /></div>
            <div><Label>Link utile</Label><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></div>
            <div><Label>Note</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Periodo migliore, cosa vedere…" /></div>
          </div>
        )}
        <div className="modal-actions flex justify-end gap-3 mt-5">
          <BtnGhost onClick={() => { setWishEdit(null); setF(null); }}>Annulla</BtnGhost>
          <BtnPrimary onClick={save}>Salva</BtnPrimary>
        </div>
      </Modal>
    </div>
  );
};