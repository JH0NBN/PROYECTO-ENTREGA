const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, enum: ['analista', 'admin', 'jefe'], required: true },
    isActive: { type: Boolean, default: true }, 
});

// Hash de la contraseña antes de guardar
usuarioSchema.pre('save', async function (next) {
    // Solo encriptar la contraseña si ha sido modificada o es nueva
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(this.password, salt);
        this.password = hash; // Asignar el hash directamente
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('Usuario', usuarioSchema);