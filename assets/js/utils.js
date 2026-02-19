export function normalizeText(s){
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // sin tildes
    .replace(/\s+/g, " ");
}

export function toInt(v, def=0){
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
}

export function toFloat(v){
  const n = parseFloat(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function isValidISODate(iso){
  // iso: YYYY-MM-DD
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(Date.UTC(y, m-1, d));
  return dt.getUTCFullYear()===y && (dt.getUTCMonth()+1)===m && dt.getUTCDate()===d;
}

export function parseDateFlexible(v){
  // acepta Date, número excel, "YYYY-MM-DD", "DD/MM/YYYY", etc. (básico)
  if(v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth()+1).padStart(2,"0");
    const d = String(v.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  const s = String(v ?? "").trim();
  if(!s) return null;

  // YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m1){
    const dd = String(m1[1]).padStart(2,"0");
    const mm = String(m1[2]).padStart(2,"0");
    const yy = m1[3];
    return `${yy}-${mm}-${dd}`;
  }

  // fallback: Date parse
  const dt = new Date(s);
  if(!isNaN(dt)){
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,"0");
    const d = String(dt.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function severityPct(row){
  const sum = (row.brotes_pos||0) + (row.hojas_adultas_pos||0) + (row.limones_pos||0) + (row.botones_pos||0) + (row.yemas_pos||0);
  return (sum / 60) * 100;
}

export function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

export function downloadText(filename, text, mime="text/plain"){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function chunk(arr, size){
  const out = [];
  for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}
