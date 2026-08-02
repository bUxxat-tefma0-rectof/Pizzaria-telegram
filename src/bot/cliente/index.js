const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');

let bot = null;
const estados = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { 
        polling: { interval: 300, autoStart: true, params: { timeout: 10 } } 
    });
    
    // ============ COMANDO /START ============
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        // Se já é cadastrado, vai direto pro menu
        if (cliente && cliente.nome && cliente.email_verificado) {
            estados.set(userId, { tela: 'menu' });
            return mostrarMenuPrincipal(chatId, cliente.nome);
        }
        
        // Se não é cadastrado, mostra botão do formulário WebApp
        const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://seu-site.onrender.com';
        
        const kb = {
            inline_keyboard: [
                [{ text: '📝 ABRIR FORMULÁRIO DE CADASTRO', web_app: { url: `${baseUrl}/cadastro` } }]
            ]
        };
        
        await bot.sendMessage(chatId, 
            '🍕 *Bem-vindo à Pizzaria!*\n\n' +
            'Para se cadastrar, clique no botão abaixo.\n' +
            'Um formulário será aberto aqui no Telegram.\n\n' +
            '📝 Preencha seus dados e finalize!',
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    });
    
    // ============ CALLBACK QUERIES (BOTÕES) ============
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const msgId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        await processarCallback(chatId, userId, data, msgId);
    });
    
    // ============ MENSAGENS DE TEXTO ============
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (msg.text && msg.text.startsWith('/')) return;
        if (!msg.text) return;
        
        const estado = estados.get(userId);
        if (!estado || !estado.aguardando) return;
        
        await processarTexto(chatId, userId, msg.text);
    });
    
    // ============ LOCALIZAÇÃO ============
    bot.on('location', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        
        if (estado && estado.tela === 'cadastro' && estado.etapa === 'endereco') {
            await processarLocalizacao(chatId, userId, msg.location);
        }
    });
    
    logger.info('🤖 Bot Cliente configurado');
    return bot;
}

// ============ MENU PRINCIPAL ============
async function mostrarMenuPrincipal(chatId, nome) {
    const kb = {
        inline_keyboard: [
            [{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }],
            [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }],
            [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
            [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '👤 Meu Perfil', callback_data: 'menu_perfil' }],
            [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
        ]
    };
    
    await enviarOuEditar(chatId, null, `🍕 *Bem-vindo à Pizzaria!*\n\n👋 Olá, *${nome.split(' ')[0]}*!\n\nEscolha uma opção:`, kb);
}

// ============ CALLBACK PROCESSOR ============
async function processarCallback(chatId, userId, data, msgId) {
    // Menu principal
    if (data === 'menu_voltar') {
        const db = getDatabase();
        const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
        estados.set(userId, { tela: 'menu' });
        return mostrarMenuPrincipal(chatId, c?.nome || 'Cliente');
    }
    
    // Cardápio
    if (data === 'menu_cardapio') return mostrarCategorias(chatId, msgId);
    if (data === 'menu_pesquisar') {
        estados.set(userId, { tela: 'pesquisar', aguardando: 'termo' });
        return enviarOuEditar(chatId, msgId, '🔍 Digite o nome do produto:', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]] });
    }
    if (data === 'menu_carrinho') return mostrarCarrinho(chatId, userId, msgId);
    if (data === 'menu_favoritos') return mostrarFavoritos(chatId, userId, msgId);
    if (data === 'menu_pedidos') return mostrarPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return mostrarPerfil(chatId, userId, msgId);
    if (data === 'menu_atendimento') return mostrarAtendimento(chatId, userId, msgId);
    
    if (data.startsWith('cat_')) return mostrarProdutos(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return mostrarDetalheProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('tam_')) { const p = data.split('_'); return mostrarBordas(chatId, userId, p[1], p[2], msgId); }
    if (data.startsWith('borda_')) { const p = data.split('_'); return mostrarAdicionais(chatId, userId, p[1], p[2], p[3], msgId, []); }
    if (data.startsWith('adic_')) return toggleAdicional(chatId, userId, data, msgId);
    if (data.startsWith('addcarr_')) return adicionarCarrinho(chatId, userId, data, msgId);
    
    if (data.startsWith('carr_')) return gerenciarCarrinho(chatId, userId, data, msgId);
    if (data.startsWith('ped_')) return gerenciarPedidos(chatId, userId, data, msgId);
    if (data.startsWith('fav_')) return gerenciarFavoritos(chatId, userId, data, msgId);
    if (data.startsWith('perfil_')) return gerenciarPerfil(chatId, userId, data, msgId);
    if (data.startsWith('pag_') || data.startsWith('aval_')) return gerenciarPagamento(chatId, userId, data, msgId);
}

// ============ CARDÁPIO ============
async function mostrarCategorias(chatId, msgId) {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    const kb = { inline_keyboard: [] };
    for (const c of cats) {
        kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    
    await enviarOuEditar(chatId, msgId, '🍕 *CARDÁPIO*\n\nEscolha uma categoria:', kb);
}

async function mostrarProdutos(chatId, userId, catId, msgId) {
    const db = getDatabase();
    const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(catId);
    const prods = db.prepare('SELECT p.*, (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco FROM produtos p WHERE p.categoria_id=? AND p.disponivel=1 ORDER BY p.ordem').all(catId);
    
    const kb = { inline_keyboard: [] };
    for (const p of prods) {
        kb.inline_keyboard.push([{ text: `🍕 ${p.nome} - ${formatarMoeda(p.preco||0)}`, callback_data: `prod_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]);
    
    await enviarOuEditar(chatId, msgId, `${cat.emoji} *${cat.nome}*\n\nEscolha um produto:`, kb);
}

async function mostrarDetalheProduto(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const p = db.prepare('SELECT p.*, c.emoji as ce FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?').get(prodId);
    const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id=? AND ativo=1').all(prodId);
    
    let msg = `${p.ce||'🍕'} *${p.nome}*\n\n`;
    if (p.descricao) msg += `📝 ${p.descricao}\n`;
    if (p.ingredientes) msg += `🥬 ${p.ingredientes}\n`;
    msg += '\nEscolha o tamanho:';
    
    const kb = { inline_keyboard: [] };
    for (const t of tamanhos) {
        kb.inline_keyboard.push([{ text: `🍕 ${t.nome} - ${formatarMoeda(t.preco)} (${t.fatias} fatias)`, callback_data: `tam_${t.id}_${prodId}` }]);
    }
    kb.inline_keyboard.push([{ text: '❤️ Favoritar', callback_data: `fav_toggle_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]);
    
    if (p.foto) {
        await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    } else {
        await enviarOuEditar(chatId, msgId, msg, kb);
    }
}

async function mostrarBordas(chatId, userId, tamId, prodId, msgId) {
    const db = getDatabase();
    const bordas = db.prepare('SELECT * FROM bordas WHERE ativo=1').all();
    
    const kb = { inline_keyboard: [] };
    for (const b of bordas) {
        const preco = b.preco > 0 ? ` (+${formatarMoeda(b.preco)})` : '';
        kb.inline_keyboard.push([{ text: `🧀 ${b.nome}${preco}`, callback_data: `borda_${b.id}_${tamId}_${prodId}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `prod_${prodId}` }]);
    
    await enviarOuEditar(chatId, msgId, '🧀 Escolha a borda:', kb);
}

async function mostrarAdicionais(chatId, userId, bordaId, tamId, prodId, msgId, selecionados) {
    const db = getDatabase();
    const adics = db.prepare('SELECT * FROM adicionais WHERE disponivel=1 ORDER BY categoria, nome').all();
    
    const kb = { inline_keyboard: [] };
    for (const a of adics) {
        const sel = selecionados.includes(a.id);
        kb.inline_keyboard.push([{ text: `${sel ? '✅' : '➕'} ${a.nome} (+${formatarMoeda(a.preco)})`, callback_data: `adic_${a.id}_${bordaId}_${tamId}_${prodId}` }]);
    }
    kb.inline_keyboard.push([{ text: '✅ Continuar →', callback_data: `addcarr_${bordaId}_${tamId}_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `borda_${bordaId}_${tamId}_${prodId}` }]);
    
    const nomes = adics.filter(a => selecionados.includes(a.id)).map(a => a.nome).join(', ');
    await enviarOuEditar(chatId, msgId, `➕ *Adicionais*\n\nSelecionados: ${nomes || 'Nenhum'}\n\nEscolha:`, kb);
}

async function toggleAdicional(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || {};
    const partes = data.split('_');
    const adicId = parseInt(partes[1]);
    const bordaId = partes[2];
    const tamId = partes[3];
    const prodId = partes[4];
    
    if (!estado.adicionais) estado.adicionais = [];
    const idx = estado.adicionais.indexOf(adicId);
    if (idx > -1) estado.adicionais.splice(idx, 1);
    else estado.adicionais.push(adicId);
    
    estados.set(userId, estado);
    await mostrarAdicionais(chatId, userId, bordaId, tamId, prodId, msgId, estado.adicionais);
}

async function adicionarCarrinho(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || {};
    const partes = data.split('_');
    const bordaId = partes[1];
    const tamId = partes[2];
    const prodId = partes[3];
    
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    const result = db.prepare('INSERT INTO carrinhos (cliente_id, produto_id, tamanho_id, borda_id, quantidade) VALUES (?,?,?,?,1)').run(cliente.id, prodId, tamId, bordaId);
    
    if (estado.adicionais && estado.adicionais.length > 0) {
        const insert = db.prepare('INSERT INTO carrinho_adicionais (carrinho_id, adicional_id) VALUES (?,?)');
        for (const adicId of estado.adicionais) {
            insert.run(result.lastInsertRowid, adicId);
        }
    }
    
    estado.adicionais = [];
    estados.set(userId, estado);
    
    const p = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(prodId);
    const t = db.prepare('SELECT nome, preco FROM tamanhos WHERE id = ?').get(tamId);
    
    const kb = {
        inline_keyboard: [
            [{ text: '🍕 Continuar Comprando', callback_data: 'menu_cardapio' }],
            [{ text: '🛒 Ver Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '💳 Finalizar Pedido', callback_data: 'carr_finalizar' }]
        ]
    };
    
    await enviarOuEditar(chatId, msgId, `✅ *${p.nome}* adicionado!\n📏 ${t.nome} - ${formatarMoeda(t.preco)}\n\nO que deseja fazer?`, kb);
}

// ============ CARRINHO ============
async function mostrarCarrinho(chatId, userId, msgId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    const itens = db.prepare(`
        SELECT c.*, p.nome as pn, t.nome as tn, t.preco as tp, b.nome as bn, b.preco as bp
        FROM carrinhos c JOIN produtos p ON c.produto_id=p.id JOIN tamanhos t ON c.tamanho_id=t.id JOIN bordas b ON c.borda_id=b.id
        WHERE c.cliente_id = ?
    `).all(cliente.id);
    
    if (itens.length === 0) {
        return enviarOuEditar(chatId, msgId, '🛒 *Carrinho vazio*', {
            inline_keyboard: [[{ text: '🍕 Ver Cardápio', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]]
        });
    }
    
    let subtotal = 0;
    let msg = '🛒 *SEU CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    
    for (const item of itens) {
        const adics = db.prepare('SELECT a.nome, a.preco FROM carrinho_adicionais ca JOIN adicionais a ON ca.adicional_id=a.id WHERE ca.carrinho_id=?').all(item.id);
        let totalAdic = 0;
        const nomes = adics.map(a => { totalAdic += a.preco; return a.nome; });
        const totalItem = (item.tp + item.bp + totalAdic) * item.quantidade;
        subtotal += totalItem;
        
        msg += `🍕 *${item.pn}* (${item.quantidade}x)\n📏 ${item.tn} | 🧀 ${item.bn}\n`;
        if (nomes.length) msg += `➕ ${nomes.join(', ')}\n`;
        msg += `💰 ${formatarMoeda(totalItem)}\n\n`;
        
        kb.inline_keyboard.push([
            { text: '➖', callback_data: `carr_menos_${item.id}` },
            { text: `${item.quantidade}`, callback_data: 'nop' },
            { text: '➕', callback_data: `carr_mais_${item.id}` },
            { text: '🗑', callback_data: `carr_del_${item.id}` }
        ]);
    }
    
    const unidade = db.prepare('SELECT taxa_entrega FROM unidades WHERE id = ?').get(cliente.unidade_proxima_id);
    const taxa = unidade?.taxa_entrega || 0;
    const total = subtotal + taxa;
    
    msg += `📦 Subtotal: *${formatarMoeda(subtotal)}*\n🚚 Entrega: *${formatarMoeda(taxa)}*\n💰 *Total: ${formatarMoeda(total)}*`;
    
    kb.inline_keyboard.push([{ text: '🎟 Cupom', callback_data: 'carr_cupom' }, { text: '📝 Observação', callback_data: 'carr_obs' }]);
    kb.inline_keyboard.push([{ text: '🍕 Mais Itens', callback_data: 'menu_cardapio' }, { text: '🗑 Limpar', callback_data: 'carr_limpar' }]);
    kb.inline_keyboard.push([{ text: '💳 Finalizar Pedido', callback_data: 'carr_finalizar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    
    await enviarOuEditar(chatId, msgId, msg, kb);
}

async function gerenciarCarrinho(chatId, userId, data, msgId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (data === 'carr_limpar') {
        db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id IN (SELECT id FROM carrinhos WHERE cliente_id=?)').run(cliente.id);
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        return mostrarCarrinho(chatId, userId, msgId);
    }
    
    if (data === 'carr_cupom') {
        estados.set(userId, { ...estados.get(userId), aguardando: 'cupom' });
        return enviarOuEditar(chatId, msgId, '🎟 Digite o código do cupom:', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_carrinho' }]] });
    }
    
    if (data === 'carr_obs') {
        estados.set(userId, { ...estados.get(userId), aguardando: 'obs' });
        return enviarOuEditar(chatId, msgId, '📝 Digite a observação:', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_carrinho' }]] });
    }
    
    if (data === 'carr_finalizar') {
        const itens = db.prepare('SELECT COUNT(*) as t FROM carrinhos WHERE cliente_id = ?').get(cliente.id);
        if (itens.t === 0) {
            return enviarOuEditar(chatId, msgId, '🛒 Carrinho vazio!', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]] });
        }
        
        const { iniciarPagamento } = require('./pagamento');
        await bot.sendMessage(chatId, '💳 Gerando pagamento...');
        await iniciarPagamento(bot, chatId, userId, msgId, estados.get(userId) || {});
        return;
    }
    
    if (data.startsWith('carr_menos_')) {
        const id = data.split('_')[2];
        const item = db.prepare('SELECT * FROM carrinhos WHERE id = ?').get(id);
        if (item.quantidade > 1) {
            db.prepare('UPDATE carrinhos SET quantidade = quantidade - 1 WHERE id = ?').run(id);
        } else {
            db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id = ?').run(id);
            db.prepare('DELETE FROM carrinhos WHERE id = ?').run(id);
        }
        return mostrarCarrinho(chatId, userId, msgId);
    }
    
    if (data.startsWith('carr_mais_')) {
        const id = data.split('_')[2];
        db.prepare('UPDATE carrinhos SET quantidade = quantidade + 1 WHERE id = ? AND quantidade < 10').run(id);
        return mostrarCarrinho(chatId, userId, msgId);
    }
    
    if (data.startsWith('carr_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id = ?').run(id);
        db.prepare('DELETE FROM carrinhos WHERE id = ?').run(id);
        return mostrarCarrinho(chatId, userId, msgId);
    }
}

// ============ PEDIDOS ============
async function mostrarPedidos(chatId, userId, msgId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 10').all(cliente.id);
    
    if (pedidos.length === 0) {
        return enviarOuEditar(chatId, msgId, '📦 Nenhum pedido ainda!', {
            inline_keyboard: [[{ text: '🍕 Fazer Pedido', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]]
        });
    }
    
    const kb = { inline_keyboard: [] };
    const emojis = { 'pendente': '⏳', 'confirmado': '✅', 'preparo': '👨‍🍳', 'entrega': '🛵', 'entregue': '📦', 'cancelado': '❌' };
    
    for (const p of pedidos) {
        kb.inline_keyboard.push([{ text: `${emojis[p.status]} ${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '📄 Baixar PDF', callback_data: 'ped_pdf' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    
    await enviarOuEditar(chatId, msgId, '📦 *MEUS PEDIDOS*\n\nSelecione:', kb);
}

async function gerenciarPedidos(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data.startsWith('ped_ver_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(id);
        
        let msg = `📦 *${p.numero}*\n📊 ${p.status}\n💳 ${p.pagamento_status}\n📅 ${formatarData(p.data_pedido)}\n\n🍕 *Itens:*\n`;
        for (const i of itens) {
            msg += `\n${i.quantidade}x ${i.produto_nome}\n📏 ${i.tamanho_nome} | 🧀 ${i.borda_nome}\n`;
            if (i.adicionais) msg += `➕ ${i.adicionais}\n`;
            msg += `💰 ${formatarMoeda(i.preco_unitario * i.quantidade)}\n`;
        }
        msg += `\n💰 *Total: ${formatarMoeda(p.total)}*`;
        if (p.observacao) msg += `\n📝 Obs: ${p.observacao}`;
        
        await enviarOuEditar(chatId, msgId, msg, { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_pedidos' }]] });
    }
    
    if (data === 'ped_pdf') {
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC').all(cliente.id);
        const itens = db.prepare('SELECT i.* FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE p.cliente_id=?').all(cliente.id);
        
        const PDFService = require('../../services/pdf');
        const pdf = await PDFService.gerarHistoricoCliente(cliente, pedidos, itens);
        await bot.sendDocument(chatId, pdf, {}, { filename: `historico_${cliente.nome?.replace(/\s/g,'_') || 'pedidos'}.pdf`, caption: '📄 Seu histórico de pedidos' });
    }
}

// ============ FAVORITOS ============
async function mostrarFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const favs = db.prepare('SELECT f.*, p.nome FROM favoritos f JOIN produtos p ON f.produto_id=p.id WHERE f.cliente_id=?').all(cliente.id);
    
    if (favs.length === 0) {
        return enviarOuEditar(chatId, msgId, '❤️ Nenhum favorito ainda!', {
            inline_keyboard: [[{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]]
        });
    }
    
    const kb = { inline_keyboard: [] };
    for (const f of favs) {
        kb.inline_keyboard.push([{ text: `🍕 ${f.nome}`, callback_data: `prod_${f.produto_id}` }, { text: '❌', callback_data: `fav_del_${f.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    
    await enviarOuEditar(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

async function gerenciarFavoritos(chatId, userId, data, msgId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (data.startsWith('fav_toggle_')) {
        const prodId = data.split('_')[2];
        const existe = db.prepare('SELECT * FROM favoritos WHERE cliente_id=? AND produto_id=?').get(cliente.id, prodId);
        if (existe) {
            db.prepare('DELETE FROM favoritos WHERE id = ?').run(existe.id);
        } else {
            db.prepare('INSERT INTO favoritos (cliente_id, produto_id) VALUES (?,?)').run(cliente.id, prodId);
        }
        await mostrarAlert(chatId, msgId, existe ? '❌ Removido' : '❤️ Favoritado');
    }
    
    if (data.startsWith('fav_del_')) {
        db.prepare('DELETE FROM favoritos WHERE id = ?').run(data.split('_')[2]);
        await mostrarFavoritos(chatId, userId, msgId);
    }
}

// ============ PERFIL ============
async function mostrarPerfil(chatId, userId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    const pedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(c.id).t;
    
    let msg = `👤 *MEU PERFIL*\n\n📝 ${c.nome}\n📧 ${c.email || 'N/A'}\n📱 ${c.telefone || 'N/A'}\n`;
    if (c.logradouro) msg += `📍 ${c.logradouro}, ${c.numero || 'S/N'} - ${c.bairro}\n`;
    msg += `\n📦 Pedidos: *${pedidos}*\n💰 Total: *${formatarMoeda(c.total_gasto)}*\n⭐ Pontos: *${c.fidelidade_pontos}*`;
    
    const kb = {
        inline_keyboard: [
            [{ text: '✏️ Nome', callback_data: 'perfil_nome' }, { text: '📧 Email', callback_data: 'perfil_email' }],
            [{ text: '📱 Telefone', callback_data: 'perfil_tel' }, { text: '📍 Endereço', callback_data: 'perfil_end' }],
            [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]
        ]
    };
    
    await enviarOuEditar(chatId, msgId, msg, kb);
}

async function gerenciarPerfil(chatId, userId, data, msgId) {
    const mapa = { 'perfil_nome': 'perfil_nome', 'perfil_email': 'perfil_email', 'perfil_tel': 'perfil_tel', 'perfil_end': 'perfil_end' };
    const msgs = { 'perfil_nome': 'Digite nome e sobrenome:', 'perfil_email': 'Digite o novo email:', 'perfil_tel': 'Digite o telefone com DDD:', 'perfil_end': 'Digite: Rua, Número, Bairro, Cidade, Estado' };
    
    if (mapa[data]) {
        estados.set(userId, { tela: 'perfil', aguardando: mapa[data] });
        await enviarOuEditar(chatId, msgId, msgs[data], { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_perfil' }]] });
    }
}

// ============ ATENDIMENTO ============
async function mostrarAtendimento(chatId, userId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT unidade_proxima_id FROM clientes WHERE telegram_id = ?').get(userId);
    const u = db.prepare('SELECT * FROM unidades WHERE id = ?').get(c?.unidade_proxima_id);
    
    let msg = '📞 *ATENDIMENTO*\n\n';
    let wpp = '5544999999999';
    
    if (u) {
        msg += `🏪 ${u.nome}\n📱 ${u.whatsapp || u.telefone}\n🕐 ${u.horario_abertura}-${u.horario_fechamento}`;
        wpp = '55' + (u.whatsapp || u.telefone || '').replace(/\D/g, '');
    } else {
        msg += '📱 (44) 99999-9999\n🕐 18h às 23h';
    }
    
    const kb = {
        inline_keyboard: [
            [{ text: '💬 WhatsApp', url: `https://wa.me/${wpp}` }],
            [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]
        ]
    };
    
    await enviarOuEditar(chatId, msgId, msg, kb);
}

// ============ PROCESSAR TEXTO ============
async function processarTexto(chatId, userId, texto) {
    const db = getDatabase();
    const estado = estados.get(userId);
    if (!estado) return;
    
    texto = texto.trim();
    
    // Cupom
    if (estado.aguardando === 'cupom') {
        const cupom = db.prepare('SELECT * FROM cupons WHERE codigo = ? AND ativo = 1').get(texto.toUpperCase());
        if (!cupom) return bot.sendMessage(chatId, '❌ Cupom inválido.');
        if (cupom.uso_atual >= cupom.uso_maximo) return bot.sendMessage(chatId, '❌ Cupom esgotado.');
        if (cupom.valido_ate && new Date(cupom.valido_ate) < new Date()) return bot.sendMessage(chatId, '❌ Cupom vencido.');
        
        estado.cupom = cupom;
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Cupom *${cupom.codigo}* aplicado!`);
        return mostrarCarrinho(chatId, userId, null);
    }
    
    // Observação
    if (estado.aguardando === 'obs') {
        estado.observacao = texto;
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Observação salva!');
        return mostrarCarrinho(chatId, userId, null);
    }
    
    // Pesquisa
    if (estado.tela === 'pesquisar' && estado.aguardando === 'termo') {
        estado.aguardando = null;
        estados.set(userId, estado);
        
        const prods = db.prepare('SELECT p.*, (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco FROM produtos p WHERE p.disponivel=1 AND (p.nome LIKE ? OR p.descricao LIKE ?) LIMIT 10').all(`%${texto}%`, `%${texto}%`);
        
        if (prods.length === 0) return bot.sendMessage(chatId, `🔍 Nenhum resultado para "${texto}".`);
        
        const kb = { inline_keyboard: [] };
        for (const p of prods) {
            kb.inline_keyboard.push([{ text: `🍕 ${p.nome} - ${formatarMoeda(p.preco||0)}`, callback_data: `prod_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]);
        return bot.sendMessage(chatId, `🔍 *Resultados para "${texto}":*`, { parse_mode: 'Markdown', reply_markup: kb });
    }
    
    // Perfil
    if (estado.tela === 'perfil' && estado.aguardando) {
        if (estado.aguardando === 'perfil_nome') {
            if (texto.length < 3 || texto.split(' ').length < 2) return bot.sendMessage(chatId, '❌ Digite nome e sobrenome.');
            db.prepare('UPDATE clientes SET nome = ? WHERE telegram_id = ?').run(texto, userId);
        }
        if (estado.aguardando === 'perfil_email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return bot.sendMessage(chatId, '❌ Email inválido.');
            db.prepare('UPDATE clientes SET email = ? WHERE telegram_id = ?').run(texto.toLowerCase(), userId);
        }
        if (estado.aguardando === 'perfil_tel') {
            const tel = texto.replace(/\D/g, '');
            if (tel.length < 10) return bot.sendMessage(chatId, '❌ Telefone inválido.');
            db.prepare('UPDATE clientes SET telefone = ? WHERE telegram_id = ?').run(tel, userId);
        }
        if (estado.aguardando === 'perfil_end') {
            const partes = texto.split(',').map(p => p.trim());
            if (partes.length < 4) return bot.sendMessage(chatId, '❌ Formato: Rua, Número, Bairro, Cidade, Estado');
            db.prepare('UPDATE clientes SET logradouro=?, numero=?, bairro=?, cidade=?, estado=? WHERE telegram_id=?').run(partes[0], partes[1], partes[2], partes[3], partes[4]||'PR', userId);
        }
        
        estado.aguardando = null;
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Dados atualizados!');
    }
}

// ============ HELPERS ============
async function enviarOuEditar(chatId, msgId, text, kb) {
    try {
        if (msgId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        } else {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
        }
    } catch (e) {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    }
}

async function mostrarAlert(chatId, msgId, text) {
    try { await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text, show_alert: true }); } catch (e) {}
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
    return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getBot() { return bot; }

module.exports = { startClientBot, getBot };
