const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarTelefone } = require('../../utils/helpers');

async function showClientesMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const clientes = db.prepare(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) as total_pedidos
        FROM clientes c 
        ORDER BY c.total_gasto DESC 
        LIMIT 30
    `).all();
    
    let mensagem = '👥 *CLIENTES*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const cliente of clientes) {
        const bloqueado = cliente.bloqueado ? '🚫' : '✅';
        mensagem += `${bloqueado} *${cliente.nome || 'Sem nome'}*\n`;
        mensagem += `   📱 ${cliente.telefone ? formatarTelefone(cliente.telefone) : 'N/A'}\n`;
        mensagem += `   📦 ${cliente.total_pedidos} pedidos\n`;
        mensagem += `   💰 ${formatarMoeda(cliente.total_gasto)}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `👤 ${cliente.nome || cliente.telegram_id}`, callback_data: `adm_cli_ver_${cliente.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([
        { text: '🔍 Buscar Cliente', callback_data: 'adm_cli_buscar' }
    ]);
    teclado.inline_keyboard.push([
        { text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }
    ]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showDetalheCliente(bot, chatId, clienteId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
    
    if (!cliente) return bot.sendMessage(chatId, 'Cliente não encontrado.');
    
    const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 10').all(clienteId);
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ?').get(clienteId).total;
    const unidade = db.prepare('SELECT nome FROM unidades WHERE id = ?').get(cliente.unidade_proxima_id);
    
    let mensagem = `👤 *DETALHES DO CLIENTE*\n\n`;
    mensagem += `🆔 ID: \`${cliente.telegram_id}\`\n`;
    mensagem += `📝 Nome: *${cliente.nome || 'N/A'}*\n`;
    mensagem += `📧 Email: ${cliente.email || 'N/A'}\n`;
    mensagem += `📱 Tel: ${cliente.telefone ? formatarTelefone(cliente.telefone) : 'N/A'}\n`;
    
    if (cliente.logradouro) {
        mensagem += `📍 ${cliente.logradouro}, ${cliente.numero || 'S/N'}\n`;
        mensagem += `🏙️ ${cliente.bairro} - ${cliente.cidade}/${cliente.estado}\n`;
    }
    
    mensagem += `🏪 Unidade: ${unidade?.nome || 'N/A'}\n`;
    mensagem += `📦 Total Pedidos: *${totalPedidos}*\n`;
    mensagem += `💰 Total Gasto: *${formatarMoeda(cliente.total_gasto)}*\n`;
    mensagem += `⭐ Fidelidade: ${cliente.fidelidade_pontos} pts\n`;
    mensagem += `🚫 Status: ${cliente.bloqueado ? 'BLOQUEADO' : 'Ativo'}\n`;
    mensagem += `📅 Cadastro: ${formatarData(cliente.data_cadastro)}\n`;
    
    if (pedidos.length > 0) {
        mensagem += `\n📦 *Últimos Pedidos:*\n`;
        for (const p of pedidos) {
            mensagem += `   ${p.numero} - ${formatarMoeda(p.total)} - ${p.status}\n`;
        }
    }
    
    const teclado = {
        inline_keyboard: [
            [
                { text: cliente.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', callback_data: `adm_cli_toggle_${clienteId}` },
                { text: '📄 Histórico PDF', callback_data: `adm_cli_pdf_${clienteId}` }
            ],
            [{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarClientesAdmin(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_clientes') {
        await showClientesMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_cli_buscar') {
        estado.aguardando = 'buscar_cliente';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🔍 Digite o nome, telefone ou ID do cliente:');
        return;
    }
    
    if (data.startsWith('adm_cli_ver_')) {
        const clienteId = data.split('_')[3];
        await showDetalheCliente(bot, chatId, clienteId, messageId);
        return;
    }
    
    if (data.startsWith('adm_cli_toggle_')) {
        const clienteId = data.split('_')[3];
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        db.prepare('UPDATE clientes SET bloqueado = ? WHERE id = ?').run(cliente.bloqueado ? 0 : 1, clienteId);
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${messageId}`, text: `✅ Cliente ${cliente.bloqueado ? 'desbloqueado' : 'bloqueado'}!` });
        await showDetalheCliente(bot, chatId, clienteId, messageId);
        return;
    }
    
    if (data.startsWith('adm_cli_pdf_')) {
        const clienteId = data.split('_')[3];
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        
        if (cliente) {
            const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC').all(clienteId);
            const itens = db.prepare(`
                SELECT i.* FROM itens_pedido i
                JOIN pedidos p ON i.pedido_id = p.id
                WHERE p.cliente_id = ?
            `).all(clienteId);
            
            const PDFService = require('../../services/pdf');
            const pdfBuffer = await PDFService.gerarHistoricoCliente(cliente, pedidos, itens);
            
            await bot.sendDocument(chatId, pdfBuffer, {
                filename: `cliente_${cliente.nome?.replace(/\s/g, '_') || clienteId}.pdf`,
                caption: `📄 Histórico - ${cliente.nome || 'Cliente ' + clienteId}`
            });
        }
        return;
    }
}

async function processarTextoClientes(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || estado.aguardando !== 'buscar_cliente') return;
    
    const termo = `%${texto.trim()}%`;
    const clientes = db.prepare(`
        SELECT * FROM clientes 
        WHERE nome LIKE ? OR telefone LIKE ? OR CAST(telegram_id AS TEXT) LIKE ?
        LIMIT 10
    `).all(termo, termo, termo);
    
    estado.aguardando = null;
    estados.set(userId, estado);
    
    if (clientes.length === 0) {
        return bot.sendMessage(chatId, '🔍 Nenhum cliente encontrado.');
    }
    
    let mensagem = '🔍 *Resultados da busca:*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const cliente of clientes) {
        mensagem += `👤 *${cliente.nome || 'Sem nome'}*\n`;
        mensagem += `📱 ${cliente.telefone ? formatarTelefone(cliente.telefone) : 'N/A'}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `👤 ${cliente.nome || cliente.telegram_id}`, callback_data: `adm_cli_ver_${cliente.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]);
    
    await bot.sendMessage(chatId, mensagem, {
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

module.exports = { showClientesMenu, processarClientesAdmin, processarTextoClientes };
