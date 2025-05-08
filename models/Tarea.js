const mongoose = require('mongoose');

const tareaSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    fechaHora: { type: Date, default: Date.now },
    analista: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    fechaLimite: { type: Date, required: true, index: true },
    ticket: { type: String, trim: true },
    placa: { type: String, trim: true },
    observacion: { type: String, trim: true },
    estado: { 
        type: String, 
        enum: ["Pendiente", "En Progreso", "Finalizado"], 
        default: "Pendiente" 
    },
    historial: [{
        accion: { type: String, required: true },
        analista_anterior: { type: mongoose.Schema.Types.ObjectId, ref: 'Analista' },
        analista_nuevo: { type: mongoose.Schema.Types.ObjectId, ref: 'Analista' },
        fechaLimite_anterior: { type: Date },
        fechaLimite_nueva: { type: Date },
        estado_anterior: { type: String, enum: ["Pendiente", "En Progreso", "Finalizado"] },
        estado_nuevo: { type: String, enum: ["Pendiente", "En Progreso", "Finalizado"] },
        observacion: { type: String, trim: true },
        fecha: { type: Date, default: Date.now },
    }]
}, {
    timestamps: true  // Agrega createdAt y updatedAt automáticamente
});

// Índice compuesto para consultas rápidas
tareaSchema.index({ analista: 1, estado: 1 });

module.exports = mongoose.model('Tarea', tareaSchema);
