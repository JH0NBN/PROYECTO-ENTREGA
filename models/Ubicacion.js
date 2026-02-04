const mongoose = require("mongoose");

const ubicacionSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },

    tipo: {
      type: String,
      enum: ["piso", "area", "subarea"],
      required: true,
    },

    // Relación jerárquica
    padre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ubicacion",
      default: null,
    },

    activa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Índice útil para búsquedas jerárquicas
ubicacionSchema.index({ tipo: 1, padre: 1 });

module.exports = mongoose.model("Ubicacion", ubicacionSchema);
