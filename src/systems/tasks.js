async function handleTasks(message, args, command, userData) {
    if (command === '!todo') {
        const sub = args[1]?.toLowerCase();

        if (!sub) {
            const list = userData.todos.length
                ? userData.todos.map((t, i) => `**${i + 1}.** ${t}`).join('\n')
                : 'No todos.';

            return message.reply(`✅ **Todo List**\n${list}`);
        }

        if (sub === 'add') {
            const text = args.slice(2).join(' ');
            if (!text) return message.reply('❌ Usage: `!todo add <task>`');

            userData.todos.push(text);
            await userData.save();

            return message.reply('✅ Todo added.');
        }

        if (sub === 'remove') {
            const index = parseInt(args[2]) - 1;
            if (isNaN(index) || index < 0 || index >= userData.todos.length) {
                return message.reply('❌ Invalid todo number.');
            }

            const removed = userData.todos.splice(index, 1);
            await userData.save();

            return message.reply(`🗑️ Removed: **${removed[0]}**`);
        }

        return message.reply('❌ Use `!todo`, `!todo add <task>`, or `!todo remove <number>`.');
    }

    if (command === '!notes') {
        const sub = args[1]?.toLowerCase();

        if (!sub) {
            const list = userData.notes.length
                ? userData.notes.map((n, i) => `**${i + 1}.** ${n}`).join('\n')
                : 'No notes.';

            return message.reply(`📝 **Notes**\n${list}`);
        }

        if (sub === 'add') {
            const note = args.slice(2).join(' ');
            if (!note) return message.reply('❌ Usage: `!notes add <note>`');

            userData.notes.push(note);
            await userData.save();

            return message.reply('✅ Note added.');
        }

        if (sub === 'remove') {
            const index = parseInt(args[2]) - 1;
            if (isNaN(index) || index < 0 || index >= userData.notes.length) {
                return message.reply('❌ Invalid note number.');
            }

            const removed = userData.notes.splice(index, 1);
            await userData.save();

            return message.reply(`🗑️ Removed note: **${removed[0]}**`);
        }
    }

    return false;
}

module.exports = { handleTasks };
