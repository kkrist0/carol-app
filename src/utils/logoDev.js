let _globalLogoDevKey = "";

export function setGlobalLogoDevKey(key) {
  _globalLogoDevKey = (key || "").trim();
}

export function getGlobalLogoDevKey() {
  return _globalLogoDevKey;
}

/**
 * Genera l'URL per il logo dell'azienda tramite Logo.dev
 * Supporta sia nomi di aziende (es. "Netflix") che domini (es. "netflix.com")
 */
export function getCompanyLogoUrl(name, { token, size = 128, format = "png", retina = true, fallback = "404" } = {}) {
  if (!name || typeof name !== "string" || !name.trim()) return "";
  const apiKey = (token || _globalLogoDevKey || "").trim();
  if (!apiKey) return "";

  const cleanName = name.trim();
  const isDomain = cleanName.includes(".") && !cleanName.includes(" ") && !cleanName.startsWith("@");
  const path = isDomain ? encodeURIComponent(cleanName) : `name/${encodeURIComponent(cleanName)}`;
  
  const params = new URLSearchParams({
    token: apiKey,
    size: String(Math.min(size, 800)),
    format,
    fallback,
  });
  if (retina) params.set("retina", "true");
  
  return `https://img.logo.dev/${path}?${params.toString()}`;
}
