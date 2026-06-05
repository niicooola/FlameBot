const mongoose = require('mongoose');
const { MONGO_URI, BRANCH_TEST } = require('./config');
if (BRANCH_TEST) {
	require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);
}

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
