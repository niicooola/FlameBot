const Groq = require('groq-sdk');
const { GROQ_API_KEY } = require('../config');
const { jailed_ids } = require('./moderation');

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const conversationMemory = new Map();

async function handleAI(message, args, command, client) {
    if (!groq) return false;

    let shouldRespond = false;
    let query = '';

    if (command === '!ask') {
        query = args.slice(1).join(' ');
        if (!query) {
            await message.reply('❌ Usage: `!ask <question>`');
            return true;
        }
        shouldRespond = true;
    } 
    else if (message.reference) {
        try {
            const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (referencedMessage.author.id === client.user.id) {
                query = message.content;
                shouldRespond = true;
            }
        } catch (err) {
            console.error('Error fetching referenced message:', err);
        }
    }
    else if (message.mentions.has(client.user.id) && !message.author.bot) {
        query = message.content.replace(`<@${client.user.id}>`, '').trim();
        shouldRespond = true;
    }
    else if (!message.author.bot) {
        const RANDOM_TRIGGER_CHANCE = 0.02;
        if (Math.random() < RANDOM_TRIGGER_CHANCE || jailed_ids.includes(message.author.id)) {
            query = message.content;
            shouldRespond = true;
        }
    }

    if (!shouldRespond || !query) return false;

    const channelId = message.channel.id;
    if (!conversationMemory.has(channelId)) {
        conversationMemory.set(channelId, []);
    }
    const history = conversationMemory.get(channelId);

    history.push({ role: 'user', content: `${message.author.username}: ${query}` });

    if (history.length > 10) history.shift();

    const loading = await message.reply('🧠 Thinking...');

    try {
        const apiMessages = [
            {
                role: 'system',
                content: `You are FlameBot, an elite, casual Discord bot for RedFlame’s server. Keep replies short, witty, friendly, and naturally integrated. Never use robotic opening templates.
						Some of your prompts will mention Yi Sang and Faust, referring to characters from the hit game Limbus Company on the PC and not famous historical personas. 
						Replace every instance of "Long Dong" with "Yi Sang", and "Wi-Fi" with "Gesellschaft". Do not replace these the other way around.
						Do not associate Yi Sang with Gesellschaft or Wi-Fi, and do not associate Faust with Long Dong.`
            },
            ...history
        ];

        const completion = await groq.chat.completions.create({
            messages: apiMessages,
            model: 'llama-3.1-8b-instant',
            temperature: 0.7,
            max_tokens: 400
        });

        const replyText = completion.choices[0]?.message?.content || 'No response.';

        history.push({ role: 'assistant', content: replyText });
        if (history.length > 10) history.shift();

        await loading.edit(replyText.slice(0, 1999));
        return true;
    } catch (err) {
        console.error('Groq memory chain error:', err);
        await loading.edit('❌ AI error.');
        return true;
    }
}

module.exports = { handleAI };
