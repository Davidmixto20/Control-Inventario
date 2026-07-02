const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';
const APP_TIME_ZONE = 'America/Caracas';

app.use(cors());
app.use(express.json());

const ensureDatabaseMigrations = async () => {
  await pool.query(`
    ALTER TABLE inventory_log
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);
};

// Probar conexión a la DB y sembrar usuarios
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.message);
  } else {
    console.log('Conexión a base de datos exitosa.');
    try {
      await ensureDatabaseMigrations();

      // Create admin user if not exists
      const adminRes = await pool.query("SELECT * FROM users WHERE username = 'admin'");
      if (adminRes.rowCount === 0) {
        const hash = await bcrypt.hash('admin123', 10);
        await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'ADMIN')", ['admin', hash]);
      }
      // Create operario user if not exists
      const opRes = await pool.query("SELECT * FROM users WHERE username = 'operario'");
      if (opRes.rowCount === 0) {
        const hash = await bcrypt.hash('operario123', 10);
        await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'WORKER')", ['operario', hash]);
      }
    } catch (e) {
      console.log('Tabla users no lista todavía:', e.message);
    }
  }
});

// Middleware de Autenticación
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token no provisto' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware para verificar rol ADMIN
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Administrador.' });
  }
};

// POST /api/login - Autenticación
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });

    res.json({ message: 'Login exitoso', token, role: user.role, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno en el servidor' });
  }
});

// PUT /api/users/password - Cambiar contraseña
app.put('/api/users/password', authenticate, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno en el servidor' });
  }
});

// GET /api/materials - Obtener lista de materiales y su estado (Cualquier usuario logueado)
app.get('/api/materials', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM materials ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los materiales' });
  }
});

// GET /api/history - Historial y resumen mensual (Solo ADMIN)
app.get('/api/history', authenticate, requireAdmin, async (req, res) => {
  const { date, month } = req.query;
  const selectedDate = date || new Date().toISOString().slice(0, 10);
  const selectedMonth = month || selectedDate.slice(0, 7);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return res.status(400).json({ error: 'Fecha invalida. Usa el formato YYYY-MM-DD.' });
  }

  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
    return res.status(400).json({ error: 'Mes invalido. Usa el formato YYYY-MM.' });
  }

  try {
    const dailyResult = await pool.query(
      `
        SELECT
          il.id,
          il.material_id,
          COALESCE(m.name, 'Material eliminado') AS material_name,
          COALESCE(m.unit, '') AS unit,
          il.type,
          il.quantity,
          il.batch_number,
          b.total_yield,
          il.timestamp,
          TO_CHAR((il.timestamp AT TIME ZONE 'UTC') AT TIME ZONE $2, 'YYYY-MM-DD"T"HH24:MI:SS') AS local_timestamp,
          TO_CHAR((il.timestamp AT TIME ZONE 'UTC') AT TIME ZONE $2, 'HH24:MI') AS local_time,
          TO_CHAR((il.timestamp AT TIME ZONE 'UTC') AT TIME ZONE $2, 'YYYY-MM-DD') AS local_date,
          COALESCE(u.username, 'Sin usuario') AS username
        FROM inventory_log il
        LEFT JOIN materials m ON m.id = il.material_id
        LEFT JOIN batches b ON b.batch_number = il.batch_number
        LEFT JOIN users u ON u.id = il.user_id
        WHERE DATE((il.timestamp AT TIME ZONE 'UTC') AT TIME ZONE $2) = $1::date
        ORDER BY il.timestamp DESC
      `,
      [selectedDate, APP_TIME_ZONE]
    );

    const monthlyResult = await pool.query(
      `
        SELECT
          il.material_id,
          COALESCE(m.name, 'Material eliminado') AS material_name,
          COALESCE(m.unit, '') AS unit,
          il.type,
          SUM(il.quantity) AS total_quantity,
          COUNT(*) AS movements_count
        FROM inventory_log il
        LEFT JOIN materials m ON m.id = il.material_id
        WHERE TO_CHAR((il.timestamp AT TIME ZONE 'UTC') AT TIME ZONE $2, 'YYYY-MM') = $1
        GROUP BY il.material_id, m.name, m.unit, il.type
        ORDER BY material_name ASC, il.type ASC
      `,
      [selectedMonth, APP_TIME_ZONE]
    );

    res.json({
      date: selectedDate,
      month: selectedMonth,
      timeZone: APP_TIME_ZONE,
      dailyMovements: dailyResult.rows,
      monthlySummary: monthlyResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});


// POST /api/users - Crear usuario (Solo ADMIN)
app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Faltan datos requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', [username, hash, role]);
    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // PostgreSQL unique violation error code
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    res.status(500).json({ error: 'Error interno en el servidor al crear usuario' });
  }
});

// POST /api/materials - Crear material (Sólo Admin)
app.post('/api/materials', authenticate, requireAdmin, async (req, res) => {
  const { name, unit, current_stock, reorder_point } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'Nombre y unidad son requeridos' });

  try {
    const result = await pool.query(
      'INSERT INTO materials (name, unit, current_stock, reorder_point) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, unit, current_stock || 0, reorder_point || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear material' });
  }
});

// PUT /api/materials/:id - Editar material (Sólo Admin)
app.put('/api/materials/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, unit, reorder_point } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'Nombre y unidad son requeridos' });

  try {
    const result = await pool.query(
      'UPDATE materials SET name = $1, unit = $2, reorder_point = $3 WHERE id = $4 RETURNING *',
      [name, unit, reorder_point || 0, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Material no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar material' });
  }
});

// DELETE /api/materials/:id - Eliminar material (Sólo Admin)
app.delete('/api/materials/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Eliminar primero el historial para evitar conflicto de llave foránea
    await client.query('DELETE FROM inventory_log WHERE material_id = $1', [id]);

    const result = await client.query('DELETE FROM materials WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Material no encontrado' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Material y su historial fueron eliminados exitosamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error interno al eliminar material' });
  } finally {
    client.release();
  }
});

// POST /api/consumption - Registrar consumo (Cualquier usuario logueado)
app.post('/api/consumption', authenticate, async (req, res) => {
  const { batch_number, total_yield, items } = req.body;

  if (!batch_number || !items || items.length === 0) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let batchRes = await client.query(
      'INSERT INTO batches (batch_number, total_yield) VALUES ($1, $2) ON CONFLICT (batch_number) DO UPDATE SET total_yield = EXCLUDED.total_yield RETURNING id, batch_number',
      [batch_number, total_yield || 0]
    );
    const batchId = batchRes.rows[0].batch_number;

    for (let item of items) {
      const { material_id, quantity } = item;
      if (!material_id || quantity <= 0) continue;

      const updateRes = await client.query(
        'UPDATE materials SET current_stock = current_stock - $1 WHERE id = $2 RETURNING *',
        [quantity, material_id]
      );
      if (updateRes.rowCount === 0) throw new Error(`Material no encontrado: ${material_id}`);

      await client.query(
        'INSERT INTO inventory_log (material_id, type, quantity, batch_number, user_id) VALUES ($1, $2, $3, $4, $5)',
        [material_id, 'CONSUMPTION', quantity, batchId, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.status(200).json({ message: 'Consumo registrado exitosamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Error al procesar el consumo' });
  } finally {
    client.release();
  }
});

// POST /api/restock - Restablecer inventario (Sólo Admin)
app.post('/api/restock', authenticate, requireAdmin, async (req, res) => {
  const { material_id, quantity } = req.body;
  if (!material_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Datos inválidos para restock' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateRes = await client.query(
      'UPDATE materials SET current_stock = current_stock + $1 WHERE id = $2 RETURNING *',
      [quantity, material_id]
    );
    if (updateRes.rowCount === 0) throw new Error(`Material no encontrado: ${material_id}`);

    await client.query(
      'INSERT INTO inventory_log (material_id, type, quantity, user_id) VALUES ($1, $2, $3, $4)',
      [material_id, 'RESTOCK', quantity, req.user.id]
    );
    await client.query('COMMIT');
    res.status(200).json({ message: 'Restock exitoso', material: updateRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Error al procesar el restock' });
  } finally {
    client.release();
  }
});

// GET /api/production-history - Historial de producción (Solo Admin)
app.get('/api/production-history', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM batches ORDER BY date DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// DELETE /api/batches/:batch_number - Eliminar lote y revertir consumos (Solo Admin)
app.delete('/api/batches/:batch_number', authenticate, requireAdmin, async (req, res) => {
  const { batch_number } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Buscar los consumos de este lote
    const logs = await client.query('SELECT material_id, quantity FROM inventory_log WHERE batch_number = $1', [batch_number]);
    
    // Devolver el material al stock
    for (const log of logs.rows) {
      await client.query('UPDATE materials SET current_stock = current_stock + $1 WHERE id = $2', [log.quantity, log.material_id]);
    }
    
    // Eliminar los registros de logs y luego el lote
    await client.query('DELETE FROM inventory_log WHERE batch_number = $1', [batch_number]);
    const deleteBatch = await client.query('DELETE FROM batches WHERE batch_number = $1 RETURNING *', [batch_number]);
    
    if (deleteBatch.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lote no encontrado' });
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Lote eliminado y stock revertido exitosamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el lote' });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Servidor backend corriendo en http://localhost:${port}`);
});
