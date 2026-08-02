const { getDatabase } = require('../../database/connection');
const { formatarMoeda, gerarNumeroPedido } = require('../../utils/helpers');
const pagamentoService = require('../../services/pagamento');
const QRCode = require('qrcode');

async function iniciarPagamento(bot, chatId, userId, messageId, estadoCarrinho = {}) {
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
        return bot.sendMessage(chatId, '🛒 Carrinho vazio!');
    }
    
    let subtotal = 0;
    const itensDescricao = [];
    
    for (const item of itens) {
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
        
        itensDescricao.push(`${item.quantidade}x ${item.produto_nome} (${item.tamanho_nome})`);
    }
    
    const unidade = db.prepare('SELECT * FROM unidades WHERE id = ?').get(cliente.unidade_proxima_id);
    const taxaEntrega = unidade?.taxa_entrega || 0;
    
    let desconto = 0;
    let cupomCodigo = null;
    
    if (estadoCarrinho && estadoCarrinho.cupom) {
        cupomCodigo = estadoCarrinho.cupom.codigo;
        if (estadoCarrinho.cupom.tipo === 'percentual') {
            desconto = subtotal * (estadoCarrinho.cupom.valor / 100);
        } else {
            desconto = estadoCarrinho.cupom.valor;
        }
    }
    
    const total = subtotal + taxaEntrega - desconto;
    const numeroPedido = gerarNumeroPedido();
    const descricao = itensDescricao.join(', ');
    const observacao = estadoCarrinho?.observacao || '';
    
    const resultado = await pagamentoService.gerarPix(total, descricao, numeroPedido);
    
    if (!resultado.sucesso) {
        return bot.sendMessage(chatId, '❌ Erro ao gerar pagamento. Tente novamente.');
    }
    
    const pedido = db.prepare(`INSERT INTO pedidos 
        (numero, cliente_id, unidade_id, status, subtotal, taxa_entrega, desconto, total, cupom, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status, observacao)
        VALUES (?, ?, ?, 'pendente', ?, ?, ?, ?, ?, 'pix', ?, ?, 'pendente', ?)`)
        .run(numeroPedido, cliente.id, cliente.unidade_proxima_id, subtotal, taxaEntrega, desconto, total, cupomCodigo, resultado.payment_id, resultado.qr_code, observacao);
    
    for (const item of itens) {
        const adicionais = db.prepare(`
            SELECT a.nome FROM carrinho_adicionais ca
            JOIN adicionais a ON ca.adicional_id = a.id
            WHERE ca.carrinho_id = ?
        `).all(item.id);
        
        const nomesAdicionais = adicionais.map(a => a.nome).join(', ');
        
        let totalAdicionaisValor = 0;
        const adicionaisValor = db.prepare(`
            SELECT COALESCE(SUM(a.preco), 0) as total FROM carrinho_adicionais ca
            JOIN adicionais a ON ca.adicional_id = a.id
            WHERE ca.carrinho_id = ?
        `).get(item.id);
        totalAdicionaisValor = adicionaisValor?.total || 0;
        
        const precoUnitario = item.tamanho_preco + item.borda_preco + totalAdicionaisValor;
        
        db.prepare(`INSERT INTO itens_pedido (pedido_id, produto_nome, tamanho_nome, borda_nome, adicionais, quantidade, preco_unitario)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(pedido.lastInsertRowid, item.produto_nome, item.tamanho_nome, item.borda_nome, nomesAdicionais, item.quantidade, precoUnitario);
    }
    
    if (cupomCodigo) {
        db.prepare('UPDATE cupons SET uso_atual = uso_atual + 1 WHERE codigo = ?').run(cupomCodigo);
    }
    
    // Gera QR Code
    let qrImageBuffer;
    try {
        qrImageBuffer = await QRCode.toBuffer(resultado.copia_cola || resultado.qr_code || ' ');
    } catch (e) {
        qrImageBuffer = Buffer.from([1,2,3]);
    }
    
    let mensagem = `💳 *PAGAMENTO PIX*\n\n` +
                  `📦 Pedido: *${numeroPedido}*\n` +
                  `💰 Valor: *${formatarMoeda(total)}*\n\n`;
    
    if (observacao) {
        mensagem += `📝 Obs: ${observacao}\n\n`;
    }
    
    mensagem += `📋 *PIX Copia e Cola:*\n` +
               `\`${resultado.copia_cola || 'Gerando...'}\`\n\n` +
               `⏰ Expira em 30 minutos\n\n` +
               `_Após pagar, aguarde a confirmação._`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '🔄 Verificar Pagamento', callback_data: `pag_verificar_${pedido.lastInsertRowid}` }],
            [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
        ]
    };
    
    try {
        await bot.sendPhoto(chatId, qrImageBuffer, {
            caption: mensagem,
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    } catch (e) {
        await bot.sendMessage(chatId, mensagem, {
            parse_mode: 'Markdown',
            reply_markup: teclado
        });
    }
    
    // Limpa carrinho
    db.prepare('DELETE FROM carrinho_adicionais WHERE carrinho_id IN (SELECT id FROM carrinhos WHERE cliente_id = ?)').run(cliente.id);
    db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
    
    // Limpa estado
    try {
        const { estadosCarrinho } = require('./carrinho');
        if (estadosCarrinho) estadosCarrinho.delete(userId);
    } catch (e) {}
    
    // Verificação automática
    verificarPagamentoPeriodicamente(bot, chatId, pedido.lastInsertRowid, resultado.payment_id, 0);
}

async function verificarPagamentoPeriodicamente(bot, chatId, pedidoId, paymentId, tentativas) {
    if (tentativas >= 30) return;
    
    setTimeout(async () => {
        const resultado = await pagamentoService.verificarPagamento(paymentId);
        
        if (resultado.aprovado) {
            const db = getDatabase();
            db.prepare('UPDATE pedidos SET status = ?, pagamento_status = ? WHERE id = ?')
                .run('confirmado', 'approved', pedidoId);
            
            const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
            
            await bot.sendMessage(chatId, 
                `✅ *PAGAMENTO APROVADO!*\n\n` +
                `📦 Pedido: *${pedido.numero}*\n` +
                `💰 Valor: ${formatarMoeda(pedido.total)}\n` +
                `📊 Status: Em preparo 🍕\n\n` +
                `_Seu pedido está sendo preparado!_\n\n` +
                `⭐ Após receber, avalie!`,
                { parse_mode: 'Markdown' }
            );
            
            try {
                const adminBot = require('../admin/index').getAdminBot();
                if (adminBot) {
                    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
                    for (const adminId of adminIds) {
                        await adminBot.sendMessage(adminId,
                            `🔔 *NOVO PEDIDO PAGO!*\n\n📦 ${pedido.numero}\n💰 ${formatarMoeda(pedido.total)}`,
                            { parse_mode: 'Markdown' }
                        );
                    }
                }
            } catch (e) {}
            
            setTimeout(async () => {
                await solicitarAvaliacao(bot, chatId, pedidoId);
            }, 30 * 60 * 1000);
            
        } else {
            verificarPagamentoPeriodicamente(bot, chatId, pedidoId, paymentId, tentativas + 1);
        }
    }, 10000);
}

async function solicitarAvaliacao(bot, chatId, pedidoId) {
    const teclado = {
        inline_keyboard: [
            [
                { text: '⭐', callback_data: `aval_${pedidoId}_1` },
                { text: '⭐⭐', callback_data: `aval_${pedidoId}_2` },
                { text: '⭐⭐⭐', callback_data: `aval_${pedidoId}_3` },
                { text: '⭐⭐⭐⭐', callback_data: `aval_${pedidoId}_4` },
                { text: '⭐⭐⭐⭐⭐', callback_data: `aval_${pedidoId}_5` }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, '🍕 *Como foi sua experiência?*\n\nDeixe sua avaliação:', {
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarPagamento(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    
    if (data.startsWith('pag_verificar_')) {
        const pedidoId = data.split('_')[2];
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        
        if (pedido && pedido.pagamento_status === 'approved') {
            return bot.sendMessage(chatId, '✅ Pagamento já aprovado! Seu pedido está sendo preparado.');
        }
        
        const resultado = await pagamentoService.verificarPagamento(pedido.pagamento_id);
        
        if (resultado.aprovado) {
            db.prepare('UPDATE pedidos SET status = ?, pagamento_status = ? WHERE id = ?')
                .run('confirmado', 'approved', pedidoId);
            
            await bot.sendMessage(chatId, '✅ Pagamento aprovado! Seu pedido está sendo preparado 🍕');
        } else {
            await bot.sendMessage(chatId, '⏳ Pagamento ainda não confirmado. Aguarde...');
        }
    }
    
    if (data.startsWith('aval_')) {
        const partes = data.split('_');
        const pedidoId = partes[1];
        const nota = parseInt(partes[2]);
        
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        db.prepare('INSERT INTO avaliacoes (pedido_id, cliente_id, nota) VALUES (?, ?, ?)')
            .run(pedidoId, cliente.id, nota);
        
        const pontos = nota * 10;
        db.prepare('UPDATE clientes SET fidelidade_pontos = fidelidade_pontos + ? WHERE id = ?')
            .run(pontos, cliente.id);
        
        await bot.sendMessage(chatId, `⭐ Obrigado pela avaliação! Você ganhou *${pontos} pontos* de fidelidade!`);
    }
}

module.exports = { iniciarPagamento, processarPagamento };
