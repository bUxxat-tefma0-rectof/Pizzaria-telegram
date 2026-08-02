const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda } = require('../../utils/helpers');

let adminBot = null;
const estadosAdmin = new Map();

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        const userId = msg.from.id;
        if (!adminIds.includes(userId)) {
            return adminBot.sendMessage(msg.chat.id, '⛔ Acesso negado.');
        }
        showDashboard(msg.chat.id);
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
    
    logger.info('🤖 Bot Admin profissional configurado');
}

// ============ DASHBOARD ============
async function showDashboard(chatId) {
    const db = getDatabase();
    const clientes = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
    const pedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    const hoje = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE date(data_pedido)=date('now')").get().t;
    
    const msg = `🏠 *PAINEL ADMINISTRATIVO*\n\n` +
               `👥 Clientes: *${clientes}*\n` +
               `📦 Pedidos: *${pedidos}*\n` +
               `💰 Faturamento: *${formatarMoeda(fat)}*\n` +
               `🕐 Hoje: *${hoje}*\n\n` +
               `Selecione:`;
    
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
    if (data === 'adm_voltar') return showDashboard(chatId);
    
    if (data.startsWith('adm_unidades')) return handleUnidades(chatId, userId, data, msgId);
    if (data.startsWith('adm_categorias') || data.startsWith('cat_')) return handleCategorias(chatId, userId, data, msgId);
    if (data.startsWith('adm_produtos') || data.startsWith('prod_')) return handleProdutos(chatId, userId, data, msgId);
    if (data.startsWith('adm_bordas') || data.startsWith('borda_')) return handleBordas(chatId, userId, data, msgId);
    if (data.startsWith('adm_adicionais') || data.startsWith('adic_')) return handleAdicionais(chatId, userId, data, msgId);
    if (data.startsWith('adm_pedidos') || data.startsWith('ped_')) return handlePedidos(chatId, userId, data, msgId);
    if (data.startsWith('adm_clientes') || data.startsWith('cli_')) return handleClientes(chatId, userId, data, msgId);
    if (data.startsWith('adm_cupons') || data.startsWith('cupom_')) return handleCupons(chatId, userId, data, msgId);
    if (data.startsWith('adm_relatorios')) return handleRelatorios(chatId, data, msgId);
    if (data.startsWith('adm_config')) return handleConfig(chatId, userId, data, msgId);
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
        
        await adminBot.editMessageText('📍 *UNIDADES*\n\nSelecione para editar ou adicione nova:', {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data === 'unid_nova') {
        estadosAdmin.set(userId, { aguardando: 'unid_nome', nova: {} });
        await adminBot.sendMessage(chatId, '📍 *NOVA UNIDADE*\n\nDigite o *nome*:', { parse_mode: 'Markdown' });
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
                [{ text: '📞 Telefone', callback_data: `unid_campo_tel_${id}` }],
                [{ text: '💬 WhatsApp', callback_data: `unid_campo_wpp_${id}` }],
                [{ text: '🚚 Taxa Entrega', callback_data: `unid_campo_taxa_${id}` }],
                [{ text: '💰 Pedido Mínimo', callback_data: `unid_campo_min_${id}` }],
                [{ text: '🕐 Horários', callback_data: `unid_campo_hora_${id}` }],
                [{ text: u.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `unid_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `unid_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_unidades' }]
            ]
        };
        
        await adminBot.editMessageText(
            `📍 *${u.nome}*\n🏙️ ${u.cidade}/${u.estado}\n🏠 ${u.logradouro}, ${u.numero}\n📞 ${u.telefone || 'N/A'}\n🚚 Taxa: ${formatarMoeda(u.taxa_entrega)}\n🕐 ${u.horario_abertura}-${u.horario_fechamento}\n\nSelecione o campo para editar:`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb }
        );
        return;
    }
    
    if (data.startsWith('unid_campo_')) {
        const partes = data.split('_');
        const campo = partes[2];
        const id = partes[3];
        
        const msgs = {
            'nome': 'Digite o novo nome:',
            'cidade': 'Digite: Cidade, Estado\nEx: Paranavaí, PR',
            'end': 'Digite: Rua, Número, Bairro\nEx: Rua Principal, 100, Centro',
            'tel': 'Digite o telefone:',
            'wpp': 'Digite o WhatsApp:',
            'taxa': 'Digite a taxa de entrega (ex: 8.00):',
            'min': 'Digite o pedido mínimo (ex: 30.00):',
            'hora': 'Digite os horários:\nEx: 18:00, 23:00'
        };
        
        estadosAdmin.set(userId, { aguardando: `unid_set_${campo}_${id}` });
        await adminBot.sendMessage(chatId, msgs[campo]);
        return;
    }
    
    if (data.startsWith('unid_toggle_')) {
        const id = data.split('_')[2];
        const u = db.prepare('SELECT * FROM unidades WHERE id = ?').get(id);
        db.prepare('UPDATE unidades SET ativo = ? WHERE id = ?').run(u.ativo ? 0 : 1, id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: u.ativo ? '❌ Desativada' : '✅ Ativada', show_alert: true });
        await handleUnidades(chatId, userId, `unid_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('unid_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM unidades WHERE id = ?').run(id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluída!', show_alert: true });
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
        
        await adminBot.editMessageText('📂 *CATEGORIAS*\n\nSelecione para editar:', {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data === 'cat_nova') {
        estadosAdmin.set(userId, { aguardando: 'cat_nova' });
        await adminBot.sendMessage(chatId, '📂 Digite: Nome, Emoji\nEx: Pizzas Doces, 🍫');
        return;
    }
    
    if (data.startsWith('cat_edit_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
        
        const kb = {
            inline_keyboard: [
                [{ text: '✏️ Nome', callback_data: `cat_setnome_${id}` }],
                [{ text: '😀 Emoji', callback_data: `cat_setemoji_${id}` }],
                [{ text: c.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `cat_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `cat_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_categorias' }]
            ]
        };
        
        await adminBot.editMessageText(`${c.emoji} *${c.nome}*\n\nSelecione para editar:`, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data.startsWith('cat_set')) {
        const partes = data.split('_');
        const campo = partes[1].replace('set', '').toLowerCase();
        const id = partes[2];
        
        const msgs = { 'nome': 'Digite o novo nome:', 'emoji': 'Envie o novo emoji:' };
        estadosAdmin.set(userId, { aguardando: `cat_${campo}_${id}` });
        await adminBot.sendMessage(chatId, msgs[campo]);
        return;
    }
    
    if (data.startsWith('cat_toggle_')) {
        const id = data.split('_')[2];
        const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
        db.prepare('UPDATE categorias SET ativo = ? WHERE id = ?').run(c.ativo ? 0 : 1, id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: c.ativo ? '❌ Desativada' : '✅ Ativada', show_alert: true });
        await handleCategorias(chatId, userId, `cat_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('cat_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluída!', show_alert: true });
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
        
        await adminBot.editMessageText('🍕 *PRODUTOS*\n\nSelecione para editar:', {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data === 'prod_novo') {
        const cats = db.prepare('SELECT * FROM categorias WHERE ativo=1').all();
        const kb = { inline_keyboard: [] };
        for (const c of cats) {
            kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `prod_novocat_${c.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]);
        await adminBot.editMessageText('📂 Escolha a categoria:', {
            chat_id: chatId, message_id: msgId, reply_markup: kb
        });
        return;
    }
    
    if (data.startsWith('prod_novocat_')) {
        const catId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: 'prod_novo', catId });
        await adminBot.sendMessage(chatId, '🍕 Digite:\nNome, Descrição, Ingredientes, Preço Base\n\nEx: Calabresa, Pizza de calabresa, Calabresa e queijo, 29.90');
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
                [{ text: '✏️ Nome', callback_data: `prod_campo_nome_${id}` }],
                [{ text: '📝 Descrição', callback_data: `prod_campo_desc_${id}` }],
                [{ text: '🥬 Ingredientes', callback_data: `prod_campo_ingr_${id}` }],
                [{ text: '🖼 Foto (URL)', callback_data: `prod_campo_foto_${id}` }],
                [{ text: '📏 Gerenciar Tamanhos', callback_data: `prod_tamanhos_${id}` }],
                [{ text: p.disponivel ? '❌ Indisponibilizar' : '✅ Disponibilizar', callback_data: `prod_toggle_${id}` }],
                [{ text: '🗑 Excluir', callback_data: `prod_del_${id}` }],
                [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
            ]
        };
        
        await adminBot.editMessageText(
            `${p.ce || '🍕'} *${p.nome}*\n📂 ${p.cn}\n📝 ${p.descricao || 'N/A'}\n🥬 ${p.ingredientes || 'N/A'}\n\n📏 *Tamanhos:*\n${tamStr || 'Nenhum'}\n\nSelecione para editar:`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb }
        );
        return;
    }
    
    if (data.startsWith('prod_campo_')) {
        const partes = data.split('_');
        const campo = partes[2];
        const id = partes[3];
        
        const msgs = {
            'nome': 'Digite o novo nome:',
            'desc': 'Digite a nova descrição:',
            'ingr': 'Digite os novos ingredientes:',
            'foto': 'Envie a URL da nova foto:'
        };
        
        estadosAdmin.set(userId, { aguardando: `prod_set_${campo}_${id}` });
        await adminBot.sendMessage(chatId, msgs[campo]);
        return;
    }
    
    if (data.startsWith('prod_tamanhos_')) {
        const id = data.split('_')[2];
        const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id=?').all(id);
        const kb = { inline_keyboard: [] };
        
        for (const t of tamanhos) {
            kb.inline_keyboard.push([
                { text: `📏 ${t.nome} - ${formatarMoeda(t.preco)}`, callback_data: `tam_edit_${t.id}_${id}` }
            ]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Tamanho', callback_data: `tam_novo_${id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `prod_edit_${id}` }]);
        
        await adminBot.editMessageText('📏 *TAMANHOS*\n\nSelecione para editar:', {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data.startsWith('tam_novo_')) {
        const prodId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `tam_novo_${prodId}` });
        await adminBot.sendMessage(chatId, '📏 Digite: Nome, Preço, Fatias\nEx: Grande, 49.90, 8');
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
        
        await adminBot.editMessageText(`📏 *${t.nome}*\n💰 ${formatarMoeda(t.preco)}\n🍕 ${t.fatias} fatias`, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb
        });
        return;
    }
    
    if (data.startsWith('tam_set_')) {
        const tamId = data.split('_')[2];
        estadosAdmin.set(userId, { aguardando: `tam_set_${tamId}` });
        await adminBot.sendMessage(chatId, 'Digite: Nome, Preço, Fatias\nEx: Grande, 49.90, 8');
        return;
    }
    
    if (data.startsWith('tam_toggle_')) {
        const partes = data.split('_');
        const t = db.prepare('SELECT * FROM tamanhos WHERE id=?').get(partes[2]);
        db.prepare('UPDATE tamanhos SET ativo=? WHERE id=?').run(t.ativo ? 0 : 1, partes[2]);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: t.ativo ? '❌ Desativado' : '✅ Ativado', show_alert: true });
        await handleProdutos(chatId, userId, `prod_tamanhos_${partes[3]}`, msgId);
        return;
    }
    
    if (data.startsWith('tam_del_')) {
        const partes = data.split('_');
        db.prepare('DELETE FROM tamanhos WHERE id=?').run(partes[2]);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluído!', show_alert: true });
        await handleProdutos(chatId, userId, `prod_tamanhos_${partes[3]}`, msgId);
        return;
    }
    
    if (data.startsWith('prod_toggle_')) {
        const id = data.split('_')[2];
        const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(id);
        db.prepare('UPDATE produtos SET disponivel=? WHERE id=?').run(p.disponivel ? 0 : 1, id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: p.disponivel ? '❌ Indisponível' : '✅ Disponível', show_alert: true });
        await handleProdutos(chatId, userId, `prod_edit_${id}`, msgId);
        return;
    }
    
    if (data.startsWith('prod_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM tamanhos WHERE produto_id=?').run(id);
        db.prepare('DELETE FROM produtos WHERE id=?').run(id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluído!', show_alert: true });
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
        
        await adminBot.editMessageText('🧀 *BORDAS*', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        return;
    }
    
    if (data === 'borda_nova') {
        estadosAdmin.set(userId, { aguardando: 'borda_nova' });
        await adminBot.sendMessage(chatId, '🧀 Digite: Nome, Preço\nEx: Catupiry, 8.00');
        return;
    }
    
    if (data.startsWith('borda_edit_')) {
        const id = data.split('_')[2];
        const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id);
        estadosAdmin.set(userId, { aguardando: `borda_set_${id}` });
        await adminBot.sendMessage(chatId, `🧀 Editando: *${b.nome}* - ${formatarMoeda(b.preco)}\n\nDigite: Nome, Preço`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (data.startsWith('borda_toggle_')) {
        const id = data.split('_')[2];
        const b = db.prepare('SELECT * FROM bordas WHERE id=?').get(id);
        db.prepare('UPDATE bordas SET ativo=? WHERE id=?').run(b.ativo ? 0 : 1, id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: b.ativo ? '❌ Desativada' : '✅ Ativada', show_alert: true });
        await handleBordas(chatId, userId, 'adm_bordas', msgId);
        return;
    }
    
    if (data.startsWith('borda_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM bordas WHERE id=?').run(id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluída!', show_alert: true });
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
        
        await adminBot.editMessageText('➕ *ADICIONAIS*', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        return;
    }
    
    if (data === 'adic_novo') {
        estadosAdmin.set(userId, { aguardando: 'adic_novo' });
        await adminBot.sendMessage(chatId, '➕ Digite: Nome, Preço, Categoria\nEx: Bacon, 5.00, carnes');
        return;
    }
    
    if (data.startsWith('adic_edit_')) {
        const id = data.split('_')[2];
        const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id);
        estadosAdmin.set(userId, { aguardando: `adic_set_${id}` });
        await adminBot.sendMessage(chatId, `➕ Editando: *${a.nome}* - ${formatarMoeda(a.preco)}\n\nDigite: Nome, Preço, Categoria`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (data.startsWith('adic_toggle_')) {
        const id = data.split('_')[2];
        const a = db.prepare('SELECT * FROM adicionais WHERE id=?').get(id);
        db.prepare('UPDATE adicionais SET disponivel=? WHERE id=?').run(a.disponivel ? 0 : 1, id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: a.disponivel ? '❌ Indisponível' : '✅ Disponível', show_alert: true });
        await handleAdicionais(chatId, userId, 'adm_adicionais', msgId);
        return;
    }
    
    if (data.startsWith('adic_del_')) {
        const id = data.split('_')[2];
        db.prepare('DELETE FROM adicionais WHERE id=?').run(id);
        await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '🗑 Excluído!', show_alert: true });
        await handleAdicionais(chatId, userId, 'adm_adicionais', msgId);
        return;
    }
}

// ============ TEXT INPUT HANDLER ============
async function handleTextInput(chatId, userId, texto) {
    const db = getDatabase();
    const estado = estadosAdmin.get(userId);
    if (!estado || !estado.aguardando) return;
    
    const ag = estado.aguardando;
    const partes = texto.split(',').map(p => p.trim());
    
    // Unidade
    if (ag.startsWith('unid_')) {
        if (ag === 'unid_nome') { estado.nova.nome = texto; estado.aguardando = 'unid_cidade'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🏙️ Cidade:'); }
        if (ag === 'unid_cidade') { estado.nova.cidade = texto; estado.aguardando = 'unid_estado'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🗺️ Estado (sigla):'); }
        if (ag === 'unid_estado') { estado.nova.estado = texto.toUpperCase(); estado.aguardando = 'unid_rua'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🏠 Rua:'); }
        if (ag === 'unid_rua') { estado.nova.logradouro = texto; estado.aguardando = 'unid_num'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🔢 Número:'); }
        if (ag === 'unid_num') { estado.nova.numero = texto; estado.aguardando = 'unid_tel'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '📞 Telefone:'); }
        if (ag === 'unid_tel') { estado.nova.telefone = texto; estado.aguardando = 'unid_wpp'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '💬 WhatsApp:'); }
        if (ag === 'unid_wpp') { estado.nova.whatsapp = texto; estado.aguardando = 'unid_taxa'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🚚 Taxa entrega (ex: 8.00):'); }
        if (ag === 'unid_taxa') { estado.nova.taxa_entrega = parseFloat(texto.replace(',','.')); estado.aguardando = 'unid_abertura'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🕐 Horário abertura (ex: 18:00):'); }
        if (ag === 'unid_abertura') { estado.nova.horario_abertura = texto; estado.aguardando = 'unid_fechamento'; estadosAdmin.set(userId, estado); return adminBot.sendMessage(chatId, '🕐 Horário fechamento (ex: 23:00):'); }
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
            const mapa = { 'nome': 'nome', 'cidade': null, 'end': null, 'tel': 'telefone', 'wpp': 'whatsapp', 'taxa': 'taxa_entrega', 'min': 'pedido_minimo', 'hora': null };
            
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
    
    // Produto campo
    if (ag.startsWith('prod_set_')) {
        const partesAg = ag.split('_');
        const campo = partesAg[2];
        const id = partesAg[3];
        const mapa = { 'nome': 'nome', 'desc': 'descricao', 'ingr': 'ingredientes', 'foto': 'foto' };
        db.prepare(`UPDATE produtos SET ${mapa[campo]}=? WHERE id=?`).run(texto, id);
        estado.aguardando = null; estadosAdmin.set(userId, estado);
        return adminBot.sendMessage(chatId, '✅ Produto atualizado!');
    }
    
    // Tamanho novo
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
}

// ============ STUBS ============
async function handlePedidos(chatId, userId, data, msgId) {
    await adminBot.editMessageText('📋 Pedidos em desenvolvimento', { chat_id: chatId, message_id: msgId });
}
async function handleClientes(chatId, userId, data, msgId) {
    await adminBot.editMessageText('👥 Clientes em desenvolvimento', { chat_id: chatId, message_id: msgId });
}
async function handleCupons(chatId, userId, data, msgId) {
    await adminBot.editMessageText('🎟 Cupons em desenvolvimento', { chat_id: chatId, message_id: msgId });
}
async function handleRelatorios(chatId, data, msgId) {
    await adminBot.editMessageText('📊 Relatórios em desenvolvimento', { chat_id: chatId, message_id: msgId });
}
async function handleConfig(chatId, userId, data, msgId) {
    await adminBot.editMessageText('⚙️ Configurações em desenvolvimento', { chat_id: chatId, message_id: msgId });
}

function getAdminBot() {
    return adminBot;
}

module.exports = { startAdminBot, getAdminBot };
