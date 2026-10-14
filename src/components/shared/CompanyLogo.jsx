import { useState } from "react";
import { getCompanyLogoUrl } from "../../utils/logoDev";

/**
 * Componente per visualizzare il logo aziendale con fallback automatico
 */
export function CompanyLogo({
  name,
  size,
  className = "w-full h-full object-cover",
  alt,
  fallbackNode = null,
  style = {},
  onLoad,
  onError,
}) {
  const [erroredUrl, setErroredUrl] = useState(null);

  if (!name || typeof name !== "string" || !name.trim()) {
    return fallbackNode || null;
  }

  const url = getCompanyLogoUrl(name, { size: size ? Math.max(size * 2, 64) : 128 });

  if (!url || erroredUrl === url) {
    return fallbackNode || null;
  }

  return (
    <img
      key={url}
      src={url}
      alt={alt || `${name} logo`}
      width={size || undefined}
      height={size || undefined}
      loading="lazy"
      onLoad={onLoad}
      onError={() => {
        setErroredUrl(url);
        onError?.();
      }}
      className={`transition-opacity duration-200 ${className}`}
      style={{ ...(size ? { width: size, height: size } : {}), ...style }}
    />
  );
}
