const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { showMenuPrincipal, processarMenu } = require('./menu');
const { iniciarCadastro, processarEtapaCadastro, processarTexto, processarLocalizacao } = require('./cadastro');
const { processarCardapio, pesquisarProdutos } = require('./cardapio');
const { showCarrinho, processarCarrinho } = require('./carrinho');
const { processarPedidos } = require('./pedidos');
const { showPerfil, processarPerfil, processarTextoPerfil } = require('./perfil');
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
        
        estados.set(userId, { tela: 'cadastro', etapa: 'nome', aguardando: 'nome' });
        await iniciarCadastro(bot, chatId);
    });
    
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        
        if (data.startsWith('menu_')) {
            await processarMenu(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('cad_')) {
            await processarEtapaCadastro(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('cat_') || data.startsWith('prod_') || 
            data.startsWith('tam_') || data.startsWith('borda_') || data.startsWith('adic_') || 
            data.startsWith('carr_add_') || data.startsWith('fav_toggle_')) {
            await processarCardapio(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('carr_')) {
            await processarCarrinho(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('ped_') || data === 'menu_pedidos') {
            await processarPedidos(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('perfil_') || data === 'menu_perfil') {
            await processarPerfil(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('pag_') || data.startsWith('aval_')) {
            await processarPagamento(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        if (data.startsWith('fav_') || data === 'menu_favoritos') {
            await processarFavoritos(bot, chatId, userId, data, messageId);
            return;
        }
    });
    
    // ÚNICO handler de mensagem
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Ignora comandos
        if (msg.text && msg.text.startsWith('/')) return;
        
        // Localização
        if (msg.location) {
            const estado = estados.get(userId);
            if (estado && estado.tela === 'cadastro') {
                await processarLocalizacao(bot, chatId, userId, msg.location, estados);
            }
            return;
        }
        
        // Texto
        if (!msg.text) return;
        
        const texto = msg.text;
        const estado = estados.get(userId);
        
        console.log(`📩 Mensagem de ${userId}: "${texto}" | Estado:`, estado ? estado.aguardando : 'sem estado');
        
        if (!estado) return;
        
        // Pesquisa
        if (estado.tela === 'pesquisar' && estado.aguardando === 'termo') {
            estado.aguardando = null;
            estados.set(userId, estado);
            await pesquisarProdutos(bot, chatId, texto, null, userId);
            return;
        }
        
        // Cadastro
        if (estado.tela === 'cadastro' && estado.aguardando) {
            await processarTexto(bot, chatId, userId, texto, estados);
            return;
        }
        
        // Perfil
        if (estado.tela === 'perfil' && estado.aguardando) {
            await processarTextoPerfil(bot, chatId, userId, texto, estados);
            return;
        }
    });
    
    logger.info('🤖 Bot Cliente configurado');
    return bot;
}

function getBot() {
    return bot;
}

module.exports = { startClientBot, getBot };
