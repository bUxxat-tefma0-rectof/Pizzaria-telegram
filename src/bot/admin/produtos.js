const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showProdutosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const produtos = db.prepare(`
        SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji,
               (SELECT MIN(preco) FROM tamanhos WHERE produto_id = p.id AND ativo = 1) as preco_min
        FROM produtos p 
        LEFT JOIN categorias c ON p.categoria_id = c.id 
        ORDER BY p.ordem
    `).all();
    
    let mensagem = '📦 *GERENCIAR PRODUTOS*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const prod of produtos) {
        const status = prod.disponivel ? '✅' : '❌';
        mensagem += `${status} *${prod.nome}*\n`;
        mensagem += `   📂 ${prod.categoria_emoji || '📂'} ${prod.categoria_nome || 'Sem categoria'}\n`;
        mensagem += `   💰 A partir de ${formatarMoeda(prod.preco_min || 0)}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `✏️ ${prod.nome}`, callback_data: `adm_prod_edit_${prod.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Novo Produto', callback_data: 'adm_prod_novo' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showEditarProduto(bot, chatId, prodId, messageId) {
    const db = getDatabase();
    const prod = db.prepare(`
        SELECT p.*, c.nome as categoria_nome 
        FROM produtos p 
        LEFT JOIN categorias c ON p.categoria_id = c.id 
        WHERE p.id = ?
    `).get(prodId);
    
    if (!prod) return bot.sendMessage(chatId, 'Produto não encontrado.');
    
    const tamanhos = db.prepare('SELECT * FROM tamanhos WHERE produto_id = ? AND ativo = 1').all(prodId);
    
    let mensagem = `📦 *EDITAR PRODUTO*\n\n` +
                  `Nome: *${prod.nome}*\n` +
                  `Categoria: ${prod.categoria_nome || 'N/A'}\n` +
                  `Disponível: ${prod.disponivel ? '✅ Sim' : '❌ Não'}\n` +
                  `Ordem: ${prod.ordem}\n` +
                  `Descrição: ${prod.descricao || 'N/A'}\n` +
                  `Ingredientes: ${prod.ingredientes || 'N/A'}\n`;
    
    if (tamanhos.length > 0) {
        mensagem += `\n📏 *Tamanhos:*\n`;
        for (const tam of tamanhos) {
            mensagem += `   ${tam.nome}: ${formatarMoeda(tam.preco)} (${tam.fatias} fatias)\n`;
        }
    }
    
    mensagem += `\nO que deseja alterar?`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '✏️ Alterar Nome', callback_data: `adm_prod_setnome_${prodId}` }],
            [{ text: '📂 Alterar Categoria', callback_data: `adm_prod_setcat_${prodId}` }],
            [{ text: '📝 Alterar Descrição', callback_data: `adm_prod_setdesc_${prodId}` }],
            [{ text: '🥬 Alterar Ingredientes', callback_data: `adm_prod_setingr_${prodId}` }],
            [{ text: '🖼 Alterar Foto (URL)', callback_data: `adm_prod_setfoto_${prodId}` }],
            [{ text: '🔢 Alterar Ordem', callback_data: `adm_prod_setordem_${prodId}` }],
            [{ text: prod.disponivel ? '❌ Indisponibilizar' : '✅ Disponibilizar', callback_data: `adm_prod_toggle_${prodId}` }],
            [{ text: '📏 Gerenciar Tamanhos', callback_data: `adm_tam_prod_${prodId}` }],
            [{ text: '🗑 Excluir Produto', callback_data: `adm_prod_del_${prodId}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarProdutosAdmin(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_produtos') {
        await showProdutosMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_prod_novo') {
        // Mostra categorias para escolher
        const categorias = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
        const teclado = { inline_keyboard: [] };
        
        for (const cat of categorias) {
            teclado.inline_keyboard.push([
                { text: `${cat.emoji} ${cat.nome}`, callback_data: `adm_prod_novocat_${cat.id}` }
            ]);
        }
        teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]);
        
        await bot.editMessageText('📂 Escolha a categoria do novo produto:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: teclado
        });
        return;
    }
    
    if (data.startsWith('adm_prod_novocat_')) {
        const catId = data.split('_')[3];
        estado.aguardando = `novo_produto_${catId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite os dados do produto:\n\nNome, Descrição, Ingredientes, URL da Foto, Preço Base\n\nExemplo: Calabresa, Pizza de calabresa, Calabresa e queijo, https://imgur.com/foto.jpg, 29.90');
        return;
    }
    
    if (data.startsWith('adm_prod_edit_')) {
        const prodId = data.split('_')[3];
        await showEditarProduto(bot, chatId, prodId, messageId);
        return;
    }
    
    if (data.startsWith('adm_prod_setnome_')) {
        const prodId = data.split('_')[3];
        estado.aguardando = `setnome_prod_${prodId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite o novo nome:');
        return;
    }
    
    if (data.startsWith('adm_prod_setcat_')) {
        const prodId = data.split('_')[3];
        estado.aguardando = `setcat_prod_${prodId}`;
        estados.set(userId, estado);
        
        const categorias = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
        let msg = '📂 Escolha a nova categoria:\n\n';
        categorias.forEach((cat, i) => {
            msg += `${i + 1}. ${cat.emoji} ${cat.nome}\n`;
        });
        msg += '\nDigite o número:';
        
        await bot.sendMessage(chatId, msg);
        return;
    }
    
    if (data.startsWith('adm_prod_setdesc_')) {
        const prodId = data.split('_')[3];
        estado.aguardando = `setdesc_prod_${prodId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite a nova descrição:');
        return;
    }
    
    if (data.startsWith('adm_prod_setingr_')) {
        const prodId = data.split('_')[3];
        estado.aguardando = `setingr_prod_${prodId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite os novos ingredientes:');
        return;
    }
