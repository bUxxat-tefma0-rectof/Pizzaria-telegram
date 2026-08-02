const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const { toggleFavorito } = require('./favoritos');

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
        { text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }
    ]);
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

async function pesquisarProdutos(bot, chatId, termo, messageId, userId) {
    const db = getDatabase();
    const produtos = db.prepare(`
        SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji,
               (SELECT MIN(preco) FROM tamanhos WHERE produto_id = p.id AND ativo = 1) as preco_min
        FROM produtos p 
        LEFT JOIN categorias c ON p.categoria_id = c.id 
        WHERE p.disponivel = 1 AND (p.nome LIKE ? OR p.descricao LIKE ? OR p.ingredientes LIKE ?)
        ORDER BY p.ordem
    `).all(`%${termo}%`, `%${termo}%`, `%${termo}%`);
    
    if (produtos.length === 0) {
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Ver Cardápio', callback_data: 'menu_cardapio' }],
                [{ text: '🔍 Nova Pesquisa', callback_data: 'menu_pesquisar' }],
                [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
            ]
        };
        
        return bot.editMessageText(`🔍 Nenhum produto encontrado para "*${termo}*"`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
    
    let mensagem = `🔍 *Resultados para "${termo}"*\n\n`;
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        mensagem += `${prod.categoria_emoji || '📦'} *${prod.nome}*\n`;
        mensagem += `💰 A partir de ${formatarMoeda(prod.preco_min || 0)}\n`;
        mensagem += `📂 ${prod.categoria_nome}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `🍕 ${prod.nome}`, callback_data: `prod_${prod.id}` },
            { text: '❤️', callback_data: `fav_toggle_${prod.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'menu_cardapio' }
    ]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showProdutos(bot, chatId, categoriaId, messageId, userId) {
    const db = getDatabase();
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(categoriaId);
    const produtos = db.prepare(`
        SELECT p.*, (SELECT MIN(preco) FROM tamanhos WHERE produto_id = p.id AND ativo = 1) as preco_min
        FROM produtos p
        WHERE p.categoria_id = ? AND p.disponivel = 1 
        ORDER BY p.ordem
    `).all(categoriaId);
    
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
    
    // Verifica favoritos do usuário
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const favoritos = db.prepare('SELECT produto_id FROM favoritos WHERE cliente_id = ?').all(cliente?.id || 0);
    const favIds = favoritos.map(f => f.produto_id);
    
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        const isFav = favIds.includes(prod.id);
        teclado.inline_keyboard.push([
            { 
                text: `${isFav ? '❤️' : '🍕'} ${prod.nome} - A partir de ${formatarMoeda(prod.preco_min || 0)}`, 
                callback_data: `prod_${prod.id}` 
            },
            { text: isFav ? '❤️' : '🤍', callback_data: `fav_toggle_${prod.id}` }
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
    
    // Verifica se é favorito
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const isFav = db.prepare('SELECT id FROM favoritos WHERE cliente_id = ? AND produto_id = ?').get(cliente?.id || 0, produtoId);
    
    let mensagem = `🍕 *${produto.nome}*\n\n`;
    if (produto.descricao) mensagem += `📝 ${produto.descricao}\n`;
    if (produto.ingredientes) mensagem += `🥬 ${produto.ingredientes}\n`;
    mensagem += `\nEscolha o tamanho:`;
    
    if (produto.foto) {
        await bot.sendPhoto(chatId, produto.foto, {
            caption: mensagem,
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
        { text: isFav ? '❤️ Remover Favorito' : '🤍 Adicionar Favorito', callback_data: `fav_toggle_${produtoId}` }
    ]);
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: `cat_${produto.categoria_id}` }
    ]);
    
    const msg = produto.foto ? 
        await bot.sendMessage(chatId, 'Escolha o tamanho:', { parse_mode: 'Markdown', reply_markup: teclado }) :
        await bot.editMessageText(mensagem, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
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
    const adicionais = db.prepare('SELECT * FROM adicionais WHERE disponivel = 1 ORDER BY categoria, nome').all();
    
    const teclado = { inline_keyboard: [] };
    let categoriaAtual = '';
    
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
    
    if (data.startsWith('cat_')) {
        const catId = data.split('_')[1];
        estado.categoriaId = catId;
        estados.set(userId, estado);
        await showProdutos(bot, chatId, catId, messageId, userId);
        return;
    }
    
    if (data.startsWith('prod_')) {
        const prodId = data.split('_')[1];
        estado.produtoId = prodId;
        estados.set(userId, estado);
        await showTamanhos(bot, chatId, prodId, messageId, userId);
        return;
    }
    
    if (data.startsWith('tam_')) {
        const partes = data.split('_');
        estado.tamanhoId = partes[1];
        estado.produtoId = partes[2];
        estados.set(userId, estado);
        await showBordas(bot, chatId, partes[1], partes[2], messageId, userId);
        return;
    }
    
    if (data.startsWith('borda_')) {
        const partes = data.split('_');
        estado.bordaId = partes[1];
        estado.tamanhoId = partes[2];
        estado.produtoId = partes[3];
        estado.adicionais = [];
        estados.set(userId, estado);
        await showAdicionais(bot, chatId, partes[1], partes[2], partes[3], messageId, userId, []);
        return;
    }
    
    if (data.startsWith('adic_')) {
        const partes = data.split('_');
        const adicId = parseInt(partes[1]);
        
        if (!estado.adicionais) estado.adicionais = [];
        
        const index = estado.adicionais.indexOf(adicId);
        if (index > -1) {
            estado.adicionais.splice(index, 1);
        } else {
            estado.adicionais.push(adicId);
        }
        
        estados.set(userId, estado);
        await showAdicionais(bot, chatId, partes[2], partes[3], partes[4], messageId, userId, estado.adicionais);
        return;
    }
    
    if (data.startsWith('carr_add_')) {
        const partes = data.split('_');
        const bordaId = partes[2];
        const tamId = partes[3];
        const prodId = partes[4];
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        const result = db.prepare(`INSERT INTO carrinhos (cliente_id, produto_id, tamanho_id, borda_id, quantidade) 
                      VALUES (?, ?, ?, ?, 1)`).run(cliente.id, prodId, tamId, bordaId);
        
        if (estado.adicionais && estado.adicionais.length > 0) {
            const insertAdic = db.prepare('INSERT INTO carrinho_adicionais (carrinho_id, adicional_id) VALUES (?, ?)');
            for (const adicId of estado.adicionais) {
                insertAdic.run(result.lastInsertRowid, adicId);
            }
        }
        
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
        
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Continuar Comprando', callback_data: 'menu_cardapio' }],
                [{ text: '🛒 Ver Carrinho', callback_data: 'menu_carrinho' }],
                [{ text: '💳 Finalizar Pedido', callback_data: 'carr_finalizar' }]
            ]
        };
        
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
        return;
    }
    
    // Favorito toggle
    if (data.startsWith('fav_toggle_')) {
        const prodId = data.split('_')[2];
        await toggleFavorito(bot, chatId, userId, prodId);
        
        // Recarrega a lista atual
        if (estado.categoriaId) {
            await showProdutos(bot, chatId, estado.categoriaId, messageId, userId);
        }
        return;
    }
}

module.exports = { showCategorias, showProdutos, showTamanhos, showBordas, showAdicionais, processarCardapio, pesquisarProdutos };
