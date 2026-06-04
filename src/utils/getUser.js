const User = require('../models/User');

async function getUser(id) {
    let user = await User.findOne({ id });

    if (!user) {
        try {
            user = await User.create({ id });
        } catch {
            user = await User.findOne({ id });
        }
    }

    if (!user.portfolios) user.portfolios = new Map();
    if (!user.inventory) user.inventory = [];
    if (!user.badges) user.badges = [];
    if (!user.notes) user.notes = [];
    if (!user.todos) user.todos = [];

    return user;
}

module.exports = { getUser };
