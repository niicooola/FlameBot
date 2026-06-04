const {
    PermissionsBitField
} = require('discord.js');

function isStaff(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isMod(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

module.exports = {
    isStaff,
    isMod,
    isAdmin
};
