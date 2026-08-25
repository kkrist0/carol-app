export function Logo({ size = 24, className = "" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className || "text-teal-400"}
    >
      {/* Guscio esagonale esterno (System Node) */}
      <polygon 
        points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        opacity="0.3"
      />
      
      {/* Esagono interno tratteggiato (Elaborazione dati in corso) */}
      <polygon 
        points="12 5 18 8.5 18 15.5 12 19 6 15.5 6 8.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        strokeDasharray="4 3"
        opacity="0.8"
      />
      
      {/* Nucleo centrale di C.A.R.O.L. */}
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      
      {/* Struttura di contenimento (Pin di connessione neurali) */}
      <path 
        d="M12 2v3M20.5 7l-2.5 1.5M20.5 17l-2.5-1.5M12 22v-3M3.5 17l2.5-1.5M3.5 7l2.5 1.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
    </svg>
  );
}