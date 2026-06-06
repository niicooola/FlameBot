const { EmbedBuilder } = require('discord.js');
const { cleanAmount } = require('../utils/amounts');

const eightBallAnswers = [
    'Yes.',
    'No.',
    'Probably.',
    'Definitely.',
    'Outlook grim.',
    'Ask again later.',
    'Absolutely not.',
    'Looks good.',
    'Fuck You!'
];

async function handleFun(message, args, command) {
    if (command === '!8ball') {
        const question = args.slice(1).join(' ');
        if (!question) return message.reply('❌ Ask a question first.');

        const answer = eightBallAnswers[Math.floor(Math.random() * eightBallAnswers.length)];
        return message.reply(`🔮 **8-Ball:** ${answer}`);
    }

    if (command === '!rps') {
        const choice = args[1]?.toLowerCase();

        if (!['rock', 'paper', 'scissors'].includes(choice)) {
            return message.reply('❌ Pick `rock`, `paper`, or `scissors`.');
        }

        const options = ['rock', 'paper', 'scissors'];
        const bot = options[Math.floor(Math.random() * options.length)];

        if (choice === bot) {
            return message.reply(`🤝 Draw. Both picked **${choice}**.`);
        }

        const win =
            (choice === 'rock' && bot === 'scissors') ||
            (choice === 'paper' && bot === 'rock') ||
            (choice === 'scissors' && bot === 'paper');

        return message.reply(
            win
                ? `🎉 You won. You picked **${choice}**, I picked **${bot}**.`
                : `❌ You lost. You picked **${choice}**, I picked **${bot}**.`
        );
    }

    if (command === '!roll') {
        const maxInput = args[1];
        
        if (!maxInput) {
            const defaultRoll = Math.floor(Math.random() * 6) + 1;
            return message.reply(`🎲 You rolled a **${defaultRoll}** out of 6.`);
        }

        const max = cleanAmount(maxInput);

        if (max === null || isNaN(max) || max <= 0) {
            return message.reply('❌ You can\'t roll a zero or negative number. Choose a valid positive number.');
        }

        const MAX_ROLL_LIMIT = 1000000;
        if (max > MAX_ROLL_LIMIT || !isFinite(max)) {
            return message.reply(`❌ That number is too big! The maximum allowed roll value is **${MAX_ROLL_LIMIT.toLocaleString()}**.`);
        }

        const roll = Math.floor(Math.random() * max) + 1;
        return message.reply(`🎲 You rolled a **${roll}** out of **${max}**.`);
    }

    if (command === '!choose') {
        const choices = args
            .slice(1)
            .join(' ')
            .split('|')
            .map(x => x.trim())
            .filter(Boolean);

        if (choices.length < 2) {
            return message.reply('❌ Use `!choose option 1 | option 2`.');
        }

        return message.reply(`🤔 I choose: **${choices[Math.floor(Math.random() * choices.length)]}**`);
    }

    if (command === '!coin') {
        return message.reply(`🪙 **${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}**`);
    }

    if (command === '!dice') {
        return message.reply(`🎲 You rolled **${Math.floor(Math.random() * 6) + 1}**.`);
    }

    if (command === '!poll') {
        const title = args.slice(1).join(' ');
        if (!title) return message.reply('❌ Usage: `!poll <question>`');

        const embed = new EmbedBuilder()
            .setColor('#FF8C00')
            .setTitle('📊 Server Poll')
            .setDescription(title)
            .setFooter({ text: `Opened by ${message.author.username}` });

        const poll = await message.channel.send({ embeds: [embed] });

        await poll.react('👍');
        await poll.react('👎');

        return true;
    }

    if (command === '!bananabread') {
        return message.reply(
            '🍌🍞 **Banana Bread:** Mix 3 ripe bananas, 1/3 cup melted butter, 1 tsp baking soda, 1 cup sugar, 1 egg, and 1.5 cups flour. Bake at 350°F for about 1 hour.'
        );
    }

    return false;
}

module.exports = {
    handleFun,
    eightBallAnswers
};
