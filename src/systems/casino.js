const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');

// ==========================================
// 🎰 GAME CONFIGURATIONS & ENGINE STATES
// ==========================================
const PLINKO_MULTIPLIERS = [5.0, 2.0, 0.5, 0.2, 0.5, 2.0, 5.0];
const PLINKO_ROWS = 6;
const SLOT_EMOJIS = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];

// Helper utility to pause execution for the frame delay animation loop
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🕹️ PLINKO ANIMATED RENDERING ENGINE
// ==========================================
function generatePlinkoFrame(currentRow, currentPos) {
    // Exact static peg board coordinates to guarantee layout alignment on Discord
    let rows = [
        [' ', ' ', ' ', '.', ' ', '.', ' ', ' ', ' '],
        [' ', ' ', '.', ' ', '.', ' ', '.', ' ', ' '],
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.'],
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.']
    ];

    // Overwrite the specific row peg index with the ball character if the ball has dropped to or past that level
    if (currentRow >= 0 && currentRow < PLINKO_ROWS) {
        let activeIndex = Math.max(0, Math.min(rows[currentRow].length - 1, currentPos));
        rows[currentRow][activeIndex] = '●';
    }

    // Join the rows together into an aligned, code-blocked string pyramid output layout
    let boardText = '```\n       ' + (currentRow === -1 ? '🔴 DROP' : '  DROP') + '\n';
    for (let r = 0; r < PLINKO_ROWS; r++) {
        let padding = ' '.repeat(PLINKO_ROWS - r + 1);
        boardText += padding + rows[r].join('') + '\n';
    }

    boardText += ' ───────────────────────\n';
    boardText += ' [5x][2x][.5][.2][.5][2x][5x]\n\`\`\``;
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

    // Deduct the bet upfront
    userData.coins -= bet;
    await userData.save();

    // 1. Calculate path route indexes immediately (0 = left bounce, 1 = right bounce)
    let path = [];
    let rightTurns = 0;
    for (let i = 0; i < PLINKO_ROWS; i++) {
        const turn = Math.random() > 0.5 ? 1 : 0;
        path.push(turn);
        if (turn === 1) rightTurns++;
    }

    const multiplier = PLINKO_MULTIPLIERS[rightTurns];
    const winnings = Math.floor(bet * multiplier);

    // 2. Pre-stage initial loading message frame
    const initialBoard = generatePlinkoFrame(-1, 3);
    const gameMessage = await message.reply({
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${initialBoard}\nPlacing bet... 🪙`
    });

    // 3. Live animation loop execution layer (0.5s intervals)
    let currentBallPos = 3;
    for (let r = 0; r < PLINKO_ROWS; r++) {
        await sleep(500); // ◄ 0.5 second interval delay frames
        
        currentBallPos += path[r] === 1 ? 1 : -1;
        const currentFrame = generatePlinkoFrame(r, currentBallPos);

        await gameMessage.edit({
            content: `🎰 **FLAMEBOT PLINKO** 🎰\n${currentFrame}\nBouncing down the peg boards... ⏱️`
        });
    }

    // 4. Update wallet values and save parameters to MongoDB
    userData.coins += winnings;
    await userData.save();

    // Final result readout calculations
    const finalBoard = generatePlinkoFrame(PLINKO_ROWS, currentBallPos); // Clears ball to show board background
    const netChange = winnings - bet;
    const resultText = netChange >= 0 
        ? `🟢 **WIN!** Landed on **${multiplier}x** and cashed out 🪙 **${winnings}**!`
        : `🔴 **LOSS!** Landed on **${multiplier}x** and only got back 🪙 **${winnings}**...`;

    await sleep(500); // Small final pause before tracking calculations output
    await gameMessage.edit({
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${finalBoard}\n${resultText}\nWallet: 🪙 **${userData.coins}**`
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
    const result = Math.random() > 0.8 ? 'heads' : 'tails';

    let winnings = 0;
    if (choice === result) {
        winnings = bet * 3;
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

    return false;
}

module.exports = {
    handleCasino
};
