const mongoose = require('mongoose');
const bcrypt = require('bcrypt');


const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, enum: ['analista', 'admin', 'jefe'], required: true },
    isActive: { type: Boolean, default: true },
    sessionToken: { type: String, default: null },
    telegramChatId: {type: String, default: null},
    telegramUsername: {type: String, default: null},
    loginAttempts: { type: Number, default: 0},
    lockUntil: { type: Date, default: null},
    resetTokenHash: { type: String, default: null},
    resetTokenExpires: { type: Date, default: null}
});

module.exports = mongoose.model('Usuario', usuarioSchema);