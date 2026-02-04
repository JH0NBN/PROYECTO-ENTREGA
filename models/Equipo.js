const mongoose = require("mongoose");

const equipoSchema = new mongoose.Schema(
  {
    marca: { type: String, required: true, trim: true },
    modelo: { type: String, required: true, trim: true },
    serial: { type: String, required: true, unique: true, trim: true },
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
  if (ultimo) {
    const d = new Date(ultimo);
    d.setMonth(d.getMonth() + 6);
    return d;
  }
  const base = new Date(fechaCompra);
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
