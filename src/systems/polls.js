const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');
const { isAdmin } = require('../utils/permissions');
const User = require('../models/User');

let activePoll = null;

async function handlePolls(message, args, command, userData) {
    if (command === '!openpoll') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');

        const raw = args.slice(1).join(' ');
        if (!raw.includes('|')) {
            return message.reply('❌ Usage: `!openpoll Option 1 | Option 2`');
        }

        const choices = raw.split('|').map(x => x.trim()).filter(Boolean);
        if (choices.length < 2) return message.reply('❌ Need at least 2 choices.');
        if (choices.length > 10) return message.reply('❌ Max 10 choices.');

        activePoll = {
            choices,
            multiplier: choices.length * 1.5,
            wagers: {}
        };

        const lines = choices.map((c, i) => `**[${i + 1}]** ${c}`).join('\n');

        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle('🗳️ Prediction Opened')
                    .setDescription(`${lines}\n\nUse \`!bet <number> <amount>\`.`)
                    .setFooter({ text: `Multiplier: ${activePoll.multiplier}x` })
            ]
        });

        return true;
    }

    if (command === '!bet') {
        if (!activePoll) return message.reply('❌ No active poll.');

        const choiceNumber = cleanAmount(args[1]);
        const amount = cleanAmount(args[2]);

        if (!choiceNumber || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!bet <choice> <amount>`');
        }

        const index = choiceNumber - 1;
        if (index < 0 || index >= activePoll.choices.length) {
            return message.reply('❌ Invalid choice.');
        }

        if (userData.coins < amount) {
            return message.reply('❌ Not enough coins.');
        }

        userData.coins -= amount;
        await userData.save();

        if (!activePoll.wagers[message.author.id]) {
            activePoll.wagers[message.author.id] = [];
        }

        activePoll.wagers[message.author.id].push({
            choiceIndex: index,
            amount
        });

        return message.reply(`✅ Bet 🪙 **${amount}** on **${choiceNumber}: ${activePoll.choices[index]}**.`);
    }

    if (command === '!endpoll') {
        if (!isAdmin(message.member)) return message.reply('❌ Admins only.');
        if (!activePoll) return message.reply('❌ No active poll.');

        const winningNumber = cleanAmount(args[1]);
        if (!winningNumber) {
            return message.reply('❌ Usage: `!endpoll <winning number>`');
        }

        const winningIndex = winningNumber - 1;
        if (winningIndex < 0 || winningIndex >= activePoll.choices.length) {
            return message.reply('❌ Invalid winner.');
        }

        let winners = 0;
        let totalPaid = 0;

        for (const [userId, bets] of Object.entries(activePoll.wagers)) {
            let payout = 0;

            for (const bet of bets) {
                if (bet.choiceIndex === winningIndex) {
                    payout += Math.floor(bet.amount * activePoll.multiplier);
                }
            }

            if (payout > 0) {
                await User.updateOne(
                    { id: userId },
                    { $inc: { coins: payout } }
                );

                winners++;
                totalPaid += payout;
            }
        }

        const winnerText = activePoll.choices[winningIndex];
        activePoll = null;

        return message.channel.send(
            `🎉 Poll ended. Winner: **${winnerText}**\n` +
            `Paid 🪙 **${totalPaid}** to **${winners}** winners.`
        );
    }

    return false;
}

module.exports = {
    handlePolls
};
