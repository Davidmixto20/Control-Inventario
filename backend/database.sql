CREATE SEQUENCE IF NOT EXISTS material_id_seq START 1;

CREATE TABLE IF NOT EXISTS materials (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'MP-' || LPAD(nextval('material_id_seq')::TEXT, 3, '0'),
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    current_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
    reorder_point NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_yield NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('ADMIN', 'WORKER')) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_log (
    id SERIAL PRIMARY KEY,
    material_id VARCHAR(50) REFERENCES materials(id),
    type VARCHAR(20) CHECK (type IN ('CONSUMPTION', 'RESTOCK')),
    quantity NUMERIC(10, 2) NOT NULL,
    batch_number VARCHAR(100) REFERENCES batches(batch_number),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos de prueba iniciales para materiales
INSERT INTO materials (name, unit, current_stock, reorder_point) VALUES 
('Harina de Trigo', 'kg', 500.00, 100.00),
('Azúcar', 'kg', 200.00, 50.00),
('Sal', 'kg', 50.00, 10.00),
('Levadura', 'g', 1000.00, 200.00)
ON CONFLICT DO NOTHING;
