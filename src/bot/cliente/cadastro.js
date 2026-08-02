const { getDatabase } = require('../../database/connection');
const Validacao = require('../../services/validacao');
const EmailService = require('../../services/email');
const Geolocalizacao = require('../../services/geolocalizacao');
const { formatarMoeda } = require('../../utils/helpers');
const { showMenuPrincipal } = require('./menu');

async function iniciarCadastro(bot, chatId) {
    const mensagem = `📝 *Cadastro*\n\n` +
                    `Como podemos te chamar?\n\n` +
                    `_Digite seu nome completo:_`;
    
    await bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
}

async function processarEtapaCadastro(bot, chatId, userId, data, messageId, estados) {
    const estado = estados.get(userId);
    
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
    
    if (data === 'cad_digitar_cep') {
        estado.aguardando = 'cep';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📮 Digite seu CEP (apenas números):');
        return;
    }
    
    if (data === 'cad_pular_endereco') {
        await finalizarCadastro(bot, chatId, userId, estados);
        return;
    }
    
    if (data === 'cad_reenviar_codigo') {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (cliente && cliente.email) {
            const resultado = await EmailService.enviarCodigoVerificacao(cliente.email);
            if (resultado.sucesso) {
                db.prepare('UPDATE clientes SET codigo_email = ? WHERE telegram_id = ?').run(resultado.codigo, userId);
                await bot.sendMessage(chatId, `✅ Novo código gerado!\n\n🔐 Seu código é: *${resultado.codigo}*`, { parse_mode: 'Markdown' });
            }
        }
        return;
    }
}

async function processarTexto(bot, chatId, userId, texto, estados) {
    const estado = estados.get(userId);
    const db = getDatabase();
    
    if (!estado || !estado.aguardando) return;
    
    // NOME
    if (estado.aguardando === 'nome') {
        const validacao = Validacao.validarNome(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        db.prepare(`INSERT INTO clientes (telegram_id, nome, etapa_cadastro) 
                    VALUES (?, ?, 'email')
                    ON CONFLICT(telegram_id) DO UPDATE SET nome = ?, etapa_cadastro = 'email'`)
            .run(userId, validacao.nome, validacao.nome);
        
        estado.aguardando = 'email';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId, `✅ Nome salvo!\n\nAgora, digite seu *email* para receber o código de verificação:`, { parse_mode: 'Markdown' });
    }
    
    // EMAIL
    if (estado.aguardando === 'email') {
        const validacao = Validacao.validarEmail(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        // Gera código IMEDIATAMENTE
        const resultado = await EmailService.enviarCodigoVerificacao(validacao.email);
        const codigo = resultado.codigo;
        
        db.prepare('UPDATE clientes SET email = ?, codigo_email = ?, etapa_cadastro = ? WHERE telegram_id = ?')
            .run(validacao.email, codigo, 'verificar_email', userId);
        
        estado.aguardando = 'codigo';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId, 
            `📧 Um código foi enviado para *${validacao.email}*\n\n` +
            `🔐 Seu código é: *${codigo}*\n\n` +
            `_Verifique também sua caixa de spam_\n\n` +
            `Digite o código de 6 dígitos:`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // CÓDIGO
    if (estado.aguardando === 'codigo') {
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (texto.trim() !== cliente.codigo_email) {
            return bot.sendMessage(chatId, '❌ Código incorreto. Tente novamente.');
        }
        
        db.prepare('UPDATE clientes SET email_verificado = 1, codigo_email = NULL, etapa_cadastro = ? WHERE telegram_id = ?')
            .run('telefone', userId);
        
        estado.aguardando = 'telefone';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId, '✅ Email verificado!\n\nAgora, digite seu *telefone* com DDD:', { parse_mode: 'Markdown' });
    }
    
    // TELEFONE
    if (estado.aguardando === 'telefone') {
        const validacao = Validacao.validarTelefone(texto);
        if (!validacao.valido) {
            return bot.sendMessage(chatId, validacao.mensagem);
        }
        
        db.prepare('UPDATE clientes SET telefone = ?, etapa_cadastro = ? WHERE telegram_id = ?')
            .run(validacao.telefone, 'endereco', userId);
        
        estado.etapa = 'endereco';
        estado.aguardando = null;
        estados.set(userId, estado);
        
        const teclado = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📍 Compartilhar Localização', callback_data: 'cad_localizacao' }],
                    [{ text: '📮 Digitar CEP', callback_data: 'cad_digitar_cep' }],
                    [{ text: '⏭️ Pular (Depois preencho)', callback_data: 'cad_pular_endereco' }]
                ]
            }
        };
        
        return bot.sendMessage(chatId, `✅ Telefone salvo!\n\nAgora, seu endereço:`, {
            parse_mode: 'Markdown',
            ...teclado
        });
    }
    
    // CEP
    if (estado.aguardando === 'cep') {
        const cepValido = await Validacao.validarCEP(texto);
        
        if (!cepValido.valido) {
            return bot.sendMessage(chatId, cepValido.mensagem + '\n\nTente novamente ou compartilhe sua localização.');
        }
        
        const { logradouro, bairro, localidade, uf } = cepValido.dados;
        
        db.prepare(`UPDATE clientes SET 
            cep = ?, logradouro = ?, bairro = ?, cidade = ?, estado = ?,
            etapa_cadastro = 'endereco_numero'
            WHERE telegram_id = ?`)
            .run(cepValido.formatado, logradouro, bairro, localidade, uf, userId);
        
        estado.aguardando = 'numero';
        estados.set(userId, estado);
        
        let msg = `📍 *Endereço encontrado:*\n\n`;
        msg += `📮 CEP: ${cepValido.formatado}\n`;
        msg += `🏠 ${logradouro}\n`;
        msg += `🏘️ ${bairro}\n`;
        msg += `🏙️ ${localidade}/${uf}\n\n`;
        msg += `Agora, digite o *número*:`;
        
        return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    
    // NÚMERO
    if (estado.aguardando === 'numero') {
        db.prepare('UPDATE clientes SET numero = ?, etapa_cadastro = ? WHERE telegram_id = ?')
            .run(texto.trim(), 'completo', userId);
        
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        const enderecoCompleto = `${cliente.logradouro}, ${texto.trim()}, ${cliente.cidade}, ${cliente.estado}`;
        
        const coords = await Geolocalizacao.buscarCoordenadas(enderecoCompleto);
        if (coords) {
            db.prepare('UPDATE clientes SET latitude = ?, longitude = ? WHERE telegram_id = ?')
                .run(coords.latitude, coords.longitude, userId);
            
            const proximas = await Geolocalizacao.encontrarUnidadeProxima(coords.latitude, coords.longitude);
            if (proximas.length > 0) {
                db.prepare('UPDATE clientes SET unidade_proxima_id = ? WHERE telegram_id = ?')
                    .run(proximas[0].id, userId);
                
                await bot.sendMessage(chatId, 
                    `📍 Unidade mais próxima:\n\n` +
                    `🏪 *${proximas[0].nome}*\n` +
                    `📍 ${proximas[0].logradouro}, ${proximas[0].numero}\n` +
                    `📏 ${proximas[0].distancia} km\n` +
                    `🚚 Taxa: ${formatarMoeda(proximas[0].taxa_entrega)}`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
        
        return finalizarCadastro(bot, chatId, userId, estados);
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
        
        await bot.sendMessage(chatId, 
            `📍 Unidade mais próxima:\n\n` +
            `🏪 *${proximas[0].nome}*\n` +
            `📍 ${proximas[0].logradouro}, ${proximas[0].numero}\n` +
            `📏 ${proximas[0].distancia} km\n` +
            `🚚 Taxa: ${formatarMoeda(proximas[0].taxa_entrega)}`,
            { parse_mode: 'Markdown' }
        );
    }
    
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
