const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

let adminBot = null;
const estadosAdmin = new Map();

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        const userId = msg.from.id;
        
        if (!adminIds.includes(userId)) {
            return adminBot.sendMessage(msg.chat.id, '⛔ Acesso negado.');
        }
        
        showDashboardAdmin(msg.chat.id, userId);
    });
    
    adminBot.on('callback_query', async (query) => {
        const userId = query.from.id;
        
        if (!adminIds.includes(userId)) return;
        
        const chatId = query.message.chat.id;
        const data = query.data;
        const messageId = query.message.message_id;
        
        adminBot.answerCallbackQuery(query.id);
        
        await processarAdminMenu(chatId, userId, data, messageId);
    });
    
    logger.info('🤖 Bot Admin configurado');
}

async function showDashboardAdmin(chatId, userId) {
    const db = getDatabase();
    
    const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes').get().total;
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos').get().total;
    const totalFaturamento = db.prepare('SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = ?').get('approved').total;
    const pedidosHoje = db.prepare("SELECT COUNT(*) as total FROM pedidos WHERE date(data_pedido) = date('now')").get().total;
    
    const mensagem = `📊 *PAINEL ADMINISTRATIVO*\n\n` +
                    `👥 Clientes: *${totalClientes}*\n` +
                    `📦 Pedidos: *${totalPedidos}*\n` +
                    `💰 Faturamento: *${formatarMoeda(totalFaturamento)}*\n` +
                    `🕐 Pedidos Hoje: *${pedidosHoje}*\n\n` +
                    `Selecione uma opção:`;
    
    const teclado = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📍 Unidades', callback_data: 'adm_unidades' }],
                [{ text: '🍕 Cardápio', callback_data: 'adm_cardapio' },
                 { text: '📦 Produtos', callback_data: 'adm_produtos' }],
                [{ text: '🧀 Bordas', callback_data: 'adm_bordas' },
                 { text: '➕ Adicionais', callback_data: 'adm_adicionais' }],
                [{ text: '📏 Tamanhos', callback_data: 'adm_tamanhos' }],
                [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
                [{ text: '👥 Clientes', callback_data: 'adm_clientes' }],
                [{ text: '🎟 Cupons', callback_data: 'adm_cupons' }],
                [{ text: '⚙️ Configurações', callback_data: 'adm_config' }]
            ]
        }
    };
    
    await adminBot.sendMessage(chatId, mensagem, {
        parse_mode: 'Markdown',
        ...teclado
    });
}

async function processarAdminMenu(chatId, userId, data, messageId) {
    switch(data) {
        case 'adm_unidades':
            const { showUnidadesMenu } = require('./unidades');
            await showUnidadesMenu(adminBot, chatId, messageId);
            break;
            
        case 'adm_cardapio':
            const { showCardapioMenu } = require('./cardapio');
            await showCardapioMenu(adminBot, chatId, messageId);
            break;
            
        case 'adm_produtos':
            const { showProdutosMenu } = require('./produtos');
            await showProdutosMenu(adminBot, chatId, messageId);
            break;
            
        case 'adm_pedidos':
            const { showPedidosMenu } = require('./pedidos');
            await showPedidosMenu(adminBot, chatId, messageId);
            break;
            
        case 'adm_clientes':
            const { showClientesMenu } = require('./clientes');
            await showClientesMenu(adminBot, chatId, messageId);
            break;
            
        case 'adm_voltar_dashboard':
            await showDashboardAdmin(chatId, userId);
            break;
    }
}

module.exports = { startAdminBot, getAdminBot: () => adminBot };
