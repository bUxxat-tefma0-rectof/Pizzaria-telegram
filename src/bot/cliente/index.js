const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { showMenuPrincipal } = require('./menu');
const { iniciarCadastro, processarEtapaCadastro, processarTexto, processarLocalizacao } = require('./cadastro');
const { processarCardapio } = require('./cardapio');
const { showCarrinho, processarCarrinho, processarTextoCarrinho } = require('./carrinho');
const { processarPedidos } = require('./pedidos');
const { showPerfil, processarPerfil } = require('./perfil');
const { processarPagamento } = require('./pagamento');
const { processarFavoritos } = require('./favoritos');

let bot = null;
const estados = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { polling: true });
    
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.nome && cliente.email_verificado) {
            estados.set(userId, { tela: 'menu_principal' });
            return showMenuPrincipal(bot, chatId, cliente.nome);
        }
        
        estados.set(userId, { tela: 'cadastro', etapa: 'nome' });
        await iniciarCadastro(bot, chatId);
    });
    
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        
        // Menu
        if (data.startsWith('menu_')) {
            const { processarMenu } = require('./menu');
            await processarMenu(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Cadastro
        if (data.startsWith('cad_')) {
            await processarEtapaCadastro(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Cardápio
        if (data.startsWith('card_') || data.startsWith('cat_') || data.startsWith('prod_') || 
            data.startsWith('tam_') || data.startsWith('borda_') || data.startsWith('adic_') || data.startsWith('carr_add_')) {
            await processarCardapio(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Carrinho
        if (data.startsWith('carr_')) {
            await processarCarrinho(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Pedidos
        if (data.startsWith('ped_') || data === 'menu_pedidos') {
            await processarPedidos(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Perfil
        if (data.startsWith('perfil_') || data === 'menu_perfil') {
            await processarPerfil(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Pagamento
        if (data.startsWith('pag_') || data.startsWith('aval_')) {
            await processarPagamento(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Favoritos
        if (data.startsWith('fav_') || data === 'menu_favoritos') {
            await processarFavoritos(bot, chatId, userId, data, messageId);
            return;
        }
    });
    
    bot.on('message', async (msg) => {
        if (msg.text && msg.text.startsWith('/')) return;
        if (msg.location) {
            const userId = msg.from.id;
            const estado = estados.get(userId);
            if (estado && estado.tela === 'cadastro' && estado.etapa === 'endereco') {
                await processarLocalizacao(bot, msg.chat.id, userId, msg.location, estados);
            }
            return;
        }
        
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const texto = msg.text;
        
        if (!texto) return;
        
        const estado = estados.get(userId);
        
        // Cadastro
        if (estado && estado.tela === 'cadastro' && estado.aguardando) {
            await processarTexto(bot, chatId, userId, texto, estados);
            return;
        }
        
        // Cupom ou observação
        const { estadosCarrinho } = require('./carrinho');
        const estadoCarrinho = estadosCarrinho.get(userId);
        
        if (estadoCarrinho && (estadoCarrinho.aguardandoCupom || estadoCarrinho.aguardandoObs)) {
            await processarTextoCarrinho(bot, chatId, userId, texto, null);
            return;
        }
    });
    
    bot.on('location', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        
        if (estado && estado.tela === 'cadastro' && estado.etapa === 'endereco') {
            await processarLocalizacao(bot, chatId, userId, msg.location, estados);
        }
    });
    
    logger.info('🤖 Bot Cliente configurado');
    return bot;
}

function getBot() {
    return bot;
}

module.exports = { startClientBot, getBot };
