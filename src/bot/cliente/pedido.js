const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

async function showPedidos(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return bot.sendMessage(chatId, '❌ Faça cadastro primeiro.');
    
    const pedidos = db.prepare(`
        SELECT * FROM pedidos 
        WHERE cliente_id = ? 
        ORDER BY data_pedido DESC 
        LIMIT 10
    `).all(cliente.id);
    
    if (pedidos.length === 0) {
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Fazer Pedido', callback_data: 'menu_cardapio' }],
                [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
            ]
        };
        
        return bot.editMessageText('📦 *Nenhum pedido encontrado*\n\nQue tal fazer seu primeiro pedido? 🍕', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
    
    const teclado = { inline_keyboard: [] };
    
    for (const pedido of pedidos) {
        const statusEmoji = {
            'pendente': '⏳',
            'confirmado': '✅',
            'preparo': '👨‍🍳',
            'entrega': '🛵',
            'entregue': '📦',
            'cancelado': '❌'
        };
        
        teclado.inline_keyboard.push([
            { 
                text: `${statusEmoji[pedido.status] || '📋'} ${pedido.numero} - ${formatarMoeda(pedido.total)} - ${formatarData(pedido.data_pedido)}`, 
                callback_data: `ped_detalhe_${pedido.id}` 
            }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }
    ]);
    
    await bot.editMessageText('📦 *MEUS PEDIDOS*\n\nSelecione para ver detalhes:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showDetalhePedido(bot, chatId, pedidoId, messageId) {
    const db = getDatabase();
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    
    if (!pedido) return bot.sendMessage(chatId, 'Pedido não encontrado.');
    
    const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
    
    let mensagem = `📦 *PEDIDO ${pedido.numero}*\n\n`;
    mensagem += `📊 Status: ${pedido.status}\n`;
    mensagem += `💳 Pagamento: ${pedido.pagamento_status}\n`;
    mensagem += `📅 Data: ${formatarData(pedido.data_pedido)}\n\n`;
    mensagem += `🍕 *Itens:*\n`;
    
    for (const item of itens) {
        mensagem += `\n${item.quantidade}x ${item.produto_nome}\n`;
        mensagem += `📏 ${item.tamanho_nome}\n`;
        mensagem += `🧀 ${item.borda_nome}\n`;
        if (item.adicionais) {
            mensagem += `➕ ${item.adicionais}\n`;
        }
        mensagem += `💰 ${formatarMoeda(item.preco_unitario)}\n`;
    }
    
    mensagem += `\n📦 Subtotal: ${formatarMoeda(pedido.subtotal)}\n`;
    mensagem += `🚚 Entrega: ${formatarMoeda(pedido.taxa_entrega)}\n`;
    mensagem += `💰 *Total: ${formatarMoeda(pedido.total)}*\n`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '⬅️ Voltar', callback_data: 'menu_pedidos' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarPedidos(bot, chatId, userId, data, messageId, estados) {
    if (data === 'menu_pedidos') {
        await showPedidos(bot, chatId, userId, messageId);
    }
    
    if (data.startsWith('ped_detalhe_')) {
        const pedidoId = data.split('_')[2];
        await showDetalhePedido(bot, chatId, pedidoId, messageId);
    }
}

module.exports = { showPedidos, showDetalhePedido, processarPedidos };
