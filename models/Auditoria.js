const mongoose = require('mongoose')
const Usuario = require('./Usuario')
const { Types } = require('mysql2')

const auditoriaSchema = new mongoose.Schema({
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    accion: { type: String, required: true },
    descripcion: { type: String },
    fecha: { type: Date, default: Date.now },
    ip: { type: String},
    ruta: { type: String}
}, {
    timestamps: true
});

module.exports = mongoose.model('Auditoria', auditoriaSchema);