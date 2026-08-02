const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

async function showPedidosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const pedidos = db.prepare(`
        SELECT p.*, c.nome as cliente_nome, c.telefone 
        FROM pedidos p 
        JOIN clientes c ON p.cliente_id = c.id 
        ORDER BY p.data_pedido DESC 
        LIMIT 20
    `).all();
    
    if (pedidos.length === 0) {
        const teclado = {
            inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]]
        };
        return bot.editMessageText('📦 Nenhum pedido ainda.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: teclado
        });
    }
    
    let mensagem = '📦 *PEDIDOS*\n\n';
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
        
        mensagem += `${statusEmoji[pedido.status] || '📋'} ${pedido.numero}\n`;
        mensagem += `   👤 ${pedido.cliente_nome}\n`;
        mensagem += `   💰 ${formatarMoeda(pedido.total)}\n`;
        mensagem += `   📅 ${formatarData(pedido.data_pedido)}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `${statusEmoji[pedido.status]} ${pedido.numero}`, callback_data: `adm_pedido_ver_${pedido.id}` }
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

async function showDetalhePedidoAdmin(bot, chatId, pedidoId, messageId) {
    const db = getDatabase();
    const pedido = db.prepare(`
        SELECT p.*, c.nome, c.telefone, c.logradouro, c.numero, c.bairro, c.cidade, c.estado
        FROM pedidos p 
        JOIN clientes c ON p.cliente_id = c.id 
        WHERE p.id = ?
    `).get(pedidoId);
    
    if (!pedido) return bot.sendMessage(chatId, 'Pedido não encontrado.');
    
    const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
    
    let mensagem = `📦 *PEDIDO ${pedido.numero}*\n\n`;
    mensagem += `👤 Cliente: ${pedido.nome}\n`;
    mensagem += `📱 Tel: ${pedido.telefone}\n`;
    mensagem += `📍 ${pedido.logradouro}, ${pedido.numero} - ${pedido.bairro}\n`;
    mensagem += `🏙️ ${pedido.cidade}/${pedido.estado}\n\n`;
    mensagem += `📊 Status: ${pedido.status}\n`;
    mensagem += `💳 Pagamento: ${pedido.pagamento_status}\n\n`;
    mensagem += `🍕 *ITENS:*\n`;
    
    for (const item of itens) {
        mensagem += `\n${item.quantidade}x ${item.produto_nome}\n`;
        mensagem += `📏 ${item.tamanho_nome} | 🧀 ${item.borda_nome}\n`;
        if (item.adicionais) mensagem += `➕ ${item.adicionais}\n`;
        mensagem += `💰 ${formatarMoeda(item.preco_unitario)}\n`;
    }
    
    mensagem += `\n💰 Total: *${formatarMoeda(pedido.total)}*\n`;
    
    const teclado = {
        inline_keyboard: [
            [
                { text: '👨‍🍳 Em Preparo', callback_data: `adm_status_preparo_${pedidoId}` },
                { text: '🛵 Saiu Entrega', callback_data: `adm_status_entrega_${pedidoId}` }
            ],
            [
                { text: '📦 Entregue', callback_data: `adm_status_entregue_${pedidoId}` },
                { text: '❌ Cancelar', callback_data: `adm_status_cancelar_${pedidoId}` }
            ],
            [{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarPedidosAdmin(bot, chatId, userId, data, messageId) {
    if (data === 'adm_pedidos') {
        await showPedidosMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_pedido_ver_')) {
        const pedidoId = data.split('_')[3];
        await showDetalhePedidoAdmin(bot, chatId, pedidoId, messageId);
        return;
    }
    
    if (data.startsWith('adm_status_')) {
        const partes = data.split('_');
        const status = partes[2];
        const pedidoId = partes[3];
        
        const db = getDatabase();
        const statusMap = {
            'preparo': 'preparo',
            'entrega': 'entrega',
            'entregue': 'entregue',
            'cancelar': 'cancelado'
        };
        
        db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(statusMap[status], pedidoId);
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        
        // Notifica cliente
        const clienteBot = require('../cliente/index').getBot();
        if (clienteBot && pedido) {
            const cliente = db.prepare('SELECT telegram_id FROM clientes WHERE id = ?').get(pedido.cliente_id);
            if (cliente) {
                const mensagens = {
                    'preparo': '👨‍🍳 Seu pedido está sendo preparado!',
                    'entrega': '🛵 Seu pedido saiu para entrega!',
                    'entregue': '📦 Pedido entregue! Bom apetite! 🍕',
                    'cancelado': '❌ Pedido cancelado.'
                };
                await clienteBot.sendMessage(cliente.telegram_id, mensagens[status]);
            }
        }
        
        await showDetalhePedidoAdmin(bot, chatId, pedidoId, messageId);
    }
}

module.exports = { showPedidosMenu, processarPedidosAdmin };
