const { getDatabase } = require('../../database/connection');

async function showCardapioMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const categorias = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
    
    let mensagem = '🍕 *GERENCIAR CARDÁPIO*\n\n';
    mensagem += '*Categorias:*\n';
    const teclado = { inline_keyboard: [] };
    
    for (const cat of categorias) {
        mensagem += `${cat.emoji} ${cat.nome}\n`;
        teclado.inline_keyboard.push([
            { text: `✏️ Editar ${cat.nome}`, callback_data: `adm_cat_edit_${cat.id}` },
            { text: '🗑', callback_data: `adm_cat_del_${cat.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '➕ Nova Categoria', callback_data: 'adm_cat_nova' }
    ]);
    teclado.inline_keyboard.push([
        { text: '🧀 Gerenciar Bordas', callback_data: 'adm_bordas' },
        { text: '➕ Gerenciar Adicionais', callback_data: 'adm_adicionais' }
    ]);
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }
    ]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

module.exports = { showCardapioMenu };
