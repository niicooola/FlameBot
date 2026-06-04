const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

async function connectDatabase() {
    if (!MONGO_URI) {
        console.warn('⚠️ MONGO_URI missing.');
        return;
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('💾 MongoDB connected.');
    } catch (err) {
        console.error('❌ MongoDB error:', err);
    }
}

module.exports = { connectDatabase };
