const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showConfigMenu(bot, chatId, messageId) {
    const db = getDatabase();
    
    // Busca configurações
    const configs = {};
    const todas = db.prepare('SELECT * FROM configs').all();
    for (const c of todas) {
        configs[c.chave] = c.valor;
    }
    
    let mensagem = '⚙️ *CONFIGURAÇÕES GERAIS*\n\n';
    mensagem += `🚚 Taxa Entrega Padrão: ${formatarMoeda(parseFloat(configs.taxa_entrega_padrao || 8))}\n`;
    mensagem += `💰 Pedido Mínimo: ${formatarMoeda(parseFloat(configs.pedido_minimo || 30))}\n`;
    mensagem += `🕐 Horário Padrão: ${configs.horario_abertura_padrao || '18:00'} - ${configs.horario_fechamento_padrao || '23:00'}\n`;
    mensagem += `⏰ Expiração PIX: ${configs.pix_expiracao || 30} min\n`;
    mensagem += `📏 Raio Entrega Padrão: ${configs.raio_entrega_padrao || 10} km\n\n`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '🚚 Taxa Entrega', callback_data: 'cfg_taxa' }],
            [{ text: '💰 Pedido Mínimo', callback_data: 'cfg_minimo' }],
            [{ text: '🕐 Horários', callback_data: 'cfg_horario' }],
            [{ text: '⏰ Expiração PIX', callback_data: 'cfg_pix' }],
            [{ text: '📏 Raio Entrega', callback_data: 'cfg_raio' }],
            [{ text: '📢 Broadcast', callback_data: 'cfg_broadcast' }],
            [{ text: '👥 Admins', callback_data: 'cfg_admins' }],
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

async function processarConfigAdmin(bot, chatId, userId, data, messageId, estados) {
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_config') {
        await showConfigMenu(bot, chatId, messageId);
        return;
    }
    
    const mapaMensagens = {
        'cfg_taxa': 'Digite a nova taxa de entrega padrão (ex: 8.00):',
        'cfg_minimo': 'Digite o novo pedido mínimo (ex: 30.00):',
        'cfg_pix': 'Digite o novo tempo de expiração do PIX em minutos (ex: 30):',
        'cfg_raio': 'Digite o novo raio de entrega padrão em km (ex: 10):'
    };
    
    if (mapaMensagens[data]) {
        const campo = data.split('_')[1];
        estado.aguardando = `cfg_${campo}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, mapaMensagens[data]);
        return;
    }
    
    if (data === 'cfg_horario') {
        estado.aguardando = 'cfg_horario';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, 'Digite os horários padrão:\nFormato: Abertura, Fechamento\nExemplo: 18:00, 23:00');
        return;
    }
    
    if (data === 'cfg_broadcast') {
        estado.aguardando = 'broadcast';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📢 Digite a mensagem para enviar a TODOS os clientes:');
        return;
    }
    
    if (data === 'cfg_admins') {
        await showAdminsMenu(bot, chatId, messageId);
        return;
    }
}

async function processarTextoConfig(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || !estado.aguardando) return;
    
    const aguardando = estado.aguardando;
    
    // Configurações numéricas
    const mapaConfig = {
        'cfg_taxa': 'taxa_entrega_padrao',
        'cfg_minimo': 'pedido_minimo',
        'cfg_pix': 'pix_expiracao',
        'cfg_raio': 'raio_entrega_padrao'
    };
    
    if (mapaConfig[aguardando]) {
        const valor = parseFloat(texto.replace(',', '.'));
        if (isNaN(valor)) return bot.sendMessage(chatId, '❌ Valor inválido.');
        
        const chave = mapaConfig[aguardando];
        const existe = db.prepare('SELECT * FROM configs WHERE chave = ?').get(chave);
        
        if (existe) {
            db.prepare('UPDATE configs SET valor = ? WHERE chave = ?').run(String(valor), chave);
        } else {
            db.prepare('INSERT INTO configs (chave, valor) VALUES (?, ?)').run(chave, String(valor));
        }
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Configuração atualizada!');
        return;
    }
    
    // Horário
    if (aguardando === 'cfg_horario') {
        const partes = texto.split(',').map(p => p.trim());
        if (partes.length < 2) return bot.sendMessage(chatId, '❌ Formato: Abertura, Fechamento');
        
        const salvar = (chave, valor) => {
            const existe = db.prepare('SELECT * FROM configs WHERE chave = ?').get(chave);
            if (existe) {
                db.prepare('UPDATE configs SET valor = ? WHERE chave = ?').run(valor, chave);
            } else {
                db.prepare('INSERT INTO configs (chave, valor) VALUES (?, ?)').run(chave, valor);
            }
        };
        
        salvar('horario_abertura_padrao', partes[0]);
        salvar('horario_fechamento_padrao', partes[1]);
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Horários atualizados!');
        return;
    }
    
    // Broadcast
    if (aguardando === 'broadcast') {
        const clientes = db.prepare('SELECT telegram_id FROM clientes WHERE bloqueado = 0').all();
        const clientBot = require('../cliente/index').getBot();
        
        let enviados = 0;
        for (const cliente of clientes) {
            try {
                await clientBot.sendMessage(cliente.telegram_id, `📢 *AVISO*\n\n${texto}`, { parse_mode: 'Markdown' });
                enviados++;
            } catch (error) {
                // Cliente pode ter bloqueado o bot
            }
        }
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Mensagem enviada para ${enviados} clientes!`);
        return;
    }
}

async function showAdminsMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const admins = db.prepare('SELECT * FROM administradores').all();
    
    let mensagem = '👥 *ADMINISTRADORES*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const admin of admins) {
        mensagem += `👤 ID: ${admin.telegram_id}\n`;
        mensagem += `📝 Nome: ${admin.nome || 'N/A'}\n`;
        mensagem += `🔰 Nível: ${admin.nivel}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `🗑 Remover ${admin.nome || admin.telegram_id}`, callback_data: `cfg_adm_del_${admin.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Adicionar Admin', callback_data: 'cfg_adm_add' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_config' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

module.exports = { showConfigMenu, processarConfigAdmin, processarTextoConfig, showAdminsMenu };
