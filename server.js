require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { Types } = mongoose;
const path = require("path");
const ExcelJS = require("exceljs");
const fs = require("fs");
const https = require("https");
const sanitizeHtml = require("sanitize-html");
const mongoSanitize = require("express-mongo-sanitize");
const Usuario = require("./models/Usuario");
const Tarea = require("./models/Tarea");
const Equipo = require("./models/Equipo");
const Ubicacion = require("./models/Ubicacion");
const { REFUSED } = require("dns");
const Auditoria = require("./models/Auditoria");
const {sendMessage,msgProxima,msgVencida,msgNuevaAsignacion,msgReasignacion,msgAmpliacion,msgFinalizada,} = require("./helpers/telegram");
const cron = require("node-cron");
const { getStatusClass } = require("./helpers/status");
const { resolve } = require("path/win32");
const app = express();
const port = process.env.PORT || 3000;

// ───────────────────────────────────────────────────────────────────────────────
// 1) Conexión a MongoDB
// ───────────────────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Conectado a MongoDB Atlas"))
  .catch((err) => {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1);
  });

// ───────────────────────────────────────────────────────────────────────────────
// 2) Middlewares
// ───────────────────────────────────────────────────────────────────────────────

app.set("trust proxy", true);
const options = {
  key: fs.readFileSync("./localhost-key.pem"),
  cert: fs.readFileSync("./localhost.pem"),
};
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});
app.get("/registro", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "registro.html"));
});
app.use(mongoSanitize());
app.use(async (req, res, next) => {
  const publicRoutes = [
    "/",
    "/login",
    "/registro",
    "/favicon.ico",
    "/index.html",
    "/login.html",
    "/registro.html",
  ];

  if (
    req.path.startsWith("/css/") ||
    req.path.startsWith("/js/") ||
    req.path.startsWith("/images/") ||
    req.path.startsWith("/uploads/") ||
    req.path.endsWith(".css") ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".png") ||
    req.path.endsWith(".jpg") ||
    req.path.endsWith(".ico") ||
    publicRoutes.includes(req.path)
  ) {
    return next();
  }
  

  const userId = req.header("x-user-id");
  const sessionToken = req.header("x-session-token");

  if (!userId || !sessionToken) {
    return res
      .status(401)
      .json({ error: "No autorizado: Falta token o usuario" });
  }

  try {
    const user = await Usuario.findById(userId);
    if (!user || user.sessionToken !== sessionToken) {
      return res
        .status(401)
        .json({ error: "Sesión inválida o ya iniciada en otro dispositivo" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("❌ Error validando sesión:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// - Jefe

async function enviarAJefes(texto) {
  try {
    const jefes = await Usuario.find({
      rol: "jefe",
      telegramChatId: { $ne: null },
    }).lean();

    for (const jefe of jefes) {
      await sendMessage(jefe.telegramChatId, texto);
    }
  } catch (err) {
    console.error("❌ Error enviando mensaje a jefes:", err);
  }
}

// - Limpiar datos
function sanitizeInput(input) {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

// - JOB
cron.schedule("*/10 * * * *", async () => {
  const now = new Date();
  try {
    const pendientes = await Tarea.find({
      estado: "Pendiente",
      fechaLimite: { $ne: null },
    })
      .populate("analista", "username")
      .lean();
    const jefes = await Usuario.find(
      { rol: "jefe", telegramChatId: { $ne: null } },
      { telegramChatId: 1 },
    ).lean();
    const jefesChats = jefes.map((j) => j.telegramChatId);

    for (const t of pendientes) {
      t.analistaNombre = t.analista?.username || "Sin asignar";
      const color = getStatusClass(t, now);

      if (color === "status-yellow" && !t.proximaNotificada) {
        try {
          const analista = await Usuario.findById(t.analista, {
            telegramChatId: 1,
          }).lean();
          if (analista?.telegramChatId)
            await sendMessage(analista.telegramChatId, msgProxima(t, now));
          for (const chat of jefesChats)
            await sendMessage(chat, msgProxima(t, now));
          await Tarea.updateOne(
            { _id: t._id },
            { $set: { proximaNotificada: true } },
          );
        } catch (e) {
          console.warn("⚠️ Aviso proxima falló:", e.message);
        }
      }

      if (color === "status-red" && !t.vencidaNotificada) {
        try {
          const analista = await Usuario.findById(t.analista, {
            telegramChatId: 1,
          }).lean();
          if (analista?.telegramChatId)
            await sendMessage(analista.telegramChatId, msgVencida(t, now));
          for (const chat of jefesChats)
            await sendMessage(chat, msgVencida(t, now));
          await Tarea.updateOne(
            { _id: t._id },
            { $set: { vencidaNotificada: true } },
          );
        } catch (e) {
          console.warn("⚠️ Aviso vencida falló:", e.message);
        }
      }
    }
  } catch (err) {
    console.error("❌ Cron avisos error:", err);
  }
});

// — Registro
app.post("/registro", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
  if (!regex.test(password)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener ≥8 caracteres, incluir letra, número y carácter especial.",
    });
  }
  try {
    if (await Usuario.findOne({ username })) {
      return res
        .status(400)
        .json({ error: "El nombre de usuario ya está en uso" });
    }
    const hash = await bcrypt.hash(password, 10);
    const nuevo = new Usuario({ username, password: hash, rol: "analista" });
    await nuevo.save();

    const xff = (req.headers["x-forwarded-for"] || "").toString();
    const ip =
      xff.split(",")[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      "desconocida";
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: nuevo._id,
      accion: "Registro de usuario",
      descripcion: `Nuevo registro de usuario: ${username}`,
      ip,
      ruta,
    });

    return res
      .status(201)
      .json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    console.error("❌ Error en POST /registro:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Login
app.post("/login", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
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
        accion: "Login fallido",
        descripcion: `Intento de login con usuario inexistente: ${username}`,
        ip,
        ruta,
      });
      return res
        .status(400)
        .json({ error: "Usuario o contraseña incorrectos" });
    }

    // Verificar si la cuenta está bloqueada
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);

      // Auditoría: intento con cuenta bloqueada
      await Auditoria.create({
        usuario: user._id,
        accion: "Intento con cuenta bloqueada",
        descripcion: `Login bloqueado para usuario: ${username}`,
        ip,
        ruta,
      });

      return res.status(403).json({
        error: `Cuenta bloqueada. Intenta de nuevo en ${minutesLeft} min.`,
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
        accion: "Login fallido",
        descripcion: `Contraseña incorrecta para usuario: ${username}`,
        ip,
        ruta,
      });

      return res.status(400).json({
        error: "Usuario o contraseña incorrectos",
      });
    }
    user.loginAttempts = 0;
    user.lockUntil = null;
    const crypto = require("crypto");
    const sessionToken = crypto.randomBytes(32).toString("hex");
    user.sessionToken = sessionToken;
    await user.save();
    await Auditoria.create({
      usuario: user._id,
      accion: "Login exitoso",
      descripcion: `Usuario ${username} inició sesión correctamente.`,
      ip,
      ruta,
    });

    return res.json({
      message: "Login exitoso",
      user: {
        id: user._id,
        username: user.username,
        rol: user.rol,
        sessionToken,
      },
    });
  } catch (err) {
    console.error("❌ Error en POST /login:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});


// - RESET PASSWORD

const crypto = require("crypto");

app.post("/reset-password", async (req, res) => {
  const ip =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  const ruta = req.originalUrl;

  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      error: "Todos los campos son obligatorios",
    });
  }

  // Validar contraseña
  const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  if (!regex.test(password)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener ≥8 caracteres, incluir letra, número y carácter especial.",
    });
  }

  try {
    // Buscar usuario con token válido
    const user = await Usuario.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        error: "Token inválido o expirado",
      });
    }

    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;

    // Limpiar token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Reiniciar bloqueos
    user.loginAttempts = 0;
    user.lockUntil = null;

    await user.save();

    // Auditoría
    await Auditoria.create({
      usuario: user._id,
      accion: "Restablecimiento de contraseña",
      descripcion: `El usuario ${user.username} restableció su contraseña correctamente.`,
      ip,
      ruta,
    });

    return res.json({
      message: "Contraseña restablecida correctamente",
    });
  } catch (err) {
    console.error("❌ Error en POST /reset-password:", err);

    return res.status(500).json({
      error: "Error en el servidor",
    });
  }
});

/* --------------------------------------------------------------------------
   FORGOT PASSWORD
-------------------------------------------------------------------------- */
app.post("/forgot-password", async (req, res) => {
  const ip =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  const ruta = req.originalUrl;

  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      error: "El usuario es obligatorio",
    });
  }

  try {
    const user = await Usuario.findOne({ username });

    // Respuesta genérica por seguridad
    if (!user) {
      return res.json({
        message:
          "Si el usuario existe, se enviarán las instrucciones.",
      });
    }

    // Generar token
    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = resetToken;

    // Expira en 30 minutos
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000;

    await user.save();

    // URL recuperación
    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/reset-password?token=${resetToken}`;

    /*
      AQUÍ ENVÍAS EL CORREO
      Ejemplo con nodemailer
    */

    console.log("🔗 Link recuperación:", resetUrl);

    // Auditoría
    await Auditoria.create({
      usuario: user._id,
      accion: "Solicitud recuperación contraseña",
      descripcion: `El usuario ${user.username} solicitó recuperación de contraseña.`,
      ip,
      ruta,
    });

    return res.json({
      message:
        "Si el usuario existe, se enviarán las instrucciones.",
    });
  } catch (err) {
    console.error("❌ Error en POST /forgot-password:", err);

    return res.status(500).json({
      error: "Error en el servidor",
    });
  }
});

// - logout
app.post("/logout", async (req, res) => {
  const userId = req.header("x-user-id");

  if (!userId) {
    return res.status(400).json({ error: "Usuario no identificado" });
  }

  try {
    await Usuario.findByIdAndUpdate(userId, { sessionToken: null });
    return res.json({ message: "Sesion cerrada exitosamente" });
  } catch (err) {
    console.error("❌ Error en POST /logout:", err);
    return res.status(500).json({ error: "Error cerrando sesion" });
  }
});

// — Listar usuarios
app.get("/usuarios", async (req, res) => {
  try {
    const raw = await Usuario.find().lean();
    const uniqueMap = new Map(raw.map((u) => [u._id.toString(), u]));
    const usuarios = Array.from(uniqueMap.values());
    return res.json(usuarios);
  } catch (err) {
    console.error("❌ Error en GET /usuarios:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Editar rol de usuario
app.put("/usuarios/:id", async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;
  if (!["analista", "jefe", "admin"].includes(rol)) {
    return res.status(400).json({ error: "Rol inválido" });
  }
  try {
    const user = await Usuario.findByIdAndUpdate(id, { rol }, { new: true });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ message: "Rol actualizado", user });
  } catch (err) {
    console.error("❌ Error en PUT /usuarios/:id:", err);
    return res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

// — Resetear contraseña
app.put("/usuarios/:id/reset-password", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.trim().length < 6) {
      return res
        .status(400)
        .json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const user = await Usuario.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Hashear la nueva contraseña
    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    await user.save();

    return res.json({ message: "Contraseña restablecida correctamente" });
  } catch (err) {
    console.error("Error en reset-password:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Activar / Inactivar usuario
app.put("/usuarios/:id/:action(activar|inactivar)", async (req, res) => {
  const { id, action } = req.params;
  try {
    const u = await Usuario.findByIdAndUpdate(
      id,
      { isActive: action === "activar" },
      { new: true },
    );
    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ message: `Usuario ${action}do`, user: u });
  } catch (err) {
    console.error(`❌ Error en PUT /usuarios/:id/${action}:`, err);
    return res.status(500).json({ error: `Error al ${action} usuario` });
  }
});

// — Obtener analistas
app.get("/analistas", async (req, res) => {
  try {
    const analistas = await Usuario.find({ rol: "analista" }, "username");
    return res.json(analistas);
  } catch (err) {
    console.error("❌ Error en GET /analistas:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// - Actualizar chatt de Telegram del usuario
app.put("/usuarios/:id/telegram", async (req, res) => {
  try {
    const { id } = req.params;
    const { telegramChatId, telegramUsername } = req.body || {};

    const isSelf = String(req.user._id) === String(id);
    if (!isSelf && !["admin", "jefe"].includes(req.user.rol)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const update = {};
    if (telegramChatId !== undefined)
      update.telegramChatId = telegramChatId?.trim() || null;
    if (telegramUsername !== undefined)
      update.telegramUsername = telegramUsername?.trim() || null;

    const user = await Usuario.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    return res.json({
      message: "Telegram actualizado",
      user: {
        id: user._id,
        username: user.username,
        telegramChatId: user.telegramChatId,
        telegramUsername: user.telegramUsername,
      },
    });
  } catch (err) {
    console.error("❌ Error en PUT /usuarios/:id/telegram:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Genera Informe tareas
app.get("/tareas/informe", async (req, res) => {
  const { fechaInicio, fechaFin, analista, estado } = req.query;
  const filtro = {};
  if (analista) filtro.analista = analista;
  if (estado) filtro.estado = estado;
  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin) filtro.fechaHora.$lte = new Date(fechaFin + "T23:59:59");
  }
  try {
    const tareas = await Tarea.find(filtro)
      .populate("analista", "username")
      .lean();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tareas");
    ws.columns = [
      { header: "Título", key: "titulo" },
      { header: "Descripción", key: "descripcion" },
      { header: "Analista", key: "analista" },
      { header: "FechaHora", key: "fechaHora" },
      { header: "FechaLímite", key: "fechaLimite" },
      { header: "Ticket", key: "ticket" },
      { header: "Placa", key: "placa" },
      { header: "Estado", key: "estado" },
    ];
    tareas.forEach((t) =>
      ws.addRow({
        titulo: t.titulo,
        descripcion: t.descripcion,
        analista: t.analista.username,
        fechaHora: new Date(t.fechaHora).toLocaleString(),
        fechaLimite: t.fechaLimite.toISOString().slice(0, 10),
        ticket: t.ticket,
        placa: t.placa,
        estado: t.estado || "Pendiente",
      }),
    );
    ws.columns.forEach((col) => {
      let max = col.header.length;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const v = (cell.value || "").toString();
        if (v.length > max) max = v.length;
      });
      col.width = max + 2;
    });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Informe_Tareas_${fechaInicio || "desde"}_${fechaFin || "hasta"}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error en GET /tareas/informe:", err);
    res.status(500).json({ error: "Error generando informe" });
  }
});

// — Genera Informe tareas
app.get("/equipos/informe", async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    const filtro = {};

    if (fechaInicio || fechaFin) {
      filtro.createdAt = {};
      if (fechaInicio) filtro.createdAt.$gte = new Date(fechaInicio);
      if (fechaFin) filtro.createdAt.$lte = new Date(fechaFin + "T23:59:59");
    }

    const equipos = await Equipo.find(filtro).lean();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Mantenimiento");

    ws.columns = [
      { header: "Nombre", key: "nombre" },
      { header: "Descripción", key: "descripcion" },
      { header: "Estado", key: "estado" },
      { header: "Fecha Creación", key: "fecha" },
    ];

    equipos.forEach((e) => {
      ws.addRow({
        nombre: e.nombre,
        descripcion: e.descripcion,
        estado: e.estado,
        fecha: new Date(e.createdAt).toLocaleDateString(),
      });
    });

    // Auto tamaño columnas
    ws.columns.forEach((col) => {
      let max = col.header.length;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const v = (cell.value || "").toString();
        if (v.length > max) max = v.length;
      });
      col.width = max + 2;
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Informe_Mantenimiento.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("❌ Error informe mantenimiento:", err);
    res.status(500).json({ error: "Error generando informe" });
  }
});

/* --------------------------------------------------------------------------
   INFORME MANTENIMIENTOS
-------------------------------------------------------------------------- */

app.get("/equipos/informe", async (req, res) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      estado,
    } = req.query;

    /* ----------------------------------------------------------------------
       FILTROS
    ---------------------------------------------------------------------- */

    const filtro = {};

    // Filtro fechas
    if (fechaInicio || fechaFin) {
      filtro.createdAt = {};

      if (fechaInicio) {
        filtro.createdAt.$gte = new Date(fechaInicio);
      }

      if (fechaFin) {
        filtro.createdAt.$lte = new Date(
          fechaFin + "T23:59:59"
        );
      }
    }

    // Filtro estado
    if (estado) {
      filtro.estado = estado;
    }

    /* ----------------------------------------------------------------------
       CONSULTA
    ---------------------------------------------------------------------- */

    const equipos = await Equipo.find(filtro)
      .populate("usuario", "username")
      .sort({ createdAt: -1 })
      .lean();

    /* ----------------------------------------------------------------------
       EXCEL
    ---------------------------------------------------------------------- */

    const wb = new ExcelJS.Workbook();

    wb.creator = "Sistema";

    wb.created = new Date();

    const ws = wb.addWorksheet("Mantenimientos");

    /* ----------------------------------------------------------------------
       COLUMNAS
    ---------------------------------------------------------------------- */

    ws.columns = [
      {
        header: "ID",
        key: "_id",
        width: 30,
      },
      {
        header: "Equipo",
        key: "nombre",
        width: 30,
      },
      {
        header: "Descripción",
        key: "descripcion",
        width: 45,
      },
      {
        header: "Estado",
        key: "estado",
        width: 20,
      },
      {
        header: "Analista",
        key: "usuario",
        width: 25,
      },
      {
        header: "Fecha Creación",
        key: "fecha",
        width: 22,
      },
    ];

    /* ----------------------------------------------------------------------
       ESTILOS HEADER
    ---------------------------------------------------------------------- */

    const headerRow = ws.getRow(1);

    headerRow.font = {
      bold: true,
      color: { argb: "FFFFFF" },
      size: 12,
    };

    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1E40AF" },
    };

    /* ----------------------------------------------------------------------
       FILAS
    ---------------------------------------------------------------------- */

    equipos.forEach((e) => {
      ws.addRow({
        _id: e._id.toString(),
        nombre: e.nombre || "N/A",
        descripcion: e.descripcion || "N/A",
        estado: e.estado || "N/A",
        usuario: e.usuario?.username || "Sin asignar",
        fecha: e.createdAt
          ? new Date(e.createdAt).toLocaleString()
          : "N/A",
      });
    });

    /* ----------------------------------------------------------------------
       BORDES
    ---------------------------------------------------------------------- */

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
      });
    });

    /* ----------------------------------------------------------------------
       FILTRO AUTOMÁTICO
    ---------------------------------------------------------------------- */

    ws.autoFilter = {
      from: "A1",
      to: "F1",
    };

    /* ----------------------------------------------------------------------
       RESPONSE
    ---------------------------------------------------------------------- */

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Informe_Mantenimientos.xlsx`
    );

    await wb.xlsx.write(res);

    res.end();

  } catch (err) {
    console.error("❌ Error generando informe:", err);

    res.status(500).json({
      error: "Error generando informe",
    });
  }
});

/* --------------------------------------------------------------------------
   INFORME MANTENIMIENTOS
-------------------------------------------------------------------------- */

app.get("/equipos/informe", async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    const filtro = {};

    if (fechaInicio || fechaFin) {
      filtro.createdAt = {};

      if (fechaInicio) {
        filtro.createdAt.$gte = new Date(fechaInicio);
      }

      if (fechaFin) {
        filtro.createdAt.$lte = new Date(
          fechaFin + "T23:59:59"
        );
      }
    }

    const equipos = await Equipo.find(filtro)
      .populate("usuario", "username")
      .lean();

    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet("Mantenimientos");

    /* ----------------------------------------------------------------------
       COLUMNAS
    ---------------------------------------------------------------------- */

    ws.columns = [
      {
        header: "ID",
        key: "_id",
        width: 28,
      },
      {
        header: "Equipo",
        key: "nombre",
        width: 30,
      },
      {
        header: "Descripción",
        key: "descripcion",
        width: 45,
      },
      {
        header: "Estado",
        key: "estado",
        width: 20,
      },
      {
        header: "Analista",
        key: "usuario",
        width: 25,
      },
      {
        header: "Fecha Creación",
        key: "fecha",
        width: 20,
      },
    ];

    /* ----------------------------------------------------------------------
       HEADER STYLE
    ---------------------------------------------------------------------- */

    ws.getRow(1).font = {
      bold: true,
      color: { argb: "FFFFFF" },
    };

    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "2563EB" },
    };

    ws.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    /* ----------------------------------------------------------------------
       DATA
    ---------------------------------------------------------------------- */

    equipos.forEach((e) => {
      ws.addRow({
        _id: e._id.toString(),
        nombre: e.nombre || "N/A",
        descripcion: e.descripcion || "N/A",
        estado: e.estado || "N/A",
        usuario: e.usuario?.username || "Sin asignar",
        fecha: e.createdAt
          ? new Date(e.createdAt).toLocaleDateString()
          : "N/A",
      });
    });

    /* ----------------------------------------------------------------------
       BORDES
    ---------------------------------------------------------------------- */

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    /* ----------------------------------------------------------------------
       RESPONSE
    ---------------------------------------------------------------------- */

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Informe_Mantenimientos.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await wb.xlsx.write(res);

    res.end();
  } catch (err) {
    console.error("❌ Error informe mantenimiento:", err);

    res.status(500).json({
      error: "Error generando informe",
    });
  }
});

// — Notificaciones
app.get("/notificaciones", async (req, res) => {
  try {
    const userId = req.header("x-user-id");
    if (!userId)
      return res.status(400).json({ error: "Usuario no identificado" });
    const asignadas = await Tarea.find({
      analista: userId,
      estado: "Pendiente",
    });
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const completadas = await Tarea.find({
      analista: userId,
      estado: "Finalizado",
      updatedAt: { $gte: ayer },
    });
    const ahora = new Date();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const porVencer = await Tarea.find({
      analista: userId,
      estado: "Pendiente",
      fechaLimite: { $gte: ahora, $lte: manana },
    });
    return res.json({
      asignadas: asignadas.map((t) => ({ id: t._id, titulo: t.titulo })),
      completadas: completadas.map((t) => ({ id: t._id, titulo: t.titulo })),
      porVencer: porVencer.map((t) => ({ id: t._id, titulo: t.titulo })),
    });
  } catch (err) {
    console.error("❌ Error en GET /notificaciones:", err);
    return res.status(500).json({ error: "Error obteniendo notificaciones" });
  }
});


// - Ampliar fechas
app.put("/tareas/ampliar-fecha/:id", async (req, res) => {
  const user = req.user;
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const ruta = req.originalUrl;

  if (!["admin", "jefe"].includes(user.rol)) {
    return res.status(403).json({ error: "No tienes permisos paraampliar" });
  }

  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });

    const { nuevaFecha } = req.body;
    if (!nuevaFecha)
      return res
        .status(400)
        .json({ error: "Debe proporcionar una nueva fecha" });

    const fechaAnterior = t.fechaLimite;
    t.fechaLimite = nuevaFecha;

    t.historial = t.historial || [];
    t.historial.push({
      accion: "Ampliacion de fecha",
      analista_anterior: t.analista,
      analista_nuevo: t.analista,
      fechaLimite_anterior: fechaAnterior,
      fechaLimite_nueva: nuevaFecha,
      estado_anterior: t.estado,
      estado_nuevo: t.estado,
      observacion: `Ampliada por ${user.username}`,
      fecha: new Date(),
    });

    await t.save();

    await Auditoria.create({
      usuario: user._id,
      accion: `Ampliada por ${user.username}`,
      descripcion: `Tarea ${t._id} ampliada a ${nuevaFecha}`,
      ip,
      ruta,
    });

    try {
      const analistaDoc = await Usuario.findById(t.analista).lean();

      if (analistaDoc?.telegramChatId) {
        await sendMessage(
          analistaDoc.telegramChatId,
          msgAmpliacion(t, nuevaFecha),
        );
      }

      await enviarAJefes(msgAmpliacion(t, nuevaFecha));
    } catch (e) {
      console.warn("⚠️ No se pudo enviar Telegram en ampliación:", e.message);
    }

    return res.json({
      message: "Fecha limite ampliada correctamente",
      tarea: t,
    });
  } catch (err) {
    console.error("❌ Error en PUT /tareas/ampliar-fecha/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Listar tareas
app.get("/tareas", async (req, res) => {
  let { analista, estado, fechaInicio, fechaFin, titulo, placa, ticket } =
    req.query;
  const filtro = {};
  if (analista && Types.ObjectId.isValid(analista)) filtro.analista = analista;
  if (estado) filtro.estado = estado;
  if (titulo) filtro.titulo = { $regex: titulo, $options: "i" };
  if (placa) filtro.placa = { $regex: placa, $options: "i" };
  if (ticket) filtro.ticket = { $regex: ticket, $options: "i" };
  if (fechaInicio || fechaFin) {
    filtro.fechaHora = {};
    if (fechaInicio) filtro.fechaHora.$gte = new Date(fechaInicio);
    if (fechaFin) filtro.fechaHora.$lte = new Date(fechaFin + "T23:59:59");
  }
  try {
    const tareas = await Tarea.find(filtro)
      .sort({ fechaHora: -1, _id: -1 })
      .populate("analista", "username")
      .lean();

    return res.json(tareas);
  } catch (err) {
    console.error("❌ Error en GET /tareas:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Obtener detalle de tarea
app.get("/tareas/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json({ error: "ID de tarea inválido o no proporcionado" });
  }

  try {
    const t = await Tarea.findById(id).lean();
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
    return res.json(t);
  } catch (err) {
    console.error("❌ Error en GET /tareas/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Crear tarea
app.post("/tareas", async (req, res) => {
  const {
    titulo,
    descripcion,
    fechaHora,
    analista,
    fechaLimite,
    ticket,
    placa,
    observacion,
  } = req.body || {};

  const sanitizedTitulo = sanitizeInput(titulo);
  const sanitizedDescripcion = sanitizeInput(descripcion);
  const sanitizedTicket = sanitizeInput(ticket);
  const sanitizedPlaca = sanitizeInput(placa);
  const sanitizedObservacion = sanitizeInput(observacion);

  if (
    !sanitizedTitulo ||
    !sanitizedDescripcion ||
    !sanitizedObservacion ||
    !fechaHora ||
    !analista ||
    !fechaLimite ||
    !ticket ||
    !placa
  ) {
    return res
      .status(400)
      .json({ error: "Todos los campos obligatorios deben estar completos" });
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
      observacion: sanitizedObservacion,
      creadaPor: req.user.username,
    });
    await nuevaTarea.save();

    // Auditoría
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    const ip =
      xff.split(",")[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      "desconocida";
    const ruta = req.originalUrl;

    await Auditoria.create({
      usuario: req.user._id,
      accion: "Creación de tarea",
      descripcion: `Tarea creada: ${sanitizedTitulo}`,
      ip,
      ruta,
    });

    try {
      const creador = req.user.username;
      const analistaDoc = await Usuario.findById(analista).lean();

      if (analistaDoc?.telegramChatId) {
        await sendMessage(
          analistaDoc.telegramChatId,
          msgNuevaAsignacion(nuevaTarea, creador, analistaDoc.username),
        );
      }

      // enviar a jefes
      await enviarAJefes(
        msgNuevaAsignacion(nuevaTarea, creador, analistaDoc.username),
      );
    } catch (e) {
      console.warn("⚠️ No se pudo enviar Telegram en creación:", e.message);
    }

    return res
      .status(201)
      .json({ message: "Tarea creada correctamente", tarea: nuevaTarea });
  } catch (err) {
    console.error("❌ Error en POST /tareas:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// =========================================================
// GENERAR PLAN MENSUAL DE MANTENIMIENTO
// =========================================================
app.post("/mantenimiento/plan/generar", async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    const { analistas } = req.body;

    if (!year || year < 2000 || year > 2100) {
      return res.status(400).json({ error: "Año inválido" });
    }

    if (!month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Mes inválido" });
    }

    if (!Array.isArray(analistas) || analistas.length === 0) {
      return res.status(400).json({
        error: "Debe seleccionar al menos un analista",
      });
    }

    const fechaInicio = new Date(year, month - 1, 1, 0, 0, 0);
    const fechaFin = new Date(year, month, 0, 23, 59, 59);

    //  evitar duplicar plan del mes
    const existePlan = await Tarea.exists({
      tipo: "mantenimiento",
      fechaInicio,
      fechaLimite: fechaFin,
    });

    if (existePlan) {
      return res.status(409).json({
        error: "Ya existe un plan para este mes",
      });
    }

    //  TODOS los equipos
    const equiposDB = await Equipo.find({
      proximoMantenimiento: { $ne: null },
    }).lean();

    //  ordenar por prioridad (vencidos primero)
    equiposDB.sort(
      (a, b) =>
        new Date(a.proximoMantenimiento) - new Date(b.proximoMantenimiento),
    );

    //  equipos que YA tienen tarea
    const equiposConTarea = await Tarea.find({
      tipo: "mantenimiento",
      creadaPorPlanMensual: true,
    }).distinct("equipo");

    const equiposDisponibles = equiposDB.filter(
      (eq) => !equiposConTarea.includes(eq._id.toString()),
    );

    if (!equiposDisponibles.length) {
      return res.json({
        analistas: [],
        total: {
          totalEquiposElegibles: 0,
          creadasEsteMes: 0,
          sobrantesParaProximoMes: 0,
        },
      });
    }

    //  dividir en 12 meses
    const equiposPorMes = Math.ceil(equiposDisponibles.length / 12);

    const inicio = (month - 1) * equiposPorMes;
    const fin = inicio + equiposPorMes;

    const equiposMes = equiposDisponibles.slice(inicio, fin);

    //  crear tareas sin duplicar
    let idx = 0;
    const tareasCreadas = [];

    for (const equipo of equiposMes) {
      const analistaAsignadoId = analistas[idx % analistas.length];
      idx++;

      const placaLimpia = (equipo.placa || "").toString().trim();
      const placaTexto = placaLimpia ? `- Placa ${placaLimpia}` : "";

      const tarea = await Tarea.create({
        titulo: `Mantenimiento equipo con serial ${
          equipo.serial || "N/A"
        } y placa ${placaLimpia || "N/A"}`,


        descripcion: `Mantenimiento preventivo del equipo con serial ${
          equipo.serial || "N/A"
        } y placa ${placaLimpia || "N/A"}`,

        tipo: "mantenimiento",

        equipo: equipo._id,
        analista: analistaAsignadoId,

        fechaInicio,
        fechaLimite: fechaFin,

        ticket: "",
        placa: placaLimpia,

        estado: "Pendiente",
        creadaPorPlanMensual: true,
      });

      tareasCreadas.push(tarea);
    }

    return res.json({
      analistas: analistas.map((id) => ({ _id: id })),
      total: {
        totalEquiposElegibles: equiposDisponibles.length,
        creadasEsteMes: tareasCreadas.length,
        sobrantesParaProximoMes:
          equiposDisponibles.length - tareasCreadas.length,
      },
    });
  } catch (err) {
    console.error("❌ Error generando plan:", err);
    return res.status(500).json({
      error: "Error interno al generar plan mensual",
    });
  }
});

// -------------------------------
// Resumen para frontend
// ------------------------------

app.get("/ubicaciones/pisos", async (req, res) => {
  try {
    const pisos = await Ubicacion.find({ tipo: "piso" });
    res.json(pisos);
  } catch (err) {
    console.error("Error obteniendo pisos:", err);
    res.status(500).json({ error: "Error obteniendo pisos" });
  }
});

app.get("/ubicaciones/:id/hijos", async (req, res) => {
  try {
    const hijos = await Ubicacion.find({ padre: req.params.id });
    res.json(hijos);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo hijos" });
  }
});

// — Terminar tarea
app.put("/tareas/terminar/:id", async (req, res) => {
  try {
    // 1) Buscar tarea y validar estado
    const t = await Tarea.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
    if (t.estado === "Finalizado") {
      return res.status(400).json({ error: "La tarea ya está finalizada" });
    }

    // 2) Historial y cambio de estado
    const sanitizedObservacion = sanitizeInput(req.body.observacion || "");

    t.observacion = sanitizedObservacion;

    const cambio = {
      accion: "Finalización",
      analista_anterior: t.analista,
      analista_nuevo: t.analista,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva: t.fechaLimite,
      estado_anterior: t.estado,
      estado_nuevo: "Finalizado",
      observacion: sanitizedObservacion,
      fecha: new Date(),
    };

    t.historial = t.historial || [];
    t.historial.push(cambio);
    t.estado = "Finalizado";
    // Si es una tarea de mantenimiento, actualizar el equipo
    try {
      if (t.tipo === "mantenimiento" && t.equipo) {
        const eq = await Equipo.findById(t.equipo);
        if (eq) {
          eq.ultimoMantenimientoFecha = new Date();
          eq.ultimoMantenimientoPor = req.user?._id || null;
          eq.ultimoMantenimientoCambios = (req.body.observacion || "").slice(
            0,
            1000,
          );
          await eq.save();
        }
      }
    } catch (e) {
      console.warn(
        "⚠️ No se pudo actualizar Equipo al finalizar mantenimiento:",
        e.message,
      );
    }

    await t.save();

    const creador = t.creadaPor || "Sistema";
    const analistaDoc = await Usuario.findById(t.analista).lean();
    const cerradoPor = req.user.username;

    await enviarAJefes(
      msgFinalizada(t, cerradoPor, analistaDoc.username, creador),
    );

    // 3) Auditoría
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    const ip =
      xff.split(",")[0].trim() ||
      req.ip ||
      (req.connection && req.connection.remoteAddress) ||
      "desconocida";
    const ruta = req.originalUrl;

    await Auditoria.create({
      usuario: req.user._id,
      accion: "Finalización de tarea",
      descripcion: `Tarea finalizada: ${t.titulo}`,
      ip,
      ruta,
    });

    if (!t.finalizadaNotificada) {
      const closedBy =
        (req.user && (req.user.username || req.user.name)) ||
        (typeof req.user === "string" ? req.user : "Usuario");

      try {
        const [analista, jefes] = await Promise.all([
          Usuario.findById(t.analista, { telegramChatId: 1 }).lean(),
          Usuario.find(
            { rol: "jefe", telegramChatId: { $ne: null } },
            { telegramChatId: 1 },
          ).lean(),
        ]);

        const jobs = [];
        if (analista?.telegramChatId) {
          jobs.push(
            sendMessage(analista.telegramChatId, msgFinalizada(t, closedBy)),
          );
        }
        for (const j of jefes) {
          jobs.push(sendMessage(j.telegramChatId, msgFinalizada(t, closedBy)));
        }
        await Promise.allSettled(jobs);

        await Tarea.updateOne(
          { _id: t._id, finalizadaNotificada: { $ne: true } },
          { $set: { finalizadaNotificada: true } },
        );
      } catch (e) {
        console.warn("⚠️ Aviso finalizada falló:", e.message);
      }
    }

    return res.json({ message: "Tarea finalizada correctamente", tarea: t });
  } catch (err) {
    console.error("❌ Error en PUT /tareas/terminar/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Reasignar tarea
app.put("/tareas/reasignar/:id", async (req, res) => {
  try {
    const t = await Tarea.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    if (t.estado === "Finalizado") {
      return res
        .status(400)
        .json({ error: "No se puede reasignar una tarea finalizada" });
    }

    const { analista_nuevo, fechaLimite, observacion } = req.body;

    // Validar que todos los campos existan y sean válidos
    if (
      typeof analista_nuevo !== "string" ||
      !analista_nuevo.trim() ||
      typeof fechaLimite !== "string" ||
      !fechaLimite.trim() ||
      typeof observacion !== "string" ||
      observacion.trim().length < 5
    ) {
      return res
        .status(400)
        .json({ error: "Faltan campos obligatorios o están vacíos" });
    }

    // Validar que el analista nuevo exista (opcional pero recomendable)
    const analistaExiste = await Usuario.exists({ _id: analista_nuevo });
    if (!analistaExiste) {
      return res
        .status(400)
        .json({ error: "El analista especificado no existe" });
    }

    const sanitizedObservacion = sanitizeInput(observacion);
    const cambio = {
      accion: "Reasignación",
      analista_anterior: t.analista,
      analista_nuevo,
      fechaLimite_anterior: t.fechaLimite,
      fechaLimite_nueva: fechaLimite,
      observacion: sanitizedObservacion,
      fecha: new Date(),
    };

    //Convertir a ObjectId antes de asignar
    const analistaId =
      typeof analista_nuevo === "object" && analista_nuevo._id
        ? analista_nuevo._id
        : analista_nuevo;
    t.analista = new Types.ObjectId(analistaId);
    t.fechaLimite = fechaLimite;
    t.historial = t.historial || [];
    t.historial.push(cambio);

    await t.save();

    // Registro en auditoría
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const ruta = req.originalUrl;

    await Auditoria.create({
      usuario: req.user._id,
      accion: "Reasignación de tarea",
      descripcion: `Tarea reasignada a analista: ${analista_nuevo}`,
      ip,
      ruta,
    });

    const analistaAnterior = await Usuario.findById(
      cambio.analista_anterior,
    ).lean();
    const analistaNuevo = await Usuario.findById(analista_nuevo).lean();

    await enviarAJefes(
      msgReasignacion(
        t,
        analistaAnterior?.username || "Desconocido",
        analistaNuevo?.username || "Desconocido",
      ),
    );
    return res.json({ message: "Tarea reasignada correctamente", tarea: t });
  } catch (err) {
    console.error("❌ Error en PUT /tareas/reasignar/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// — Eliminar tarea
app.delete("/tareas/:id", async (req, res) => {
  try {
    const t = await Tarea.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ error: "Tarea no encontrada" });

    // Auditoría
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const ruta = req.originalUrl;
    await Auditoria.create({
      usuario: req.user._id,
      accion: "Eliminación de tarea",
      descripcion: `Tarea eliminada: ${t.titulo}`,
      ip,
      ruta,
    });

    return res.json({ message: "Tarea eliminada correctamente" });
  } catch (err) {
    console.error("❌ Error en DELETE /tareas/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// - Crear equipo
app.post("/equipos", async (req, res) => {
  try {
    const {
      marca,
      modelo,
      serial,
      placa,
      tipo,
      ubicacion,
      dominio,
      fechaCompra,
      ultimoMantenimientoFecha,
      ultimoMantenimientoPor,
      ultimoMantenimientoCambios,
    } = req.body || {};

    if (
      !marca ||
      !modelo ||
      !serial ||
      !ubicacion ||
      !dominio ||
      !fechaCompra
    ) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const equipo = new Equipo({
      marca,
      modelo,
      serial,
      placa,
      tipo,
      ubicacion,
      dominio,
      fechaCompra,
      ultimoMantenimientoFecha: ultimoMantenimientoFecha || null,
      ultimoMantenimientoPor: ultimoMantenimientoPor || null,
      ultimoMantenimientoCambios: ultimoMantenimientoCambios || "",
    });

    await equipo.save();

    return res.status(201).json({
      message: "Equipo creado",
      equipo,
    });
  } catch (err) {
    console.error("❌ POST /equipos:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Listar equipos
app.get("/equipos", async (_req, res) => {
  try {
    const list = await Equipo.find().sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error("❌ GET /equipos:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// Actualizar equipo
app.put("/equipos/:id", async (req, res) => {
  try {
    const equipo = await Equipo.findById(req.params.id);
    if (!equipo) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    // Actualizar campos permitidos
    Object.assign(equipo, req.body || {});

    await equipo.save();

    return res.json({
      message: "Equipo actualizado",
      equipo,
    });
  } catch (err) {
    console.error("❌ PUT /equipos/:id:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Eliminar equipo
app.delete("/equipos/:id", async (req, res) => {
  try {
    const e = await Equipo.findByIdAndDelete(req.params.id);
    if (!e) return res.status(404).json({ error: "Equipo no encontrado" });
    return res.json({ message: "Equipo eliminado" });
  } catch (err) {
    console.error("❌ DELETE /equipos/:id:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// Generar plan de mantenimiento (calculado desde el esquema)
app.get("/equipos/proximos", async (req, res) => {
  try {
    const hoy = new Date();

    const equipos = await Equipo.find({
      proximoMantenimiento: {
        $lte: new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()),
      },
    })
      .sort({ proximoMantenimiento: 1 })
      .lean();

    return res.json(equipos);
  } catch (err) {
    console.error("❌ GET /equipos/proximos:", err);
    return res
      .status(500)
      .json({ error: "Error generando plan de mantenimiento" });
  }
});

app.get("/ubicaciones/pisos", async (_req, res) => {
  try {
    const pisos = await Ubicacion.find({
      tipo: "piso",
      activa: true,
    })
      .sort({ nombre: 1 })
      .lean();

    res.json(pisos);
  } catch (err) {
    console.error("❌ GET /ubicaciones/pisos:", err);
    res.status(500).json({ error: "Error obteniendo pisos" });
  }
});

app.get("/ubicaciones/:id/hijos", async (req, res) => {
  try {
    const hijos = await Ubicacion.find({
      padre: req.params.id,
      activa: true,
    })
      .sort({ nombre: 1 })
      .lean();

    res.json(hijos);
  } catch (err) {
    console.error("❌ GET /ubicaciones/:id/hijos:", err);
    res.status(500).json({ error: "Error obteniendo ubicaciones hijas" });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// 5) Arrancar el servidor
// ───────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en puerto ${port}`);
});