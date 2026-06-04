const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    id: {
        type: String,
        unique: true,
        required: true
    },

    coins: {
        type: Number,
        default: 0
    },

    warnings: {
        type: Number,
        default: 0
    },

    xp: {
        type: Number,
        default: 0
    },

    afk: {
        type: String,
        default: null
    },

    hasBooster: {
        type: Boolean,
        default: false
    },

    customTitle: {
        type: String,
        default: null
    },

    hasShield: {
        type: Boolean,
        default: false
    },

    portfolios: {
        type: Map,
        of: Number,
        default: {}
    }
});

module.exports = mongoose.model('User', userSchema);
