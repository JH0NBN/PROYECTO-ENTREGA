const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const mongoose = require('mongoose');
const { Types } = mongoose;
const path     = require('path');
const ExcelJS  = require('exceljs');

const Usuario = require('./models/Usuario');
const Tarea   = require('./models/Tarea');

const app  = express();
const port = 3000;

// ───────────────────────────────────────────────────────────────────────────────
// 1) Conexión a MongoDB
// ───────────────────────────────────────────────────────────────────────────────
mongoose.connect('mongodb://localhost:27017/entregas_turnos', {
  useNewUrlParser:    true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => {
  console.error('❌ Error conectando a MongoDB:', err);
  process.exit(1);
});

// ───────────────────────────────────────────────────────────────────────────────
// 2) Middlewares
// ───────────────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// servir login.js y script.js en la raíz

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ───────────────────────────────────────────────────────────────────────────────
// 3) RUTAS API
// ───────────────────────────────────────────────────────────────────────────────

// — Registro
app.post('/registro', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
  if (!regex.test(password)) {
    return res.status(400).json({
      error: "La contraseña debe tener ≥8 caracteres, incluir letra, número y carácter especial."
    });
  }
  try {
    if (await Usuario.findOne({ username })) {
      return res.status(400).json({ error: "El nombre de usuario ya está en uso" });
    }
    const hash = await bcrypt.hash(password, 10);
    const nuevo = new Usuario({ username, password: hash, rol: 'analista' });
    await nuevo.save();
    res.status(201).json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    console.error("❌ Error en POST /registro:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  try {
    const u = await Usuario.findOne({ username });
    if (!u) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }
    const match = await bcrypt.compare(password, u.password);
    if (!match) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }
    res.json({
      message: "Inicio de sesión exitoso",
      user: { id: u._id, username: u.username, rol: u.rol }
    });
  } catch (err) {
    console.error("❌ Error en POST /login:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Listar usuarios (admin)
app.get('/usuarios', async (req, res) => {
  try {
    const list = await Usuario.find({}, 'username rol isActive');
    res.json(list);
  } catch (err) {
    console.error("❌ Error en GET /usuarios:", err);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

// — Editar username
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "username obligatorio" });
  }
  try {
    if (await Usuario.findOne({ username })) {
      return res.status(400).json({ error: "El nombre de usuario ya existe" });
    }
    const u = await Usuario.findByIdAndUpdate(id, { username }, { new: true });
    if (!u) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ message: "Nombre cambiado", user: u });
  } catch (err) {
    console.error("❌ Error en PUT /usuarios/:id:", err);
    res.status(500).json({ error: "Error actualizando usuario" });
  }
});

// — Resetear contraseña
app.put('/usuarios/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const defaultPass = "Abc123!@#";
  try {
    const hash = await bcrypt.hash(defaultPass, 10);
    const u = await Usuario.findByIdAndUpdate(id, { password: hash });
    if (!u) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ message: "Contraseña restablecida", defaultPassword: defaultPass });
  } catch (err) {
    console.error("❌ Error en PUT /usuarios/:id/reset-password:", err);
    res.status(500).json({ error: "Error al restablecer contraseña" });
  }
});

// — Activar / Inactivar usuario
app.put('/usuarios/:id/:action(activar|inactivar)', async (req, res) => {
  const { id, action } = req.params;
  try {
    const u = await Usuario.findByIdAndUpdate(
      id,
      { isActive: action === 'activar' },
      { new: true }
    );
    if (!u) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ message: `Usuario ${action}do`, user: u });
  } catch (err) {
    console.error(`❌ Error en PUT /usuarios/:id/${action}:`, err);
    res.status(500).json({ error: `Error al ${action} usuario` });
  }
});

// — Obtener analistas
app.get('/analistas', async (req, res) => {
  try {
    const analistas = await Usuario.find({ rol: 'analista' }, 'username');
    res.json(analistas);
  } catch (err) {
    console.error("❌ Error en GET /analistas:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Crear tarea
app.post('/tareas', async (req, res) => {
  const { titulo, descripcion, fechaHora, analista, fechaLimite } = req.body;
  if (!titulo || !descripcion || !fechaHora || !analista || !fechaLimite) {
    return res.status(400).json({ error: "Todos los campos obligatorios deben estar completos" });
  }
  try {
    const t = new Tarea(req.body);
    await t.save();
    res.status(201).json({ message: "Tarea creada correctamente", tarea: t });
  } catch (err) {
    console.error("❌ Error en POST /tareas:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Listar tareas con filtros
app.get('/tareas', async (req, res) => {
  let { analista, estado, fechaInicio, fechaFin, titulo, placa } = req.query;
  const filtro = {};

  if (
    analista &&
    analista !== '' &&
    analista !== 'undefined' &&
    analista !== '"undefined"' &&
    Types.ObjectId.isValid(analista)
  ) {
    filtro.analista = analista;
  }
  if (estado) filtro.estado = estado;
  if (titulo) filtro.titulo = { $regex: titulo, $options: 'i' };
  if (placa)  filtro.placa  = { $regex: placa, $options: 'i' };

  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin)    filtro.fechaHora.$lte = new Date(fechaFin + 'T23:59:59');
  }

  try {
    const tareas = await Tarea.find(filtro);
    res.json(tareas);
  } catch (err) {
    console.error("❌ Error en GET /tareas:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Obtener detalle de tarea
app.get('/tareas/:id', async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }
    res.json(t);
  } catch (err) {
    console.error("❌ Error en GET /tareas/:id:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Terminar tarea (historial + cambio de estado)
app.put('/tareas/terminar/:id', async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
    if (t.estado === "Finalizado") {
      return res.status(400).json({ error: "La tarea ya está finalizada" });
    }
    const cambio = {
      accion:               "Finalización",
      analista_anterior:    t.analista,
      analista_nuevo:       t.analista,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva:    t.fechaLimite,
      estado_anterior:      t.estado,
      estado_nuevo:         "Finalizado",
      observacion:          req.body.observacion || "",
      fecha:                new Date()
    };
    t.historial = t.historial || [];
    t.historial.push(cambio);
    t.estado = "Finalizado";
    await t.save();
    res.json({ message: "Tarea finalizada correctamente", tarea: t });
  } catch (err) {
    console.error("❌ Error en PUT /tareas/terminar/:id:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Reasignar tarea
app.put('/tareas/reasignar/:id', async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
    if (t.estado === "Finalizado") {
      return res.status(400).json({ error: "No se puede reasignar una tarea finalizada" });
    }
    const { analista_nuevo, fechaLimite, observacion } = req.body;
    const cambio = {
      accion:               "Reasignación",
      analista_anterior:    t.analista,
      analista_nuevo,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva:    fechaLimite,
      observacion,
      fecha:                new Date()
    };
    t.analista    = analista_nuevo;
    t.fechaLimite = fechaLimite;
    t.historial   = t.historial || [];
    t.historial.push(cambio);
    await t.save();
    res.json({ message: "Tarea reasignada correctamente", tarea: t });
  } catch (err) {
    console.error("❌ Error en PUT /tareas/reasignar/:id:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Eliminar tarea
app.delete('/tareas/:id', async (req, res) => {
  try {
    const t = await Tarea.findByIdAndDelete(req.params.id);
    if (!t) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }
    res.json({ message: "Tarea eliminada correctamente" });
  } catch (err) {
    console.error("❌ Error en DELETE /tareas/:id:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Informe Excel
app.get('/tareas/informe', async (req, res) => {
  const { fechaInicio, fechaFin, analista, estado } = req.query;
  const filtro = {};
  if (analista) filtro.analista = analista;
  if (estado)   filtro.estado    = estado;
  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin)    filtro.fechaHora.$lte = new Date(fechaFin + 'T23:59:59');
  }
  try {
    const tareas = await Tarea.find(filtro).populate("analista","username");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tareas");
    ws.columns = [
      { header:"Título",      key:"titulo" },
      { header:"Descripción", key:"descripcion" },
      { header:"Analista",    key:"analista" },
      { header:"FechaHora",   key:"fechaHora" },
      { header:"FechaLímite", key:"fechaLimite" },
      { header:"Ticket",      key:"ticket" },
      { header:"Placa",       key:"placa" },
      { header:"Estado",      key:"estado" }
    ];
    tareas.forEach(t => {
      ws.addRow({
        titulo:      t.titulo,
        descripción: t.descripcion,
        analista:    t.analista.username,
        fechaHora:   t.fechaHora.toLocaleString(),
        fechaLimite: t.fechaLimite.toISOString().slice(0,10),
        ticket:      t.ticket,
        placa:       t.placa,
        estado:      t.estado
      });
    });
    ws.columns.forEach(col => {
      let max = col.header.length;
      col.eachCell({ includeEmpty:true }, cell => {
        const v = (cell.value||"").toString();
        if (v.length > max) max = v.length;
      });
      col.width = max + 2;
    });
    res.setHeader("Content-Disposition", 
      `attachment; filename="Informe_Tareas_${fechaInicio||'desde'}_${fechaFin||'hasta'}.xlsx"`
    );
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error en GET /tareas/informe:", err);
    res.status(500).json({ error: "Error generando informe" });
  }
});

// — Notificaciones
app.get('/notificaciones', async (req, res) => {
  try {
    const userId = req.header('x-user-id');
    if (!userId) {
      return res.status(400).json({ error: 'Usuario no identificado' });
    }
    const asignadas = await Tarea.find({ analista: userId, estado:'Pendiente' });
    const ayer      = new Date(Date.now() - 24*60*60*1000);
    const completadas= await Tarea.find({
      analista:userId, estado:'Finalizado', updatedAt:{ $gte:ayer }
    });
    const ahora     = new Date();
    const manana    = new Date(Date.now() + 24*60*60*1000);
    const porVencer = await Tarea.find({
      analista:userId, estado:'Pendiente',
      fechaLimite:{ $gte:ahora, $lte:manana }
    });

    res.json({
      asignadas:   asignadas.map(t=>({ id:t._id, titulo:t.titulo })),
      completadas: completadas.map(t=>({ id:t._id, titulo:t.titulo })),
      porVencer:   porVencer.map(t=>({ id:t._id, titulo:t.titulo }))
    });
  } catch (err) {
    console.error("❌ Error en GET /notificaciones:", err);
    res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// 5) Arrancar el servidor
// ───────────────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});
