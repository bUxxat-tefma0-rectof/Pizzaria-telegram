const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

async function showClientesMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const clientes = db.prepare('SELECT * FROM clientes ORDER BY total_gasto DESC LIMIT 20').all();
    
    let mensagem = '👥 *CLIENTES*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const cliente of clientes) {
        const bloqueado = cliente.bloqueado ? '🚫' : '✅';
        mensagem += `${bloqueado} *${cliente.nome}*\n`;
        mensagem += `   📱 ${cliente.telefone || 'N/A'}\n`;
        mensagem += `   💰 ${formatarMoeda(cliente.total_gasto)}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `👤 ${cliente.nome}`, callback_data: `adm_cliente_ver_${cliente.id}` }
        ]);
    }
    
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

module.exports = { showClientesMenu };
