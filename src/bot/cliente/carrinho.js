const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showCarrinho(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return bot.sendMessage(chatId, '❌ Faça cadastro primeiro.');
    
    const itens = db.prepare(`
        SELECT c.*, p.nome as produto_nome, t.nome as tamanho_nome, t.preco as tamanho_preco,
               b.nome as borda_nome, b.preco as borda_preco
        FROM carrinhos c
        JOIN produtos p ON c.produto_id = p.id
        JOIN tamanhos t ON c.tamanho_id = t.id
        JOIN bordas b ON c.borda_id = b.id
        WHERE c.cliente_id = ?
    `).all(cliente.id);
    
    if (itens.length === 0) {
        const teclado = {
            inline_keyboard: [
                [{ text: '🍕 Ver Cardápio', callback_data: 'menu_cardapio' }],
                [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
            ]
        };
        
        return bot.editMessageText('🛒 *Seu carrinho está vazio*', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
    
    // Verifica horário
    const unidade = db.prepare('SELECT * FROM unidades WHERE id = ?').get(cliente.unidade_proxima_id);
    const horarioValido = verificarHorarioFuncionamento(unidade);
    
    let subtotal = 0;
    let mensagem = '🛒 *SEU CARRINHO*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        
        const adicionais = db.prepare(`
            SELECT a.nome, a.preco FROM carrinho_adicionais ca
            JOIN adicionais a ON ca.adicional_id = a.id
            WHERE ca.carrinho_id = ?
        `).all(item.id);
        
        let totalAdicionais = 0;
        const nomesAdicionais = adicionais.map(a => {
            totalAdicionais += a.preco;
            return a.nome;
        });
        
        const totalItem = (item.tamanho_preco + item.borda_preco + totalAdicionais) * item.quantidade;
        subtotal += totalItem;
        
        mensagem += `🍕 *${item.produto_nome}* (${item.quantidade}x)\n`;
        mensagem += `📏 ${item.tamanho_nome}\n`;
        mensagem += `🧀 ${item.borda_nome}\n`;
        
        if (nomesAdicionais.length > 0) {
            mensagem += `➕ ${nomesAdicionais.join(', ')}\n`;
        }
        
        if (item.observacao) {
            mensagem += `📝 Obs: ${item.observacao}\n`;
        }
        
        mensagem += `💰 ${formatarMoeda(totalItem)}\n\n`;
        
        // Botões de quantidade e remover
        teclado.inline_keyboard.push([
            { text: '➖', callback_data: `carr_qtd_menos_${item.id}` },
            { text: `${item.quantidade}`, callback_data: `carr_ignorar` },
            { text: '➕', callback_data: `carr_qtd_mais_${item.id}` },
            { text: '🗑', callback_data: `carr_remover_${item.id}` }
        ]);
    }
    
    const taxaEntrega = unidade?.taxa_entrega || 0;
    
    // Aplica cupom se existir
    let desconto = 0;
    let cupomAplicado = null;
    const estadoCarrinho = estadosCarrinho.get(userId) || {};
    
    if (estadoCarrinho.cupom) {
        cupomAplicado = estadoCarrinho.cupom;
        if (cupomAplicado.tipo === 'percentual') {
            desconto = subtotal * (cupomAplicado.valor / 100);
        } else {
            desconto = cupomAplicado.valor;
        }
    }
    
    const total = subtotal + taxaEntrega - desconto;
    
    mensagem += `📦 Subtotal: *${formatarMoeda(subtotal)}*\n`;
    mensagem += `🚚 Entrega: *${formatarMoeda(taxaEntrega)}*\n`;
    
    if (desconto > 0) {
        mensagem += `🎟 Desconto: *-${formatarMoeda(desconto)}*\n`;
    }
    
    mensagem += `💰 *Total: ${formatarMoeda(total)}*\n`;
    
    if (!horarioValido) {
        mensagem += `\n⚠️ *Fora do horário de funcionamento*\n🕐 ${unidade.horario_abertura} às ${unidade.horario_fechamento}`;
    }
    
    teclado.inline_keyboard.push([
        { text: '🎟 Cupom', callback_data: 'carr_cupom' },
        { text: '📝 Observação', callback_data: 'carr_obs' }
    ]);
    teclado.inline_keyboard.push([
        { text: '➕ Mais Itens', callback_data: 'menu_cardapio' },
        { text: '🗑 Limpar Tudo', callback_data: 'carr_limpar' }
    ]);
    
    if (horarioValido) {
        teclado.inline_keyboard.push([
            { text: '💳 Finalizar Pedido', callback_data: 'carr_finalizar' }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }
    ]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

// Estados do carrinho por usuário
const estadosCarrinho = new Map();

async function processarCarrinho(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return;
    
    // Quantidade menos
    if (data.startsWith('carr_qtd_menos_')) {
        const itemId = data.split('_')[3];
        const item = db.prepare('SELECT * FROM carrinhos WHERE id = ? AND cliente_id = ?').get(itemId, cliente.id);
        
        if (item && item.quantidade > 1) {
            db.prepare('UPDATE carrinhos SET quantidade = quantidade - 1 WHERE id = ?').run(itemId);
        } else {
            // Remove item e seus adicionais
            db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id = ?').run(itemId);
            db.prepare('DELETE FROM carrinhos WHERE id = ?').run(itemId);
        }
        
        await showCarrinho(bot, chatId, userId, messageId);
        return;
    }
    
    // Quantidade mais
    if (data.startsWith('carr_qtd_mais_')) {
        const itemId = data.split('_')[3];
        const item = db.prepare('SELECT * FROM carrinhos WHERE id = ? AND cliente_id = ?').get(itemId, cliente.id);
        
        if (item && item.quantidade < 10) {
            db.prepare('UPDATE carrinhos SET quantidade = quantidade + 1 WHERE id = ?').run(itemId);
        }
        
        await showCarrinho(bot, chatId, userId, messageId);
        return;
    }
    
    // Remover item
    if (data.startsWith('carr_remover_')) {
        const itemId = data.split('_')[2];
        db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id = ?').run(itemId);
        db.prepare('DELETE FROM carrinhos WHERE id = ? AND cliente_id = ?').run(itemId, cliente.id);
        
        await showCarrinho(bot, chatId, userId, messageId);
        return;
    }
    
    // Limpar tudo
    if (data === 'carr_limpar') {
        db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id IN (SELECT id FROM carrinhos WHERE cliente_id = ?)').run(cliente.id);
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${messageId}`, text: '🗑 Carrinho limpo!' });
        await showCarrinho(bot, chatId, userId, messageId);
        return;
    }
    
    // Cupom
    if (data === 'carr_cupom') {
        const estado = estadosCarrinho.get(userId) || {};
        estado.aguardandoCupom = true;
        estadosCarrinho.set(userId, estado);
        
        await bot.sendMessage(chatId, '🎟 Digite o código do cupom:');
        return;
    }
    
    // Observação
    if (data === 'carr_obs') {
        const estado = estadosCarrinho.get(userId) || {};
        estado.aguardandoObs = true;
        estadosCarrinho.set(userId, estado);
        
        await bot.sendMessage(chatId, '📝 Digite a observação para o pedido (ex: sem cebola, trocar borda, etc):');
        return;
    }
    
    // Finalizar
    if (data === 'carr_finalizar') {
        const { iniciarPagamento } = require('./pagamento');
        await iniciarPagamento(bot, chatId, userId, messageId, estadosCarrinho.get(userId));
        return;
    }
}

// Processa texto do carrinho (cupom, observação)
async function processarTextoCarrinho(bot, chatId, userId, texto, messageId) {
    const db = getDatabase();
    const estado = estadosCarrinho.get(userId) || {};
    
    if (estado.aguardandoCupom) {
        const cupom = db.prepare('SELECT * FROM cupons WHERE codigo = ? AND ativo = 1').get(texto.trim().toUpperCase());
        
        if (!cupom) {
            await bot.sendMessage(chatId, '❌ Cupom inválido ou expirado.');
        } else if (cupom.uso_atual >= cupom.uso_maximo) {
            await bot.sendMessage(chatId, '❌ Cupom esgotado.');
        } else if (cupom.valido_ate && new Date(cupom.valido_ate) < new Date()) {
            await bot.sendMessage(chatId, '❌ Cupom vencido.');
        } else {
            estado.cupom = cupom;
            await bot.sendMessage(chatId, `✅ Cupom *${cupom.codigo}* aplicado!\nDesconto: ${cupom.tipo === 'percentual' ? cupom.valor + '%' : formatarMoeda(cupom.valor)}`);
        }
        
        estado.aguardandoCupom = false;
        estadosCarrinho.set(userId, estado);
        
        // Atualiza carrinho
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        const itens = db.prepare('SELECT id FROM carrinhos WHERE cliente_id = ?').all(cliente.id);
        
        if (itens.length > 0) {
            await showCarrinho(bot, chatId, userId, messageId);
        }
        return;
    }
    
    if (estado.aguardandoObs) {
        estado.observacao = texto.trim();
        estado.aguardandoObs = false;
        estadosCarrinho.set(userId, estado);
        
        await bot.sendMessage(chatId, `✅ Observação salva: "${texto.trim()}"`);
        return;
    }
}

function verificarHorarioFuncionamento(unidade) {
    if (!unidade) return true;
    
    const agora = new Date();
    const diaSemana = agora.getDay(); // 0=Dom, 1=Seg...
    
    // Verifica se o dia funciona
    const dias = unidade.dias_funcionamento.split(',').map(Number);
    if (!dias.includes(diaSemana)) return false;
    
    // Verifica horário
    const [horaAbre, minAbre] = unidade.horario_abertura.split(':').map(Number);
    const [horaFecha, minFecha] = unidade.horario_fechamento.split(':').map(Number);
    
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const minutosAbre = horaAbre * 60 + minAbre;
    const minutosFecha = horaFecha * 60 + minFecha;
    
    return minutosAgora >= minutosAbre && minutosAgora <= minutosFecha;
}

module.exports = { showCarrinho, processarCarrinho, processarTextoCarrinho };
