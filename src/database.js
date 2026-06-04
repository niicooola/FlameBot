const mongoose = require('mongoose');

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log('Mongo connected');
    } catch (err) {
        console.error(err);
    }
}

module.exports = {
    connectDatabase
};
