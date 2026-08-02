const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

let adminBot = null;
const estadosAdmin = new Map();
const menusAnteriores = new Map(); // Guarda menu anterior pra voltar

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        const userId = msg.from.id;
        if (!adminIds.includes(userId)) {
            return adminBot.sendMessage(msg.chat.id, '⛔ Acesso negado.');
        }
        showDashboard(msg.chat.id, userId);
    });
    
    adminBot.on('callback_query', async (query) => {
        const userId = query.from.id;
        if (!adminIds.includes(userId)) return;
        
        const chatId = query.message.chat.id;
        const data = query.data;
        const msgId = query.message.message_id;
        
        adminBot.answerCallbackQuery(query.id);
        await handleCallback(chatId, userId, data, msgId);
    });
    
    adminBot.on('message', async (msg) => {
        const userId = msg.from.id;
        if (!adminIds.includes(userId)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        
        const estado = estadosAdmin.get(userId);
        if (estado && estado.aguardando) {
            await handleTextInput(msg.chat.id, userId, msg.text);
        }
    });
    
    logger.info('🤖 Bot Admin completo configurado');
}

// ============ DASHBOARD ============
async function showDashboard(chatId, userId) {
    const db = getDatabase();
    const clientes = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
    const pedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    const hoje = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE date(data_pedido)=date('now')").get().t;
    const pendentes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status IN ('confirmado','preparo')").get().t;
    
    const msg = `🏠 *PAINEL ADMINISTRATIVO*\n\n` +
               `👥 Clientes: *${clientes}*\n` +
               `📦 Pedidos: *${pedidos}*\n` +
               `⚠️ Pendentes: *${pendentes}*\n` +
               `🕐 Hoje: *${hoje}*\n` +
               `💰 Faturamento: *${formatarMoeda(fat)}*\n\n` +
               `Selecione uma opção:`;
    
    const kb = {
        inline_keyboard: [
            [{ text: '📍 Unidades', callback_data: 'adm_unidades' }],
            [{ text: '📂 Categorias', callback_data: 'adm_categorias' }, { text: '🍕 Produtos', callback_data: 'adm_produtos' }],
            [{ text: '🧀 Bordas', callback_data: 'adm_bordas' }, { text: '➕ Adicionais', callback_data: 'adm_adicionais' }],
            [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
            [{ text: '👥 Clientes', callback_data: 'adm_clientes' }],
            [{ text: '🎟 Cupons', callback_data: 'adm_cupons' }],
            [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }],
            [{ text: '⚙️ Configurações', callback_data: 'adm_config' }]
        ]
    };
    
    await adminBot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// ============ CALLBACK ROUTER ============
async function handleCallback(chatId, userId, data, msgId) {
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
        const unidades = db.prepare('SELECT * FROM unidades ORDER BY cidade').all();
        const kb = { inline_keyboard: [] };
        
        for (const u of unidades) {
            kb.inline_keyboard.push([
                { text: `${u.ativo ? '✅' : '❌'} ${u.nome} - ${u.cidade}/${u.estado}`, callback_data: `unid_edit_${u.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Nova Unidade', callback_data: 'unid_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '📍 *UNIDADES*\n\nSelecione para editar ou adicione nova:', kb);
        return;
    }
    
    if (data === 'unid_nova') {
        estadosAdmin.set(userId, { aguardando: 'unid_nome', nova: {} });
        await editMessage(chatId, msgId, '📍 *NOVA UNIDADE*\n\nDigite o *nome*:', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_unidades' }]] });
        return;
    }
    
    if (data.startsWith('unid_edit_')) {
        const id = data.split('_')[2];
        const u = db.prepare('SELECT * FROM unidades WHERE id = ?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Nome', callback_data: `unid_campo_nome_${id}` }],
                [{ text: '🏙️ Cidade/Estado', callback_data: `unid_campo_cidade_${id}` }],
                [{ text: '🏠 Endereço', callback_data: `unid_campo_end_${id}` }],
                [{ text: '📞 Telefone', callback_data: `unid_campo_tel_${id}` }, { text: '💬 WhatsApp', callback_data: `unid_campo_wpp_${id}` }],
                [{ text: '🚚 Taxa', callback_data: `unid_campo_taxa_${id}` }, { text: '💰 Mínimo', callback_data: `unid_campo_min_${id}` }],
                [{ text: '🕐 Horários', callback_data: `unid_campo_hora_${id}` }],
                [{ text: u.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `unid_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `unid_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_unidades' }]
            ]
        };
        
        await editMessage(chatId, msgId,
            `📍 *${u.nome}*\n🏙️ ${u.cidade}/${u.estado}\n🏠 ${u.logradouro}, ${u.numero}\n📞 ${u.telefone || 'N/A'}\n💬 ${u.whatsapp || 'N/A'}\n🚚 Taxa: ${formatarMoeda(u.taxa_entrega)}\n💰 Mínimo: ${formatarMoeda(u.pedido_minimo)}\n🕐 ${u.horario_abertura}-${u.horario_fechamento}\n\nSelecione o campo:`,
            kb
        );
        return;
    }
    
    if (data.startsWith('unid_campo_')) {
        const partes = data.split('_');
        const campo = partes[2];
        const id = partes[3];
        
        const msgs = {
            'nome': 'Digite o novo nome:', 'cidade': 'Digite: Cidade, Estado\nEx: Paranavaí, PR',
            'end': 'Digite: Rua, Número, Bairro', 'tel': 'Digite o telefone:', 'wpp': 'Digite o WhatsApp:',
            'taxa': 'Digite a taxa (ex: 8.00):', 'min': 'Digite o mínimo (ex: 30.00):', 'hora': 'Digite: Abertura, Fechamento\nEx: 18:00, 23:00'
        };
        
        estadosAdmin.set(userId, { aguardando: `unid_set_${campo}_${id}` });
        await editMessage(chatId, msgId, msgs[campo], { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `unid_edit_${id}` }]] });
        return;
    }
    
    if (data.startsWith('unid_toggle_')) {
        const id = data.split('_')[2];
        const u = db.prepare('SELECT * FROM unidades WHERE id = ?').get(id);
        db.prepare('UPDATE unidades SET ativo = ? WHERE id = ?').run(u.ativo ? 0 : 1, id);
        await showAlert(chatId, msgId, u.ativo ? '❌ Desativada' : '✅ Ativada');
        await handleUnidades(chatId, userId, `unid_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('unid_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM unidades WHERE id = ?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluída!');
        await handleUnidades(chatId, userId, 'adm_unidades', msgId);
        return;
    }
}

// ============ CATEGORIAS ============
async function handleCategorias(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_categorias') {
        const cats = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
        const kb = { inline_keyboard: [] };
        
        for (const c of cats) {
            kb.inline_keyboard.push([
                { text: `${c.ativo ? '✅' : '❌'} ${c.emoji} ${c.nome}`, callback_data: `cat_edit_${c.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Nova Categoria', callback_data: 'cat_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '📂 *CATEGORIAS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data === 'cat_nova') {
        estadosAdmin.set(userId, { aguardando: 'cat_nova' });
        await editMessage(chatId, msgId, '📂 Digite: Nome, Emoji\nEx: Pizzas Doces, 🍫', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_categorias' }]] });
        return;
    }
    
    if (data.startsWith('cat_edit_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Nome', callback_data: `cat_setnome_${id}` }, { text: '😀 Emoji', callback_data: `cat_setemoji_${id}` }],
                [{ text: c.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `cat_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `cat_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_categorias' }]
            ]
        };
        
        await editMessage(chatId, msgId, `${c.emoji} *${c.nome}*\n\nSelecione para editar:`, kb);
        return;
    }
    
    if (data.startsWith('cat_set')) {
        const partes = data.split('_');
        const campo = partes[1].includes('nome') ? 'nome' : 'emoji';
        const id = partes[2];
        const msgs = { 'nome': 'Digite o novo nome:', 'emoji': 'Envie o novo emoji:' };
        estadosAdmin.set(userId, { aguardando: `cat_${campo}_${id}` });
        await editMessage(chatId, msgId, msgs[campo], { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `cat_edit_${id}` }]] });
        return;
    }
    
    if (data.startsWith('cat_toggle_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
        db.prepare('UPDATE categorias SET ativo = ? WHERE id = ?').run(c.ativo ? 0 : 1, id);
        await showAlert(chatId, msgId, c.ativo ? '❌ Desativada' : '✅ Ativada');
        await handleCategorias(chatId, userId, `cat_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('cat_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluída!');
        await handleCategorias(chatId, userId, 'adm_categorias', msgId);
        return;
    }
}

// ============ PRODUTOS ============
async function handleProdutos(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_produtos') {
        const prods = db.prepare(`
            SELECT p.*, c.emoji as ce, c.nome as cn,
                   (SELECT MIN(preco) FROM tamanhos WHERE produto_id=p.id AND ativo=1) as preco
            FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id ORDER BY p.ordem
        `).all();
        
        const kb = { inline_keyboard: [] };
        for (const p of prods) {
            kb.inline_keyboard.push([
                { text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco||0)}`, callback_data: `prod_edit_${p.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Produto', callback_data: 'prod_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '🍕 *PRODUTOS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data === 'prod_novo') {
        const cats = db.prepare('SELECT * FROM categorias WHERE ativo=1').all();
        const kb = { inline_keyboard: [] };
        for (const c of cats) {
            kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `prod_novocat_${c.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]);
        await editMessage(chatId, msgId, '📂 Escolha a categoria:', kb);
        return;
    }
    
    if (data.startsWith('prod_novocat_')) {
        const catId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: 'prod_novo', catId });
        await editMessage(chatId, msgId, '🍕 Digite:\nNome, Descrição, Ingredientes, Preço Base\n\nEx: Calabresa, Pizza de calabresa, Calabresa e queijo, 29.90', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_produtos' }]] });
        return;
    }
    
    if (data.startsWith('prod_edit_')) {
        const id = data.split('_')[2];
        const p = db.prepare(`
            SELECT p.*, c.nome as cn, c.emoji as ce FROM produtos p 
            LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?
        `).get(id);
        
        const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id=? AND ativo=1').all(id);
        let tamStr = '';
        for (const t of tamanhos) tamStr += `   📏 ${t.nome}: ${formatarMoeda(t.preco)} (${t.fatias} fatias)\n`;
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Nome', callback_data: `prod_campo_nome_${id}` }, { text: '📝 Descrição', callback_data: `prod_campo_desc_${id}` }],
                [{ text: '🥬 Ingredientes', callback_data: `prod_campo_ingr_${id}` }, { text: '🖼 Foto', callback_data: `prod_campo_foto_${id}` }],
                [{ text: '📏 Gerenciar Tamanhos', callback_data: `prod_tamanhos_${id}` }],
                [{ text: p.disponivel ? '❌ Indisponibilizar' : '✅ Disponibilizar', callback_data: `prod_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `prod_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
            ]
        };
        
        await editMessage(chatId, msgId,
            `${p.ce || '🍕'} *${p.nome}*\n📂 ${p.cn}\n📝 ${p.descricao || 'N/A'}\n🥬 ${p.ingredientes || 'N/A'}\n\n📏 *Tamanhos:*\n${tamStr || 'Nenhum'}\n\nSelecione para editar:`,
            kb
        );
        return;
    }
    
    if (data.startsWith('prod_campo_')) {
        const partes = data.split('_');
        const campo = partes[2];
        const id = partes[3];
        
        const msgs = { 'nome': 'Digite o novo nome:', 'desc': 'Digite a nova descrição:', 'ingr': 'Digite os novos ingredientes:', 'foto': 'Envie a URL da nova foto:' };
        
        estadosAdmin.set(userId, { aguardando: `prod_set_${campo}_${id}` });
        await editMessage(chatId, msgId, msgs[campo], { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `prod_edit_${id}` }]] });
        return;
    }
    
    if (data.startsWith('prod_tamanhos_')) {
        const id = data.split('_')[2];
        const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id=?').all(id);
        const kb = { inline_keyboard: [] };
        
        for (const t of tamanhos) {
            kb.inline_keyboard.push([
                { text: `${t.ativo?'✅':'❌'} ${t.nome} - ${formatarMoeda(t.preco)}`, callback_data: `tam_edit_${t.id}_${id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Tamanho', callback_data: `tam_novo_${id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `prod_edit_${id}` }]);
        
        await editMessage(chatId, msgId, '📏 *TAMANHOS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data.startsWith('tam_novo_')) {
        const prodId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `tam_novo_${prodId}` });
        await editMessage(chatId, msgId, '📏 Digite: Nome, Preço, Fatias\nEx: Grande, 49.90, 8', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `prod_tamanhos_${prodId}` }]] });
        return;
    }
    
    if (data.startsWith('tam_edit_')) {
        const partes = data.split('_');
        const tamId = partes[2];
        const prodId = partes[3];
        const t = db.prepare('SELECT * FROM tamanhos WHERE id=?').get(tamId);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Editar', callback_data: `tam_set_${tamId}` }],
                [{ text: t.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `tam_toggle_${tamId}_${prodId}` }],
                [{ text: '🗑 Excluir', callback_data: `tam_del_${tamId}_${prodId}` }],
                [{ text: '⬅️ Voltar', callback_data: `prod_tamanhos_${prodId}` }]
            ]
        };
        
        await editMessage(chatId, msgId, `📏 *${t.nome}*\n💰 ${formatarMoeda(t.preco)}\n🍕 ${t.fatias} fatias`, kb);
        return;
    }
    
    if (data.startsWith('tam_set_')) {
        const tamId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `tam_set_${tamId}` });
        await editMessage(chatId, msgId, 'Digite: Nome, Preço, Fatias\nEx: Grande, 49.90, 8', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `tam_edit_${tamId}_0` }]] });
        return;
    }
    
    if (data.startsWith('tam_toggle_')) {
        const partes = data.split('_');
        const t = db.prepare('SELECT * FROM tamanhos WHERE id=?').get(partes[2]);
        db.prepare('UPDATE tamanhos SET ativo=? WHERE id=?').run(t.ativo ? 0 : 1, partes[2]);
        await showAlert(chatId, msgId, t.ativo ? '❌ Desativado' : '✅ Ativado');
        await handleProdutos(chatId, userId, `prod_tamanhos_${partes[3]}`, msgId);
        return;
    }
    
    if (data.startsWith('tam_del_')) {
        const partes = data.split('_');
        db.prepare('DELETE FROM tamanhos WHERE id=?').run(partes[2]);
        await showAlert(chatId, msgId, '🗑 Excluído!');
        await handleProdutos(chatId, userId, `prod_tamanhos_${partes[3]}`, msgId);
        return;
    }
    
    if (data.startsWith('prod_toggle_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(id);
        db.prepare('UPDATE produtos SET disponivel=? WHERE id=?').run(p.disponivel ? 0 : 1, id);
        await showAlert(chatId, msgId, p.disponivel ? '❌ Indisponível' : '✅ Disponível');
        await handleProdutos(chatId, userId, `prod_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('prod_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM tamanhos WHERE produto_id=?').run(id);
        db.prepare('DELETE FROM produtos WHERE id=?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluído!');
        await handleProdutos(chatId, userId, 'adm_produtos', msgId);
        return;
    }
}

// ============ BORDAS ============
async function handleBordas(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_bordas') {
        const bordas = db.prepare('SELECT * FROM bordas').all();
        const kb = { inline_keyboard: [] };
        for (const b of bordas) {
            kb.inline_keyboard.push([
                { text: `${b.ativo?'✅':'❌'} ${b.nome} - ${formatarMoeda(b.preco)}`, callback_data: `borda_edit_${b.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Nova Borda', callback_data: 'borda_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '🧀 *BORDAS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data === 'borda_nova') {
        estadosAdmin.set(userId, { aguardando: 'borda_nova' });
        await editMessage(chatId, msgId, '🧀 Digite: Nome, Preço\nEx: Catupiry, 8.00', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_bordas' }]] });
        return;
    }
    
    if (data.startsWith('borda_edit_')) {
        const id = data.split('_')[2];
        const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Editar', callback_data: `borda_set_${id}` }],
                [{ text: b.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `borda_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `borda_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_bordas' }]
            ]
        };
        
        await editMessage(chatId, msgId, `🧀 *${b.nome}*\n💰 ${formatarMoeda(b.preco)}\n${b.ativo ? '✅ Ativa' : '❌ Inativa'}`, kb);
        return;
    }
    
    if (data.startsWith('borda_set_')) {
        const id = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `borda_set_${id}` });
        await editMessage(chatId, msgId, 'Digite: Nome, Preço\nEx: Catupiry, 8.00', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `borda_edit_${id}` }]] });
        return;
    }
    
    if (data.startsWith('borda_toggle_')) {
        const id = data.split('_')[2];
        const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id);
        db.prepare('UPDATE bordas SET ativo=? WHERE id=?').run(b.ativo ? 0 : 1, id);
        await showAlert(chatId, msgId, b.ativo ? '❌ Desativada' : '✅ Ativada');
        await handleBordas(chatId, userId, `borda_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('borda_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM bordas WHERE id=?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluída!');
        await handleBordas(chatId, userId, 'adm_bordas', msgId);
        return;
    }
}

// ============ ADICIONAIS ============
async function handleAdicionais(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_adicionais') {
        const adics = db.prepare('SELECT * FROM adicionais ORDER BY categoria, nome').all();
        const kb = { inline_keyboard: [] };
        for (const a of adics) {
            kb.inline_keyboard.push([
                { text: `${a.disponivel?'✅':'❌'} ${a.nome} - ${formatarMoeda(a.preco)}`, callback_data: `adic_edit_${a.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Adicional', callback_data: 'adic_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '➕ *ADICIONAIS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data === 'adic_novo') {
        estadosAdmin.set(userId, { aguardando: 'adic_novo' });
        await editMessage(chatId, msgId, '➕ Digite: Nome, Preço, Categoria\nEx: Bacon, 5.00, carnes', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_adicionais' }]] });
        return;
    }
    
    if (data.startsWith('adic_edit_')) {
        const id = data.split('_')[2];
        const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Editar', callback_data: `adic_set_${id}` }],
                [{ text: a.disponivel ? '❌ Indisponibilizar' : '✅ Disponibilizar', callback_data: `adic_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `adic_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_adicionais' }]
            ]
        };
        
        await editMessage(chatId, msgId, `➕ *${a.nome}*\n💰 ${formatarMoeda(a.preco)}\n📂 ${a.categoria}\n${a.disponivel ? '✅ Disponível' : '❌ Indisponível'}`, kb);
        return;
    }
    
    if (data.startsWith('adic_set_')) {
        const id = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `adic_set_${id}` });
        await editMessage(chatId, msgId, 'Digite: Nome, Preço, Categoria\nEx: Bacon, 5.00, carnes', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: `adic_edit_${id}` }]] });
        return;
    }
    
    if (data.startsWith('adic_toggle_')) {
        const id = data.split('_')[2];
        const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id);
        db.prepare('UPDATE adicionais SET disponivel=? WHERE id=?').run(a.disponivel ? 0 : 1, id);
        await showAlert(chatId, msgId, a.disponivel ? '❌ Indisponível' : '✅ Disponível');
        await handleAdicionais(chatId, userId, `adic_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('adic_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM adicionais WHERE id=?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluído!');
        await handleAdicionais(chatId, userId, 'adm_adicionais', msgId);
        return;
    }
}

// ============ PEDIDOS ============
async function handlePedidos(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_pedidos') {
        const pedidos = db.prepare(`
            SELECT p.*, c.nome as cliente_nome, c.telefone 
            FROM pedidos p JOIN clientes c ON p.cliente_id = c.id 
            ORDER BY p.data_pedido DESC LIMIT 20
        `).all();
        
        const kb = { inline_keyboard: [] };
        
        for (const p of pedidos) {
            const emoji = { 'pendente': '⏳', 'confirmado': '✅', 'preparo': '👨‍🍳', 'entrega': '🛵', 'entregue': '📦', 'cancelado': '❌' };
            kb.inline_keyboard.push([
                { text: `${emoji[p.status]} ${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '📋 *PEDIDOS*\n\nSelecione para ver detalhes:', kb);
        return;
    }
    
    if (data.startsWith('ped_ver_')) {
        const id = data.split('_')[2];
        const p = db.prepare(`
            SELECT p.*, c.nome, c.telefone, c.logradouro, c.numero, c.bairro, c.cidade, c.estado
            FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id=?
        `).get(id);
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id=?').all(id);
        
        let msg = `📦 *PEDIDO ${p.numero}*\n\n`;
        msg += `👤 ${p.nome}\n📱 ${p.telefone}\n📍 ${p.logradouro}, ${p.numero} - ${p.bairro}\n`;
        msg += `📊 Status: ${p.status}\n💳 Pagamento: ${p.pagamento_status}\n\n`;
        msg += `🍕 *ITENS:*\n`;
        
        for (const i of itens) {
            msg += `\n${i.quantidade}x ${i.produto_nome}\n📏 ${i.tamanho_nome} | 🧀 ${i.borda_nome}\n`;
            if (i.adicionais) msg += `➕ ${i.adicionais}\n`;
            msg += `💰 ${formatarMoeda(i.preco_unitario * i.quantidade)}\n`;
        }
        
        msg += `\n💰 Total: *${formatarMoeda(p.total)}*\n`;
        if (p.observacao) msg += `📝 Obs: ${p.observacao}\n`;
        
        const kb = {
            inline_keyboard: [
                [
                    { text: '👨‍🍳 Preparo', callback_data: `ped_status_preparo_${id}` },
                    { text: '🛵 Entrega', callback_data: `ped_status_entrega_${id}` }
                ],
                [
                    { text: '📦 Entregue', callback_data: `ped_status_entregue_${id}` },
                    { text: '❌ Cancelar', callback_data: `ped_status_cancelar_${id}` }
                ],
                [{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]
            ]
        };
        
        await editMessage(chatId, msgId, msg, kb);
        return;
    }
    
    if (data.startsWith('ped_status_')) {
        const partes = data.split('_');
        const status = partes[2];
        const id = partes[3];
        
        const mapa = { 'preparo': 'preparo', 'entrega': 'entrega', 'entregue': 'entregue', 'cancelar': 'cancelado' };
        db.prepare('UPDATE pedidos SET status=? WHERE id=?').run(mapa[status], id);
        
        const p = db.prepare('SELECT * FROM pedidos WHERE id=?').get(id);
        
        // Notifica cliente
        try {
            const clientBot = require('../cliente/index').getBot();
            const cliente = db.prepare('SELECT telegram_id FROM clientes WHERE id=?').get(p.cliente_id);
            if (clientBot && cliente) {
                const msgs = {
                    'preparo': '👨‍🍳 Seu pedido está sendo preparado!',
                    'entrega': '🛵 Seu pedido saiu para entrega!',
                    'entregue': '📦 Pedido entregue! Bom apetite! 🍕',
                    'cancelado': '❌ Pedido cancelado.'
                };
                await clientBot.sendMessage(cliente.telegram_id, msgs[status]);
            }
        } catch (e) {}
        
        await showAlert(chatId, msgId, `✅ Status: ${mapa[status].toUpperCase()}`);
        await handlePedidos(chatId, userId, `ped_ver_${id}`, msgId);
        return;
    }
}

// ============ CLIENTES ============
async function handleClientes(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_clientes') {
        const clientes = db.prepare(`
            SELECT c.*, (SELECT COUNT(*) FROM pedidos WHERE cliente_id=c.id) as total_pedidos
            FROM clientes c ORDER BY c.total_gasto DESC LIMIT 30
        `).all();
        
        const kb = { inline_keyboard: [] };
        
        for (const c of clientes) {
            kb.inline_keyboard.push([
                { text: `${c.bloqueado?'🚫':'✅'} ${c.nome || 'Sem nome'} - ${formatarMoeda(c.total_gasto)}`, callback_data: `cli_ver_${c.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '👥 *CLIENTES*\n\nSelecione para ver detalhes:', kb);
        return;
    }
    
    if (data.startsWith('cli_ver_')) {
        const id = data.split('_')[2];
        const c = db.prepare(`
            SELECT c.*, (SELECT COUNT(*) FROM pedidos WHERE cliente_id=c.id) as total_pedidos,
                   (SELECT AVG(nota) FROM avaliacoes WHERE cliente_id=c.id) as media_avaliacao
            FROM clientes c WHERE c.id=?
        `).get(id);
        
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id=? ORDER BY data_pedido DESC LIMIT 5').all(id);
        
        let msg = `👤 *DETALHES DO CLIENTE*\n\n`;
        msg += `🆔 ID: \`${c.telegram_id}\`\n`;
        msg += `📝 Nome: *${c.nome || 'N/A'}*\n`;
        msg += `📧 Email: ${c.email || 'N/A'}\n`;
        msg += `📱 Tel: ${c.telefone || 'N/A'}\n`;
        if (c.logradouro) msg += `📍 ${c.logradouro}, ${c.numero || 'S/N'} - ${c.bairro}\n`;
        msg += `📦 Pedidos: *${c.total_pedidos}*\n`;
        msg += `💰 Total: *${formatarMoeda(c.total_gasto)}*\n`;
        msg += `⭐ Fidelidade: ${c.fidelidade_pontos} pts\n`;
        if (c.media_avaliacao) msg += `📊 Avaliação: ${c.media_avaliacao.toFixed(1)}/5\n`;
        msg += `🚫 Status: ${c.bloqueado ? 'BLOQUEADO' : 'Ativo'}\n`;
        msg += `📅 Cadastro: ${formatarData(c.data_cadastro)}\n`;
        
        if (pedidos.length > 0) {
            msg += `\n📦 *Últimos Pedidos:*\n`;
            for (const p of pedidos) {
                msg += `   ${p.numero} - ${formatarMoeda(p.total)} - ${p.status}\n`;
            }
        }
        
        const kb = {
            inline_keyboard: [
                [{ text: c.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', callback_data: `cli_toggle_${id}` }],
                [{ text: '📄 Histórico PDF', callback_data: `cli_pdf_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]
            ]
        };
        
        await editMessage(chatId, msgId, msg, kb);
        return;
    }
    
    if (data.startsWith('cli_toggle_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id);
        db.prepare('UPDATE clientes SET bloqueado=? WHERE id=?').run(c.bloqueado ? 0 : 1, id);
        await showAlert(chatId, msgId, c.bloqueado ? '✅ Desbloqueado' : '🚫 Bloqueado');
        await handleClientes(chatId, userId, `cli_ver_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('cli_pdf_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id);
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id=? ORDER BY data_pedido DESC').all(id);
        const itens = db.prepare('SELECT i.* FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE p.cliente_id=?').all(id);
        
        const PDFService = require('../../services/pdf');
        const pdfBuffer = await PDFService.gerarHistoricoCliente(c, pedidos, itens);
        
        await adminBot.sendDocument(chatId, pdfBuffer, {}, {
            filename: `cliente_${c.nome?.replace(/\s/g,'_') || id}.pdf`,
            caption: `📄 Histórico - ${c.nome || 'Cliente'}`
        });
        return;
    }
}

// ============ CUPONS ============
async function handleCupons(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    if (data === 'adm_cupons') {
        const cupons = db.prepare('SELECT * FROM cupons ORDER BY id DESC').all();
        const kb = { inline_keyboard: [] };
        
        for (const c of cupons) {
            const tipo = c.tipo === 'percentual' ? '%' : 'R$';
            kb.inline_keyboard.push([
                { text: `${c.ativo?'✅':'❌'} ${c.codigo} - ${c.valor}${tipo}`, callback_data: `cupom_edit_${c.id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Cupom', callback_data: 'cupom_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        
        await editMessage(chatId, msgId, '🎟 *CUPONS*\n\nSelecione para editar:', kb);
        return;
    }
    
    if (data === 'cupom_novo') {
        estadosAdmin.set(userId, { aguardando: 'cupom_novo' });
        await editMessage(chatId, msgId, '🎟 Digite: Código, Tipo, Valor, Usos, Dias Validade\nEx: PIZZA10, percentual, 10, 100, 30', { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: 'adm_cupons' }]] });
        return;
    }
    
    if (data.startsWith('cupom_edit_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM cupons WHERE id=?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: c.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `cupom_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `cupom_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_cupons' }]
            ]
        };
        
        await editMessage(chatId, msgId,
            `🎟 *${c.codigo}*\n💰 ${c.valor}${c.tipo === 'percentual' ? '%' : 'R$'}\n📊 ${c.uso_atual}/${c.uso_maximo} usos\n⏰ Válido: ${formatarData(c.valido_ate)}\n${c.ativo ? '✅ Ativo' : '❌ Inativo'}`,
            kb
        );
        return;
    }
    
    if (data.startsWith('cupom_toggle_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM cupons WHERE id=?').get(id);
        db.prepare('UPDATE cupons SET ativo=? WHERE id=?').run(c.ativo ? 0 : 1, id);
        await showAlert(chatId, msgId, c.ativo ? '❌ Desativado' : '✅ Ativado');
        await handleCupons(chatId, userId, `cupom_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('cupom_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM cupons WHERE id=?').run(id);
        await showAlert(chatId, msgId, '🗑 Excluído!');
        await handleCupons(chatId, userId, 'adm_cupons', msgId);
        return;
    }
}

// ============ RELATÓRIOS ============
async function handleRelatorios(chatId, userId, data, msgId) {
    const db = getDatabase();
    
    const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    const fatMes = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved' AND strftime('%Y-%m',data_pedido)=strftime('%Y-%m','now')").get().t;
    const clientes = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
    const ticket = totalPedidos > 0 ? fat / totalPedidos : 0;
    
    const top = db.prepare(`
        SELECT produto_nome, COUNT(*) as t, SUM(preco_unitario*quantidade) as r
        FROM itens_pedido GROUP BY produto_nome ORDER BY t DESC LIMIT 5
    `).all();
    
    let msg = '📊 *RELATÓRIOS*\n\n';
    msg += `💰 Faturamento: *${formatarMoeda(fat)}*\n`;
    msg += `📅 Mês: *${formatarMoeda(fatMes)}*\n`;
    msg += `👥 Clientes: *${clientes}*\n`;
    msg += `🎯 Ticket Médio: *${formatarMoeda(ticket)}*\n\n`;
    msg += '🍕 *TOP 5:*\n';
    for (const t of top) {
        msg += `   ${t.produto_nome}: ${t.t}x - ${formatarMoeda(t.r)}\n`;
    }
    
    const kb = {
        inline_keyboard: [
            [{ text: '📄 Exportar PDF', callback_data: 'rel_pdf' }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
        ]
    };
    
    await editMessage(chatId, msgId, msg, kb);
}

// ============ CONFIG ============
async function handleConfig(chatId, userId, data, msgId) {
    const db = getDatabase();
    const configs = {};
    const todas = db.prepare('SELECT * FROM configs').all();
    for (const c of todas) configs[c.chave] = c.valor;
    
    const msg = '⚙️ *CONFIGURAÇÕES*\n\n' +
               `🚚 Taxa: ${formatarMoeda(parseFloat(configs.taxa_entrega_padrao||8))}\n` +
               `💰 Mínimo: ${formatarMoeda(parseFloat(configs.pedido_minimo||30))}\n` +
               `🕐 Horário: ${configs.horario_abertura_padrao||'18:00'} - ${configs.horario_fechamento_padrao||'23:00'}\n` +
               `⏰ PIX: ${configs.pix_expiracao||30} min`;
    
    const kb = {
        inline_keyboard: [
            [{ text: '🚚 Taxa', callback_data: 'cfg_taxa' }, { text: '💰 Mínimo', callback_data: 'cfg_min' }],
            [{ text: '🕐 Horários', callback_data: 'cfg_hora' }, { text: '⏰ Expiração PIX', callback_data: 'cfg_pix' }],
            [{ text: '📢 Broadcast', callback_data: 'cfg_broadcast' }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
        ]
    };
    
    await editMessage(chatId, msgId, msg, kb);
}

// ============ TEXT INPUT HANDLER ============
async function handleTextInput(chatId, userId, texto) {
    const db = getDatabase();
    const estado = estadosAdmin.get(userId);
    if (!estado || !estado.aguardando) return;
    
    const ag = estado.aguardando;
    const partes = texto.split(',').map(p => p.trim());
    
    // Unidade
    if (ag === 'unid_nome') { estado.nova.nome = texto; estado.aguardando = 'unid_cidade'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🏙️ Cidade:'); }
    if (ag === 'unid_cidade') { estado.nova.cidade = texto; estado.aguardando = 'unid_estado'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🗺️ Estado (sigla):'); }
    if (ag === 'unid_estado') { estado.nova.estado = texto.toUpperCase(); estado.aguardando = 'unid_rua'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🏠 Rua:'); }
    if (ag === 'unid_rua') { estado.nova.logradouro = texto; estado.aguardando = 'unid_num'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🔢 Número:'); }
    if (ag === 'unid_num') { estado.nova.numero = texto; estado.aguardando = 'unid_tel'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '📞 Telefone:'); }
    if (ag === 'unid_tel') { estado.nova.telefone = texto; estado.aguardando = 'unid_wpp'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '💬 WhatsApp:'); }
    if (ag === 'unid_wpp') { estado.nova.whatsapp = texto; estado.aguardando = 'unid_taxa'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🚚 Taxa (ex: 8.00):'); }
    if (ag === 'unid_taxa') { estado.nova.taxa_entrega = parseFloat(texto.replace(',','.')); estado.aguardando = 'unid_abertura'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🕐 Abertura (ex: 18:00):'); }
    if (ag === 'unid_abertura') { estado.nova.horario_abertura = texto; estado.aguardando = 'unid_fechamento'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🕐 Fechamento (ex: 23:00):'); }
    if (ag === 'unid_fechamento') {
        estado.nova.horario_fechamento = texto;
        const u = estado.nova;
        db.prepare(`INSERT INTO unidades (nome,cidade,estado,logradouro,numero,telefone,whatsapp,taxa_entrega,horario_abertura,horario_fechamento)
            VALUES (?,?,?,?,?,?,?,?,?,?)`).run(u.nome,u.cidade,u.estado,u.logradouro,u.numero,u.telefone,u.whatsapp,u.taxa_entrega,u.horario_abertura,u.horario_fechamento);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Unidade *${u.nome}* criada!`, { parse_mode: 'Markdown' });
    }
    
    if (ag.startsWith('unid_set_')) {
        const partesAg = ag.split('_');
        const campo = partesAg[2];
        const id = partesAg[3];
        const mapa = { 'nome': 'nome', 'tel': 'telefone', 'wpp': 'whatsapp', 'taxa': 'taxa_entrega', 'min': 'pedido_minimo' };
        
        if (campo === 'cidade') {
            const [cid, est] = texto.split(',').map(p => p.trim());
            db.prepare('UPDATE unidades SET cidade=?, estado=? WHERE id=?').run(cid, est?.toUpperCase() || 'PR', id);
        } else if (campo === 'end') {
            const [rua, num, bairro] = texto.split(',').map(p => p.trim());
            db.prepare('UPDATE unidades SET logradouro=?, numero=?, bairro=? WHERE id=?').run(rua, num, bairro || '', id);
        } else if (campo === 'hora') {
            const [abre, fecha] = texto.split(',').map(p => p.trim());
            db.prepare('UPDATE unidades SET horario_abertura=?, horario_fechamento=? WHERE id=?').run(abre, fecha, id);
        } else {
            const col = mapa[campo];
            const val = ['taxa','min'].includes(campo) ? parseFloat(texto.replace(',','.')) : texto;
            db.prepare(`UPDATE unidades SET ${col}=? WHERE id=?`).run(val, id);
        }
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, '✅ Unidade atualizada!');
    }
    
    // Categoria
    if (ag === 'cat_nova') {
        const [nome, emoji] = partes;
        db.prepare('INSERT INTO categorias (nome, emoji, ordem) VALUES (?, ?, (SELECT COALESCE(MAX(ordem),0)+1 FROM categorias))').run(nome, emoji || '🍕');
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Categoria *${nome}* criada!`, { parse_mode: 'Markdown' });
    }
    
    if (ag.startsWith('cat_nome_') || ag.startsWith('cat_emoji_')) {
        const partesAg = ag.split('_');
        const campo = partesAg[1];
        const id = partesAg[2];
        db.prepare(`UPDATE categorias SET ${campo}=? WHERE id=?`).run(texto, id);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, '✅ Categoria atualizada!');
    }
    
    // Produto novo
    if (ag === 'prod_novo') {
        const [nome, desc, ingr, preco] = partes;
        const result = db.prepare('INSERT INTO produtos (categoria_id, nome, descricao, ingredientes) VALUES (?,?,?,?)').run(estado.catId, nome, desc, ingr);
        db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?,?,?,?)').run(result.lastInsertRowid, 'Média', parseFloat(preco.replace(',','.')), 8);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Produto *${nome}* criado!`, { parse_mode: 'Markdown' });
    }
    
    if (ag.startsWith('prod_set_')) {
        const partesAg = ag.split('_');
        const campo = partesAg[2];
        const id = partesAg[3];
        const mapa = { 'nome': 'nome', 'desc': 'descricao', 'ingr': 'ingredientes', 'foto': 'foto' };
        db.prepare(`UPDATE produtos SET ${mapa[campo]}=? WHERE id=?`).run(texto, id);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, '✅ Produto atualizado!');
    }
    
    // Tamanho
    if (ag.startsWith('tam_novo_')) {
        const prodId = ag.split('_')[2];
        const [nome, preco, fatias] = partes;
        db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?,?,?,?)').run(prodId, nome, parseFloat(preco.replace(',','.')), parseInt(fatias) || 8);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Tamanho *${nome}* criado!`, { parse_mode: 'Markdown' });
    }
    
    if (ag.startsWith('tam_set_')) {
        const tamId = ag.split('_')[2];
        const [nome, preco, fatias] = partes;
        db.prepare('UPDATE tamanhos SET nome=?, preco=?, fatias=? WHERE id=?').run(nome, parseFloat(preco.replace(',','.')), parseInt(fatias) || 8, tamId);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, '✅ Tamanho atualizado!');
    }
    
    // Borda
    if (ag === 'borda_nova' || ag.startsWith('borda_set_')) {
        const id = ag.startsWith('borda_set_') ? ag.split('_')[2] : null;
        const [nome, preco] = partes;
        if (id) {
            db.prepare('UPDATE bordas SET nome=?, preco=? WHERE id=?').run(nome, parseFloat(preco.replace(',','.')), id);
        } else {
            db.prepare('INSERT INTO bordas (nome, preco) VALUES (?,?)').run(nome, parseFloat(preco.replace(',','.')));
        }
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Borda ${id ? 'atualizada' : 'criada'}!`);
    }
    
    // Adicional
    if (ag === 'adic_novo' || ag.startsWith('adic_set_')) {
        const id = ag.startsWith('adic_set_') ? ag.split('_')[2] : null;
        const [nome, preco, cat] = partes;
        if (id) {
            db.prepare('UPDATE adicionais SET nome=?, preco=?, categoria=? WHERE id=?').run(nome, parseFloat(preco.replace(',','.')), cat || 'geral', id);
        } else {
            db.prepare('INSERT INTO adicionais (nome, preco, categoria) VALUES (?,?,?)').run(nome, parseFloat(preco.replace(',','.')), cat || 'geral');
        }
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Adicional ${id ? 'atualizado' : 'criado'}!`);
    }
    
    // Cupom
    if (ag === 'cupom_novo') {
        const [codigo, tipo, valor, usos, dias] = partes;
        const validade = new Date();
        validade.setDate(validade.getDate() + parseInt(dias));
        db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?,?,?,?,?)')
            .run(codigo.toUpperCase(), tipo, parseFloat(valor), parseInt(usos), validade.toISOString());
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, `✅ Cupom *${codigo.toUpperCase()}* criado!`, { parse_mode: 'Markdown' });
    }
}

// ============ HELPERS ============
async function editMessage(chatId, msgId, text, kb) {
    try {
        await adminBot.editMessageText(text, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: kb
        });
    } catch (e) {
        // Se não conseguir editar, envia nova
        await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    }
}

async function showAlert(chatId, msgId, text) {
    try {
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text, show_alert: true });
    } catch (e) {}
}

function getAdminBot() {
    return adminBot;
}

module.exports = { startAdminBot, getAdminBot };
