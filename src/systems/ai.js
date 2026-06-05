const Groq = require('groq-sdk');
const { GROQ_API_KEY } = require('../config');

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Simple in-memory storage to remember the last 10 messages per channel
const conversationMemory = new Map();

async function handleAI(message, args, command, client) {
    if (!groq) return false;

    // ─── 1. DETERMINING IF THE BOT SHOULD RESPOND ───
    let shouldRespond = false;
    let query = '';

    // Condition A: Explicit command (!ask <question>)
    if (command === '!ask') {
        query = args.slice(1).join(' ');
        if (!query) {
            await message.reply('❌ Usage: `!ask <question>`');
            return true;
        }
        shouldRespond = true;
    } 
    // Condition B: Someone directly replied to a message sent by FlameBot
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
    // Condition C: FlameBot was directly @mentioned in the message
    else if (message.mentions.has(client.user.id) && !message.author.bot) {
        query = message.content.replace(`<@${client.user.id}>`, '').trim();
        shouldRespond = true;
    }
    // Condition D: The random passive chatter trigger (Low chance on regular messages)
    else if (!message.author.bot) {
        const RANDOM_TRIGGER_CHANCE = 0.02; // ◄ 2% chance per message. Adjust this decimal up or down!
        if (Math.random() < RANDOM_TRIGGER_CHANCE || message.author.id === 543594062670856192) {
            query = message.content;
            shouldRespond = true;
        }
    }

    // If none of the triggers matched, skip execution and hand back to the main loop
    if (!shouldRespond || !query) return false;

    // ─── 2. MANAGING CHANNEL MEMORY CONTEXT ───
    const channelId = message.channel.id;
    if (!conversationMemory.has(channelId)) {
        conversationMemory.set(channelId, []);
    }
    const history = conversationMemory.get(channelId);

    // Push the user's new question/message into history
    history.push({ role: 'user', content: `${message.author.username}: ${query}` });

    // Keep memory clean—only remember the last 10 lines so we don't hit model token limits
    if (history.length > 10) history.shift();

    const loading = await message.reply('🧠 Thinking...');

    try {
        // Compile the complete system prompt payload + conversation history
        const apiMessages = [
            {
                role: 'system',
                content: 'You are FlameBot, an elite, casual Discord bot for RedFlame’s server. Keep replies short, witty, friendly, and naturally integrated. Never use robotic opening templates.'
            },
            ...history
        ];

        const completion = await groq.chat.completions.create({
            messages: apiMessages,
            model: 'llama-3.1-8b-instant',
            temperature: 0.7, // Bumped slightly for more natural/creative conversation
            max_tokens: 400
        });

        const replyText = completion.choices[0]?.message?.content || 'No response.';

        // Save FlameBot's reply to the channel history so it remembers its own context next time
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
