const { getDatabase } = require('../../database/connection');

async function showMenuPrincipal(bot, chatId, nome) {
    const mensagem = `🍕 *Bem-vindo à Pizzaria!*\n\n` +
                    `👋 Olá, *${nome}*!\n\n` +
                    `Escolha uma opção:`;
    
    const teclado = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }],
                [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
                [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
                [{ text: '👤 Meu Perfil', callback_data: 'menu_perfil' }],
                [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, mensagem, { 
        parse_mode: 'Markdown',
        ...teclado 
    });
}

async function processarMenu(bot, chatId, userId, data, messageId, estados) {
    switch(data) {
        case 'menu_cardapio':
            estados.set(userId, { tela: 'cardapio' });
            const { showCategorias } = require('./cardapio');
            await showCategorias(bot, chatId, messageId);
            break;
            
        case 'menu_carrinho':
            const { showCarrinho } = require('./carrinho');
            await showCarrinho(bot, chatId, userId, messageId);
            break;
            
        case 'menu_pedidos':
            const { showPedidos } = require('./pedidos');
            await showPedidos(bot, chatId, userId, messageId);
            break;
            
        case 'menu_perfil':
            const { showPerfil } = require('./perfil');
            await showPerfil(bot, chatId, userId, messageId);
            break;
            
        case 'menu_atendimento':
            const mensagem = `📞 *Atendimento*\n\n` +
                           `Entre em contato pelo WhatsApp:\n` +
                           `📱 (44) 99999-9999\n\n` +
                           `⏰ Seg a Dom: 18h às 23h`;
            
            const teclado = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
                    ]
                }
            };
            
            await bot.editMessageText(mensagem, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...teclado
            });
            break;
            
        case 'menu_voltar_principal':
            const db = getDatabase();
            const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
            estados.set(userId, { tela: 'menu_principal' });
            await showMenuPrincipal(bot, chatId, cliente?.nome || 'Cliente');
            break;
    }
}

module.exports = { showMenuPrincipal, processarMenu };
