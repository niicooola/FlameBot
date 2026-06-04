let systemLogsEnabled = true;

function logsEnabled() {
    return systemLogsEnabled;
}

function enableLogs() {
    systemLogsEnabled = true;
}

function disableLogs() {
    systemLogsEnabled = false;
}

async function dmServerLeadership(guild, embed) {
    if (!systemLogsEnabled) return;

    try {
        const members = await guild.members.fetch();

        const leaders = members.filter(member =>
            member.id === guild.ownerId ||
            member.roles.cache.some(role => ['Admin', 'Owner/Streamer'].includes(role.name))
        );

        leaders.forEach(async member => {
            if (!member.user.bot) {
                await member.send({ embeds: [embed] }).catch(() => {});
            }
        });
    } catch (err) {
        console.error('Failed to DM leadership:', err.message);
    }
}

module.exports = {
    logsEnabled,
    enableLogs,
    disableLogs,
    dmServerLeadership
};
