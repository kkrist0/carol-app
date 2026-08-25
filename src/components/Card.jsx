export const Card = ({ children, className = "", delay = 0, hover = true }) => (
  <div 
    className={`
      bg-white/3 border border-white/10 backdrop-blur-md rounded-2xl
      ${hover ? "transition-all duration-300 hover:bg-white/6 hover:border-white/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40" : ""} 
      ${className}
    `} 
    style={ delay ? { 
      animation: `fadeUp .55s cubic-bezier(.22,1,.36,1) both`, 
      animationDelay: `${delay}ms` 
    } : {}}
  >
    {children}
  </div>
);