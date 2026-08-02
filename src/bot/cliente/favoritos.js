const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showFavoritos(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return bot.sendMessage(chatId, '❌ Faça cadastro primeiro.');
    
    const favoritos = db.prepare(`
        SELECT f.*, p.nome, p.descricao, p.foto,
               (SELECT MIN(preco) FROM tamanhos WHERE produto_id = p.id AND ativo = 1) as preco_min
        FROM favoritos f
        JOIN produtos p ON f.produto_id = p.id
        WHERE f.cliente_id = ?
    `).all(cliente.id);
    
    if (favoritos.length === 0) {
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Ver Cardápio', callback_data: 'menu_cardapio' }],
                [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
            ]
        };
        
        return bot.editMessageText('❤️ *Nenhum favorito ainda*\n\nAdicione produtos aos favoritos!', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
    
    let mensagem = '❤️ *MEUS FAVORITOS*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const fav of favoritos) {
        mensagem += `🍕 *${fav.nome}*\n`;
        mensagem += `💰 A partir de ${formatarMoeda(fav.preco_min || 0)}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `🍕 ${fav.nome}`, callback_data: `prod_${fav.produto_id}` },
            { text: '❌', callback_data: `fav_remover_${fav.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function toggleFavorito(bot, chatId, userId, produtoId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return;
    
    const favorito = db.prepare('SELECT * FROM favoritos WHERE cliente_id = ? AND produto_id = ?')
        .get(cliente.id, produtoId);
    
    if (favorito) {
        db.prepare('DELETE FROM favoritos WHERE id = ?').run(favorito.id);
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}`, text: '❌ Removido dos favoritos' });
    } else {
        db.prepare('INSERT INTO favoritos (cliente_id, produto_id) VALUES (?, ?)')
            .run(cliente.id, produtoId);
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}`, text: '❤️ Adicionado aos favoritos!' });
    }
}

async function processarFavoritos(bot, chatId, userId, data, messageId) {
    if (data === 'menu_favoritos') {
        await showFavoritos(bot, chatId, userId, messageId);
        return;
    }
    
    if (data.startsWith('fav_remover_')) {
        const favId = data.split('_')[2];
        const db = getDatabase();
        db.prepare('DELETE FROM favoritos WHERE id = ?').run(favId);
        await showFavoritos(bot, chatId, userId, messageId);
        return;
    }
    
    if (data.startsWith('fav_toggle_')) {
        const prodId = data.split('_')[2];
        await toggleFavorito(bot, chatId, userId, prodId);
    }
}

module.exports = { showFavoritos, toggleFavorito, processarFavoritos };
