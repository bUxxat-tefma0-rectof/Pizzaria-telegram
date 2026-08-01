const { getDatabase } = require('../../database/connection');
const Validacao = require('../../services/validacao');
const EmailService = require('../../services/email');
const Geolocalizacao = require('../../services/geolocalizacao');
const { formatarMoeda, gerarCodigo } = require('../../utils/helpers');
const { showMenuPrincipal } = require('./menu');

async function iniciarCadastro(bot, chatId) {
    const mensagem = `📝 *Cadastro*\n\n` +
                    `Como podemos te chamar?\n\n` +
                    `_Digite seu nome completo:_`;
    
    await bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
}

async function processarEtapaCadastro(bot, chatId, userId, data, messageId, estados) {
    const estado = estados.get(userId);
    
    // Compartilhar localização
    if (data === 'cad_localizacao') {
        await bot.sendMessage(chatId, '📍 Por favor, compartilhe sua localização:', {
            reply_markup: {
                keyboard: [[{ text: '📍 Compartilhar Localização', request_location: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }
    
    // Pular endereço
    if (data === 'cad_pular_endereco') {
        finalizarCadastro(bot, chatId, userId, estados);
        return;
    }
    
    if (data === 'cad_confirmar_codigo') {
        estado.aguardando = 'codigo';
        await bot.sendMessage(chatId, 'Digite o código de 6 dígitos enviado para seu email:');
        return;
    }
    
    if (data === 'cad_reenviar_codigo') {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (cliente && cliente.email) {
            const resultado = await EmailService.enviarCodigoVerificacao(cliente.email);
            if (resultado.sucesso) {
                db.prepare('UPDATE clientes SET codigo_email = ? WHERE telegram_id = ?').run(resultado.codigo, userId);
                await bot.sendMessage(chatId, '✅ Novo código enviado para seu email!');
            }
        }
        return;
    }
}

async function processarTexto(bot, chatId, userId, texto, estados) {
    const estado = estados.get(userId);
    const db = getDatabase();
    
    if (estado.aguardando === 'nome') {
        const validacao = Validacao.validarNome(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        // Salva nome
        db.prepare(`INSERT INTO clientes (telegram_id, nome, etapa_cadastro) 
                    VALUES (?, ?, 'email')
                    ON CONFLICT(telegram_id) DO UPDATE SET nome = ?, etapa_cadastro = 'email'`)
            .run(userId, validacao.nome, validacao.nome);
        
        estado.aguardando = 'email';
        return bot.sendMessage(chatId, `✅ Nome salvo!\n\nAgora, digite seu *email* para receber o código de verificação:`, { parse_mode: 'Markdown' });
    }
    
    if (estado.aguardando === 'email') {
        const validacao = Validacao.validarEmail(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        // Envia código
        const resultado = await EmailService.enviarCodigoVerificacao(validacao.email);
        if (!resultado.sucesso) {
            return bot.sendMessage(chatId, '❌ Erro ao enviar email. Tente novamente.');
        }
        
        db.prepare('UPDATE clientes SET email = ?, codigo_email = ?, etapa_cadastro = ? WHERE telegram_id = ?')
            .run(validacao.email, resultado.codigo, 'verificar_email', userId);
        
        estado.aguardando = 'codigo';
        
        const teclado = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📩 Reenviar Código', callback_data: 'cad_reenviar_codigo' }]
                ]
            }
        };
        
        return bot.sendMessage(chatId, `📧 Código enviado para *${validacao.email}*\n\nDigite o código de 6 dígitos:`, {
            parse_mode: 'Markdown',
            ...teclado
        });
    }
    
    if (estado.aguardando === 'codigo') {
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (texto.trim() !== cliente.codigo_email) {
            return bot.sendMessage(chatId, '❌ Código incorreto. Tente novamente.');
        }
        
        db.prepare('UPDATE clientes SET email_verificado = 1, codigo_email = NULL, etapa_cadastro = ? WHERE telegram_id = ?')
            .run('telefone', userId);
        
        estado.aguardando = 'telefone';
        return bot.sendMessage(chatId, '✅ Email verificado!\n\nAgora, digite seu *telefone*:', { parse_mode: 'Markdown' });
    }
    
    if (estado.aguardando === 'telefone') {
        const validacao = Validacao.validarTelefone(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        db.prepare('UPDATE clientes SET telefone = ?, etapa_cadastro = ? WHERE telegram_id = ?')
            .run(validacao.telefone, 'endereco', userId);
        
        estado.etapa = 'endereco';
        estado.aguardando = null;
        
        const teclado = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📍 Compartilhar Localização', callback_data: 'cad_localizacao' }],
                    [{ text: '⏭️ Pular (Depois preencho)', callback_data: 'cad_pular_endereco' }]
                ]
            }
        };
        
        return bot.sendMessage(chatId, `✅ Telefone salvo!\n\nAgora, seu endereço:\n_Digite no formato: Rua, Número, Bairro, Cidade, Estado_\n\nExemplo: Rua Principal, 100, Centro, Paranavaí, PR\n\nOu compartilhe sua localização:`, {
            parse_mode: 'Markdown',
            ...teclado
        });
    }
    
    if (estado.etapa === 'endereco') {
        const partes = texto.split(',').map(p => p.trim());
        
        if (partes.length >= 4) {
            const [logradouro, numero, bairro, cidade, estado] = partes;
            
            db.prepare(`UPDATE clientes SET 
                logradouro = ?, numero = ?, bairro = ?, cidade = ?, estado = ?,
                etapa_cadastro = 'completo'
                WHERE telegram_id = ?`)
                .run(logradouro, numero, bairro, cidade, estado || 'PR', userId);
            
            // Busca unidade próxima
            const coords = await Geolocalizacao.buscarCoordenadas(`${logradouro}, ${numero}, ${cidade}, ${estado || 'PR'}`);
            if (coords) {
                const proximas = await Geolocalizacao.encontrarUnidadeProxima(coords.latitude, coords.longitude);
                if (proximas.length > 0) {
                    db.prepare('UPDATE clientes SET unidade_proxima_id = ?, latitude = ?, longitude = ? WHERE telegram_id = ?')
                        .run(proximas[0].id, coords.latitude, coords.longitude, userId);
                    
                    await bot.sendMessage(chatId, `📍 Você está mais próximo da unidade:\n\n🏪 *${proximas[0].nome}*\n📍 ${proximas[0].logradouro}, ${proximas[0].numero}\n📏 ${proximas[0].distancia} km\n🚚 Taxa de entrega: ${formatarMoeda(proximas[0].taxa_entrega)}`, { parse_mode: 'Markdown' });
                }
            }
            
            return finalizarCadastro(bot, chatId, userId, estados);
        }
        
        return bot.sendMessage(chatId, '❌ Formato inválido. Use: Rua, Número, Bairro, Cidade, Estado');
    }
}

async function processarLocalizacao(bot, chatId, userId, location, estados) {
    const db = getDatabase();
    const { latitude, longitude } = location;
    
    db.prepare('UPDATE clientes SET latitude = ?, longitude = ?, etapa_cadastro = ? WHERE telegram_id = ?')
        .run(latitude, longitude, 'completo', userId);
    
    const proximas = await Geolocalizacao.encontrarUnidadeProxima(latitude, longitude);
    
    if (proximas.length > 0) {
        db.prepare('UPDATE clientes SET unidade_proxima_id = ? WHERE telegram_id = ?')
            .run(proximas[0].id, userId);
        
        await bot.sendMessage(chatId, `📍 Unidade mais próxima:\n\n🏪 *${proximas[0].nome}*\n📍 ${proximas[0].logradouro}, ${proximas[0].numero}\n📏 ${proximas[0].distancia} km\n🚚 Taxa: ${formatarMoeda(proximas[0].taxa_entrega)}`, { parse_mode: 'Markdown' });
    }
    
    // Remove teclado de localização
    await bot.sendMessage(chatId, '✅ Localização salva!', {
        reply_markup: { remove_keyboard: true }
    });
    
    await finalizarCadastro(bot, chatId, userId, estados);
}

async function finalizarCadastro(bot, chatId, userId, estados) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
    
    estados.set(userId, { tela: 'menu_principal' });
    
    await bot.sendMessage(chatId, `🎉 *Cadastro concluído!*\n\nBem-vindo(a), ${cliente.nome}!`, { parse_mode: 'Markdown' });
    
    await showMenuPrincipal(bot, chatId, cliente.nome);
}

module.exports = { iniciarCadastro, processarEtapaCadastro, processarTexto, processarLocalizacao };
