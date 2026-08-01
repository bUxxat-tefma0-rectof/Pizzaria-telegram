const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { showMenuPrincipal } = require('./menu');
const { iniciarCadastro, processarEtapaCadastro } = require('./cadastro');

let bot = null;
const estados = new Map(); // Armazena estado da conversa por usuário

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { polling: true });
    
    // Comando /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.nome && cliente.email_verificado) {
            estados.set(userId, { tela: 'menu_principal' });
            return showMenuPrincipal(bot, chatId, cliente.nome);
        }
        
        // Novo cadastro
        estados.set(userId, { tela: 'cadastro', etapa: 'nome' });
        await iniciarCadastro(bot, chatId);
    });
    
    // Callback queries (botões)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;
        
        // Sempre responde o callback
        bot.answerCallbackQuery(query.id);
        
        // Processa navegação do menu
        if (data.startsWith('menu_')) {
            const { processarMenu } = require('./menu');
            await processarMenu(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa cadastro
        if (data.startsWith('cad_')) {
            await processarEtapaCadastro(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa cardápio
        if (data.startsWith('card_') || data.startsWith('cat_') || data.startsWith('prod_') || data.startsWith('tam_') || data.startsWith('borda_') || data.startsWith('adic_')) {
            const { processarCardapio } = require('./cardapio');
            await processarCardapio(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa carrinho
        if (data.startsWith('carr_')) {
            const { processarCarrinho } = require('./carrinho');
            await processarCarrinho(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa pedidos
        if (data.startsWith('ped_')) {
            const { processarPedidos } = require('./pedidos');
            await processarPedidos(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa perfil
        if (data.startsWith('perfil_')) {
            const { processarPerfil } = require('./perfil');
            await processarPerfil(bot, chatId, userId, data, messageId, estados);
            return;
        }
        
        // Processa pagamento
        if (data.startsWith('pag_')) {
            const { processarPagamento } = require('./pagamento');
            await processarPagamento(bot, chatId, userId, data, messageId, estados);
            return;
        }
    });
    
    // Mensagens de texto
    bot.on('message', async (msg) => {
        if (msg.text && msg.text.startsWith('/')) return;
        if (msg.location) return; // Tratado separadamente
        
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        
        if (estado && estado.tela === 'cadastro' && estado.aguardando) {
            const { processarTexto } = require('./cadastro');
            await processarTexto(bot, chatId, userId, msg.text, estados);
        }
    });
    
    // Localização
    bot.on('location', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        
        if (estado && estado.tela === 'cadastro' && estado.etapa === 'endereco') {
            const { processarLocalizacao } = require('./cadastro');
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
