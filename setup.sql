-- ============================================================
-- setup.sql — Script de inicialización para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Tabla: fincas
CREATE TABLE IF NOT EXISTS fincas (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);

-- 2. Tabla: bloques
CREATE TABLE IF NOT EXISTS bloques (
    id BIGSERIAL PRIMARY KEY,
    finca_id BIGINT NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    UNIQUE(finca_id, nombre)
);

-- 3. Tabla: monitoreos
CREATE TABLE IF NOT EXISTS monitoreos (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    finca_id BIGINT NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    bloque_id BIGINT REFERENCES bloques(id) ON DELETE SET NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    tecnico TEXT DEFAULT '',
    brotes_pos INTEGER DEFAULT 0,
    hojas_adultas_pos INTEGER DEFAULT 0,
    limones_pos INTEGER DEFAULT 0,
    botones_pos INTEGER DEFAULT 0,
    yemas_pos INTEGER DEFAULT 0,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_monitoreos_fecha ON monitoreos(fecha);
CREATE INDEX IF NOT EXISTS idx_monitoreos_finca ON monitoreos(finca_id);
CREATE INDEX IF NOT EXISTS idx_monitoreos_fingerprint ON monitoreos(fingerprint);

-- 5. Habilitar RLS en todas las tablas
ALTER TABLE fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoreos ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS para rol anon (frontend sin login)

-- FINCAS
CREATE POLICY "fincas_select_anon" ON fincas
    FOR SELECT TO anon USING (true);
CREATE POLICY "fincas_insert_anon" ON fincas
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "fincas_update_anon" ON fincas
    FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "fincas_delete_anon" ON fincas
    FOR DELETE TO anon USING (true);

-- BLOQUES
CREATE POLICY "bloques_select_anon" ON bloques
    FOR SELECT TO anon USING (true);
CREATE POLICY "bloques_insert_anon" ON bloques
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "bloques_update_anon" ON bloques
    FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "bloques_delete_anon" ON bloques
    FOR DELETE TO anon USING (true);

-- MONITOREOS
CREATE POLICY "monitoreos_select_anon" ON monitoreos
    FOR SELECT TO anon USING (true);
CREATE POLICY "monitoreos_insert_anon" ON monitoreos
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "monitoreos_update_anon" ON monitoreos
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 7. (Opcional) Insertar fincas de ejemplo
-- INSERT INTO fincas (nombre) VALUES ('Finca Demo 1'), ('Finca Demo 2');
-- INSERT INTO bloques (finca_id, nombre) VALUES (1, 'Bloque A'), (1, 'Bloque B'), (2, 'Lote 1');
