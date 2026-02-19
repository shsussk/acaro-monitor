// ============================================================
// app.js — Módulo compartido: Supabase client, utilidades, nav
// ============================================================

// --- Supabase Client ---
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Utilidades ---
const Utils = {
    normalize(str) {
        return (str || '').toString().trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    },

    parseDate(val) {
        if (!val) return null;
        let s = String(val).trim();
        // Excel serial number
        if (/^\d{5}$/.test(s)) {
            const d = new Date((parseInt(s) - 25569) * 86400000);
            if (!isNaN(d)) return d.toISOString().split('T')[0];
        }
        // Try various formats
        const formats = [
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,          // YYYY-MM-DD
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,          // DD/MM/YYYY o MM/DD/YYYY
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/,            // DD-MM-YYYY
        ];
        // YYYY-MM-DD
        let m = s.match(formats[0]);
        if (m) {
            const d = new Date(+m[1], +m[2]-1, +m[3]);
            if (d.getFullYear()==+m[1] && d.getMonth()==+m[2]-1 && d.getDate()==+m[3])
                return d.toISOString().split('T')[0];
        }
        // DD/MM/YYYY
        m = s.match(formats[1]);
        if (m) {
            const d = new Date(+m[3], +m[2]-1, +m[1]);
            if (d.getFullYear()==+m[3] && d.getMonth()==+m[2]-1 && d.getDate()==+m[1])
                return d.toISOString().split('T')[0];
        }
        // DD-MM-YYYY
        m = s.match(formats[2]);
        if (m) {
            const d = new Date(+m[3], +m[2]-1, +m[1]);
            if (d.getFullYear()==+m[3] && d.getMonth()==+m[2]-1 && d.getDate()==+m[1])
                return d.toISOString().split('T')[0];
        }
        // Fallback Date.parse
        const dp = new Date(s);
        if (!isNaN(dp)) return dp.toISOString().split('T')[0];
        return null;
    },

    parseFloat(val) {
        const n = Number(String(val).replace(',', '.'));
        return isFinite(n) ? n : null;
    },

    parseInt(val, def = 0) {
        const n = Number(String(val).replace(',', '.'));
        return isFinite(n) ? Math.round(n) : def;
    },

    calcSeveridad(r) {
        const sum = (r.brotes_pos||0) + (r.hojas_adultas_pos||0) +
                    (r.limones_pos||0) + (r.botones_pos||0) + (r.yemas_pos||0);
        return Math.min(((sum / 60) * 100), 100);
    },

    sevClass(pct) {
        if (pct < 20) return 'sev-low';
        if (pct < 50) return 'sev-med';
        return 'sev-high';
    },

    sevColor(pct) {
        if (pct < 20) return '#2e7d32';
        if (pct < 50) return '#f57f17';
        return '#e53935';
    },

    fingerprint(r) {
        return `${r.fecha}|${r.finca_id}|${r.bloque_id||''}|${r.lat}|${r.lon}|${Utils.normalize(r.tecnico||'')}`;
    },

    showAlert(container, msg, type = 'info') {
        const div = document.createElement('div');
        div.className = `alert alert-${type}`;
        div.textContent = msg;
        container.prepend(div);
        setTimeout(() => div.remove(), 6000);
    },

    dateRange(preset) {
        const today = new Date();
        const to = today.toISOString().split('T')[0];
        let from;
        if (preset === 'week') {
            const d = new Date(today); d.setDate(d.getDate() - 7);
            from = d.toISOString().split('T')[0];
        } else if (preset === 'month') {
            const d = new Date(today); d.setMonth(d.getMonth() - 1);
            from = d.toISOString().split('T')[0];
        } else {
            from = '2020-01-01';
        }
        return { from, to };
    }
};

// --- Catálogos (cacheados) ---
let _fincas = null;
let _bloques = null;

async function loadFincas(force = false) {
    if (_fincas && !force) return _fincas;
    const { data, error } = await db.from('fincas').select('*').order('nombre');
    if (error) { console.error('Error cargando fincas:', error); return []; }
    _fincas = data || [];
    return _fincas;
}

async function loadBloques(fincaId, force = false) {
    let query = db.from('bloques').select('*').order('nombre');
    if (fincaId) query = query.eq('finca_id', fincaId);
    const { data, error } = await query;
    if (error) { console.error('Error cargando bloques:', error); return []; }
    return data || [];
}

async function loadAllBloques() {
    if (_bloques) return _bloques;
    const { data, error } = await db.from('bloques').select('*').order('nombre');
    if (error) return [];
    _bloques = data || [];
    return _bloques;
}

// --- Populate filter dropdowns ---
async function populateFilters() {
    const fincas = await loadFincas();
    const selFinca = document.getElementById('filterFinca');
    const selBloque = document.getElementById('filterBloque');
    if (!selFinca) return;

    selFinca.innerHTML = '<option value="">Todas las fincas</option>';
    fincas.forEach(f => {
        selFinca.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
    });

    selFinca.addEventListener('change', async () => {
        const fid = selFinca.value;
        selBloque.innerHTML = '<option value="">Todos los bloques</option>';
        if (fid) {
            const bloques = await loadBloques(fid);
            bloques.forEach(b => {
                selBloque.innerHTML += `<option value="${b.id}">${b.nombre}</option>`;
            });
        }
    });
}

function getFilterValues() {
    const preset = document.getElementById('filterPreset')?.value || 'month';
    let from, to;
    if (preset === 'custom') {
        from = document.getElementById('filterFrom')?.value || '2020-01-01';
        to = document.getElementById('filterTo')?.value || new Date().toISOString().split('T')[0];
    } else {
        ({ from, to } = Utils.dateRange(preset));
    }
    const finca_id = document.getElementById('filterFinca')?.value || '';
    const bloque_id = document.getElementById('filterBloque')?.value || '';
    return { from, to, finca_id, bloque_id };
}

async function queryMonitoreos(filters, limit = 5000) {
    let q = db.from('monitoreos').select('*, fincas(nombre), bloques(nombre)')
        .gte('fecha', filters.from)
        .lte('fecha', filters.to)
        .order('fecha', { ascending: false })
        .limit(limit);
    if (filters.finca_id) q = q.eq('finca_id', filters.finca_id);
    if (filters.bloque_id) q = q.eq('bloque_id', filters.bloque_id);
    const { data, error } = await q;
    if (error) { console.error('Query error:', error); return []; }
    return data || [];
}

// --- Navbar highlight ---
function initNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar nav a').forEach(a => {
        if (a.getAttribute('href') === path) a.classList.add('active');
    });

    // Toggle custom date inputs
    const preset = document.getElementById('filterPreset');
    const customDates = document.getElementById('customDates');
    if (preset && customDates) {
        preset.addEventListener('change', () => {
            customDates.style.display = preset.value === 'custom' ? 'flex' : 'none';
        });
    }
}

document.addEventListener('DOMContentLoaded', initNav);
