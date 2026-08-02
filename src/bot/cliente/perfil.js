const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarTelefone } = require('../../utils/helpers');

async function showPerfil(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return bot.sendMessage(chatId, '❌ Faça cadastro primeiro.');
    
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ?').get(cliente.id).total;
    
    let mensagem = `👤 *MEU PERFIL*\n\n`;
    mensagem += `📝 Nome: *${cliente.nome}*\n`;
    mensagem += `📧 Email: ${cliente.email || 'Não informado'}\n`;
    mensagem += `📱 Telefone: ${cliente.telefone ? formatarTelefone(cliente.telefone) : 'Não informado'}\n`;
    
    if (cliente.logradouro) {
        mensagem += `📍 Endereço: ${cliente.logradouro}, ${cliente.numero || 'S/N'}\n`;
        mensagem += `🏙️ ${cliente.bairro} - ${cliente.cidade}/${cliente.estado}\n`;
    }
    
    mensagem += `\n📦 Pedidos: *${totalPedidos}*\n`;
    mensagem += `💰 Total gasto: *${formatarMoeda(cliente.total_gasto)}*\n`;
    mensagem += `⭐ Fidelidade: *${cliente.fidelidade_pontos} pontos*\n`;
    mensagem += `📅 Cadastro: ${formatarData(cliente.data_cadastro)}\n`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '✏️ Editar Dados', callback_data: 'perfil_editar' }],
            [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '⬅️ Voltar', callback_data: 'menu_voltar_principal' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarPerfil(bot, chatId, userId, data, messageId, estados) {
    if (data === 'menu_perfil') {
        await showPerfil(bot, chatId, userId, messageId);
    }
    
    if (data === 'perfil_editar') {
        await bot.sendMessage(chatId, '📝 Envie os novos dados no formato:\n\nNome, Email, Telefone\n\nExemplo: João Silva, joao@email.com, 44999525600');
        estados.set(userId, { tela: 'perfil', aguardando: 'edicao' });
    }
}

module.exports = { showPerfil, processarPerfil };
