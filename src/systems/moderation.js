const { EmbedBuilder } = require('discord.js');
const { MUTE_ROLE_ID } = require('../config');
const User = require('../models/User');
const { cleanAmount } = require('../utils/amounts');
const { isStaff, isMod, isAdmin } = require('../utils/permissions');
const { enableLogs, disableLogs, logsEnabled, dmServerLeadership } = require('../utils/logging');

async function handleModeration(message, args, command) {
    if (command === '!enablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        enableLogs();
        return message.reply('✅ Logs enabled.');
    }

    if (command === '!disablelogs') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        disableLogs();
        return message.reply('⚠️ Logs disabled.');
    }

    if (command === '!clear' || command === '!purge') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const amount = cleanAmount(args[1]);
        if (!amount || amount < 1 || amount > 100) return message.reply('❌ Use `!clear 1-100`.');

        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true);
        const msg = await message.channel.send(`🧹 Deleted **${deleted.size}** messages.`);
        setTimeout(() => msg.delete().catch(() => {}), 4000);
        return true;
    }

    if (command === '!warn') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');

        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        // 🛡️ SECURITY GATE 1: Prevent staff from warning people with equal or higher authority
        if (message.member.roles.highest.position <= target.roles.highest.position) {
            return message.reply("❌ You can't issue a warning to someone with an equal or higher role, bro.");
        }

        const reason = args.slice(2).join(' ') || 'No reason provided.';
        const data = await User.findOne({ id: target.id }) || await User.create({ id: target.id });

        data.warnings += 1;
        await data.save();

        await target.send(`⚠️ Warning in **${message.guild.name}**\nReason: ${reason}\nWarnings: ${data.warnings}/3`).catch(() => {});
        await message.channel.send(`⚠️ ${target} warned. Count: **${data.warnings}/3**.`);

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('Warning Issued')
            .addFields(
                { name: 'Staff', value: `<@${message.author.id}>`, inline: true },
                { name: 'Target', value: `<@${target.id}>`, inline: true },
                { name: 'Reason', value: reason },
                { name: 'Total Strikes', value: `${data.warnings}/3`, inline: true }
            );

        await dmServerLeadership(message.guild, embed);

        // ─── 🛡️ HOV'S PATHTRIGGER SECURITY FIX ───
        if (data.warnings >= 3) {
            // Check if the commander has full Mod permissions required to execute a kick
            if (!isMod(message.member)) {
                return message.channel.send(`⚠️ <@${target.id}> has reached **3 warnings**, but a full Mod or Admin must review this case because Trial Mods cannot trigger automated kicks.`);
            }

            // Double check bot permission safety grid
            if (target.kickable) {
                await target.kick('Auto-moderation: Accumulated 3 active server warnings.');
                data.warnings = 0;
                await data.save();
                return message.channel.send('🥾 User auto-kicked for 3 warnings.');
            } else {
                return message.channel.send(`⚠️ <@${target.id}> hit 3 warnings, but FlameBot lacks role hierarchy to kick them.`);
            }
        }

        return true;
    }

    if (command === '!warnings') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        const data = await User.findOne({ id: target.id }) || await User.create({ id: target.id });
        return message.reply(`📋 ${target.user.username} has **${data.warnings}** warnings.`);
    }

    if (command === '!clearwarns') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');

        await User.updateOne({ id: target.id }, { $set: { warnings: 0 } }, { upsert: true });
        return message.reply('✅ Warnings cleared.');
    }

    if (command === '!mute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');
        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !role) return message.reply('❌ Missing target or mute role.');
        await target.roles.add(role);

        return message.reply(`🤫 Muted ${target}.`);
    }

    if (command === '!unmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');
        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !role) return message.reply('❌ Missing target or mute role.');
        await target.roles.remove(role);

        return message.reply(`🔊 Unmuted ${target}.`);
    }

    if (command === '!tempmute') {
        if (!isStaff(message.member)) return message.reply('❌ Staff only.');
        const target = message.mentions.members.first();
        const mins = cleanAmount(args[2]);
        const role = message.guild.roles.cache.get(MUTE_ROLE_ID);

        if (!target || !mins || !role) return message.reply('❌ Usage: `!tempmute @user <minutes>`');

        await target.roles.add(role);
        message.reply(`🤫 Muted ${target} for **${mins} minutes**.`);

        setTimeout(async () => {
            await target.roles.remove(role).catch(() => {});
            message.channel.send(`🔊 ${target} was automatically unmuted.`).catch(() => {});
        }, mins * 60000);

        return true;
    }

    if (command === '!kick') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.kickable) return message.reply('❌ I cannot kick that user.');

        const reason = args.slice(2).join(' ') || 'No reason provided.';
        await target.kick(reason);
        return message.reply(`🥾 Kicked **${target.user.username}**. Reason: ${reason}`);
    }

    if (command === '!ban' || command === '!tempban') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('❌ Mention a user.');
        if (!target.bannable) return message.reply('❌ I cannot ban that user.');

        const reason = args.slice(2).join(' ') || 'No reason provided.';
        await target.ban({ reason });
        return message.reply(`🔨 Banned **${target.user.username}**. Reason: ${reason}`);
    }

    if (command === '!slowmode') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        const value = args[1]?.toLowerCase();

        if (value === 'off') {
            await message.channel.setRateLimitPerUser(0);
            return message.reply('✅ Slowmode off.');
        }

        const seconds = cleanAmount(value);
        if (seconds === null || seconds < 0 || seconds > 21600) return message.reply('❌ Use seconds or `off`.');

        await message.channel.setRateLimitPerUser(seconds);
        return message.reply(`📶 Slowmode set to **${seconds}s**.`);
    }

    if (command === '!lockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 Channel locked.');
    }

    if (command === '!unlockchannel') {
        if (!isMod(message.member)) return message.reply('❌ Mod only.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply('🔓 Channel unlocked.');
    }

    return false;
}

module.exports = { handleModeration };
