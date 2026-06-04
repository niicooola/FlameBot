async function handleProfile(message, args, command, userData) {
    if (command === '!profile') {
        return message.reply(
            `👤 **Profile**\n` +
            `Coins: 🪙 **${userData.coins}**\n` +
            `XP: ⭐ **${userData.xp}**\n` +
            `Bio: ${userData.bio || 'No bio set.'}\n` +
            `Badges: ${userData.badges.length ? userData.badges.join(', ') : 'None'}`
        );
    }

    if (command === '!setbio') {
        const bio = args.slice(1).join(' ');
        if (!bio) return message.reply('❌ Usage: `!setbio <bio>`');
        if (bio.length > 120) return message.reply('❌ Bio max is 120 characters.');

        userData.bio = bio;
        await userData.save();

        return message.reply('✅ Bio updated.');
    }

    if (command === '!badges') {
        return message.reply(`🏅 Badges: ${userData.badges.length ? userData.badges.join(', ') : 'None'}`);
    }

    if (command === '!inventory' || command === '!inv') {
        return message.reply(`🎒 Inventory: ${userData.inventory.length ? userData.inventory.join(', ') : 'Empty'}`);
    }

    return false;
}

module.exports = { handleProfile };
