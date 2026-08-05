const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    coins: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    afk: { type: String, default: null },
    hasBooster: { type: Boolean, default: false },
    customTitle: { type: String, default: null },
    hasShield: { type: Boolean, default: false },
    portfolios: { type: Map, of: Number, default: {} },
	votes: {type: Number, default: 1 },
    voteList: {type: [String], default: [] },

    bio: { type: String, default: null },
    inventory: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    notes: { type: [String], default: [] },
    todos: { type: [String], default: [] }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
