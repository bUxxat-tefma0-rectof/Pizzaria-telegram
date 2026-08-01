require('dotenv').config();
const { initDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const logger = require('./utils/logger');

async function main() {
    logger.info('🍕 Iniciando Sistema de Pizzaria...');
    
    // Inicializa banco de dados
    await initDatabase();
    logger.info('✅ Banco de dados pronto');
    
    // Inicia bot do cliente
    if (process.env.BOT_TOKEN_CLIENTE) {
        await startClientBot();
        logger.info('✅ Bot Cliente online');
    }
    
    // Inicia bot admin
    if (process.env.BOT_TOKEN_ADMIN) {
        await startAdminBot();
        logger.info('✅ Bot Admin online');
    }
    
    logger.info('🍕 Sistema completo! Pizzaria pronta para entregas!');
}

main().catch(error => {
    logger.error('Erro fatal:', error);
    process.exit(1);
});
