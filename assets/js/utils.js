// assets/js/utils.js

export function normalizeText(s) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function toInt(v, def = 0) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
}

export function toFloat(v) {
  const n = parseFloat(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

export function parseDateFlexible(v) {
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(v ?? "").trim();
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    const dd = String(m1[1]).padStart(2, "0");
    const mm = String(m1[2]).padStart(2, "0");
    return `${m1[3]}-${mm}-${dd}`;
  }

  // ← CAMBIO: fallback sin desfase UTC
  // new Date("2026-04-09") parsea como UTC → en UTC-4 devuelve 2026-04-08
  // Usar regex para extraer año/mes/día directamente si el string tiene forma reconocible
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m2) {
    const yy = m2[1];
    const mm = String(m2[2]).padStart(2, "0");
    const dd = String(m2[3]).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  // último recurso: Date.parse con corrección local
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

// ← CAMBIO: denominador variable según estructuras con dato real
// Reemplaza la versión anterior que usaba /48 fijo
export function severityPct(row) {
  const vals = [
    row.brotes_hojas,
    row.hojas_adultas,
    row.brotes_limones,
    row.botones_florales,
  ].filter((v) => v !== null && v !== undefined);

  if (vals.length === 0) return 0;
  const sum   = vals.reduce((a, b) => a + b, 0);
  const denom = vals.length * 12;
  return (sum / denom) * 100;
}

// Severidad solo de hojas adultas (métrica principal del sistema)
export function sevHA(row) {
  if (row.hojas_adultas === null || row.hojas_adultas === undefined) return null;
  return (row.hojas_adultas / 12) * 100;
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function downloadText(filename, text, mime = "text/plain") {
  const blob = URL.createObjectURL(new Blob([text], { type: mime }));
  const a    = document.createElement("a");
  a.href     = blob;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blob);
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
