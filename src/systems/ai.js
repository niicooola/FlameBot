const Groq = require('groq-sdk');
const { GROQ_API_KEY } = require('../config');

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

async function handleAI(message, args, command) {
    if (command !== '!ask') return false;

    if (!groq) return message.reply('❌ GROQ_API_KEY missing.');

    const query = args.slice(1).join(' ');
    if (!query) return message.reply('❌ Usage: `!ask <question>`');

    const loading = await message.reply('🧠 Thinking...');

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are FlameBot, a helpful casual Discord bot. Keep replies short, friendly, and useful.'
                },
                {
                    role: 'user',
                    content: query
                }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.5,
            max_tokens: 500
        });

        const text = completion.choices[0]?.message?.content || 'No response.';
        return loading.edit(text.slice(0, 1999));
    } catch (err) {
        console.error('Groq error:', err);
        return loading.edit('❌ AI error.');
    }
}

module.exports = { handleAI };
