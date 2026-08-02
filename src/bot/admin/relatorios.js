const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const PDFService = require('../../services/pdf');

async function showRelatoriosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos').get().total;
    const totalPagos = db.prepare("SELECT COUNT(*) as total FROM pedidos WHERE pagamento_status = 'approved'").get().total;
    const faturamento = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved'").get().total;
    const faturamentoMes = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().total;
    const faturamentoHoje = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now')").get().total;
    const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes').get().total;
    const ticketMedio = totalPagos > 0 ? faturamento / totalPagos : 0;
    const mediaAvaliacoes = db.prepare('SELECT AVG(nota) as media FROM avaliacoes').get().media || 0;
    
    const produtosMaisVendidos = db.prepare(`
        SELECT produto_nome, COUNT(*) as total, SUM(preco_unitario * quantidade) as receita
        FROM itens_pedido 
        GROUP BY produto_nome 
        ORDER BY total DESC 
        LIMIT 10
    `).all();
    
    const statusCount = db.prepare(`
        SELECT status, COUNT(*) as total FROM pedidos GROUP BY status
    `).all();
    
    let mensagem = '📊 *RELATÓRIOS*\n\n';
    mensagem += `📦 Total Pedidos: *${totalPedidos}*\n`;
    mensagem += `✅ Pedidos Pagos: *${totalPagos}*\n`;
    mensagem += `💰 Faturamento Total: *${formatarMoeda(faturamento)}*\n`;
    mensagem += `📅 Faturamento Mês: *${formatarMoeda(faturamentoMes)}*\n`;
    mensagem += `🕐 Faturamento Hoje: *${formatarMoeda(faturamentoHoje)}*\n`;
    mensagem += `👥 Clientes: *${totalClientes}*\n`;
    mensagem += `🎯 Ticket Médio: *${formatarMoeda(ticketMedio)}*\n`;
    mensagem += `⭐ Média Avaliações: *${mediaAvaliacoes.toFixed(1)}*\n\n`;
    
    mensagem += '📊 *Status Pedidos:*\n';
    for (const s of statusCount) {
        mensagem += `   ${s.status}: ${s.total}\n`;
    }
    
    mensagem += '\n🍕 *TOP 5 MAIS VENDIDOS:*\n';
    for (const prod of produtosMaisVendidos.slice(0, 5)) {
        mensagem += `   ${prod.produto_nome}: ${prod.total}x - ${formatarMoeda(prod.receita)}\n`;
    }
    
    const teclado = {
        inline_keyboard: [
            [{ text: '📄 Exportar Relatório PDF', callback_data: 'adm_rel_pdf' }],
            [{ text: '📅 Relatório Mensal', callback_data: 'adm_rel_mensal' }],
            [{ text: '🕐 Relatório Hoje', callback_data: 'adm_rel_hoje' }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarRelatoriosAdmin(bot, chatId, userId, data, messageId) {
    const db = getDatabase();
    
    if (data === 'adm_relatorios') {
        await showRelatoriosMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_rel_pdf') {
        await bot.sendMessage(chatId, '📄 Gerando relatório completo...');
        
        const pedidos = db.prepare("SELECT * FROM pedidos WHERE pagamento_status = 'approved' ORDER BY data_pedido DESC").all();
        const itens = db.prepare(`
            SELECT i.* FROM itens_pedido i
            JOIN pedidos p ON i.pedido_id = p.id
            WHERE p.pagamento_status = 'approved'
        `).all();
        
        const pdfBuffer = await PDFService.gerarRelatorioAdmin(pedidos, itens);
        
        await bot.sendDocument(chatId, pdfBuffer, {
            filename: `relatorio_${new Date().toISOString().slice(0, 10)}.pdf`,
            caption: '📊 Relatório de pedidos pagos'
        });
        return;
    }
    
    if (data === 'adm_rel_mensal') {
        const pedidos = db.prepare(`
            SELECT * FROM pedidos 
            WHERE pagamento_status = 'approved' 
            AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')
            ORDER BY data_pedido DESC
        `).all();
        
        const total = pedidos.reduce((sum, p) => sum + p.total, 0);
        
        let mensagem = `📅 *RELATÓRIO MENSAL*\n\n`;
        mensagem += `📦 Pedidos: *${pedidos.length}*\n`;
        mensagem += `💰 Total: *${formatarMoeda(total)}*\n`;
        
        await bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
        return;
    }
    
    if (data === 'adm_rel_hoje') {
        const pedidos = db.prepare(`
            SELECT * FROM pedidos 
            WHERE date(data_pedido) = date('now')
            ORDER BY data_pedido DESC
        `).all();
        
        const pagos = pedidos.filter(p => p.pagamento_status === 'approved');
        const total = pagos.reduce((sum, p) => sum + p.total, 0);
        
        let mensagem = `🕐 *RELATÓRIO DE HOJE*\n\n`;
        mensagem += `📦 Total Pedidos: *${pedidos.length}*\n`;
        mensagem += `✅ Pagos: *${pagos.length}*\n`;
        mensagem += `⏳ Pendentes: *${pedidos.length - pagos.length}*\n`;
        mensagem += `💰 Faturamento: *${formatarMoeda(total)}*\n`;
        
        await bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
        return;
    }
}

module.exports = { showRelatoriosMenu, processarRelatoriosAdmin };
