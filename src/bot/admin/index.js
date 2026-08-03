const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda } = require('../../utils/helpers');

let adminBot = null;
const estados = new Map();
const adminMsg = new Map(); // Guarda {msgId, chatId} da mensagem ativa

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        if (!adminIds.includes(msg.from.id)) return adminBot.sendMessage(msg.chat.id, '⛔ Acesso negado.');
        showDashboard(msg.chat.id, msg.from.id);
    });
    
    adminBot.on('callback_query', async (q) => {
        if (!adminIds.includes(q.from.id)) return;
        adminBot.answerCallbackQuery(q.id);
        await router(q.message.chat.id, q.from.id, q.data, q.message.message_id);
    });
    
    adminBot.on('message', async (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        
        const est = estados.get(msg.from.id);
        if (est && est.aguardando) {
            // APAGA a mensagem do usuário imediatamente
            try { await adminBot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}
            await handleInput(msg.chat.id, msg.from.id, msg.text);
        }
    });
    
    logger.info('🤖 Admin ZERO acúmulo');
}

// ============ DASHBOARD ============
async function showDashboard(chatId, userId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
    const ped = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    const hoje = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE date(data_pedido)=date('now')").get().t;
    
    const msg = `🏠 *PAINEL ADMINISTRATIVO*\n\n` +
               `👥 Clientes: *${cli}*\n📦 Pedidos: *${ped}*\n` +
               `🕐 Hoje: *${hoje}*\n💰 Faturamento: *${formatarMoeda(fat)}*\n\n` +
               `Selecione:`;
    
    const kb = { inline_keyboard: [
        [{ text: '📍 Unidades', callback_data: 'adm_unidades' }],
        [{ text: '📂 Categorias', callback_data: 'adm_categorias' }, { text: '🍕 Produtos', callback_data: 'adm_produtos' }],
        [{ text: '🧀 Bordas', callback_data: 'adm_bordas' }, { text: '➕ Adicionais', callback_data: 'adm_adicionais' }],
        [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
        [{ text: '👥 Clientes', callback_data: 'adm_clientes' }],
        [{ text: '🎟 Cupons', callback_data: 'adm_cupons' }],
        [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }],
        [{ text: '⚙️ Configurações', callback_data: 'adm_config' }]
    ]};
    
    await editOrSend(chatId, null, msg, kb);
}

// ============ ROUTER ============
async function router(chatId, userId, data, msgId) {
    adminMsg.set(userId, { chatId, msgId });
    
    if (data === 'adm_voltar') return showDashboard(chatId, userId);
    if (data.startsWith('adm_unidades') || data.startsWith('unid_')) return handleUnidades(chatId, userId, data, msgId);
    if (data.startsWith('adm_categorias') || data.startsWith('cat_')) return handleCategorias(chatId, userId, data, msgId);
    if (data.startsWith('adm_produtos') || data.startsWith('prod_') || data.startsWith('tam_')) return handleProdutos(chatId, userId, data, msgId);
    if (data.startsWith('adm_bordas') || data.startsWith('borda_')) return handleBordas(chatId, userId, data, msgId);
    if (data.startsWith('adm_adicionais') || data.startsWith('adic_')) return handleAdicionais(chatId, userId, data, msgId);
    if (data.startsWith('adm_pedidos') || data.startsWith('ped_')) return handlePedidos(chatId, userId, data, msgId);
    if (data.startsWith('adm_clientes') || data.startsWith('cli_')) return handleClientes(chatId, userId, data, msgId);
    if (data.startsWith('adm_cupons') || data.startsWith('cupom_')) return handleCupons(chatId, userId, data, msgId);
    if (data.startsWith('adm_relatorios')) return handleRelatorios(chatId, userId, data, msgId);
    if (data.startsWith('adm_config') || data.startsWith('cfg_')) return handleConfig(chatId, userId, data, msgId);
}

// ============ UNIDADES ============
async function handleUnidades(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_unidades') {
        const uns = db.prepare('SELECT * FROM unidades ORDER BY cidade').all();
        const kb = { inline_keyboard: [] };
        for (const u of uns) kb.inline_keyboard.push([{ text: `${u.ativo?'✅':'❌'} ${u.nome} - ${u.cidade}/${u.estado}`, callback_data: `unid_edit_${u.id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Nova Unidade', callback_data: 'unid_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '📍 *UNIDADES*\n\nSelecione:', kb);
    }
    
    if (data === 'unid_nova') {
        estados.set(userId, { aguardando: 'unid_nome', nova: {} });
        return editOrSend(chatId, msgId, '📍 *NOVA UNIDADE*\n\nDigite o *nome*:', backButton('adm_unidades'));
    }
    
    if (data.startsWith('unid_edit_')) {
        const id = data.split('_')[2];
        const u = db.prepare('SELECT * FROM unidades WHERE id=?').get(id);
        const kb = { inline_keyboard: [
            [{ text: '✏️ Nome', callback_data: `unid_set_nome_${id}` }, { text: '🏙️ Cidade', callback_data: `unid_set_cidade_${id}` }],
            [{ text: '🏠 Endereço', callback_data: `unid_set_end_${id}` }],
            [{ text: '📞 Telefone', callback_data: `unid_set_tel_${id}` }, { text: '💬 WhatsApp', callback_data: `unid_set_wpp_${id}` }],
            [{ text: '🚚 Taxa', callback_data: `unid_set_taxa_${id}` }, { text: '💰 Mínimo', callback_data: `unid_set_min_${id}` }],
            [{ text: '🕐 Horários', callback_data: `unid_set_hora_${id}` }],
            [{ text: u.ativo?'❌ Desativar':'✅ Ativar', callback_data: `unid_toggle_${id}` }],
            [{ text: '🗑 Excluir', callback_data: `unid_del_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_unidades' }]
        ]};
        return editOrSend(chatId, msgId, `📍 *${u.nome}*\n🏙️ ${u.cidade}/${u.estado}\n🏠 ${u.logradouro}, ${u.numero}\n📞 ${u.telefone||'N/A'}\n🚚 ${formatarMoeda(u.taxa_entrega)}\n🕐 ${u.horario_abertura}-${u.horario_fechamento}\n\nSelecione o campo:`, kb);
    }
    
    if (data.startsWith('unid_set_')) {
        const [_, __, campo, id] = data.split('_');
        const msgs = { nome:'Digite o nome:', cidade:'Digite: Cidade, Estado\nEx: Paranavaí, PR', end:'Digite: Rua, Número, Bairro', tel:'Digite o telefone:', wpp:'Digite o WhatsApp:', taxa:'Digite a taxa (ex: 8.00):', min:'Digite o mínimo (ex: 30.00):', hora:'Digite: Abertura, Fechamento\nEx: 18:00, 23:00' };
        estados.set(userId, { aguardando: `unid_${campo}_${id}` });
        return editOrSend(chatId, msgId, msgs[campo], backButton(`unid_edit_${id}`));
    }
    
    if (data.startsWith('unid_toggle_')) {
        const id = data.split('_')[2];
        const u = db.prepare('SELECT * FROM unidades WHERE id=?').get(id);
        db.prepare('UPDATE unidades SET ativo=? WHERE id=?').run(u.ativo?0:1, id);
        await alert(chatId, msgId, u.ativo?'❌ Desativada':'✅ Ativada');
        return handleUnidades(chatId, userId, `unid_edit_${id}`, msgId);
    }
    
    if (data.startsWith('unid_del_')) {
        db.prepare('DELETE FROM unidades WHERE id=?').run(data.split('_')[2]);
        await alert(chatId, msgId, '🗑 Excluída!');
        return handleUnidades(chatId, userId, 'adm_unidades', msgId);
    }
}

// ============ CATEGORIAS ============
async function handleCategorias(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_categorias') {
        const cats = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
        const kb = { inline_keyboard: [] };
        for (const c of cats) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.emoji} ${c.nome}`, callback_data: `cat_edit_${c.id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Nova', callback_data: 'cat_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '📂 *CATEGORIAS*', kb);
    }
    
    if (data === 'cat_nova') {
        estados.set(userId, { aguardando: 'cat_nova' });
        return editOrSend(chatId, msgId, '📂 Digite: Nome, Emoji\nEx: Pizzas Doces, 🍫', backButton('adm_categorias'));
    }
    
    if (data.startsWith('cat_edit_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id=?').get(id);
        const kb = { inline_keyboard: [
            [{ text: '✏️ Nome', callback_data: `cat_set_nome_${id}` }, { text: '😀 Emoji', callback_data: `cat_set_emoji_${id}` }],
            [{ text: c.ativo?'❌ Desativar':'✅ Ativar', callback_data: `cat_toggle_${id}` }],
            [{ text: '🗑 Excluir', callback_data: `cat_del_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_categorias' }]
        ]};
        return editOrSend(chatId, msgId, `${c.emoji} *${c.nome}*`, kb);
    }
    
    if (data.startsWith('cat_set_')) {
        const [_, __, campo, id] = data.split('_');
        estados.set(userId, { aguardando: `cat_${campo}_${id}` });
        return editOrSend(chatId, msgId, campo==='nome'?'Digite o nome:':'Envie o emoji:', backButton(`cat_edit_${id}`));
    }
    
    if (data.startsWith('cat_toggle_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id=?').get(id);
        db.prepare('UPDATE categorias SET ativo=? WHERE id=?').run(c.ativo?0:1, id);
        await alert(chatId, msgId, c.ativo?'❌ Desativada':'✅ Ativada');
        return handleCategorias(chatId, userId, `cat_edit_${id}`, msgId);
    }
    
    if (data.startsWith('cat_del_')) {
        db.prepare('DELETE FROM categorias WHERE id=?').run(data.split('_')[2]);
        await alert(chatId, msgId, '🗑 Excluída!');
        return handleCategorias(chatId, userId, 'adm_categorias', msgId);
    }
}

// ============ PRODUTOS ============
async function handleProdutos(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_produtos') {
        const prods = db.prepare('SELECT p.*, c.emoji as ce, (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id ORDER BY p.ordem').all();
        const kb = { inline_keyboard: [] };
        for (const p of prods) {
            kb.inline_keyboard.push([{ text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco||0)}`, callback_data: `prod_edit_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Produto', callback_data: 'prod_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '🍕 *PRODUTOS*\n\nSelecione:', kb);
    }
    
    if (data === 'prod_novo') {
        const cats = db.prepare('SELECT * FROM categorias WHERE ativo=1').all();
        const kb = { inline_keyboard: [] };
        for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `prod_novocat_${c.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]);
        return editOrSend(chatId, msgId, '📂 Escolha a categoria:', kb);
    }
    
    if (data.startsWith('prod_novocat_')) {
        estados.set(userId, { aguardando: 'prod_novo', catId: data.split('_')[2] });
        return editOrSend(chatId, msgId, '🍕 Digite:\nNome, Descrição, Ingredientes, Preço Base\n\nEx: Calabresa, Pizza de calabresa, Calabresa e queijo, 29.90', backButton('adm_produtos'));
    }
    
    if (data.startsWith('prod_edit_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT p.*, c.nome as cn, c.emoji as ce FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?').get(id);
        const ts = db.prepare('SELECT * FROM tamanhos WHERE produto_id=? AND ativo=1').all(id);
        let tsStr = '';
        for (const t of ts) tsStr += `   📏 ${t.nome}: ${formatarMoeda(t.preco)}\n`;
        
        const kb = { inline_keyboard: [
            [{ text: '✏️ Nome', callback_data: `prod_set_nome_${id}` }, { text: '📝 Descrição', callback_data: `prod_set_desc_${id}` }],
            [{ text: '🥬 Ingredientes', callback_data: `prod_set_ingr_${id}` }, { text: '🖼 Foto', callback_data: `prod_set_foto_${id}` }],
            [{ text: '📏 Tamanhos', callback_data: `prod_tams_${id}` }],
            [{ text: p.disponivel?'❌ Indisponibilizar':'✅ Disponibilizar', callback_data: `prod_toggle_${id}` }],
            [{ text: '🗑 Excluir', callback_data: `prod_del_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
        ]};
        
        let msg = `${p.ce||'🍕'} *${p.nome}*\n📂 ${p.cn}\n📝 ${p.descricao||'N/A'}\n🥬 ${p.ingredientes||'N/A'}\n\n📏 *Tamanhos:*\n${tsStr||'Nenhum'}\n\nSelecione:`;
        return editOrSend(chatId, msgId, msg, kb);
    }
    
    if (data.startsWith('prod_set_')) {
        const [_, __, campo, id] = data.split('_');
        const msgs = { nome:'Digite o nome:', desc:'Digite a descrição:', ingr:'Digite os ingredientes:', foto:'Envie a URL da foto:' };
        estados.set(userId, { aguardando: `prod_${campo}_${id}` });
        return editOrSend(chatId, msgId, msgs[campo], backButton(`prod_edit_${id}`));
    }
    
    if (data.startsWith('prod_tams_')) {
        const id = data.split('_')[2];
        const ts = db.prepare('SELECT * FROM tamanhos WHERE produto_id=?').all(id);
        const kb = { inline_keyboard: [] };
        for (const t of ts) kb.inline_keyboard.push([{ text: `${t.ativo?'✅':'❌'} ${t.nome} - ${formatarMoeda(t.preco)}`, callback_data: `tam_edit_${t.id}_${id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Novo Tamanho', callback_data: `tam_novo_${id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `prod_edit_${id}` }]);
        return editOrSend(chatId, msgId, '📏 *TAMANHOS*', kb);
    }
    
    if (data.startsWith('tam_novo_')) {
        estados.set(userId, { aguardando: `tam_novo_${data.split('_')[2]}` });
        return editOrSend(chatId, msgId, '📏 Digite: Nome, Preço, Fatias\nEx: Grande, 49.90, 8', backButton(`prod_tams_${data.split('_')[2]}`));
    }
    
    if (data.startsWith('tam_edit_')) {
        const [_, __, tid, pid] = data.split('_');
        const t = db.prepare('SELECT * FROM tamanhos WHERE id=?').get(tid);
        const kb = { inline_keyboard: [
            [{ text: '✏️ Editar', callback_data: `tam_set_${tid}` }],
            [{ text: t.ativo?'❌ Desativar':'✅ Ativar', callback_data: `tam_toggle_${tid}_${pid}` }],
            [{ text: '🗑 Excluir', callback_data: `tam_del_${tid}_${pid}` }],
            [{ text: '⬅️ Voltar', callback_data: `prod_tams_${pid}` }]
        ]};
        return editOrSend(chatId, msgId, `📏 *${t.nome}*\n💰 ${formatarMoeda(t.preco)}\n🍕 ${t.fatias} fatias`, kb);
    }
    
    if (data.startsWith('tam_set_')) {
        estados.set(userId, { aguardando: `tam_set_${data.split('_')[2]}` });
        return editOrSend(chatId, msgId, 'Digite: Nome, Preço, Fatias', backButton(`tam_edit_${data.split('_')[2]}_0`));
    }
    
    if (data.startsWith('tam_toggle_')) {
        const [_, __, tid, pid] = data.split('_');
        const t = db.prepare('SELECT * FROM tamanhos WHERE id=?').get(tid);
        db.prepare('UPDATE tamanhos SET ativo=? WHERE id=?').run(t.ativo?0:1, tid);
        await alert(chatId, msgId, t.ativo?'❌ Desativado':'✅ Ativado');
        return handleProdutos(chatId, userId, `prod_tams_${pid}`, msgId);
    }
    
    if (data.startsWith('tam_del_')) {
        const [_, __, tid, pid] = data.split('_');
        db.prepare('DELETE FROM tamanhos WHERE id=?').run(tid);
        await alert(chatId, msgId, '🗑 Excluído!');
        return handleProdutos(chatId, userId, `prod_tams_${pid}`, msgId);
    }
    
    if (data.startsWith('prod_toggle_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(id);
        db.prepare('UPDATE produtos SET disponivel=? WHERE id=?').run(p.disponivel?0:1, id);
        await alert(chatId, msgId, p.disponivel?'❌ Indisponível':'✅ Disponível');
        return handleProdutos(chatId, userId, `prod_edit_${id}`, msgId);
    }
    
    if (data.startsWith('prod_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM tamanhos WHERE produto_id=?').run(id);
        db.prepare('DELETE FROM produtos WHERE id=?').run(id);
        await alert(chatId, msgId, '🗑 Excluído!');
        return handleProdutos(chatId, userId, 'adm_produtos', msgId);
    }
}

// ============ BORDAS ============
async function handleBordas(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data === 'adm_bordas') {
        const bs = db.prepare('SELECT * FROM bordas').all();
        const kb = { inline_keyboard: [] };
        for (const b of bs) kb.inline_keyboard.push([{ text: `${b.ativo?'✅':'❌'} ${b.nome} - ${formatarMoeda(b.preco)}`, callback_data: `borda_edit_${b.id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Nova', callback_data: 'borda_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '🧀 *BORDAS*', kb);
    }
    if (data === 'borda_nova') { estados.set(userId, { aguardando: 'borda_nova' }); return editOrSend(chatId, msgId, '🧀 Digite: Nome, Preço\nEx: Catupiry, 8.00', backButton('adm_bordas')); }
    if (data.startsWith('borda_edit_')) {
        const id = data.split('_')[2];
        const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id);
        const kb = { inline_keyboard: [
            [{ text: '✏️ Editar', callback_data: `borda_set_${id}` }],
            [{ text: b.ativo?'❌ Desativar':'✅ Ativar', callback_data: `borda_toggle_${id}` }],
            [{ text: '🗑 Excluir', callback_data: `borda_del_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_bordas' }]
        ]};
        return editOrSend(chatId, msgId, `🧀 *${b.nome}*\n💰 ${formatarMoeda(b.preco)}`, kb);
    }
    if (data.startsWith('borda_set_')) { estados.set(userId, { aguardando: `borda_set_${data.split('_')[2]}` }); return editOrSend(chatId, msgId, 'Digite: Nome, Preço', backButton(`borda_edit_${data.split('_')[2]}`)); }
    if (data.startsWith('borda_toggle_')) { const id = data.split('_')[2]; const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id); db.prepare('UPDATE bordas SET ativo=? WHERE id=?').run(b.ativo?0:1, id); await alert(chatId, msgId, b.ativo?'❌ Desativada':'✅ Ativada'); return handleBordas(chatId, userId, `borda_edit_${id}`, msgId); }
    if (data.startsWith('borda_del_')) { db.prepare('DELETE FROM bordas WHERE id=?').run(data.split('_')[2]); await alert(chatId, msgId, '🗑 Excluída!'); return handleBordas(chatId, userId, 'adm_bordas', msgId); }
}

// ============ ADICIONAIS ============
async function handleAdicionais(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data === 'adm_adicionais') {
        const ads = db.prepare('SELECT * FROM adicionais ORDER BY categoria, nome').all();
        const kb = { inline_keyboard: [] };
        for (const a of ads) kb.inline_keyboard.push([{ text: `${a.disponivel?'✅':'❌'} ${a.nome} - ${formatarMoeda(a.preco)}`, callback_data: `adic_edit_${a.id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'adic_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '➕ *ADICIONAIS*', kb);
    }
    if (data === 'adic_novo') { estados.set(userId, { aguardando: 'adic_novo' }); return editOrSend(chatId, msgId, '➕ Digite: Nome, Preço, Categoria\nEx: Bacon, 5.00, carnes', backButton('adm_adicionais')); }
    if (data.startsWith('adic_edit_')) {
        const id = data.split('_')[2];
        const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id);
        const kb = { inline_keyboard: [
            [{ text: '✏️ Editar', callback_data: `adic_set_${id}` }],
            [{ text: a.disponivel?'❌ Indisponibilizar':'✅ Disponibilizar', callback_data: `adic_toggle_${id}` }],
            [{ text: '🗑 Excluir', callback_data: `adic_del_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_adicionais' }]
        ]};
        return editOrSend(chatId, msgId, `➕ *${a.nome}*\n💰 ${formatarMoeda(a.preco)}\n📂 ${a.categoria}`, kb);
    }
    if (data.startsWith('adic_set_')) { estados.set(userId, { aguardando: `adic_set_${data.split('_')[2]}` }); return editOrSend(chatId, msgId, 'Digite: Nome, Preço, Categoria', backButton(`adic_edit_${data.split('_')[2]}`)); }
    if (data.startsWith('adic_toggle_')) { const id = data.split('_')[2]; const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id); db.prepare('UPDATE adicionais SET disponivel=? WHERE id=?').run(a.disponivel?0:1, id); await alert(chatId, msgId, a.disponivel?'❌ Indisponível':'✅ Disponível'); return handleAdicionais(chatId, userId, `adic_edit_${id}`, msgId); }
    if (data.startsWith('adic_del_')) { db.prepare('DELETE FROM adicionais WHERE id=?').run(data.split('_')[2]); await alert(chatId, msgId, '🗑 Excluído!'); return handleAdicionais(chatId, userId, 'adm_adicionais', msgId); }
}

// ============ PEDIDOS ============
async function handlePedidos(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data === 'adm_pedidos') {
        const peds = db.prepare('SELECT p.*, c.nome as cn FROM pedidos p JOIN clientes c ON p.cliente_id=c.id ORDER BY p.data_pedido DESC LIMIT 20').all();
        const kb = { inline_keyboard: [] };
        const e = { pendente:'⏳', confirmado:'✅', preparo:'👨‍🍳', entrega:'🛵', entregue:'📦', cancelado:'❌' };
        for (const p of peds) kb.inline_keyboard.push([{ text: `${e[p.status]} ${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '📋 *PEDIDOS*', kb);
    }
    if (data.startsWith('ped_ver_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT p.*, c.nome, c.telefone FROM pedidos p JOIN clientes c ON p.cliente_id=c.id WHERE p.id=?').get(id);
        const it = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id=?').all(id);
        let m = `📦 *${p.numero}*\n👤 ${p.nome}\n📱 ${p.telefone}\n📊 ${p.status}\n💳 ${p.pagamento_status}\n\n🍕 *Itens:*\n`;
        for (const i of it) { m += `\n${i.quantidade}x ${i.produto_nome}\n📏 ${i.tamanho_nome} | 🧀 ${i.borda_nome}\n`; if (i.adicionais) m += `➕ ${i.adicionais}\n`; m += `💰 ${formatarMoeda(i.preco_unitario*i.quantidade)}\n`; }
        m += `\n💰 *Total: ${formatarMoeda(p.total)}*`;
        const kb = { inline_keyboard: [
            [{ text: '👨‍🍳 Preparo', callback_data: `ped_st_preparo_${id}` }, { text: '🛵 Entrega', callback_data: `ped_st_entrega_${id}` }],
            [{ text: '📦 Entregue', callback_data: `ped_st_entregue_${id}` }, { text: '❌ Cancelar', callback_data: `ped_st_cancelar_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]
        ]};
        return editOrSend(chatId, msgId, m, kb);
    }
    if (data.startsWith('ped_st_')) {
        const [_, __, st, id] = data.split('_');
        const mapa = { preparo:'preparo', entrega:'entrega', entregue:'entregue', cancelar:'cancelado' };
        db.prepare('UPDATE pedidos SET status=? WHERE id=?').run(mapa[st], id);
        await alert(chatId, msgId, `✅ ${mapa[st].toUpperCase()}`);
        return handlePedidos(chatId, userId, `ped_ver_${id}`, msgId);
    }
}

// ============ CLIENTES ============
async function handleClientes(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data === 'adm_clientes') {
        const clis = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM pedidos WHERE cliente_id=c.id) as tp FROM clientes c ORDER BY c.total_gasto DESC LIMIT 30').all();
        const kb = { inline_keyboard: [] };
        for (const c of clis) kb.inline_keyboard.push([{ text: `${c.bloqueado?'🚫':'✅'} ${c.nome||'Sem nome'} - ${formatarMoeda(c.total_gasto)}`, callback_data: `cli_ver_${c.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '👥 *CLIENTES*', kb);
    }
    if (data.startsWith('cli_ver_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id);
        let m = `👤 *${c.nome||'N/A'}*\n📧 ${c.email||'N/A'}\n📱 ${c.telefone||'N/A'}\n💰 ${formatarMoeda(c.total_gasto)}\n⭐ ${c.fidelidade_pontos} pts\n🚫 ${c.bloqueado?'BLOQUEADO':'Ativo'}`;
        const kb = { inline_keyboard: [
            [{ text: c.bloqueado?'✅ Desbloquear':'🚫 Bloquear', callback_data: `cli_toggle_${id}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]
        ]};
        return editOrSend(chatId, msgId, m, kb);
    }
    if (data.startsWith('cli_toggle_')) { const id = data.split('_')[2]; const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id); db.prepare('UPDATE clientes SET bloqueado=? WHERE id=?').run(c.bloqueado?0:1, id); await alert(chatId, msgId, c.bloqueado?'✅ Desbloqueado':'🚫 Bloqueado'); return handleClientes(chatId, userId, `cli_ver_${id}`, msgId); }
}

// ============ CUPONS ============
async function handleCupons(chatId, userId, data, msgId) {
    const db = getDatabase();
    if (data === 'adm_cupons') {
        const cs = db.prepare('SELECT * FROM cupons').all();
        const kb = { inline_keyboard: [] };
        for (const c of cs) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.codigo} - ${c.valor}${c.tipo==='percentual'?'%':'R$'}`, callback_data: `cupom_edit_${c.id}` }]);
        kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'cupom_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        return editOrSend(chatId, msgId, '🎟 *CUPONS*', kb);
    }
    if (data === 'cupom_novo') { estados.set(userId, { aguardando: 'cupom_novo' }); return editOrSend(chatId, msgId, '🎟 Digite: Código, Tipo, Valor, Usos, Dias\nEx: PIZZA10, percentual, 10, 100, 30', backButton('adm_cupons')); }
    if (data.startsWith('cupom_toggle_')) { const id = data.split('_')[2]; const c = db.prepare('SELECT * FROM cupons WHERE id=?').get(id); db.prepare('UPDATE cupons SET ativo=? WHERE id=?').run(c.ativo?0:1, id); await alert(chatId, msgId, c.ativo?'❌ Desativado':'✅ Ativado'); return handleCupons(chatId, userId, 'adm_cupons', msgId); }
    if (data.startsWith('cupom_del_')) { db.prepare('DELETE FROM cupons WHERE id=?').run(data.split('_')[2]); await alert(chatId, msgId, '🗑 Excluído!'); return handleCupons(chatId, userId, 'adm_cupons', msgId); }
}

// ============ RELATÓRIOS / CONFIG ============
async function handleRelatorios(chatId, userId, data, msgId) {
    const db = getDatabase();
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    const top = db.prepare('SELECT produto_nome, COUNT(*) as t FROM itens_pedido GROUP BY produto_nome ORDER BY t DESC LIMIT 5').all();
    let m = `📊 *RELATÓRIOS*\n\n💰 Faturamento: *${formatarMoeda(fat)}*\n\n🍕 *TOP 5:*\n`;
    for (const t of top) m += `   ${t.produto_nome}: ${t.t}x\n`;
    return editOrSend(chatId, msgId, m, backButton('adm_voltar'));
}

async function handleConfig(chatId, userId, data, msgId) {
    return editOrSend(chatId, msgId, '⚙️ *CONFIGURAÇÕES*\n\nEm desenvolvimento.', backButton('adm_voltar'));
}

// ============ INPUT HANDLER ============
async function handleInput(chatId, userId, texto) {
    const db = getDatabase();
    const est = estados.get(userId);
    if (!est || !est.aguardando) return;
    
    const ag = est.aguardando;
    const partes = texto.split(',').map(p => p.trim());
    const info = adminMsg.get(userId) || { chatId, msgId: null };
    
    // UNIDADE
    if (ag === 'unid_nome') { est.nova.nome = texto; est.aguardando = 'unid_cidade'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🏙️ Digite a *cidade*:', backButton('adm_unidades')); }
    if (ag === 'unid_cidade') { est.nova.cidade = texto; est.aguardando = 'unid_estado'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🗺️ Digite o *estado* (sigla):', backButton('adm_unidades')); }
    if (ag === 'unid_estado') { est.nova.estado = texto.toUpperCase(); est.aguardando = 'unid_rua'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🏠 Digite a *rua*:', backButton('adm_unidades')); }
    if (ag === 'unid_rua') { est.nova.logradouro = texto; est.aguardando = 'unid_num'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🔢 Digite o *número*:', backButton('adm_unidades')); }
    if (ag === 'unid_num') { est.nova.numero = texto; est.aguardando = 'unid_tel'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '📞 Digite o *telefone*:', backButton('adm_unidades')); }
    if (ag === 'unid_tel') { est.nova.telefone = texto; est.aguardando = 'unid_wpp'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '💬 Digite o *WhatsApp*:', backButton('adm_unidades')); }
    if (ag === 'unid_wpp') { est.nova.whatsapp = texto; est.aguardando = 'unid_taxa'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🚚 Digite a *taxa* (ex: 8.00):', backButton('adm_unidades')); }
    if (ag === 'unid_taxa') { est.nova.taxa_entrega = parseFloat(texto.replace(',','.')); est.aguardando = 'unid_abertura'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🕐 Digite *abertura* (ex: 18:00):', backButton('adm_unidades')); }
    if (ag === 'unid_abertura') { est.nova.horario_abertura = texto; est.aguardando = 'unid_fechamento'; estados.set(userId, est); return editOrSend(chatId, info.msgId, '🕐 Digite *fechamento* (ex: 23:00):', backButton('adm_unidades')); }
    if (ag === 'unid_fechamento') {
        est.nova.horario_fechamento = texto;
        const u = est.nova;
        db.prepare('INSERT INTO unidades (nome,cidade,estado,logradouro,numero,telefone,whatsapp,taxa_entrega,horario_abertura,horario_fechamento) VALUES (?,?,?,?,?,?,?,?,?,?)').run(u.nome,u.cidade,u.estado,u.logradouro,u.numero,u.telefone,u.whatsapp,u.taxa_entrega,u.horario_abertura,u.horario_fechamento);
        est.aguardando = null; estados.set(userId, est);
        return editOrSend(chatId, info.msgId, `✅ Unidade *${u.nome}* criada!`, backButton('adm_unidades'));
    }
    
    if (ag.startsWith('unid_')) {
        const [_, campo, id] = ag.split('_');
        if (campo === 'cidade') { const [c, e] = partes; db.prepare('UPDATE unidades SET cidade=?, estado=? WHERE id=?').run(c, e?.toUpperCase()||'PR', id); }
        else if (campo === 'end') { const [r, n, b] = partes; db.prepare('UPDATE unidades SET logradouro=?, numero=?, bairro=? WHERE id=?').run(r, n, b||'', id); }
        else if (campo === 'hora') { const [a, f] = partes; db.prepare('UPDATE unidades SET horario_abertura=?, horario_fechamento=? WHERE id=?').run(a, f, id); }
        else { const mapa = { nome:'nome', tel:'telefone', wpp:'whatsapp', taxa:'taxa_entrega', min:'pedido_minimo' }; db.prepare(`UPDATE unidades SET ${mapa[campo]}=? WHERE id=?`).run(['taxa','min'].includes(campo)?parseFloat(texto.replace(',','.')):texto, id); }
        est.aguardando = null; estados.set(userId, est);
        return editOrSend(chatId, info.msgId, '✅ Atualizado!', backButton('adm_unidades'));
    }
    
    // CATEGORIA
    if (ag === 'cat_nova') { db.prepare('INSERT INTO categorias (nome, emoji) VALUES (?,?)').run(partes[0], partes[1]||'🍕'); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, `✅ Categoria *${partes[0]}* criada!`, backButton('adm_categorias')); }
    if (ag.startsWith('cat_')) { const [_, campo, id] = ag.split('_'); db.prepare(`UPDATE categorias SET ${campo}=? WHERE id=?`).run(texto, id); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, '✅ Atualizado!', backButton('adm_categorias')); }
    
    // PRODUTO
    if (ag === 'prod_novo') {
        const [nome, desc, ingr, preco] = partes;
        const r = db.prepare('INSERT INTO produtos (categoria_id, nome, descricao, ingredientes) VALUES (?,?,?,?)').run(est.catId, nome, desc, ingr);
        db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?,?,?,?)').run(r.lastInsertRowid, 'Média', parseFloat(preco.replace(',','.')), 8);
        est.aguardando = null; estados.set(userId, est);
        return editOrSend(chatId, info.msgId, `✅ Produto *${nome}* criado com tamanho Média!`, backButton('adm_produtos'));
    }
    if (ag.startsWith('prod_')) { const [_, campo, id] = ag.split('_'); const mapa = { nome:'nome', desc:'descricao', ingr:'ingredientes', foto:'foto' }; db.prepare(`UPDATE produtos SET ${mapa[campo]}=? WHERE id=?`).run(texto, id); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, '✅ Atualizado!', backButton(`prod_edit_${id}`)); }
    
    // TAMANHO
    if (ag.startsWith('tam_novo_')) { const pid = ag.split('_')[2]; const [n, p, f] = partes; db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?,?,?,?)').run(pid, n, parseFloat(p.replace(',','.')), parseInt(f)||8); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, `✅ Tamanho *${n}* criado!`, backButton(`prod_tams_${pid}`)); }
    if (ag.startsWith('tam_set_')) { const id = ag.split('_')[2]; const [n, p, f] = partes; db.prepare('UPDATE tamanhos SET nome=?, preco=?, fatias=? WHERE id=?').run(n, parseFloat(p.replace(',','.')), parseInt(f)||8, id); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, '✅ Tamanho atualizado!', backButton('adm_produtos')); }
    
    // BORDA
    if (ag === 'borda_nova') { const [n, p] = partes; db.prepare('INSERT INTO bordas (nome, preco) VALUES (?,?)').run(n, parseFloat(p.replace(',','.'))); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, `✅ Borda *${n}* criada!`, backButton('adm_bordas')); }
    if (ag.startsWith('borda_set_')) { const id = ag.split('_')[2]; const [n, p] = partes; db.prepare('UPDATE bordas SET nome=?, preco=? WHERE id=?').run(n, parseFloat(p.replace(',','.')), id); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, '✅ Atualizada!', backButton('adm_bordas')); }
    
    // ADICIONAL
    if (ag === 'adic_novo') { const [n, p, c] = partes; db.prepare('INSERT INTO adicionais (nome, preco, categoria) VALUES (?,?,?)').run(n, parseFloat(p.replace(',','.')), c||'geral'); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, `✅ Adicional *${n}* criado!`, backButton('adm_adicionais')); }
    if (ag.startsWith('adic_set_')) { const id = ag.split('_')[2]; const [n, p, c] = partes; db.prepare('UPDATE adicionais SET nome=?, preco=?, categoria=? WHERE id=?').run(n, parseFloat(p.replace(',','.')), c||'geral', id); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, '✅ Atualizado!', backButton('adm_adicionais')); }
    
    // CUPOM
    if (ag === 'cupom_novo') { const [cod, tipo, valor, usos, dias] = partes; const val = new Date(); val.setDate(val.getDate()+parseInt(dias)); db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?,?,?,?,?)').run(cod.toUpperCase(), tipo, parseFloat(valor), parseInt(usos), val.toISOString()); est.aguardando = null; estados.set(userId, est); return editOrSend(chatId, info.msgId, `✅ Cupom *${cod.toUpperCase()}* criado!`, backButton('adm_cupons')); }
}

// ============ HELPERS ============
async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) {
            await adminBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        } else {
            const sent = await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
            adminMsg.set(chatId, { chatId, msgId: sent.message_id });
        }
    } catch (e) {
        const sent = await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
        adminMsg.set(chatId, { chatId, msgId: sent.message_id });
    }
}

function backButton(data) {
    return { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: data }]] };
}

async function alert(chatId, msgId, text) {
    try { await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text, show_alert: true }); } catch (e) {}
}

function getAdminBot() { return adminBot; }

module.exports = { startAdminBot, getAdminBot };
