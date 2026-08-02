const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showProdutosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const produtos = db.prepare(`
        SELECT p.*, c.nome as categoria_nome 
        FROM produtos p 
        LEFT JOIN categorias c ON p.categoria_id = c.id 
        ORDER BY p.ordem
    `).all();
    
    let mensagem = '📦 *PRODUTOS*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        const status = prod.disponivel ? '✅' : '❌';
        mensagem += `${status} *${prod.nome}*\n`;
        mensagem += `   📂 ${prod.categoria_nome}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `✏️ ${prod.nome}`, callback_data: `adm_produto_edit_${prod.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '➕ Novo Produto', callback_data: 'adm_produto_novo' }
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

module.exports = { showProdutosMenu };
