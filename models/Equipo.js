const mongoose = require('mongoose');

const equipoSchema = new mongoose.Schema({
  marca:   { type: String, required: true, trim: true },
  modelo:  { type: String, required: true, trim: true },
  serial:  { type: String, required: true, unique: true, trim: true },
  placa:   { type: String, trim: true },
  nombre:  { type: String, required: true, trim: true },

  fechaCompra: { type: Date, required: true },

  // Historial último mantenimiento
  ultimoMantenimientoFecha:  { type: Date, default: null },
  ultimoMantenimientoPor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  ultimoMantenimientoCambios:{ type: String, default: '' },

  // Proyección (siguiente programado)
  proximoMantenimiento: { type: Date, index: true },
}, { timestamps: true });

/**
 * Regla:
 * - 1er año desde la compra: SIN mantenimiento
 * - Luego, cada 6 meses
 * - Si existe último mantenimiento => próximo = último + 6m
 */
function calcularProximo(fechaCompra, ultimo) {
  if (ultimo) {
    const d = new Date(ultimo);
    d.setMonth(d.getMonth() + 6);
    return d;
  }
  const base = new Date(fechaCompra);
  base.setFullYear(base.getFullYear() + 1); // 1 año sin mantenimiento
  return base; // primer mantenimiento al año
}

equipoSchema.pre('save', function(next) {
  this.proximoMantenimiento = calcularProximo(this.fechaCompra, this.ultimoMantenimientoFecha);
  next();
});

equipoSchema.methods.recalcularProximo = function() {
  this.proximoMantenimiento = calcularProximo(this.fechaCompra, this.ultimoMantenimientoFecha);
  return this.proximoMantenimiento;
};

module.exports = mongoose.model('Equipo', equipoSchema);
