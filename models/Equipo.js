const mongoose = require("mongoose");

const equipoSchema = new mongoose.Schema(
  {
    marca: { type: String, required: true, trim: true },
    modelo: { type: String, required: true, trim: true },
    serial: { type: String, unique: true, sparse: true },
    placa: { type: String, trim: true },

    tipo: { type: String, trim: true },
    ubicacion: {
      piso: {
        type: String,
        required: true,
      },
      area: {
        type: String,
        required: true,
      },
      subarea: {
        type: String,
        default: null,
      },
    },
    dominio: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: "" },
    fechaCompra: { type: Date, required: true },

    ultimoMantenimientoFecha: { type: Date, default: null },
    ultimoMantenimientoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
    ultimoMantenimientoCambios: { type: String, default: "" },

    proximoMantenimiento: { type: Date, index: true },
  },
  { timestamps: true },
);

function calcularProximo(fechaCompra, ultimo) {
  const compra = new Date(fechaCompra);

  if (ultimo) {
    const ultimoDate = new Date(ultimo);

    // 🟢 CASO 1: Primer mantenimiento (nuevo equipo)
    if (ultimoDate.getTime() === compra.getTime()) {
      const primer = new Date(compra);
      primer.setFullYear(primer.getFullYear() + 1);
      return primer;
    }

    // 🔵 CASO 2: Ya tuvo mantenimiento real → +6 meses
    const siguiente = new Date(ultimoDate);
    siguiente.setMonth(siguiente.getMonth() + 6);
    return siguiente;
  }

  // Si por alguna razón no hay ultimo mantenimiento
  const base = new Date(compra);
  base.setFullYear(base.getFullYear() + 1);
  return base;
}

equipoSchema.pre("save", function (next) {
  this.proximoMantenimiento = calcularProximo(
    this.fechaCompra,
    this.ultimoMantenimientoFecha
  );
  next();
});

module.exports = mongoose.model("Equipo", equipoSchema);
