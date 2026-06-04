const { cleanAmount } = require('../utils/amounts');
const { CASINO_COOLDOWN } = require('../config');

const lastGambled = {};

async function handleCasino(message, args, command, userData) {
    if (!['!coinflip', '!cf', '!blackjack', '!bj', '!gamble'].includes(command)) return false;

    const now = Date.now();

    if (lastGambled[message.author.id] && now - lastGambled[message.author.id] < CASINO_COOLDOWN) {
        const left = Math.ceil((CASINO_COOLDOWN - (now - lastGambled[message.author.id])) / 1000);
        return message.reply(`❌ Casino cooldown. Wait **${left}s**.`);
    }

    if (command === '!coinflip' || command === '!cf') {
        const side = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['heads', 'tails'].includes(side) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!coinflip <heads/tails> <bet>`');
        }

        if (userData.coins < bet) return message.reply('❌ Not enough coins.');

        lastGambled[message.author.id] = now;

        const result = Math.random() < 0.5 ? 'heads' : 'tails';

        if (side === result) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🪙 Landed **${result}**. You won **${bet} coins**.`);
        }

        userData.coins -= bet;
        await userData.save();
        return message.reply(`🪙 Landed **${result}**. You lost **${bet} coins**.`);
    }

    if (command === '!blackjack' || command === '!bj') {
        const bet = cleanAmount(args[1]);

        if (!bet || bet <= 0) return message.reply('❌ Usage: `!blackjack <bet>`');
        if (userData.coins < bet) return message.reply('❌ Not enough coins.');

        lastGambled[message.author.id] = now;

        const player = Math.floor(Math.random() * 10) + 12;
        const dealer = Math.floor(Math.random() * 10) + 12;

        if (dealer > 21 || player > dealer) {
            userData.coins += bet;
            await userData.save();
            return message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You won **${bet} coins**.`);
        }

        if (player === dealer) {
            return message.reply(`🃏 Push. Both got **${player}**.`);
        }

        userData.coins -= bet;
        await userData.save();
        return message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You lost **${bet} coins**.`);
    }

    if (command === '!gamble') {
        const mode = args[1]?.toLowerCase();
        const bet = cleanAmount(args[2]);

        if (!['slots', 'dice'].includes(mode) || !bet || bet <= 0) {
            return message.reply('❌ Usage: `!gamble <slots/dice> <bet>`');
        }

        if (userData.coins < bet) return message.reply('❌ Not enough coins.');

        lastGambled[message.author.id] = now;

        if (mode === 'dice') {
            const userRoll = Math.floor(Math.random() * 6) + 1;
            const botRoll = Math.floor(Math.random() * 6) + 1;

            if (userRoll > botRoll) {
                userData.coins += bet;
                await userData.save();
                return message.reply(`🎲 You rolled **${userRoll}**, bot rolled **${botRoll}**. Won **${bet} coins**.`);
            }

            if (userRoll === botRoll) {
                return message.reply(`🎲 Draw. Both rolled **${userRoll}**.`);
            }

            userData.coins -= bet;
            await userData.save();
            return message.reply(`🎲 You rolled **${userRoll}**, bot rolled **${botRoll}**. Lost **${bet} coins**.`);
        }

        const symbols = ['🍒', '🍋', '🍇', '💎', '🔥'];
        const s1 = symbols[Math.floor(Math.random() * symbols.length)];
        const s2 = symbols[Math.floor(Math.random() * symbols.length)];
        const s3 = symbols[Math.floor(Math.random() * symbols.length)];
        const visual = `[ ${s1} | ${s2} | ${s3} ]`;

        if (s1 === s2 && s2 === s3) {
            const payout = bet * 4;
            userData.coins += payout;
            await userData.save();
            return message.reply(`🎰 ${visual} Jackpot. Won **${payout} coins**.`);
        }

        if (s1 === s2 || s2 === s3 || s1 === s3) {
            const payout = Math.floor(bet * 1.5);
            userData.coins += payout;
            await userData.save();
            return message.reply(`🎰 ${visual} Match. Won **${payout} coins**.`);
        }

        userData.coins -= bet;
        await userData.save();
        return message.reply(`🎰 ${visual} No match. Lost **${bet} coins**.`);
    }

    return false;
}

module.exports = { handleCasino };
