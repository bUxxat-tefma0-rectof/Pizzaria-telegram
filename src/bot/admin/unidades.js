const { getDatabase } = require('../../database/connection');

async function showUnidadesMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const unidades = db.prepare('SELECT * FROM unidades ORDER BY cidade').all();
    
    let mensagem = '📍 *UNIDADES*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const unidade of unidades) {
        const status = unidade.ativo ? '✅' : '❌';
        mensagem += `${status} *${unidade.nome}*\n`;
        mensagem += `   📍 ${unidade.cidade}/${unidade.estado}\n`;
        mensagem += `   🚚 Taxa: R$ ${unidade.taxa_entrega}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `✏️ ${unidade.nome}`, callback_data: `adm_unidade_edit_${unidade.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '➕ Nova Unidade', callback_data: 'adm_unidade_nova' }
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

module.exports = { showUnidadesMenu };
