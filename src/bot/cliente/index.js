const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');

let bot = null;
const estados = new Map();
const ultimaMsg = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { polling: { interval: 300, autoStart: true } });
    
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.nome && cliente.email_verificado) {
            estados.set(userId, { tela: 'menu' });
            return mostrarMenu(chatId, cliente.nome);
        }
        
        const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://seu-site.onrender.com';
        
        await bot.sendPhoto(chatId, 'https://imgur.com/pizzaria-banner.jpg', {
            caption: '🍕 *Bem-vindo à Pizzaria!*\n\nClique abaixo para se cadastrar:',
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '📝 ABRIR FORMULÁRIO DE CADASTRO', web_app: { url: `${baseUrl}/cadastro` } }]]
            }
        });
    });
    
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const msgId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        await router(chatId, userId, data, msgId);
    });
    
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (!estado || !estado.aguardando) return;
        await handleText(msg.chat.id, userId, msg.text);
    });
    
    logger.info('🤖 Bot Cliente online');
    return bot;
}

async function mostrarMenu(chatId, nome) {
    await editarOuEnviar(chatId, null,
        `🍕 *PIZZARIA TELEGRAM*\n\n👋 Olá, *${nome.split(' ')[0]}*!\n\n` +
        `📋 *Meu Progresso:*\n` +
        `🟢🟢🟢🟢🟢 Cadastro concluído\n\n` +
        `Escolha uma opção:`,
        { inline_keyboard: [
            [{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }],
            [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }],
            [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
            [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '👤 Meu Perfil', callback_data: 'menu_perfil' }],
            [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
        ]}
    );
}

// ============ ROUTER ============
async function router(chatId, userId, data, msgId) {
    if (data === 'menu_voltar') { const db = getDatabase(); const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id=?').get(userId); estados.set(userId, { tela: 'menu' }); return mostrarMenu(chatId, c?.nome || 'Cliente'); }
    if (data === 'menu_cardapio') return showCategorias(chatId, msgId);
    if (data === 'menu_pesquisar') { estados.set(userId, { tela: 'pesquisar', aguardando: 'termo' }); return editarOuEnviar(chatId, msgId, '🔍 Digite o nome do produto:', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]] }); }
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_favoritos') return showFavoritos(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    if (data === 'menu_atendimento') return showAtendimento(chatId, userId, msgId);
    if (data.startsWith('cat_')) return showProdutos(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('tam_')) { const [_, t, p] = data.split('_'); return showBordas(chatId, t, p, msgId); }
    if (data.startsWith('borda_')) { const [_, b, t, p] = data.split('_'); return showAdicionais(chatId, userId, b, t, p, msgId, []); }
    if (data.startsWith('adic_')) return toggleAdic(chatId, userId, data, msgId);
    if (data.startsWith('addcarr_')) return addCarrinho(chatId, userId, data, msgId);
    if (data.startsWith('carr_')) return handleCarrinho(chatId, userId, data, msgId);
    if (data.startsWith('ped_')) return handlePedidos(chatId, userId, data, msgId);
    if (data.startsWith('fav_')) return handleFavoritos(chatId, userId, data, msgId);
    if (data.startsWith('perfil_')) return handlePerfil(chatId, userId, data, msgId);
    if (data.startsWith('pag_') || data.startsWith('aval_')) { const { processarPagamento } = require('./pagamento'); return processarPagamento(bot, chatId, userId, data, msgId, estados); }
}

// ============ CARDÁPIO ============
async function showCategorias(chatId, msgId) {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias WHERE ativo=1 ORDER BY ordem').all();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editarOuEnviar(chatId, msgId, '🍕 *CARDÁPIO*\n\nEscolha uma categoria:', kb);
}

async function showProdutos(chatId, catId, msgId) {
    const db = getDatabase();
    const cat = db.prepare('SELECT * FROM categorias WHERE id=?').get(catId);
    const prods = db.prepare('SELECT p.*, (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco FROM produtos p WHERE p.categoria_id=? AND p.disponivel=1 ORDER BY p.ordem').all(catId);
    const kb = { inline_keyboard: [] };
    for (const p of prods) {
        kb.inline_keyboard.push([{ text: `🍕 ${p.nome} - ${fmt(p.preco||0)}`, callback_data: `prod_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]);
    await editarOuEnviar(chatId, msgId, `${cat.emoji} *${cat.nome}*\n\nEscolha:`, kb);
}

async function showProduto(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const p = db.prepare('SELECT p.*, c.emoji as ce FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?').get(prodId);
    const ts = db.prepare('SELECT * FROM tamanhos WHERE produto_id=? AND ativo=1').all(prodId);
    let msg = `${p.ce||'🍕'} *${p.nome}*\n\n`;
    if (p.descricao) msg += `📝 ${p.descricao}\n`;
    if (p.ingredientes) msg += `🥬 ${p.ingredientes}\n`;
    msg += '\nEscolha o tamanho:';
    const kb = { inline_keyboard: [] };
    for (const t of ts) kb.inline_keyboard.push([{ text: `🍕 ${t.nome} - ${fmt(t.preco)} (${t.fatias} fatias)`, callback_data: `tam_${t.id}_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '❤️ Favoritar', callback_data: `fav_toggle_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]);
    
    if (p.foto) {
        await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    } else {
        await editarOuEnviar(chatId, msgId, msg, kb);
    }
}

async function showBordas(chatId, tamId, prodId, msgId) {
    const db = getDatabase();
    const bordas = db.prepare('SELECT * FROM bordas WHERE ativo=1').all();
    const kb = { inline_keyboard: [] };
    for (const b of bordas) kb.inline_keyboard.push([{ text: `🧀 ${b.nome}${b.preco>0?' (+'+fmt(b.preco)+')':''}`, callback_data: `borda_${b.id}_${tamId}_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `prod_${prodId}` }]);
    await editarOuEnviar(chatId, msgId, '🧀 Escolha a borda:', kb);
}

async function showAdicionais(chatId, userId, bordaId, tamId, prodId, msgId, sel) {
    const db = getDatabase();
    const adics = db.prepare('SELECT * FROM adicionais WHERE disponivel=1').all();
    const kb = { inline_keyboard: [] };
    for (const a of adics) {
        const s = sel.includes(a.id);
        kb.inline_keyboard.push([{ text: `${s?'✅':'➕'} ${a.nome} (+${fmt(a.preco)})`, callback_data: `adic_${a.id}_${bordaId}_${tamId}_${prodId}` }]);
    }
    kb.inline_keyboard.push([{ text: '✅ Continuar →', callback_data: `addcarr_${bordaId}_${tamId}_${prodId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `borda_${bordaId}_${tamId}_${prodId}` }]);
    const nomes = adics.filter(a => sel.includes(a.id)).map(a => a.nome).join(', ');
    await editarOuEnviar(chatId, msgId, `➕ *Adicionais*\n\nSelecionados: ${nomes||'Nenhum'}`, kb);
}

async function toggleAdic(chatId, userId, data, msgId) {
    const est = estados.get(userId) || {};
    const [_, aid, bid, tid, pid] = data.split('_');
    if (!est.adicionais) est.adicionais = [];
    const idx = est.adicionais.indexOf(parseInt(aid));
    if (idx > -1) est.adicionais.splice(idx, 1); else est.adicionais.push(parseInt(aid));
    estados.set(userId, est);
    await showAdicionais(chatId, userId, bid, tid, pid, msgId, est.adicionais);
}

async function addCarrinho(chatId, userId, data, msgId) {
    const est = estados.get(userId) || {};
    const [_, bid, tid, pid] = data.split('_');
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const r = db.prepare('INSERT INTO carrinhos (cliente_id,produto_id,tamanho_id,borda_id) VALUES (?,?,?,?)').run(cli.id, pid, tid, bid);
    if (est.adicionais) { const ins = db.prepare('INSERT INTO carrinho_adicionais (carrinho_id,adicional_id) VALUES (?,?)'); for (const a of est.adicionais) ins.run(r.lastInsertRowid, a); }
    est.adicionais = []; estados.set(userId, est);
    const p = db.prepare('SELECT nome FROM produtos WHERE id=?').get(pid);
    await editarOuEnviar(chatId, msgId, `✅ *${p.nome}* adicionado!`, { inline_keyboard: [[{ text: '🍕 Continuar', callback_data: 'menu_cardapio' }], [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }], [{ text: '💳 Finalizar', callback_data: 'carr_finalizar' }]] });
}

// ============ CARRINHO ============
async function showCarrinho(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT * FROM clientes WHERE telegram_id=?').get(userId);
    const itens = db.prepare('SELECT c.*, p.nome as pn, t.nome as tn, t.preco as tp, b.nome as bn, b.preco as bp FROM carrinhos c JOIN produtos p ON c.produto_id=p.id JOIN tamanhos t ON c.tamanho_id=t.id JOIN bordas b ON c.borda_id=b.id WHERE c.cliente_id=?').all(cli.id);
    if (itens.length === 0) return editarOuEnviar(chatId, msgId, '🛒 Carrinho vazio!', { inline_keyboard: [[{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
    
    let st = 0, msg = '🛒 *CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    for (const i of itens) {
        const ad = db.prepare('SELECT a.nome,a.preco FROM carrinho_adicionais ca JOIN adicionais a ON ca.adicional_id=a.id WHERE ca.carrinho_id=?').all(i.id);
        let ta = 0; const ns = ad.map(a => { ta += a.preco; return a.nome; });
        const ti = (i.tp + i.bp + ta) * i.quantidade; st += ti;
        msg += `🍕 *${i.pn}* x${i.quantidade}\n📏 ${i.tn} | 🧀 ${i.bn}\n`;
        if (ns.length) msg += `➕ ${ns.join(', ')}\n`;
        msg += `💰 ${fmt(ti)}\n\n`;
        kb.inline_keyboard.push([{ text: '➖', callback_data: `carr_menos_${i.id}` }, { text: `${i.quantidade}`, callback_data: 'nop' }, { text: '➕', callback_data: `carr_mais_${i.id}` }, { text: '🗑', callback_data: `carr_del_${i.id}` }]);
    }
    const tx = db.prepare('SELECT taxa_entrega FROM unidades WHERE id=?').get(cli.unidade_proxima_id)?.taxa_entrega || 0;
    msg += `📦 Subtotal: *${fmt(st)}*\n🚚 Entrega: *${fmt(tx)}*\n💰 *Total: ${fmt(st+tx)}*`;
    kb.inline_keyboard.push([{ text: '🎟 Cupom', callback_data: 'carr_cupom' }, { text: '📝 Obs', callback_data: 'carr_obs' }]);
    kb.inline_keyboard.push([{ text: '💳 Finalizar', callback_data: 'carr_finalizar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editarOuEnviar(chatId, msgId, msg, kb);
}

async function handleCarrinho(chatId, userId, data, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    if (data === 'carr_limpar') { db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id IN (SELECT id FROM carrinhos WHERE cliente_id=?)').run(cli.id); db.prepare('DELETE FROM carrinhos WHERE cliente_id=?').run(cli.id); return showCarrinho(chatId, userId, msgId); }
    if (data === 'carr_cupom') { estados.set(userId, { ...estados.get(userId), aguardando: 'cupom' }); return editarOuEnviar(chatId, msgId, '🎟 Digite o código:', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_carrinho' }]] }); }
    if (data === 'carr_obs') { estados.set(userId, { ...estados.get(userId), aguardando: 'obs' }); return editarOuEnviar(chatId, msgId, '📝 Digite a observação:', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_carrinho' }]] }); }
    if (data === 'carr_finalizar') { const { iniciarPagamento } = require('./pagamento'); return iniciarPagamento(bot, chatId, userId, msgId, estados.get(userId) || {}); }
    if (data.startsWith('carr_menos_')) { const id = data.split('_')[2]; const i = db.prepare('SELECT * FROM carrinhos WHERE id=?').get(id); if (i.quantidade>1) db.prepare('UPDATE carrinhos SET quantidade=quantidade-1 WHERE id=?').run(id); else { db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id=?').run(id); db.prepare('DELETE FROM carrinhos WHERE id=?').run(id); } return showCarrinho(chatId, userId, msgId); }
    if (data.startsWith('carr_mais_')) { db.prepare('UPDATE carrinhos SET quantidade=quantidade+1 WHERE id=? AND quantidade<10').run(data.split('_')[2]); return showCarrinho(chatId, userId, msgId); }
    if (data.startsWith('carr_del_')) { const id = data.split('_')[2]; db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id=?').run(id); db.prepare('DELETE FROM carrinhos WHERE id=?').run(id); return showCarrinho(chatId, userId, msgId); }
}

// ============ PEDIDOS, FAVORITOS, PERFIL, ATENDIMENTO ============
async function showPedidos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const peds = db.prepare('SELECT * FROM pedidos WHERE cliente_id=? ORDER BY data_pedido DESC LIMIT 10').all(cli.id);
    if (peds.length === 0) return editarOuEnviar(chatId, msgId, '📦 Nenhum pedido!', { inline_keyboard: [[{ text: '🍕 Fazer Pedido', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
    const kb = { inline_keyboard: [] };
    const e = { 'pendente':'⏳','confirmado':'✅','preparo':'👨‍🍳','entrega':'🛵','entregue':'📦','cancelado':'❌' };
    for (const p of peds) kb.inline_keyboard.push([{ text: `${e[p.status]} ${p.numero} - ${fmt(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '📄 PDF', callback_data: 'ped_pdf' }, { text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editarOuEnviar(chatId, msgId, '📦 *MEUS PEDIDOS*', kb);
}

async function handlePedidos(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data.startsWith('ped_ver_')) {
        const p = db.prepare('SELECT * FROM pedidos WHERE id=?').get(data.split('_')[2]);
        const it = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id=?').all(p.id);
        let m = `📦 *${p.numero}*\n📊 ${p.status}\n💳 ${p.pagamento_status}\n\n🍕 *Itens:*\n`;
        for (const i of it) { m += `\n${i.quantidade}x ${i.produto_nome}\n📏 ${i.tamanho_nome} | 🧀 ${i.borda_nome}\n`; if (i.adicionais) m += `➕ ${i.adicionais}\n`; m += `💰 ${fmt(i.preco_unitario*i.quantidade)}\n`; }
        m += `\n💰 *Total: ${fmt(p.total)}*`;
        await editarOuEnviar(chatId, msgId, m, { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_pedidos' }]] });
    }
}

async function showFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const fv = db.prepare('SELECT f.*, p.nome FROM favoritos f JOIN produtos p ON f.produto_id=p.id WHERE f.cliente_id=?').all(cli.id);
    if (fv.length === 0) return editarOuEnviar(chatId, msgId, '❤️ Nenhum favorito!', { inline_keyboard: [[{ text: '🍕 Cardápio', callback_data: 'menu_cardapio' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
    const kb = { inline_keyboard: [] };
    for (const f of fv) kb.inline_keyboard.push([{ text: `🍕 ${f.nome}`, callback_data: `prod_${f.produto_id}` }, { text: '❌', callback_data: `fav_del_${f.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editarOuEnviar(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

async function handleFavoritos(chatId, userId, data, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    if (data.startsWith('fav_toggle_')) { const pid = data.split('_')[2]; const ex = db.prepare('SELECT * FROM favoritos WHERE cliente_id=? AND produto_id=?').get(cli.id, pid); if (ex) db.prepare('DELETE FROM favoritos WHERE id=?').run(ex.id); else db.prepare('INSERT INTO favoritos (cliente_id,produto_id) VALUES (?,?)').run(cli.id, pid); }
    if (data.startsWith('fav_del_')) { db.prepare('DELETE FROM favoritos WHERE id=?').run(data.split('_')[2]); return showFavoritos(chatId, userId, msgId); }
}

async function showPerfil(chatId, userId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT * FROM clientes WHERE telegram_id=?').get(userId);
    const peds = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id=?').get(c.id).t;
    let m = `👤 *MEU PERFIL*\n\n📝 ${c.nome}\n📧 ${c.email||'N/A'}\n📱 ${c.telefone||'N/A'}\n`;
    if (c.logradouro) m += `📍 ${c.logradouro}, ${c.numero||'S/N'} - ${c.bairro}\n`;
    m += `\n📦 Pedidos: *${peds}*\n💰 Total: *${fmt(c.total_gasto)}*\n⭐ Pontos: *${c.fidelidade_pontos}*`;
    await editarOuEnviar(chatId, msgId, m, { inline_keyboard: [[{ text: '✏️ Nome', callback_data: 'perfil_nome' }, { text: '📧 Email', callback_data: 'perfil_email' }], [{ text: '📱 Telefone', callback_data: 'perfil_tel' }, { text: '📍 Endereço', callback_data: 'perfil_end' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
}

async function handlePerfil(chatId, userId, data, msgId) {
    const m = { 'perfil_nome': 'Digite nome e sobrenome:', 'perfil_email': 'Digite o email:', 'perfil_tel': 'Digite o telefone:', 'perfil_end': 'Digite: Rua, Número, Bairro, Cidade, Estado' };
    if (m[data]) { estados.set(userId, { tela: 'perfil', aguardando: data }); return editarOuEnviar(chatId, msgId, m[data], { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'menu_perfil' }]] }); }
}

async function showAtendimento(chatId, userId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT unidade_proxima_id FROM clientes WHERE telegram_id=?').get(userId);
    const u = db.prepare('SELECT * FROM unidades WHERE id=?').get(c?.unidade_proxima_id);
    let m = '📞 *ATENDIMENTO*\n\n', w = '5544999999999';
    if (u) { m += `🏪 ${u.nome}\n📱 ${u.whatsapp||u.telefone}\n🕐 ${u.horario_abertura}-${u.horario_fechamento}`; w = '55'+(u.whatsapp||u.telefone||'').replace(/\D/g,''); }
    await editarOuEnviar(chatId, msgId, m, { inline_keyboard: [[{ text: '💬 WhatsApp', url: `https://wa.me/${w}` }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
}

// ============ TEXT HANDLER ============
async function handleText(chatId, userId, texto) {
    const db = getDatabase();
    const est = estados.get(userId);
    texto = texto.trim();
    
    if (est.aguardando === 'cupom') {
        const c = db.prepare('SELECT * FROM cupons WHERE codigo=? AND ativo=1').get(texto.toUpperCase());
        if (!c) return bot.sendMessage(chatId, '❌ Cupom inválido.');
        est.cupom = c; est.aguardando = null; estados.set(userId, est);
        return showCarrinho(chatId, userId, null);
    }
    if (est.aguardando === 'obs') { est.observacao = texto; est.aguardando = null; estados.set(userId, est); return showCarrinho(chatId, userId, null); }
    
    if (est.tela === 'pesquisar') {
        est.aguardando = null; estados.set(userId, est);
        const prods = db.prepare('SELECT p.*, (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco FROM produtos p WHERE p.disponivel=1 AND (p.nome LIKE ? OR p.descricao LIKE ?) LIMIT 10').all(`%${texto}%`, `%${texto}%`);
        const kb = { inline_keyboard: [] };
        for (const p of prods) kb.inline_keyboard.push([{ text: `🍕 ${p.nome} - ${fmt(p.preco||0)}`, callback_data: `prod_${p.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_cardapio' }]);
        return bot.sendMessage(chatId, prods.length ? `🔍 *Resultados:*` : '🔍 Nenhum resultado.', { parse_mode: 'Markdown', reply_markup: kb });
    }
    
    if (est.tela === 'perfil') {
        if (est.aguardando === 'perfil_nome') { if (texto.split(' ').length < 2) return bot.sendMessage(chatId, '❌ Nome e sobrenome.'); db.prepare('UPDATE clientes SET nome=? WHERE telegram_id=?').run(texto, userId); }
        if (est.aguardando === 'perfil_email') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return bot.sendMessage(chatId, '❌ Email inválido.'); db.prepare('UPDATE clientes SET email=? WHERE telegram_id=?').run(texto, userId); }
        if (est.aguardando === 'perfil_tel') { const t = texto.replace(/\D/g,''); if (t.length < 10) return bot.sendMessage(chatId, '❌ Telefone inválido.'); db.prepare('UPDATE clientes SET telefone=? WHERE telegram_id=?').run(t, userId); }
        if (est.aguardando === 'perfil_end') { const p = texto.split(',').map(pp => pp.trim()); if (p.length < 4) return bot.sendMessage(chatId, '❌ Formato: Rua, Número, Bairro, Cidade, Estado'); db.prepare('UPDATE clientes SET logradouro=?,numero=?,bairro=?,cidade=?,estado=? WHERE telegram_id=?').run(p[0],p[1],p[2],p[3],p[4]||'PR',userId); }
        est.aguardando = null; estados.set(userId, est);
        return bot.sendMessage(chatId, '✅ Dados atualizados!');
    }
}

// ============ HELPERS ============
async function editarOuEnviar(chatId, msgId, text, kb) {
    try {
        if (msgId) await bot.editMessageText(text, { chat_id, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function getBot() { return bot; }

module.exports = { startClientBot, getBot };
