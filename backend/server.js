const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

app.use(cors());
app.use(express.json());

// Probar conexión a la DB y sembrar usuarios
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.message);
  } else {
    console.log('Conexión a base de datos exitosa.');
    try {
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
  try {
    // Check if there are logs referencing this material
    const checkLogs = await pool.query('SELECT * FROM inventory_log WHERE material_id = $1 LIMIT 1', [id]);
    if (checkLogs.rowCount > 0) {
      return res.status(400).json({ error: 'No se puede eliminar el material porque tiene registros históricos de consumo o restock.' });
    }

    const result = await pool.query('DELETE FROM materials WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Material no encontrado' });
    res.json({ message: 'Material eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar material' });
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
        'INSERT INTO inventory_log (material_id, type, quantity, batch_number) VALUES ($1, $2, $3, $4)',
        [material_id, 'CONSUMPTION', quantity, batchId]
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
      'INSERT INTO inventory_log (material_id, type, quantity) VALUES ($1, $2, $3)',
      [material_id, 'RESTOCK', quantity]
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

app.listen(port, () => {
  console.log(`Servidor backend corriendo en http://localhost:${port}`);
});
