const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'jhonbarbosa',
    password: 'DUko2806*',
    database: 'entregas_turnos'
});

db.connect(err => {
    if (err) {
        console.error('❌ Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('✅ Conectado a MySQL');
});

// Crear tablas si no existen
const createTables = [
    `CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol ENUM('admin', 'analista') DEFAULT 'analista'
    );`,
    `CREATE TABLE IF NOT EXISTS tareas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT NOT NULL,
        fecha_hora DATETIME NOT NULL,
        analista VARCHAR(255) NOT NULL,
        fecha_limite DATE NOT NULL,
        ticket VARCHAR(50) NOT NULL,
        placa VARCHAR(50) NOT NULL,
        observacion TEXT,
        estado ENUM('Pendiente', 'Terminada') DEFAULT 'Pendiente'
    );`,
    `CREATE TABLE IF NOT EXISTS historial_tareas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tarea_id INT NOT NULL,
        accion VARCHAR(50) NOT NULL,
        analista_anterior VARCHAR(255),
        analista_nuevo VARCHAR(255),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tarea_id) REFERENCES tareas(id)
    );`
];

createTables.forEach(query => {
    db.query(query, (err) => {
        if (err) {
            console.error('❌ Error al crear tablas:', err);
        }
    });
});

// Ruta para el login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    db.query("SELECT id, username, password FROM usuarios WHERE username = ?", [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        res.status(200).json({ message: "Inicio de sesión exitoso", user: { id: user.id, username: user.username } });
    });
});

// Ruta para obtener analistas
app.get('/analistas', (req, res) => {
    db.query("SELECT username FROM usuarios WHERE rol = 'analista'", (err, results) => {
        if (err) return res.status(500).json({ error: "Error al obtener analistas" });
        res.status(200).json(results);
    });
});

// Ruta para guardar tareas
app.post('/tareas', (req, res) => {
    const { titulo, descripcion, fechaHora, analista, fechaLimite, ticket, placa, observacion } = req.body;

    if (!titulo || !descripcion || !fechaHora || !analista || !fechaLimite || !ticket || !placa) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    db.query(`
        INSERT INTO tareas (titulo, descripcion, fecha_hora, analista, fecha_limite, ticket, placa, observacion) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [titulo, descripcion, fechaHora, analista, fechaLimite, ticket, placa, observacion], 
        (err, result) => {
            if (err) {
                console.error("Error al guardar tarea:", err);
                return res.status(500).json({ error: "Error al guardar tarea" });
            }
            res.status(201).json({ message: "Tarea guardada correctamente", id: result.insertId });
        }
    );
});

// Ruta para obtener tareas
app.get('/tareas', (req, res) => {
    db.query("SELECT * FROM tareas", (err, results) => {
        if (err) return res.status(500).json({ error: "Error al obtener tareas" });
        res.status(200).json(results);
    });
});

// Ruta para obtener detalles de una tarea específica
app.get('/tareas/:id', (req, res) => {
    const tareaId = req.params.id;
    db.query("SELECT * FROM tareas WHERE id = ?", [tareaId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: "Tarea no encontrada" });
        }
        res.status(200).json(results[0]);
    });
});

// Ruta para terminar una tarea
app.put('/tareas/terminar/:id', (req, res) => {
    const tareaId = req.params.id;
    db.query("UPDATE tareas SET estado = 'Terminada' WHERE id = ?", [tareaId], (err) => {
        if (err) {
            console.error("Error al terminar la tarea:", err);
            return res.status(500).json({ error: "Error al terminar la tarea" });
        }
        db.query("INSERT INTO historial_tareas (tarea_id, accion) VALUES (?, 'Terminada')", [tareaId], (err) => {
            if (err) {
                console.error("Error al guardar historial:", err);
                return res.status(500).json({ error: "Error al guardar historial" });
            }
            res.status(200).json({ message: "Tarea terminada correctamente" });
        });
    });
});

// Ruta para reasignar una tarea
app.put('/tareas/reasignar/:id', (req, res) => {
    const tareaId = req.params.id;
    const { analista, fechaLimite, observacion } = req.body; // Agregar observación

    if (!analista || !fechaLimite) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Verificar si la tarea está terminada
    db.query("SELECT estado FROM tareas WHERE id = ?", [tareaId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: "Tarea no encontrada" });
        }

        const tarea = results[0];
        if (tarea.estado === 'Terminada') {
            return res.status(400).json({ error: "No se puede reasignar una tarea terminada" });
        }

        // Reasignar la tarea si no está terminada
        db.query("UPDATE tareas SET analista = ?, fecha_limite = ? WHERE id = ?", [analista, fechaLimite, tareaId], (err) => {
            if (err) {
                console.error("Error al reasignar tarea:", err);
                return res.status(500).json({ error: "Error al reasignar tarea" });
            }
            db.query(
                "INSERT INTO historial_tareas (tarea_id, accion, analista_anterior, analista_nuevo, observacion) VALUES (?, 'Reasignada', (SELECT analista FROM tareas WHERE id = ?), ?, ?)",
                [tareaId, tareaId, analista, observacion], // Incluir observación
                (err) => {
                    if (err) {
                        console.error("Error al guardar historial:", err);
                        return res.status(500).json({ error: "Error al guardar historial" });
                    }
                    res.status(200).json({ message: "Tarea reasignada correctamente" });
                }
            );
        });
    });
});

// Ruta para obtener el historial de cambios de una tarea
app.get('/historial-tareas/:id', (req, res) => {
    const tareaId = req.params.id;
    db.query("SELECT * FROM historial_tareas WHERE tarea_id = ?", [tareaId], (err, results) => {
        if (err) {
            console.error("Error al obtener el historial de cambios:", err);
            return res.status(500).json({ error: "Error al obtener el historial de cambios" });
        }
        res.status(200).json(results);
    });
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});