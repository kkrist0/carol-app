export const Spinner = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ animation: "spin .8s linear infinite" }}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".2" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);