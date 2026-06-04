const User = require('../models/User');

async function getUser(id) {
    let user = await User.findOne({
        id
    });

    if (!user) {
        user = await User.create({
            id
        });
    }

    return user;
}

module.exports = {
    getUser
};
