const { PermissionsBitField } = require('discord.js');
const { MAINTAINER_USER_ID } = require('../config');

function hasRole(member, names) {
    return member.roles.cache.some(role => names.includes(role.name));
}

function isMaintainer(member) {
	return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        hasRole(member, ['Bot Manager', 'Admin', 'Owner/Streamer']) || 
		member.id == MAINTAINER_USER_ID;
}

function isStaff(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        hasRole(member, ['Trial Mod', 'Mod', 'Lower Admin', 'Admin', 'Owner/Streamer']);
}

function isMod(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        hasRole(member, ['Mod', 'Lower Admin', 'Admin', 'Owner/Streamer']);
}

function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.id === member.guild.ownerId ||
        hasRole(member, ['Lower Admin', 'Admin', 'Owner/Streamer']);
}

module.exports = { isStaff, isMod, isAdmin, isMaintainer };
