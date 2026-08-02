const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarTelefone } = require('../../utils/helpers');

async function showPerfil(bot, chatId, userId, messageId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    
    if (!cliente) return bot.sendMessage(chatId, '❌ Faça cadastro primeiro.');
    
    const totalPedidos = db.prepare('SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ?').get(cliente.id).total;
    const unidade = db.prepare('SELECT nome FROM unidades WHERE id = ?').get(cliente.unidade_proxima_id);
    
    let mensagem = `👤 *MEU PERFIL*\n\n`;
    mensagem += `📝 Nome: *${cliente.nome}*\n`;
    mensagem += `📧 Email: ${cliente.email || 'Não informado'}\n`;
    mensagem += `📱 Telefone: ${cliente.telefone ? formatarTelefone(cliente.telefone) : 'Não informado'}\n`;
    
    if (cliente.logradouro) {
        mensagem += `📍 Endereço: ${cliente.logradouro}, ${cliente.numero || 'S/N'}\n`;
        mensagem += `🏙️ ${cliente.bairro} - ${cliente.cidade}/${cliente.estado}\n`;
    }
    
    if (unidade) {
        mensagem += `🏪 Unidade: ${unidade.nome}\n`;
    }
    
    mensagem += `\n📦 Pedidos: *${totalPedidos}*\n`;
    mensagem += `💰 Total gasto: *${formatarMoeda(cliente.total_gasto)}*\n`;
    mensagem += `⭐ Fidelidade: *${cliente.fidelidade_pontos} pontos*\n`;
    mensagem += `📅 Cadastro: ${formatarData(cliente.data_cadastro)}\n`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '✏️ Editar Nome', callback_data: 'perfil_edit_nome' }],
            [{ text: '📧 Editar Email', callback_data: 'perfil_edit_email' }],
            [{ text: '📱 Editar Telefone', callback_data: 'perfil_edit_tel' }],
            [{ text: '📍 Editar Endereço', callback_data: 'perfil_edit_end' }],
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
        return;
    }
    
    const estado = estados.get(userId) || {};
    estado.tela = 'perfil';
    
    const mapa = {
        'perfil_edit_nome': 'edit_nome',
        'perfil_edit_email': 'edit_email',
        'perfil_edit_tel': 'edit_tel',
        'perfil_edit_end': 'edit_end'
    };
    
    if (mapa[data]) {
        estado.aguardando = mapa[data];
        estados.set(userId, estado);
        
        const mensagens = {
            'edit_nome': 'Digite seu novo nome completo:',
            'edit_email': 'Digite seu novo email:',
            'edit_tel': 'Digite seu novo telefone (com DDD):',
            'edit_end': 'Digite seu novo endereço:\nFormato: Rua, Número, Bairro, Cidade, Estado'
        };
        
        await bot.sendMessage(chatId, mensagens[mapa[data]]);
        return;
    }
}

async function processarTextoPerfil(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || !estado.aguardando) return;
    
    switch(estado.aguardando) {
        case 'edit_nome':
            if (texto.trim().length < 3) return bot.sendMessage(chatId, '❌ Nome muito curto.');
            db.prepare('UPDATE clientes SET nome = ? WHERE telegram_id = ?').run(texto.trim(), userId);
            break;
            
        case 'edit_email':
            const Validacao = require('../../services/validacao');
            const valEmail = Validacao.validarEmail(texto);
            if (!valEmail.valido) return bot.sendMessage(chatId, valEmail.mensagem);
            db.prepare('UPDATE clientes SET email = ?, email_verificado = 0 WHERE telegram_id = ?').run(valEmail.email, userId);
            await bot.sendMessage(chatId, '⚠️ Email alterado. Será necessário verificar novamente no próximo acesso.');
            break;
            
        case 'edit_tel':
            const valTel = require('../../services/validacao').validarTelefone(texto);
            if (!valTel.valido) return bot.sendMessage(chatId, valTel.mensagem);
            db.prepare('UPDATE clientes SET telefone = ? WHERE telegram_id = ?').run(valTel.telefone, userId);
            break;
            
        case 'edit_end':
            const partes = texto.split(',').map(p => p.trim());
            if (partes.length < 4) return bot.sendMessage(chatId, '❌ Formato: Rua, Número, Bairro, Cidade, Estado');
            const [rua, num, bairro, cidade, estado_uf] = partes;
            db.prepare(`UPDATE clientes SET logradouro = ?, numero = ?, bairro = ?, cidade = ?, estado = ? WHERE telegram_id = ?`)
                .run(rua, num, bairro, cidade, estado_uf || 'PR', userId);
            break;
    }
    
    estado.aguardando = null;
    estados.set(userId, estado);
    await bot.sendMessage(chatId, '✅ Dados atualizados com sucesso!');
}

module.exports = { showPerfil, processarPerfil, processarTextoPerfil };
