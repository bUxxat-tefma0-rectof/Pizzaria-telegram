require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase, getDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Não crasha com erros não tratados
process.on('unhandledRejection', (error) => {
    logger.error('Erro não tratado: ' + error.message);
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ ROTAS ============

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        sistema: '🍕 Pizzaria Telegram',
        timestamp: new Date().toISOString()
    });
});

// Página do formulário de cadastro (WebApp)
app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'cadastro.html'));
});

// API que recebe os dados do formulário de cadastro
app.post('/api/cadastro-webapp', (req, res) => {
    const db = getDatabase();
    const { userId, nome, email, telefone, cep, rua, numero, bairro, cidade, estado } = req.body;
    
    if (!userId || !nome || !email || !telefone) {
        return res.json({ sucesso: false, mensagem: 'Dados obrigatórios faltando.' });
    }
    
    // Validações
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
        
        logger.info(`✅ Cadastro WebApp: ${nome} (ID: ${userId})`);
        res.json({ sucesso: true, mensagem: 'Cadastro realizado com sucesso!' });
    } catch (error) {
        logger.error('Erro ao salvar cadastro: ' + error.message);
        res.json({ sucesso: false, mensagem: 'Erro ao salvar. Tente novamente.' });
    }
});

// ============ INICIAR ============
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
    
    // Inicia servidor web
    app.listen(PORT, () => {
        logger.info(`🌐 Servidor web na porta ${PORT}`);
        logger.info(`📝 Formulário: http://localhost:${PORT}/cadastro`);
        logger.info('🍕 Sistema completo! Pizzaria pronta para entregas!');
    });
}

main().catch(error => {
    logger.error('Erro fatal: ' + error.message);
    process.exit(1);
});
