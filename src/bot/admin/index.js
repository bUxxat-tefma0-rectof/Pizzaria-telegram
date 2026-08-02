const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const { showUnidadesMenu, processarUnidadesAdmin, processarTextoUnidades } = require('./unidades');
const { showCardapioMenu, processarCardapioAdmin, processarTextoAdmin } = require('./cardapio');
const { showProdutosMenu, processarProdutosAdmin, processarTextoProdutos } = require('./produtos');
const { showPedidosMenu, processarPedidosAdmin } = require('./pedidos');
const { showClientesMenu } = require('./clientes');
const { showRelatoriosMenu } = require('./relatorios');
const { showCuponsMenu, processarCuponsAdmin, processarTextoCupons } = require('./cupons');

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
    
    adminBot.on('message', async (msg) => {
        const userId = msg.from.id;
        
        if (!adminIds.includes(userId)) return;
        if (msg.text && msg.text.startsWith('/')) return;
        
        const estado = estadosAdmin.get(userId);
        if (estado && estado.aguardando && msg.text) {
            await processarTextoAdmin(bot, msg.chat.id, userId, msg.text, estadosAdmin);
            await processarTextoProdutos(bot, msg.chat.id, userId, msg.text, estadosAdmin);
            await processarTextoUnidades(bot, msg.chat.id, userId, msg.text, estadosAdmin);
            await processarTextoCupons(bot, msg.chat.id, userId, msg.text, estadosAdmin);
        }
    });
    
    logger.info('🤖 Bot Admin configurado');
}

async function showDashboardAdmin(chatId, userId) {
    const db = getDatabase();
    
    const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes').get().total;
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos').get().total;
    const totalFaturamento = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved'").get().total;
    const pedidosHoje = db.prepare("SELECT COUNT(*) as total FROM pedidos WHERE date(data_pedido) = date('now')").get().total;
    const pedidosPendentes = db.prepare("SELECT COUNT(*) as total FROM pedidos WHERE status IN ('pendente', 'confirmado') AND pagamento_status = 'approved'").get().total;
    
    const mensagem = `📊 *PAINEL ADMINISTRATIVO*\n\n` +
                    `👥 Clientes: *${totalClientes}*\n` +
                    `📦 Pedidos: *${totalPedidos}*\n` +
                    `⚠️ Pendentes: *${pedidosPendentes}*\n` +
                    `🕐 Hoje: *${pedidosHoje}*\n` +
                    `💰 Faturamento: *${formatarMoeda(totalFaturamento)}*\n\n` +
                    `Selecione uma opção:`;
    
    const teclado = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📍 Unidades', callback_data: 'adm_unidades' }],
                [{ text: '🍕 Cardápio', callback_data: 'adm_cardapio' }, { text: '📦 Produtos', callback_data: 'adm_produtos' }],
                [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
                [{ text: '👥 Clientes', callback_data: 'adm_clientes' }],
                [{ text: '🎟 Cupons', callback_data: 'adm_cupons' }],
                [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }],
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
    // Unidades
    if (data.startsWith('adm_unid')) {
        await processarUnidadesAdmin(adminBot, chatId, userId, data, messageId, estadosAdmin);
        return;
    }
    
    // Cardápio
    if (data.startsWith('adm_cardapio') || data.startsWith('adm_cat_') || data.startsWith('adm_borda') || data.startsWith('adm_adic') || data.startsWith('adm_tam')) {
        await processarCardapioAdmin(adminBot, chatId, userId, data, messageId, estadosAdmin);
        return;
    }
    
    // Produtos
    if (data.startsWith('adm_prod')) {
        await processarProdutosAdmin(adminBot, chatId, userId, data, messageId, estadosAdmin);
        return;
    }
    
    // Pedidos
    if (data.startsWith('adm_pedido') || data.startsWith('adm_status')) {
        await processarPedidosAdmin(adminBot, chatId, userId, data, messageId);
        return;
    }
    
    // Cupons
    if (data.startsWith('adm_cupom')) {
        await processarCuponsAdmin(adminBot, chatId, userId, data, messageId, estadosAdmin);
        return;
    }
    
    // Menu principal
    switch(data) {
        case 'adm_pedidos':
            await showPedidosMenu(adminBot, chatId, messageId);
            break;
        case 'adm_clientes':
            await showClientesMenu(adminBot, chatId, messageId);
            break;
        case 'adm_relatorios':
            await showRelatoriosMenu(adminBot, chatId, messageId);
            break;
        case 'adm_config':
            await adminBot.sendMessage(chatId, '⚙️ Configurações em desenvolvimento.');
            break;
        case 'adm_voltar_dashboard':
            await showDashboardAdmin(chatId, userId);
            break;
    }
}

function getAdminBot() {
    return adminBot;
}

module.exports = { startAdminBot, getAdminBot };
