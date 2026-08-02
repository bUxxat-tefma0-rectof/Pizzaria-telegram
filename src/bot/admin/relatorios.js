const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showRelatoriosMenu(bot, chatId, messageId) {
    const db = getDatabase();
    
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos').get().total;
    const totalPagos = db.prepare("SELECT COUNT(*) as total FROM pedidos WHERE pagamento_status = 'approved'").get().total;
    const faturamento = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved'").get().total;
    const faturamentoMes = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().total;
    const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes').get().total;
    const ticketMedio = totalPagos > 0 ? faturamento / totalPagos : 0;
    
    const produtosMaisVendidos = db.prepare(`
        SELECT produto_nome, COUNT(*) as total, SUM(preco_unitario) as receita
        FROM itens_pedido 
        GROUP BY produto_nome 
        ORDER BY total DESC 
        LIMIT 5
    `).all();
    
    let mensagem = '📊 *RELATÓRIOS*\n\n';
    mensagem += `📦 Total Pedidos: *${totalPedidos}*\n`;
    mensagem += `✅ Pedidos Pagos: *${totalPagos}*\n`;
    mensagem += `💰 Faturamento Total: *${formatarMoeda(faturamento)}*\n`;
    mensagem += `📅 Faturamento Mês: *${formatarMoeda(faturamentoMes)}*\n`;
    mensagem += `👥 Clientes: *${totalClientes}*\n`;
    mensagem += `🎯 Ticket Médio: *${formatarMoeda(ticketMedio)}*\n\n`;
    
    mensagem += '🍕 *MAIS VENDIDOS:*\n';
    for (const prod of produtosMaisVendidos) {
        mensagem += `   ${prod.produto_nome}: ${prod.total}x - ${formatarMoeda(prod.receita)}\n`;
    }
    
    const teclado = {
        inline_keyboard: [
            [{ text: '📄 Exportar PDF', callback_data: 'adm_exportar_pdf' }],
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

module.exports = { showRelatoriosMenu };
