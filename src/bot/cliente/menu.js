const { getDatabase } = require('../../database/connection');

async function showMenuPrincipal(bot, chatId, nome) {
    const mensagem = `🍕 *Bem-vindo à Pizzaria!*\n\n` +
                    `👋 Olá, *${nome}*!\n\n` +
                    `Escolha uma opção:`;
    
    const teclado = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }],
                [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }],
                [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
                [{ text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
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
            
        case 'menu_pesquisar':
            estados.set(userId, { tela: 'pesquisar', aguardando: 'termo' });
            await bot.sendMessage(chatId, '🔍 Digite o nome do produto que deseja buscar:');
            break;
            
        case 'menu_carrinho':
            const { showCarrinho } = require('./carrinho');
            await showCarrinho(bot, chatId, userId, messageId);
            break;
            
        case 'menu_favoritos':
            const { showFavoritos } = require('./favoritos');
            await showFavoritos(bot, chatId, userId, messageId);
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
            await mostrarAtendimento(bot, chatId, userId, messageId);
            break;
            
        case 'menu_voltar_principal':
            const db = getDatabase();
            const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
            estados.set(userId, { tela: 'menu_principal' });
            await showMenuPrincipal(bot, chatId, cliente?.nome || 'Cliente');
            break;
    }
}

async function mostrarAtendimento(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT unidade_proxima_id FROM clientes WHERE telegram_id = ?').get(userId);
    const unidade = db.prepare('SELECT * FROM unidades WHERE id = ?').get(cliente?.unidade_proxima_id);
    
    let mensagem = `📞 *ATENDIMENTO*\n\n`;
    let whatsapp = '';
    
    if (unidade && unidade.whatsapp) {
        whatsapp = unidade.whatsapp;
        mensagem += `🏪 *${unidade.nome}*\n`;
        mensagem += `📱 WhatsApp: ${unidade.whatsapp}\n`;
        mensagem += `📞 Telefone: ${unidade.telefone || 'N/A'}\n`;
        mensagem += `🕐 ${unidade.horario_abertura} às ${unidade.horario_fechamento}\n`;
    } else {
        mensagem += `📱 Entre em contato pelo WhatsApp:\n(44) 99999-9999\n\n`;
        mensagem += `⏰ Seg a Dom: 18h às 23h\n`;
        whatsapp = '5544999999999';
    }
    
    const teclado = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💬 Falar no WhatsApp', url: `https://wa.me/55${whatsapp.replace(/\D/g, '')}` }],
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
}

module.exports = { showMenuPrincipal, processarMenu };
