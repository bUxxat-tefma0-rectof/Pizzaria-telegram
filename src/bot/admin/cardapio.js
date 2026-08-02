const { getDatabase } = require('../../database/connection');

async function showCardapioMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const categorias = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
    
    let mensagem = '🍕 *GERENCIAR CARDÁPIO*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const cat of categorias) {
        const status = cat.ativo ? '✅' : '❌';
        mensagem += `${status} ${cat.emoji} *${cat.nome}* (Ordem: ${cat.ordem})\n`;
        teclado.inline_keyboard.push([
            { text: `✏️ ${cat.emoji} ${cat.nome}`, callback_data: `adm_cat_edit_${cat.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Nova Categoria', callback_data: 'adm_cat_nova' }]);
    teclado.inline_keyboard.push([{ text: '🧀 Bordas', callback_data: 'adm_bordas' }, { text: '➕ Adicionais', callback_data: 'adm_adicionais' }]);
    teclado.inline_keyboard.push([{ text: '📏 Tamanhos', callback_data: 'adm_tamanhos_list' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showEditarCategoria(bot, chatId, catId, messageId) {
    const db = getDatabase();
    const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(catId);
    
    if (!cat) return bot.sendMessage(chatId, 'Categoria não encontrada.');
    
    const mensagem = `✏️ *EDITAR CATEGORIA*\n\n` +
                    `Nome: *${cat.nome}*\n` +
                    `Emoji: ${cat.emoji}\n` +
                    `Ordem: ${cat.ordem}\n` +
                    `Status: ${cat.ativo ? 'Ativo' : 'Inativo'}\n\n` +
                    `O que deseja alterar?`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '✏️ Alterar Nome', callback_data: `adm_cat_setnome_${catId}` }],
            [{ text: '😀 Alterar Emoji', callback_data: `adm_cat_setemoji_${catId}` }],
            [{ text: '🔢 Alterar Ordem', callback_data: `adm_cat_setordem_${catId}` }],
            [{ text: cat.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `adm_cat_toggle_${catId}` }],
            [{ text: '🗑 Excluir', callback_data: `adm_cat_del_${catId}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_cardapio' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarCardapioAdmin(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_cardapio') {
        await showCardapioMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_cat_nova') {
        estado.aguardando = 'nova_categoria';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite o nome da nova categoria:');
        return;
    }
    
    if (data.startsWith('adm_cat_edit_')) {
        const catId = data.split('_')[3];
        await showEditarCategoria(bot, chatId, catId, messageId);
        return;
    }
    
    if (data.startsWith('adm_cat_setnome_')) {
        const catId = data.split('_')[3];
        estado.aguardando = `setnome_cat_${catId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite o novo nome:');
        return;
    }
    
    if (data.startsWith('adm_cat_setemoji_')) {
        const catId = data.split('_')[3];
        estado.aguardando = `setemoji_cat_${catId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Envie o novo emoji:');
        return;
    }
    
    if (data.startsWith('adm_cat_setordem_')) {
        const catId = data.split('_')[3];
        estado.aguardando = `setordem_cat_${catId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite o número da nova ordem:');
        return;
    }
    
    if (data.startsWith('adm_cat_toggle_')) {
        const catId = data.split('_')[3];
        const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(catId);
        db.prepare('UPDATE categorias SET ativo = ? WHERE id = ?').run(cat.ativo ? 0 : 1, catId);
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${messageId}`, text: '✅ Status alterado!' });
        await showEditarCategoria(bot, chatId, catId, messageId);
        return;
    }
    
    if (data.startsWith('adm_cat_del_')) {
        const catId = data.split('_')[3];
        
        // Verifica se tem produtos
        const produtos = db.prepare('SELECT COUNT(*) as total FROM produtos WHERE categoria_id = ?').get(catId);
        if (produtos.total > 0) {
            await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${messageId}`, text: '❌ Remova os produtos primeiro!', show_alert: true });
            return;
        }
        
        db.prepare('DELETE FROM categorias WHERE id = ?').run(catId);
        await showCardapioMenu(bot, chatId, messageId);
        return;
    }
    
    // Bordas
    if (data === 'adm_bordas') {
        await showBordasMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_borda_nova') {
        estado.aguardando = 'nova_borda';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço\n\nExemplo: Catupiry, 8.00');
        return;
    }
    
    if (data.startsWith('adm_borda_edit_')) {
        const bordaId = data.split('_')[3];
        estado.aguardando = `edit_borda_${bordaId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço\n\nExemplo: Catupiry, 8.00');
        return;
    }
    
    if (data.startsWith('adm_borda_toggle_')) {
        const bordaId = data.split('_')[3];
        const borda = db.prepare('SELECT * FROM bordas WHERE id = ?').get(bordaId);
        db.prepare('UPDATE bordas SET ativo = ? WHERE id = ?').run(borda.ativo ? 0 : 1, bordaId);
        await showBordasMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_borda_del_')) {
        const bordaId = data.split('_')[3];
        db.prepare('DELETE FROM bordas WHERE id = ?').run(bordaId);
        await showBordasMenu(bot, chatId, messageId);
        return;
    }
    
    // Adicionais
    if (data === 'adm_adicionais') {
        await showAdicionaisMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_adicional_novo') {
        estado.aguardando = 'novo_adicional';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço, Categoria\n\nExemplo: Bacon, 5.00, carnes');
        return;
    }
    
    if (data.startsWith('adm_adic_edit_')) {
        const adicId = data.split('_')[3];
        estado.aguardando = `edit_adic_${adicId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço, Categoria\n\nExemplo: Bacon, 5.00, carnes');
        return;
    }
    
    if (data.startsWith('adm_adic_toggle_')) {
        const adicId = data.split('_')[3];
        const adic = db.prepare('SELECT * FROM adicionais WHERE id = ?').get(adicId);
        db.prepare('UPDATE adicionais SET disponivel = ? WHERE id = ?').run(adic.disponivel ? 0 : 1, adicId);
        await showAdicionaisMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_adic_del_')) {
        const adicId = data.split('_')[3];
        db.prepare('DELETE FROM adicionais WHERE id = ?').run(adicId);
        await showAdicionaisMenu(bot, chatId, messageId);
        return;
    }
    
    // Tamanhos
    if (data === 'adm_tamanhos_list') {
        await showTamanhosMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_tam_prod_')) {
        const prodId = data.split('_')[3];
        await showTamanhosPorProduto(bot, chatId, prodId, messageId);
        return;
    }
    
    if (data.startsWith('adm_tam_novo_')) {
        const prodId = data.split('_')[3];
        estado.aguardando = `novo_tamanho_${prodId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço, Fatias\n\nExemplo: Grande, 49.90, 8');
        return;
    }
    
    if (data.startsWith('adm_tam_edit_')) {
        const partes = data.split('_');
        const tamId = partes[3];
        estado.aguardando = `edit_tamanho_${tamId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite: Nome, Preço, Fatias\n\nExemplo: Grande, 49.90, 8');
        return;
    }
    
    if (data.startsWith('adm_tam_toggle_')) {
        const tamId = data.split('_')[3];
        const tam = db.prepare('SELECT * FROM tamanhos WHERE id = ?').get(tamId);
        db.prepare('UPDATE tamanhos SET ativo = ? WHERE id = ?').run(tam.ativo ? 0 : 1, tamId);
        await showTamanhosMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_tam_del_')) {
        const tamId = data.split('_')[3];
        db.prepare('DELETE FROM tamanhos WHERE id = ?').run(tamId);
        await showTamanhosMenu(bot, chatId, messageId);
        return;
    }
}

async function showBordasMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const bordas = db.prepare('SELECT * FROM bordas ORDER BY nome').all();
    
    let mensagem = '🧀 *BORDAS*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const borda of bordas) {
        const status = borda.ativo ? '✅' : '❌';
        mensagem += `${status} *${borda.nome}* - R$ ${borda.preco.toFixed(2)}\n`;
        teclado.inline_keyboard.push([
            { text: `✏️ ${borda.nome}`, callback_data: `adm_borda_edit_${borda.id}` },
            { text: borda.ativo ? '❌' : '✅', callback_data: `adm_borda_toggle_${borda.id}` },
            { text: '🗑', callback_data: `adm_borda_del_${borda.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Nova Borda', callback_data: 'adm_borda_nova' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_cardapio' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showAdicionaisMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const adicionais = db.prepare('SELECT * FROM adicionais ORDER BY categoria, nome').all();
    
    let mensagem = '➕ *ADICIONAIS*\n\n';
    const teclado = { inline_keyboard: [] };
    let categoriaAtual = '';
    
    for (const adic of adicionais) {
        if (adic.categoria !== categoriaAtual) {
            categoriaAtual = adic.categoria;
            mensagem += `\n📂 *${categoriaAtual.toUpperCase()}*\n`;
        }
        const status = adic.disponivel ? '✅' : '❌';
        mensagem += `${status} ${adic.nome} - R$ ${adic.preco.toFixed(2)}\n`;
        teclado.inline_keyboard.push([
            { text: `✏️ ${adic.nome}`, callback_data: `adm_adic_edit_${adic.id}` },
            { text: adic.disponivel ? '❌' : '✅', callback_data: `adm_adic_toggle_${adic.id}` },
            { text: '🗑', callback_data: `adm_adic_del_${adic.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Novo Adicional', callback_data: 'adm_adicional_novo' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_cardapio' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showTamanhosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const produtos = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 ORDER BY nome').all();
    
    let mensagem = '📏 *TAMANHOS*\n\nSelecione o produto:';
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        teclado.inline_keyboard.push([
            { text: `🍕 ${prod.nome}`, callback_data: `adm_tam_prod_${prod.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_cardapio' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showTamanhosPorProduto(bot, chatId, prodId, messageId) {
    const db = getDatabase();
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(prodId);
    const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id = ?').all(prodId);
    
    let mensagem = `📏 *TAMANHOS - ${produto.nome}*\n\n`;
    const teclado = { inline_keyboard: [] };
    
    for (const tam of tamanhos) {
        const status = tam.ativo ? '✅' : '❌';
        mensagem += `${status} *${tam.nome}* - R$ ${tam.preco.toFixed(2)} (${tam.fatias} fatias)\n`;
        teclado.inline_keyboard.push([
            { text: `✏️ ${tam.nome}`, callback_data: `adm_tam_edit_${tam.id}` },
            { text: tam.ativo ? '❌' : '✅', callback_data: `adm_tam_toggle_${tam.id}` },
            { text: '🗑', callback_data: `adm_tam_del_${tam.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Novo Tamanho', callback_data: `adm_tam_novo_${prodId}` }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_tamanhos_list' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

// Processa texto (chamado do index.js)
async function processarTextoAdmin(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || !estado.aguardando) return;
    
    const aguardando = estado.aguardando;
    
    // Nova categoria
    if (aguardando === 'nova_categoria') {
        const nome = texto.trim();
        if (nome.length < 2) return bot.sendMessage(chatId, '❌ Nome muito curto.');
        
        const maxOrdem = db.prepare('SELECT MAX(ordem) as max FROM categorias').get();
        db.prepare('INSERT INTO categorias (nome, emoji, ordem) VALUES (?, ?, ?)').run(nome, '🍕', (maxOrdem.max || 0) + 1);
        
        estado.aguardando = null;
        estados.set(userId, estado);
        
        await bot.sendMessage(chatId, `✅ Categoria "${nome}" criada!`);
        await showCardapioMenu(bot, chatId, null);
        return;
    }
    
    // Alterar nome categoria
    if (aguardando.startsWith('setnome_cat_')) {
        const catId = aguardando.split('_')[2];
        db.prepare('UPDATE categorias SET nome = ? WHERE id = ?').run(texto.trim(), catId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Nome alterado!');
        return;
    }
    
    // Alterar emoji categoria
    if (aguardando.startsWith('setemoji_cat_')) {
        const catId = aguardando.split('_')[2];
        db.prepare('UPDATE categorias SET emoji = ? WHERE id = ?').run(texto.trim(), catId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Emoji alterado!');
        return;
    }
    
    // Alterar ordem categoria
    if (aguardando.startsWith('setordem_cat_')) {
        const catId = aguardando.split('_')[2];
        const ordem = parseInt(texto);
        if (isNaN(ordem)) return bot.sendMessage(chatId, '❌ Digite um número.');
        db.prepare('UPDATE categorias SET ordem = ? WHERE id = ?').run(ordem, catId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Ordem alterada!');
        return;
    }
    
    // Nova borda
    if (aguardando === 'nova_borda') {
        const partes = texto.split(',');
        if (partes.length < 2) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        if (isNaN(preco)) return bot.sendMessage(chatId, '❌ Preço inválido.');
        
        db.prepare('INSERT INTO bordas (nome, preco) VALUES (?, ?)').run(nome, preco);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Borda "${nome}" criada!`);
        return;
    }
    
    // Editar borda
    if (aguardando.startsWith('edit_borda_')) {
        const bordaId = aguardando.split('_')[2];
        const partes = texto.split(',');
        if (partes.length < 2) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        if (isNaN(preco)) return bot.sendMessage(chatId, '❌ Preço inválido.');
        
        db.prepare('UPDATE bordas SET nome = ?, preco = ? WHERE id = ?').run(nome, preco, bordaId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Borda atualizada!');
        return;
    }
    
    // Novo adicional
    if (aguardando === 'novo_adicional') {
        const partes = texto.split(',');
        if (partes.length < 3) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço, Categoria');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        const categoria = partes[2].trim();
        if (isNaN(preco)) return bot.sendMessage(chatId, '❌ Preço inválido.');
        
        db.prepare('INSERT INTO adicionais (nome, preco, categoria) VALUES (?, ?, ?)').run(nome, preco, categoria);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Adicional "${nome}" criado!`);
        return;
    }
    
    // Editar adicional
    if (aguardando.startsWith('edit_adic_')) {
        const adicId = aguardando.split('_')[2];
        const partes = texto.split(',');
        if (partes.length < 3) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço, Categoria');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        const categoria = partes[2].trim();
        if (isNaN(preco)) return bot.sendMessage(chatId, '❌ Preço inválido.');
        
        db.prepare('UPDATE adicionais SET nome = ?, preco = ?, categoria = ? WHERE id = ?').run(nome, preco, categoria, adicId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Adicional atualizado!');
        return;
    }
    
    // Novo tamanho
    if (aguardando.startsWith('novo_tamanho_')) {
        const prodId = aguardando.split('_')[2];
        const partes = texto.split(',');
        if (partes.length < 3) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço, Fatias');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        const fatias = parseInt(partes[2]);
        if (isNaN(preco) || isNaN(fatias)) return bot.sendMessage(chatId, '❌ Valores inválidos.');
        
        db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?, ?, ?, ?)').run(prodId, nome, preco, fatias);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Tamanho "${nome}" criado!`);
        return;
    }
    
    // Editar tamanho
    if (aguardando.startsWith('edit_tamanho_')) {
        const tamId = aguardando.split('_')[2];
        const partes = texto.split(',');
        if (partes.length < 3) return bot.sendMessage(chatId, '❌ Formato: Nome, Preço, Fatias');
        const nome = partes[0].trim();
        const preco = parseFloat(partes[1].replace(',', '.'));
        const fatias = parseInt(partes[2]);
        if (isNaN(preco) || isNaN(fatias)) return bot.sendMessage(chatId, '❌ Valores inválidos.');
        
        db.prepare('UPDATE tamanhos SET nome = ?, preco = ?, fatias = ? WHERE id = ?').run(nome, preco, fatias, tamId);
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Tamanho atualizado!');
        return;
    }
}

module.exports = { showCardapioMenu, processarCardapioAdmin, showBordasMenu, showAdicionaisMenu, showTamanhosMenu, processarTextoAdmin };
