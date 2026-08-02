require('dotenv').config();
const express = require('express');
const { initDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Não crasha com erros
process.on('unhandledRejection', (error) => {
    logger.error('Erro não tratado: ' + error.message);
});

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        sistema: '🍕 Pizzaria Telegram',
        timestamp: new Date().toISOString()
    });
});

async function main() {
    logger.info('🍕 Iniciando Sistema de Pizzaria...');
    
    await initDatabase();
    logger.info('✅ Banco de dados pronto');
    
    if (process.env.BOT_TOKEN_CLIENTE) {
        await startClientBot();
        logger.info('✅ Bot Cliente online');
    }
    
    if (process.env.BOT_TOKEN_ADMIN) {
        await startAdminBot();
        logger.info('✅ Bot Admin online');
    }
    
    app.listen(PORT, () => {
        logger.info(`🌐 Servidor web na porta ${PORT}`);
        logger.info('🍕 Sistema completo! Pizzaria pronta para entregas!');
    });
}

main().catch(error => {
    logger.error('Erro fatal: ' + error.message);
});
