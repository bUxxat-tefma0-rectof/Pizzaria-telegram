const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showCategorias(bot, chatId, messageId) {
    const db = getDatabase();
    const categorias = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    
    const teclado = { inline_keyboard: [] };
    
    for (const cat of categorias) {
        teclado.inline_keyboard.push([
            { text: `${cat.emoji} ${cat.nome}`, callback_data: `cat_${cat.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }
    ]);
    
    await bot.editMessageText('🍕 *CARDÁPIO*\n\nEscolha uma categoria:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showProdutos(bot, chatId, categoriaId, messageId, userId) {
    const db = getDatabase();
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(categoriaId);
    const produtos = db.prepare('SELECT * FROM produtos WHERE categoria_id = ? AND disponivel = 1 ORDER BY ordem').all(categoriaId);
    
    if (produtos.length === 0) {
        const teclado = {
            inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]]
        };
        return bot.editMessageText('😕 Nenhum produto disponível nesta categoria.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: teclado
        });
    }
    
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        const tamanhos = db.prepare('SELECT MIN(preco) as preco_min FROM tamanhos WHERE produto_id = ? AND ativo = 1').get(prod.id);
        const preco = tamanhos?.preco_min || 0;
        
        teclado.inline_keyboard.push([
            { text: `${prod.nome} - A partir de ${formatarMoeda(preco)}`, callback_data: `prod_${prod.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'menu_cardapio' }
    ]);
    
    await bot.editMessageText(`${categoria.emoji} *${categoria.nome}*\n\nEscolha um produto:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showTamanhos(bot, chatId, produtoId, messageId, userId) {
    const db = getDatabase();
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
    const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id = ? AND ativo = 1').all(produtoId);
    
    if (produto.foto) {
        await bot.sendPhoto(chatId, produto.foto, {
            caption: `🍕 *${produto.nome}*\n\n📝 ${produto.descricao || ''}\n🥬 ${produto.ingredientes || ''}\n\nEscolha o tamanho:`,
            parse_mode: 'Markdown'
        });
    }
    
    const teclado = { inline_keyboard: [] };
    
    for (const tam of tamanhos) {
        teclado.inline_keyboard.push([
            { 
                text: `🍕 ${tam.nome} - ${formatarMoeda(tam.preco)} (${tam.fatias} fatias)`, 
                callback_data: `tam_${tam.id}_${produtoId}` 
            }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: `cat_${produto.categoria_id}` }
    ]);
    
    const mensagem = produto.foto ? undefined : 
        `🍕 *${produto.nome}*\n\n📝 ${produto.descricao || ''}\n🥬 ${produto.ingredientes || ''}\n\nEscolha o tamanho:`;
    
    if (produto.foto) {
        await bot.sendMessage(chatId, 'Escolha o tamanho:', {
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    } else {
        await bot.editMessageText(mensagem, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
}

async function showBordas(bot, chatId, tamanhoId, produtoId, messageId, userId) {
    const db = getDatabase();
    const bordas = db.prepare('SELECT * FROM bordas WHERE ativo = 1').all();
    
    const teclado = { inline_keyboard: [] };
    
    for (const borda of bordas) {
        const precoTexto = borda.preco > 0 ? ` (+${formatarMoeda(borda.preco)})` : '';
        teclado.inline_keyboard.push([
            { text: `🧀 ${borda.nome}${precoTexto}`, callback_data: `borda_${borda.id}_${tamanhoId}_${produtoId}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: `prod_${produtoId}` }
    ]);
    
    await bot.editMessageText('🧀 Escolha a borda:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showAdicionais(bot, chatId, bordaId, tamanhoId, produtoId, messageId, userId, selecionados = []) {
    const db = getDatabase();
    const adicionais = db.prepare('SELECT * FROM adicionais WHERE disponivel = 1').all();
    
    const teclado = { inline_keyboard: [] };
    
    for (const adic of adicionais) {
        const selecionado = selecionados.includes(adic.id);
        const prefixo = selecionado ? '✅' : '➕';
        teclado.inline_keyboard.push([
            { 
                text: `${prefixo} ${adic.nome} (+${formatarMoeda(adic.preco)})`, 
                callback_data: `adic_${adic.id}_${bordaId}_${tamanhoId}_${produtoId}` 
            }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '✅ Continuar →', callback_data: `carr_add_${bordaId}_${tamanhoId}_${produtoId}` }
    ]);
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: `tam_${tamanhoId}_${produtoId}` }
    ]);
    
    const selecionadosNomes = adicionais
        .filter(a => selecionados.includes(a.id))
        .map(a => a.nome)
        .join(', ');
    
    const mensagem = `➕ *Adicionais*\n\n` +
                    `Selecionados: ${selecionadosNomes || 'Nenhum'}\n\n` +
                    `Escolha seus adicionais:`;
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarCardapio(bot, chatId, userId, data, messageId, estados) {
    const estado = estados.get(userId) || {};
    
    // Categorias
    if (data.startsWith('cat_')) {
        const catId = data.split('_')[1];
        estado.categoriaId = catId;
        estados.set(userId, estado);
        await showProdutos(bot, chatId, catId, messageId, userId);
    }
    
    // Produtos
    else if (data.startsWith('prod_')) {
        const prodId = data.split('_')[1];
        estado.produtoId = prodId;
        estados.set(userId, estado);
        await showTamanhos(bot, chatId, prodId, messageId, userId);
    }
    
    // Tamanhos
    else if (data.startsWith('tam_')) {
        const partes = data.split('_');
        const tamId = partes[1];
        const prodId = partes[2];
        estado.tamanhoId = tamId;
        estado.produtoId = prodId;
        estados.set(userId, estado);
        await showBordas(bot, chatId, tamId, prodId, messageId, userId);
    }
    
    // Bordas
    else if (data.startsWith('borda_')) {
        const partes = data.split('_');
        const bordaId = partes[1];
        const tamId = partes[2];
        const prodId = partes[3];
        estado.bordaId = bordaId;
        estado.tamanhoId = tamId;
        estado.produtoId = prodId;
        estado.adicionais = [];
        estados.set(userId, estado);
        await showAdicionais(bot, chatId, bordaId, tamId, prodId, messageId, userId, []);
    }
    
    // Adicionais (toggle)
    else if (data.startsWith('adic_')) {
        const partes = data.split('_');
        const adicId = parseInt(partes[1]);
        const bordaId = partes[2];
        const tamId = partes[3];
        const prodId = partes[4];
        
        if (!estado.adicionais) estado.adicionais = [];
        
        const index = estado.adicionais.indexOf(adicId);
        if (index > -1) {
            estado.adicionais.splice(index, 1);
        } else {
            estado.adicionais.push(adicId);
        }
        
        estados.set(userId, estado);
        await showAdicionais(bot, chatId, bordaId, tamId, prodId, messageId, userId, estado.adicionais);
    }
    
    // Adicionar ao carrinho
    else if (data.startsWith('carr_add_')) {
        const partes = data.split('_');
        const bordaId = partes[2];
        const tamId = partes[3];
        const prodId = partes[4];
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        // Verifica se já tem carrinho
        let carrinho = db.prepare('SELECT * FROM carrinhos WHERE cliente_id = ? LIMIT 1').get(cliente.id);
        
        if (!carrinho) {
            // Cria novo carrinho
            const result = db.prepare(`INSERT INTO carrinhos (cliente_id, produto_id, tamanho_id, borda_id, quantidade) 
                          VALUES (?, ?, ?, ?, 1)`).run(cliente.id, prodId, tamId, bordaId);
            
            // Salva adicionais
            if (estado.adicionais && estado.adicionais.length > 0) {
                const insertAdic = db.prepare('INSERT INTO carrinho_adicionais (carrinho_id, adicional_id) VALUES (?, ?)');
                for (const adicId of estado.adicionais) {
                    insertAdic.run(result.lastInsertRowid, adicId);
                }
            }
        } else {
            // Adiciona ao carrinho existente
            const result = db.prepare(`INSERT INTO carrinhos (cliente_id, produto_id, tamanho_id, borda_id, quantidade) 
                          VALUES (?, ?, ?, ?, 1)`).run(cliente.id, prodId, tamId, bordaId);
            
            if (estado.adicionais && estado.adicionais.length > 0) {
                const insertAdic = db.prepare('INSERT INTO carrinho_adicionais (carrinho_id, adicional_id) VALUES (?, ?)');
                for (const adicId of estado.adicionais) {
                    insertAdic.run(result.lastInsertRowid, adicId);
                }
            }
        }
        
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Continuar Comprando', callback_data: 'menu_cardapio' }],
                [{ text: '🛒 Ver Carrinho', callback_data: 'menu_carrinho' }],
                [{ text: '💳 Finalizar Pedido', callback_data: 'carr_finalizar' }]
            ]
        };
        
        // Pega info do produto
        const produto = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(prodId);
        const tamanho = db.prepare('SELECT nome, preco FROM tamanhos WHERE id = ?').get(tamId);
        const borda = db.prepare('SELECT nome, preco FROM bordas WHERE id = ?').get(bordaId);
        
        let totalAdicionais = 0;
        if (estado.adicionais && estado.adicionais.length > 0) {
            for (const adicId of estado.adicionais) {
                const adic = db.prepare('SELECT preco FROM adicionais WHERE id = ?').get(adicId);
                totalAdicionais += adic?.preco || 0;
            }
        }
        
        const subtotal = tamanho.preco + borda.preco + totalAdicionais;
        
        await bot.sendMessage(chatId, 
            `✅ *Adicionado ao carrinho!*\n\n` +
            `🍕 ${produto.nome}\n` +
            `📏 ${tamanho.nome} - ${formatarMoeda(tamanho.preco)}\n` +
            `🧀 ${borda.nome}${borda.preco > 0 ? ' (+' + formatarMoeda(borda.preco) + ')' : ''}\n` +
            `➕ ${estado.adicionais?.length || 0} adicionais\n` +
            `💰 Subtotal: *${formatarMoeda(subtotal)}*\n\n` +
            `O que deseja fazer?`,
            { parse_mode: 'Markdown', reply_markup: teclado }
        );
        
        estado.adicionais = [];
        estados.set(userId, estado);
    }
}

module.exports = { showCategorias, showProdutos, showTamanhos, showBordas, showAdicionais, processarCardapio };
