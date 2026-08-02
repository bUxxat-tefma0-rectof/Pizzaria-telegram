require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase, getDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (error) => {
    logger.error('Erro: ' + error.message);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'online', sistema: '🍕 Pizzaria Telegram', timestamp: new Date().toISOString() });
});

// Página do formulário WebApp
app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'cadastro.html'));
});

// API do formulário WebApp
app.post('/api/cadastro-webapp', (req, res) => {
    const db = getDatabase();
    const { userId, nome, email, telefone, cep, rua, numero, bairro, cidade, estado } = req.body;
    
    if (!userId || !nome || !email || !telefone) {
        return res.json({ sucesso: false, mensagem: 'Dados obrigatórios faltando.' });
    }
    
    if (nome.trim().length < 3 || nome.trim().split(' ').filter(p => p.length > 0).length < 2) {
        return res.json({ sucesso: false, mensagem: 'Digite nome e sobrenome.' });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.json({ sucesso: false, mensagem: 'Email inválido.' });
    }
    
    const telLimpo = telefone.replace(/\D/g, '');
    if (telLimpo.length < 10 || telLimpo.length > 11) {
        return res.json({ sucesso: false, mensagem: 'Telefone inválido.' });
    }
    
    try {
        db.prepare(`INSERT INTO clientes (telegram_id, nome, email, email_verificado, telefone, cep, logradouro, numero, bairro, cidade, estado, etapa_cadastro)
                    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'completo')
                    ON CONFLICT(telegram_id) DO UPDATE SET
                    nome = ?, email = ?, email_verificado = 1, telefone = ?, cep = ?, logradouro = ?, numero = ?, bairro = ?, cidade = ?, estado = ?, etapa_cadastro = 'completo'`)
            .run(userId, nome, email, telLimpo, cep, rua, numero, bairro, cidade, estado,
                 nome, email, telLimpo, cep, rua, numero, bairro, cidade, estado);
        
        logger.info(`✅ Cadastro WebApp: ${nome}`);
        res.json({ sucesso: true, mensagem: 'Cadastro realizado!' });
    } catch (error) {
        logger.error('Erro cadastro: ' + error.message);
        res.json({ sucesso: false, mensagem: 'Erro ao salvar.' });
    }
});

async function main() {
    logger.info('🍕 Iniciando...');
    await initDatabase();
    logger.info('✅ Banco pronto');
    
    if (process.env.BOT_TOKEN_CLIENTE) {
        await startClientBot();
        logger.info('✅ Bot Cliente online');
    }
    
    if (process.env.BOT_TOKEN_ADMIN) {
        await startAdminBot();
        logger.info('✅ Bot Admin online');
    }
    
    app.listen(PORT, () => {
        logger.info(`🌐 Porta ${PORT}`);
        logger.info('🍕 Sistema completo!');
    });
}

main().catch(error => {
    logger.error('Erro fatal: ' + error.message);
    process.exit(1);
});
