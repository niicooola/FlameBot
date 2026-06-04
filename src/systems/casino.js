const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');

// ==========================================
// 🎰 GAME CONFIGURATIONS & ENGINE STATES
// ==========================================
const PLINKO_MULTIPLIERS = [5.0, 2.0, 0.5, 0.2, 0.5, 2.0, 5.0];
const PLINKO_ROWS = 6;

const SLOT_EMOJIS = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];

// ==========================================
// 🕹️ PLINKO AUXILIARY RENDERING ENGINE
// ==========================================
function generatePlinkoBoard(path) {
    let boardText = '```\n     🔴 DROP\n';
    let currentPos = 3; // Center alignment baseline

    for (let r = 0; r < PLINKO_ROWS; r++) {
        if (r < path.length) {
            currentPos += path[r] === 1 ? 0.5 : -0.5;
        }

        let rowStr = ' '.repeat(Math.floor(PLINKO_ROWS - r));
        for (let p = 0; p <= r + 2; p++) {
            if (p === Math.floor(currentPos)) {
                rowStr += '● ';
            } else {
                rowStr += '. ';
            }
        }
        boardText += `${rowStr}\n`;
    }

    boardText += '───────────────────\n';
    boardText += `[5x][2x][.5][.2][.5][2x][5x]\n\`\`\``;
    return boardText;
}

// ==========================================
// 🎲 INDIVIDUAL GAME LOGIC CONTROLLERS
// ==========================================

async function runPlinkoGame(message, args, userData) {
    const bet = cleanAmount(args[1]);
    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!plinko <amount>`\nExample: `!plinko 100`');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You don't have enough coins, gng! You need 🪙 **${bet}**.`);
        return true;
    }

    userData.coins -= bet;

    // Simulate peg mechanics (0 = left, 1 = right)
    let path = [];
    let rightTurns = 0;
    for (let i = 0; i < PLINKO_ROWS; i++) {
        const turn = Math.random() > 0.5 ? 1 : 0;
        path.push(turn);
        if (turn === 1) rightTurns++;
    }

    const multiplier = PLINKO_MULTIPLIERS[rightTurns];
    const winnings = Math.floor(bet * multiplier);

    userData.coins += winnings;
    await userData.save();

    const boardVisual = generatePlinkoBoard(path);
    const netChange = winnings - bet;
    const resultText = netChange >= 0 
        ? `🟢 **WIN!** Landed on **${multiplier}x** and cashed out 🪙 **${winnings}**!`
        : `🔴 **LOSS!** Landed on **${multiplier}x** and only got back 🪙 **${winnings}**...`;

    await message.reply({
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${boardVisual}\n${resultText}\nWallet: 🪙 **${userData.coins}**`
    });
    return true;
}

async function runSlotsGame(message, args, userData) {
    const bet = cleanAmount(args[1]);
    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!slots <amount>`');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You are broke, gng! You need 🪙 **${bet}**.`);
        return true;
    }

    userData.coins -= bet;

    // Roll three random slots
    const slot1 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
    const slot2 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
    const slot3 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];

    let multiplier = 0;
    let title = '🔴 LOSE';

    if (slot1 === slot2 && slot2 === slot3) {
        multiplier = slot1 === '7️⃣' ? 10 : slot1 === '💎' ? 5 : 3;
        title = '🎉 JACKPOT';
    } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
        multiplier = 1.5;
        title = '💵 MINI WIN';
    }

    const winnings = Math.floor(bet * multiplier);
    userData.coins += winnings;
    await userData.save();

    const embed = new EmbedBuilder()
        .setColor(multiplier > 0 ? '#00FF00' : '#FF0000')
        .setTitle(`🎰 Slots: ${title}`)
        .setDescription(`▶  [ ${slot1} | ${slot2} | ${slot3} ]  ◀\n\nResult: 🪙 **${winnings}** back.\nWallet: 🪙 **${userData.coins}**`);

    await message.reply({ embeds: [embed] });
    return true;
}

async function runCoinflipGame(message, args, userData) {
    const sideInput = args[1]?.toLowerCase();
    const bet = cleanAmount(args[2]);

    if (!['heads', 'tails', 'h', 't'].includes(sideInput) || !bet || bet <= 0) {
        await message.reply('❌ Usage: `!coinflip <heads/tails> <amount>`');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You don't have enough coins, bro. Balance: 🪙 **${userData.coins}**`);
        return true;
    }

    userData.coins -= bet;

    const choice = (sideInput === 'h' || sideInput === 'heads') ? 'heads' : 'tails';
    const result = Math.random() > 0.5 ? 'heads' : 'tails';

    let winnings = 0;
    if (choice === result) {
        winnings = bet * 2;
    }

    userData.coins += winnings;
    await userData.save();

    const msg = winnings > 0
        ? `🪙 The coin landed on **${result}**! You won 🪙 **${winnings}**! 🎉`
        : `🪙 The coin landed on **${result}**! You lost 🪙 **${bet}**... 💀`;

    await message.reply(`${msg}\nWallet: 🪙 **${userData.coins}**`);
    return true;
}

// ==========================================
// 🔌 CENTRAL ROUTING EXPORT MATRIX
// ==========================================
async function handleCasino(message, args, command, userData) {
    if (command === '!plinko') {
        return await runPlinkoGame(message, args, userData);
    }

    if (command === '!slots') {
        return await runSlotsGame(message, args, userData);
    }

    if (command === '!coinflip' || command === '!cf') {
        return await runCoinflipGame(message, args, userData);
    }

    return false; // Skips execution seamlessly if it's not a casino command
}

module.exports = {
    handleCasino
};
