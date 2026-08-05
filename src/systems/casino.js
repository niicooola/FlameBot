const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');
const { CASINO_COOLDOWN, MUTE_ROLE_ID } = require('../config');

const PLINKO_MULTIPLIERS = [5.0, 2.0, 0.5, 0.2, 0.5, 2.0, 5.0];
const PLINKO_ROWS = 6;
const SLOT_EMOJIS = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];
const lastGambled = {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// In-memory cylinders for Russian Roulette (6 chambers tracked per text channel context)
const activeChambers = new Map();

function generatePlinkoFrame(currentRow, currentPos) {
    let rows = [
        [' ', ' ', ' ', '.', ' ', '.', ' ', ' ', ' '],
        [' ', ' ', '.', ' ', '.', ' ', '.', ' ', ' '],
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],
        [' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.'],
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' '],
        ['.', ' ', '.', ' ', '.', ' ', '.', ' ', '.', ' ', '.']
    ];

    if (currentRow >= 0 && currentRow < PLINKO_ROWS) {
        const activeIndex = Math.max(0, Math.min(rows[currentRow].length - 1, currentPos));
        rows[currentRow][activeIndex] = '●';
    }

    let boardText = '```\n       ' + (currentRow === -1 ? 'DROP' : 'DROP') + '\n';

    for (let r = 0; r < PLINKO_ROWS; r++) {
        const padding = ' '.repeat(PLINKO_ROWS - r + 1);
        boardText += padding + rows[r].join('') + '\n';
    }

    boardText += ' ───────────────────────\n';
    boardText += ' [5x][2x][.5][.2][.5][2x][5x]\n';

    return boardText;
}

async function runPlinkoGame(message, args, userData) {
    const bet = cleanAmount(args[1]);

    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!plinko <amount>`');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You need 🪙 **${bet}**.`);
        return true;
    }

    userData.coins -= bet;
    await userData.save();

    const path = [];
    let rightTurns = 0;

    for (let i = 0; i < PLINKO_ROWS; i++) {
        const turn = Math.random() > 0.5 ? 1 : 0;
        path.push(turn);
        if (turn === 1) rightTurns++;
    }

    const multiplier = PLINKO_MULTIPLIERS[rightTurns];
    const winnings = Math.floor(bet * multiplier);

    const gameMessage = await message.reply({
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(-1, 3)}\nPlacing bet... 🪙`
    });

    let currentBallPos = 3;

    for (let r = 0; r < PLINKO_ROWS; r++) {
        await sleep(500);

        currentBallPos += path[r] === 1 ? 1 : -1;

        await gameMessage.edit({
            content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(r, currentBallPos)}\nBouncing...`
        });
    }

    userData.coins += winnings;
    await userData.save();

    const netChange = winnings - bet;
    const resultText = netChange >= 0
        ? `🟢 **WIN!** Landed on **${multiplier}x** and got 🪙 **${winnings}**.`
        : `🔴 **LOSS!** Landed on **${multiplier}x** and got back 🪙 **${winnings}**.`;

    await sleep(500);

    await gameMessage.edit({
        content: `🎰 **FLAMEBOT PLINKO** 🎰\n${generatePlinkoFrame(PLINKO_ROWS, currentBallPos)}\n${resultText}\nWallet: 🪙 **${userData.coins}**`
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
        await message.reply(`❌ You need 🪙 **${bet}**.`);
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
        await message.reply(`❌ Balance: 🪙 **${userData.coins}**`);
        return true;
    }

    userData.coins -= bet;

    const choice = sideInput === 'h' || sideInput === 'heads' ? 'heads' : 'tails';
    const result = Math.random() > 0.5 ? 'heads' : 'tails';

    const winnings = choice === result ? bet * 2 : 0;

    userData.coins += winnings;
    await userData.save();

    const msg = winnings > 0
        ? `🪙 Landed **${result}**. You won 🪙 **${winnings}**.`
        : `🪙 Landed **${result}**. You lost 🪙 **${bet}**.`;

    await message.reply(`${msg}\nWallet: 🪙 **${userData.coins}**`);
    return true;
}

async function runGambleVote(message, args, userData) {
    const sideInput = args[1]?.toLowerCase();
    const bet = cleanAmount(args[2]);

    if (!['heads', 'tails', 'h', 't'].includes(sideInput) || !bet || bet <= 0) {
        await message.reply('❌ Usage: `!gamblevote <heads/tails> <amount>`');
        return true;
    }

    if (userData.votes < bet) {
        await message.reply(`❌ Balance: 🪙 **${userData.coins}**`);
        return true;
    }

    userData.votes -= bet;

    const choice = sideInput === 'h' || sideInput === 'heads' ? 'heads' : 'tails';
    const result = Math.random() > 0.5 ? 'heads' : 'tails';

    const winnings = choice === result ? bet * 2 : 0;

    userData.votes += winnings;
    await userData.save();

    const msg = winnings > 0
        ? ` Landed **${result}**. You won **${winnings} votes**.`
        : ` Landed **${result}**. You lost **${bet} votes**.`;

    await message.reply(`${msg}\Votes: **${userData.votes}**`);
    return true;
}

async function runVoting(message, args, userData) {
    if (userData.votes < 1) await message.reply(`Not enough votes`);
	args[0] = "";
	const vote = args.join(" ").trim();
	if (vote.length < 4) await message.reply(`Vote must be at least 4 chars`);
	userData.voteList.push(vote);
	userData.votes--;
	await userData.save();

    await message.reply(`Successfully voted for ${vote}`);
    return true;
}

async function runBlackjackGame(message, args, userData) {
    const bet = cleanAmount(args[1]);

    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!blackjack <amount>`');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply('❌ Not enough coins.');
        return true;
    }

    const player = Math.floor(Math.random() * 10) + 12;
    const dealer = Math.floor(Math.random() * 10) + 12;

    if (dealer > 21 || player > dealer) {
        userData.coins += bet;
        await userData.save();
        await message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You won 🪙 **${bet}**.`);
        return true;
    }

    if (player === dealer) {
        await message.reply(`🃏 Push. Both got **${player}**.`);
        return true;
    }

    userData.coins -= bet;
    await userData.save();
    await message.reply(`🃏 You: **${player}** | Dealer: **${dealer}**. You lost 🪙 **${bet}**.`);
    return true;
}

async function runRouletteGame(message, args, userData) {
    const bet = cleanAmount(args[1]);
    if (!bet || bet <= 0) {
        await message.reply('❌ Usage: `!roulette <amount>`\n*Warning: Pulling the live round burns your bet and mutes you for 1 minute!*');
        return true;
    }

    if (userData.coins < bet) {
        await message.reply(`❌ You don't have enough coins, bro. Wallet: 🪙 **${userData.coins}**`);
        return true;
    }

    const channelId = message.channel.id;
    
    if (!activeChambers.has(channelId) || activeChambers.get(channelId).length === 0) {
        const newCylinder = [1, 0, 0, 0, 0, 0];
        for (let i = newCylinder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newCylinder[i], newCylinder[j]] = [newCylinder[j], newCylinder[i]];
        }
        activeChambers.set(channelId, newCylinder);
    }

    const cylinder = activeChambers.get(channelId);
    const shot = cylinder.pop();
    const remaining = cylinder.length;

    userData.coins -= bet;

    const introEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔫 Casino Russian Roulette')
        .setDescription(`<@${message.author.id}> wagers 🪙 **${bet}** coins, spins the chamber, and pulls the trigger... \n\nChambers remaining: **${remaining + 1}/6**`)
        .setFooter({ text: 'Spins... click...' });

    const gameMsg = await message.channel.send({ embeds: [introEmbed] });
    
    await sleep(1500);

    if (shot === 1) {
        await userData.save();

        const deadEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💥 BAM! You Got Caught!')
            .setDescription(`💀 <@${message.author.id}> pulled the live round! Your bet of 🪙 **${bet}** has burned. You are muted for **1 minute**.`);

        await gameMsg.edit({ embeds: [deadEmbed] });

        const muteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);
        if (muteRole) {
            await message.member.roles.add(muteRole).catch(() => {});
            setTimeout(async () => {
                await message.member.roles.remove(muteRole).catch(() => {});
                message.channel.send(`🔊 <@${message.author.id}> survived surgery and has been unmuted.`);
            }, 60000);
        }
    } else {
        const winnings = Math.floor(bet * 2); 
        userData.coins += winnings; 
        await userData.save();

        const winEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🔒 *CLICK*... Clear Chamber!')
            .setDescription(`🍀 Empty chamber! <@${message.author.id}> beats the house.\n\n• **Earnings:** 🪙 **+${bet}** coins (2x payout)\n• **New Wallet:** 🪙 **${userData.coins}**\n• **Chambers left in gun:** **${remaining}**`);

        await gameMsg.edit({ embeds: [winEmbed] });
    }
    return true;
}

async function handleCasino(message, args, command, userData) {
    if (!['!plinko', '!slots', '!coinflip', '!cf', '!blackjack', '!bj', '!gamble', '!roulette', '!rr', '!vote', '!gamblevote'].includes(command)) {
        return false;
    }

    const now = Date.now();

    if (lastGambled[message.author.id] && now - lastGambled[message.author.id] < CASINO_COOLDOWN) {
        const left = Math.ceil((CASINO_COOLDOWN - (now - lastGambled[message.author.id])) / 1000);
        await message.reply(`❌ Casino cooldown. Wait **${left}s**.`);
        return true;
    }

    lastGambled[message.author.id] = now;

    if (command === '!plinko') return runPlinkoGame(message, args, userData);
    if (command === '!slots') return runSlotsGame(message, args, userData);
    if (command === '!coinflip' || command === '!cf') return runCoinflipGame(message, args, userData);
    if (command === '!blackjack' || command === '!bj') return runBlackjackGame(message, args, userData);
    //if (command === '!roulette' || command === '!rr') return runRouletteGame(message, args, userData);
	
	if (command === '!vote') return runVoting(message, args, userData);
	if (command === '!gamblevote') return runGambleVote(message, args, userData);
    if (command === '!gamble') {
        const mode = args[1]?.toLowerCase();

        if (mode === 'slots') {
            return runSlotsGame(message, [args[0], args[2]], userData);
        }

        return message.reply('❌ Usage: `!gamble slots <amount>` or use `!plinko`, `!blackjack`, `!coinflip`, `!roulette`.');
    }

    return false;
}

module.exports = {
    handleCasino
};
