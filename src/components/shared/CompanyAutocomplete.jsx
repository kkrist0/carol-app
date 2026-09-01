import { useState, useRef, useEffect, useMemo } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { Label } from "../Forms";

// Catalogo predefinito di brand e compagnie popolari (Italia e Internazionale)
const POPULAR_COMPANIES = [
  // Streaming, Tech & Gaming
  "Amazon", "Apple", "Netflix", "Spotify", "Google", "YouTube", 
  "Disney+", "Microsoft", "PlayStation", "Nintendo", "Steam", "Adobe", "OpenAI", 
  "ChatGPT", "GitHub", "Notion", "Dropbox", "Twitch", "DAZN", "Audible", "Canva",
  
  // Supermercati & Spesa
  "Esselunga", "Conad", "Coop", "Carrefour", "Lidl", "Eurospin", "Pam", "Aldi", 
  "Tigros", "Bennet", "Crai", "MD", "Despar", "Penny Market", "Iper", "NaturaSì",
  
  // Ristoranti & Delivery
  "Deliveroo", "Just Eat", "Glovo", "Uber Eats", "McDonald's", "Burger King", 
  "Starbucks", "KFC", "Poke House", "Autogrill", "Domino's", "Too Good To Go",
  
  // Viaggi, Trasporti & Carburante
  "Trenitalia", "Italo", "Frecciarossa", "Ryanair", "EasyJet", "Wizz Air", 
  "Lufthansa", "Vueling", "ITA Airways", "Air France", "Uber", "Bolt", "FreeNow", 
  "Telepass", "Eni", "IP", "Q8", "Tamoil", "Esso", "Shell", "Booking.com", 
  "Airbnb", "Expedia", "TripAdvisor", "Lime", "Dott",
  
  // Shopping, Abbigliamento & Casa
  "Zara", "H&M", "Decathlon", "Nike", "Adidas", "Zalando", "ASOS", "Shein", 
  "Uniqlo", "IKEA", "Leroy Merlin", "MediaWorld", "Unieuro", "Euronics", 
  "Sephora", "Douglas", "ManoMano", "eBay", "Vinted", "AliExpress", "Temu", 
  "OVS", "Pull&Bear", "Bershka", "Stradivarius", "Mango",
  
  // Utenze & Telecomunicazioni
  "Enel", "Enel Energia", "Eni Plenitude", "A2A", "Edison", "Acea", "Hera", 
  "Iren", "Sorgenia", "NeN", "Iliad", "Vodafone", "TIM", "WindTre", "Fastweb", 
  "Very Mobile", "Ho Mobile", "PosteMobile", "Sky", "Eolo",
  
  // Finanza, Banche & Pagamenti
  "PayPal", "Satispay", "Revolut", "BBVA", "Intesa Sanpaolo", "UniCredit", 
  "Poste Italiane", "Fineco", "Hype", "N26", "Isybank", "Webank", "ING", 
  "Banca Mediolanum", "Banco BPM", "BNL", "American Express", "Nexi", "Klarna", 
  "Scalapay", "Trade Republic", "Degiro", "Directa", "Allianz", "Generali", 
  "UnipolSai", "Prima Assicurazioni",
  
  // Salute & Fitness
  "McFIT", "Virgin Active", "FitActive", "Anytime Fitness", "Synlab"
];

export function CompanyAutocomplete({
  value = "",
  onChange,
  existingCompanies = [],
  placeholder = "es. Amazon, Netflix, Esselunga...",
  label = "Compagnia (estrazione logo)",
  categoryIcon = "•",
}) {
  const [prevValue, setPrevValue] = useState(value);
  const [query, setQuery] = useState(value || "");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sincronizzazione dello stato quando cambia il valore dall'esterno
  if (prevValue !== value) {
    setPrevValue(value);
    setQuery(value || "");
  }

  // Combina le compagnie esistenti nei movimenti con quelle predefinite senza duplicati
  const allSuggestions = useMemo(() => {
    const custom = (existingCompanies || []).filter(Boolean);
    const seen = new Set();
    const list = [];
    
    // Prima le compagnie usate di recente dall'utente
    custom.forEach((c) => {
      const trimmed = c.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seen.has(lower)) {
        seen.add(lower);
        list.push(trimmed);
      }
    });
    
    // Poi la lista dei brand popolari
    POPULAR_COMPANIES.forEach((c) => {
      const lower = c.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(c);
      }
    });
    
    return list;
  }, [existingCompanies]);

  // Filtra i suggerimenti in base alla query
  const filteredSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allSuggestions.slice(0, 10);
    }
    const matches = allSuggestions.filter((item) =>
      item.toLowerCase().includes(q)
    );
    return matches.slice(0, 10);
  }, [allSuggestions, query]);

  // Opzione personalizzata se ciò che è stato digitato non corrisponde esattamente a una voce
  const showCustomOption = useMemo(() => {
    const q = query.trim();
    if (!q) return false;
    return !filteredSuggestions.some(
      (item) => item.toLowerCase() === q.toLowerCase()
    );
  }, [query, filteredSuggestions]);

  const totalOptionsCount = filteredSuggestions.length + (showCustomOption ? 1 : 0);

  // Gestione click esterno per chiudere il dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (compagnia) => {
    const selected = (compagnia || "").trim();
    setQuery(selected);
    onChange?.(selected);
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    setQuery("");
    onChange?.("");
    setIsOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, totalOptionsCount));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + totalOptionsCount) % Math.max(1, totalOptionsCount));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showCustomOption && highlightedIndex === 0) {
        handleSelect(query);
      } else {
        const itemIdx = showCustomOption ? highlightedIndex - 1 : highlightedIndex;
        if (filteredSuggestions[itemIdx]) {
          handleSelect(filteredSuggestions[itemIdx]);
        } else if (query.trim()) {
          handleSelect(query);
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && <Label>{label}</Label>}

      {/* Input container con anteprima integrata */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange?.(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-20 py-2 text-sm text-white placeholder-slate-500 outline-none hover:border-white/20 focus:border-indigo-400/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-indigo-400/15 transition-all"
        />

        {/* Mini Preview Logo / Tasto Cancella nell'input */}
        <div className="absolute right-2 flex items-center gap-1.5">
          {query.trim() && (
            <>
              <div 
                className="w-6 h-6 rounded-lg bg-white/10 border border-white/10 grid place-items-center overflow-hidden shrink-0" 
                title={`Anteprima logo: ${query}`}
              >
                <CompanyLogo 
                  name={query} 
                  className="w-full h-full object-cover" 
                  fallbackNode={<span className="text-xs">{categoryIcon}</span>} 
                />
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="w-6 h-6 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-xs"
                title="Rimuovi compagnia e logo"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dropdown dei suggerimenti */}
      {isOpen && (
        <div 
          className="absolute z-50 left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-slate-900/95 border border-white/15 backdrop-blur-xl shadow-2xl divide-y divide-white/5 p-1"
          style={{ animation: "fadeUp 0.15s ease-out both" }}
        >
          {showCustomOption && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(query);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg text-xs transition-colors ${
                highlightedIndex === 0 ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-white/10 border border-white/10 grid place-items-center overflow-hidden shrink-0">
                <CompanyLogo 
                  name={query} 
                  className="w-full h-full object-cover" 
                  fallbackNode={<span className="text-xs">{categoryIcon}</span>} 
                />
              </div>
              <span className="truncate">
                Estrai logo per: <b className="text-white">"{query}"</b>
              </span>
            </button>
          )}

          {filteredSuggestions.map((item, idx) => {
            const actualIdx = showCustomOption ? idx + 1 : idx;
            const isHighlighted = highlightedIndex === actualIdx;
            return (
              <button
                key={item}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg text-xs transition-colors ${
                  isHighlighted ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-white/10 border border-white/10 grid place-items-center overflow-hidden shrink-0">
                  <CompanyLogo 
                    name={item} 
                    className="w-full h-full object-cover" 
                    fallbackNode={<span className="text-xs">{categoryIcon}</span>} 
                  />
                </div>
                <span className="truncate flex-1 font-medium">{item}</span>
                {existingCompanies.includes(item) && (
                  <span className="text-[10px] text-indigo-300/80 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-400/20">
                    Recente
                  </span>
                )}
              </button>
            );
          })}

          {totalOptionsCount === 0 && (
            <div className="px-3 py-2.5 text-xs text-slate-500 text-center">
              Nessun suggerimento trovato
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <p className="text-[11px] text-slate-500 mt-1 pl-0.5">
        Inserisci la compagnia o il servizio per estrarre l'immagine del logo.
      </p>
    </div>
  );
}
