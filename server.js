const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const mongoose = require('mongoose');
const { Types } = mongoose;
const path     = require('path');
const ExcelJS  = require('exceljs');
const fs       = require('fs');
const https    = require('https');
const sanitizeHtml = require('sanitize-html');
const mongoSanitize = require('express-mongo-sanitize')

const Usuario = require('./models/Usuario');
const Tarea   = require('./models/Tarea');
const { REFUSED } = require('dns');
const Auditoria = require('./models/Auditoria');
const { resolve } = require('path/win32');

const app  = express();
const port = 3000;

const options = {
  key: fs.readFileSync('./localhost-key.pem'),
  cert: fs.readFileSync('./localhost.pem')
};

app.use(express.static(path.join(__dirname)));

// ───────────────────────────────────────────────────────────────────────────────
// 1) Conexión a MongoDB
// ───────────────────────────────────────────────────────────────────────────────
mongoose.connect('mongodb://localhost:27017/entregas_turnos')
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  })
// ───────────────────────────────────────────────────────────────────────────────
// 2) Middlewares
// ───────────────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));
app.use(mongoSanitize());

// validar sesión única
app.use(async (req, res, next) => {
  if (["/login", "/registro"].includes(req.path)) return next();

  const userId = req.header('x-user-id');
  const sessionToken = req.header('x-session-token');

  if (!userId || !sessionToken) {
    return res.status(401).json({ error: "No autorizado: Falta token o usuario" });
  }

  try {
    const user = await Usuario.findById(userId);
    if (!user || user.sessionToken !== sessionToken) {
      return res.status(401).json({ error: "Sesión inválida o ya iniciada en otro dispositivo" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("❌ Error validando sesión:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// - Limpiar datos
function sanitizeInput(input) {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  })
}

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

    const ip = req.header['x-forwarded-for'] || req.connection.remoteAddress;
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: nuevo._id,
      accion: 'Registro de usuario',
      descripcion: 'Nuevo registro de usuario: ${username}',
      ip,
      ruta
    });

    return res.status(201).json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    console.error("❌ Error en POST /registro:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Login
app.post('/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ruta = req.originalUrl;
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  try {
    const user = await Usuario.findOne({ username });

    if (!user) {
      // Auditoría: usuario no encontrado
      await Auditoria.create({
        usuario: null,
        accion: 'Login fallido',
        descripcion: `Intento de login con usuario inexistente: ${username}`,
        ip,
        ruta
      });
      return res.status(400).json({ error: "Usuario o contraseña incorrectos" });
    }

    // Verificar si la cuenta está bloqueada
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      
      // Auditoría: intento con cuenta bloqueada
      await Auditoria.create({
        usuario: user._id,
        accion: 'Intento con cuenta bloqueada',
        descripcion: `Login bloqueado para usuario: ${username}`,
        ip,
        ruta
      });

      return res.status(403).json({
        error: `Cuenta bloqueada. Intenta de nuevo en ${minutesLeft} min.`
      });
    }

    // Validar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60000); // 30 min
      }
      await user.save();

      // Auditoría: intento fallido
      await Auditoria.create({
        usuario: user._id,
        accion: 'Login fallido',
        descripcion: `Contraseña incorrecta para usuario: ${username}`,
        ip,
        ruta
      });

      return res.status(400).json({
        error: "Usuario o contraseña incorrectos"
      });
    }
    user.loginAttempts = 0;
    user.lockUntil = null;
    const crypto = require('crypto');
    const sessionToken = crypto.randomBytes(32).toString('hex');
    user.sessionToken = sessionToken;
    await user.save();
    await Auditoria.create({
      usuario: user._id,
      accion: 'Login exitoso',
      descripcion: `Usuario ${username} inició sesión correctamente.`,
      ip,
      ruta
    });

    return res.json({
      message: "Login exitoso",
      user: {
        id: user._id,
        username: user.username,
        rol: user.rol,
        sessionToken
      }
    });
  } catch (err) {
    console.error("❌ Error en POST /login:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// - logout
app.post('/logout', async (req, res) => {
  const userId = req.header('x-user-id');

  if (!userId) {
    return res.status(400).json({ error: "Usuario no identificado" });
  }

  try{
    await Usuario.findByIdAndUpdate(userId, { sessionToken: null });
    return res.json({ message: "Sesion cerrada exitosamente"});
  } catch (err) {
    console.error("❌ Error en POST /logout:", err);
    return re.status(500).json({ error: "Error cerrando sesion"});
  }
});

// — Listar usuarios
app.get('/usuarios', async (req, res) => {
  try {
    const raw = await Usuario.find().lean();
    const uniqueMap = new Map(raw.map(u => [u._id.toString(), u]));
    const usuarios = Array.from(uniqueMap.values());
    return res.json(usuarios);
  } catch (err) {
    console.error("❌ Error en GET /usuarios:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Editar rol de usuario
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;
  if (!['analista','jefe','admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  try {
    const user = await Usuario.findByIdAndUpdate(id, { rol }, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ message: 'Rol actualizado', user });
  } catch (err) {
    console.error('❌ Error en PUT /usuarios/:id:', err);
    return res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// — Resetear contraseña
app.put('/usuarios/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const defaultPass = "Abc123!@#";
  try {
    const hash = await bcrypt.hash(defaultPass, 10);
    const u = await Usuario.findByIdAndUpdate(id, { password: hash });
    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ message: "Contraseña restablecida", defaultPassword: defaultPass });
  } catch (err) {
    console.error("❌ Error en PUT /usuarios/:id/reset-password:", err);
    return res.status(500).json({ error: "Error al restablecer contraseña" });
  }
});

// — Activar / Inactivar usuario
app.put('/usuarios/:id/:action(activar|inactivar)', async (req, res) => {
  const { id, action } = req.params;
  try {
    const u = await Usuario.findByIdAndUpdate(id, { isActive: action === 'activar' }, { new: true });
    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ message: `Usuario ${action}do`, user: u });
  } catch (err) {
    console.error(`❌ Error en PUT /usuarios/:id/${action}:`, err);
    return res.status(500).json({ error: `Error al ${action} usuario` });
  }
});

// — Obtener analistas
app.get('/analistas', async (req, res) => {
  try {
    const analistas = await Usuario.find({ rol: 'analista' }, 'username');
    return res.json(analistas);
  } catch (err) {
    console.error("❌ Error en GET /analistas:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Generar Informe (Excel)
app.get('/tareas/informe', async (req, res) => {
  const { fechaInicio, fechaFin, analista, estado } = req.query;
  const filtro = {};
  if (analista) filtro.analista = analista;
  if (estado)   filtro.estado   = estado;
  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin)    filtro.fechaHora.$lte = new Date(fechaFin + 'T23:59:59');
  }
  try {
    const tareas = await Tarea.find(filtro).populate('analista','username').lean();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tareas');
    ws.columns = [
      { header: 'Título',      key: 'titulo' },
      { header: 'Descripción', key: 'descripcion' },
      { header: 'Analista',    key: 'analista' },
      { header: 'FechaHora',   key: 'fechaHora' },
      { header: 'FechaLímite', key: 'fechaLimite' },
      { header: 'Ticket',      key: 'ticket' },
      { header: 'Placa',       key: 'placa' },
      { header: 'Estado',      key: 'estado' }
    ];
    tareas.forEach(t => ws.addRow({
      titulo: t.titulo,
      descripcion: t.descripcion,
      analista: t.analista.username,
      fechaHora: new Date(t.fechaHora).toLocaleString(),
      fechaLimite: t.fechaLimite.toISOString().slice(0,10),
      ticket: t.ticket,
      placa: t.placa,
      estado: t.estado || 'Pendiente'
    }));
    ws.columns.forEach(col => {
      let max = col.header.length;
      col.eachCell({ includeEmpty: true }, cell => {
        const v = (cell.value || '').toString();
        if (v.length > max) max = v.length;
      });
      col.width = max + 2;
    });
    res.setHeader('Content-Disposition', `attachment; filename="Informe_Tareas_${fechaInicio||'desde'}_${fechaFin||'hasta'}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('❌ Error en GET /tareas/informe:', err);
    res.status(500).json({ error: 'Error generando informe' });
  }
});

// — Notificaciones
app.get('/notificaciones', async (req, res) => {
  try {
    const userId = req.header('x-user-id');
    if (!userId) return res.status(400).json({ error: 'Usuario no identificado' });
    const asignadas = await Tarea.find({ analista: userId, estado: 'Pendiente' });
    const ayer      = new Date(Date.now() - 24*60*60*1000);
    const completadas = await Tarea.find({ analista: userId, estado: 'Finalizado', updatedAt: { $gte: ayer } });
    const ahora   = new Date();
    const manana  = new Date(Date.now() + 24*60*60*1000);
    const porVencer = await Tarea.find({ analista: userId, estado: 'Pendiente', fechaLimite: { $gte: ahora, $lte: manana } });
    return res.json({ asignadas: asignadas.map(t => ({ id: t._id, titulo: t.titulo })), completadas: completadas.map(t => ({ id: t._id, titulo: t.titulo })), porVencer: porVencer.map(t => ({ id: t._id, titulo: t.titulo })) });
  } catch (err) {
    console.error('❌ Error en GET /notificaciones:', err);
    return res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
});

// - Ampliar fechas
app.put('/tareas/ampliar-fecha/:id', async (req, res) => {
  const user = req.user;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ruta = req.originalUrl;

  if (!['admin', 'jefe'].includes(user.rol)) {
    return res.status(403).json({ error: 'No tienes permisos paraampliar'});
  }

  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada'});

    const { nuevaFecha } = req.body;
    if (!nuevaFecha) return res.status(400).json({ error: 'Debe proporcionar una nueva fecha' });

    const fechaAnterior = t.fechaLimite;
    t.fechaLimite = nuevaFecha;

    t.historial = t.historial || [];
    t.historial.push({
      accion: 'Ampliacion de fecha',
      analista_anterior: t.analista,
      analista_nuevo: t.analista,
      fechaLimite_anterior: fechaAnterior,
      fechaLimite_nueva: nuevaFecha,
      estado_anterior: t.estado,
      estado_nuevo: t.estado,
      observacion: `Ampliada por ${user.username}`,
      fecha: new Date()
    });

    await t.save();

    await Auditoria.create({
      usuario: user._id,
      accion: `Ampliada por ${user.username}`,
      descripcion: `Tarea ${t._id} ampliada a ${nuevaFecha}`,
      ip,
      ruta
    });

    return res.json({ message: 'Fecha limite ampliada correctamente', tarea: t})
  } catch (err) {
    console.error('❌ Error en PUT /tareas/ampliar-fecha/:id:', err);
    return res.status(500).json({ error: 'Error en el servidor'})
  }
});

// — Listar tareas
app.get('/tareas', async (req, res) => {
  let { analista, estado, fechaInicio, fechaFin, titulo, placa } = req.query;
  const filtro = {};
  if (analista && Types.ObjectId.isValid(analista)) filtro.analista = analista;
  if (estado) filtro.estado = estado;
  if (titulo) filtro.titulo = { $regex: titulo, $options: 'i' };
  if (placa)  filtro.placa  = { $regex: placa,  $options: 'i' };
  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin)    filtro.fechaHora.$lte = new Date(fechaFin + 'T23:59:59');
  }
  try {
    const tareas = await Tarea.find(filtro).lean();
    return res.json(tareas);
  } catch (err) {
    console.error('❌ Error en GET /tareas:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

// — Obtener detalle de tarea
app.get('/tareas/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID de tarea inválido o no proporcionado' });
  }

  try {
    const t = await Tarea.findById(id).lean();
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    return res.json(t);
  } catch (err) {
    console.error('❌ Error en GET /tareas/:id:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});
// — Crear tarea
app.post('/tareas', async (req, res) => {
  const {
    titulo,
    descripcion,
    fechaHora,
    analista,
    fechaLimite,
    ticket,
    placa,
    observacion
  } = req.body;

  const sanitizedTitulo = sanitizeInput(titulo);
  const sanitizedDescripcion = sanitizeInput(descripcion);
  const sanitizedTicket = sanitizeInput(ticket);
  const sanitizedPlaca = sanitizeInput(placa);
  const sanitizedObservacion = sanitizeInput(observacion);

  if (!sanitizedTitulo || !sanitizedDescripcion || !sanitizedObservacion || !fechaHora || !analista || !fechaLimite || !ticket || !placa) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar completos' });
  }

  try {
    const nuevaTarea = new Tarea({
      titulo: sanitizedTitulo,
      descripcion: sanitizedDescripcion,
      fechaHora,
      analista,
      fechaLimite,
      ticket: sanitizedTicket,
      placa: sanitizedPlaca,
      observacion: sanitizedObservacion
    });
    await nuevaTarea.save();

    // Auditoría
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: req.user._id,
      accion: 'Creación de tarea',
      descripcion: `Tarea creada: ${sanitizedTitulo}`,
      ip,
      ruta
    });

    return res.status(201).json({ message: 'Tarea creada correctamente', tarea: nuevaTarea });
  } catch (err) {
    console.error('❌ Error en POST /tareas:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

// — Terminar tarea
app.put('/tareas/terminar/:id', async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (t.estado === 'Finalizado') return res.status(400).json({ error: 'La tarea ya está finalizada' });

    const sanitizedObservacion = sanitizeInput(req.body.observacion || '');
    const cambio = {
      accion: 'Finalización',
      analista_anterior: t.analista,
      analista_nuevo: t.analista,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva: t.fechaLimite,
      estado_anterior: t.estado,
      estado_nuevo: 'Finalizado',
      observacion: sanitizedObservacion,
      fecha: new Date()
    };

    t.historial = t.historial || [];
    t.historial.push(cambio);
    t.estado = 'Finalizado';
    await t.save();

    // Auditoría
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: req.user._id,
      accion: 'Finalización de tarea',
      descripcion: `Tarea finalizada: ${t.titulo}`,
      ip,
      ruta
    });

    return res.json({ message: 'Tarea finalizada correctamente', tarea: t });
  } catch (err) {
    console.error('❌ Error en PUT /tareas/terminar/:id:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

// — Reasignar tarea
app.put('/tareas/reasignar/:id', async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    if (t.estado === 'Finalizado') {
      return res.status(400).json({ error: 'No se puede reasignar una tarea finalizada' });
    }

    const { analista_nuevo, fechaLimite, observacion } = req.body;

    // ✅ Validar que todos los campos existan y sean válidos
    if (
      typeof analista_nuevo !== "string" || !analista_nuevo.trim() ||
      typeof fechaLimite !== "string" || !fechaLimite.trim() ||
      typeof observacion !== "string" || observacion.trim().length < 5
    ) {
      return res.status(400).json({ error: 'Faltan campos obligatorios o están vacíos' });
    }

    // ✅ Validar que el analista nuevo exista (opcional pero recomendable)
    const analistaExiste = await Usuario.exists({ _id: analista_nuevo });
    if (!analistaExiste) {
      return res.status(400).json({ error: 'El analista especificado no existe' });
    }

    const sanitizedObservacion = sanitizeInput(observacion);
    const cambio = {
      accion: 'Reasignación',
      analista_anterior: t.analista,
      analista_nuevo,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva: fechaLimite,
      observacion: sanitizedObservacion,
      fecha: new Date()
    };

    // ✅ Convertir a ObjectId antes de asignar
    t.analista = Types.ObjectId(analista_nuevo);
    t.fechaLimite = fechaLimite;
    t.historial = t.historial || [];
    t.historial.push(cambio);

    await t.save();

    // Registro en auditoría
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ruta = req.originalUrl;

    await Auditoria.create({
      usuario: req.user._id,
      accion: 'Reasignación de tarea',
      descripcion: `Tarea reasignada a analista: ${analista_nuevo}`,
      ip,
      ruta
    });

    return res.json({ message: 'Tarea reasignada correctamente', tarea: t });

  } catch (err) {
    console.error('❌ Error en PUT /tareas/reasignar/:id:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});



// — Eliminar tarea
app.delete('/tareas/:id', async (req, res) => {
  try {
    const t = await Tarea.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });

    // Auditoría
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: req.user._id,
      accion: 'Eliminación de tarea',
      descripcion: `Tarea eliminada: ${t.titulo}`,
      ip,
      ruta
    });

    return res.json({ message: 'Tarea eliminada correctamente' });
  } catch (err) {
    console.error('❌ Error en DELETE /tareas/:id:', err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// 5) Arrancar el servidor
// ───────────────────────────────────────────────────────────────────────────────
https.createServer(options, app).listen(port, () => {
  console.log(`🚀 Servidor HTTPS corriendo en https://localhost:${port}`);
});