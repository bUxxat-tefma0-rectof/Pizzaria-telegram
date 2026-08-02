const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');

async function showUnidadesMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const unidades = db.prepare('SELECT * FROM unidades ORDER BY cidade, nome').all();
    
    let mensagem = '📍 *GERENCIAR UNIDADES*\n\n';
    const teclado = { inline_keyboard: [] };
    
    for (const unidade of unidades) {
        const status = unidade.ativo ? '✅' : '❌';
        mensagem += `${status} *${unidade.nome}*\n`;
        mensagem += `   📍 ${unidade.cidade}/${unidade.estado}\n`;
        mensagem += `   🚚 Taxa: ${formatarMoeda(unidade.taxa_entrega)}\n`;
        mensagem += `   🕐 ${unidade.horario_abertura} às ${unidade.horario_fechamento}\n\n`;
        
        teclado.inline_keyboard.push([
            { text: `✏️ ${unidade.nome}`, callback_data: `adm_unid_edit_${unidade.id}` }
        ]);
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Nova Unidade', callback_data: 'adm_unid_nova' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function showEditarUnidade(bot, chatId, unidadeId, messageId) {
    const db = getDatabase();
    const unidade = db.prepare('SELECT * FROM unidades WHERE id = ?').get(unidadeId);
    
    if (!unidade) return bot.sendMessage(chatId, 'Unidade não encontrada.');
    
    let mensagem = `📍 *EDITAR UNIDADE*\n\n` +
                  `Nome: *${unidade.nome}*\n` +
                  `Endereço: ${unidade.logradouro}, ${unidade.numero || 'S/N'}\n` +
                  `Bairro: ${unidade.bairro || 'N/A'}\n` +
                  `Cidade/Estado: ${unidade.cidade}/${unidade.estado}\n` +
                  `CEP: ${unidade.cep || 'N/A'}\n` +
                  `📱 Tel: ${unidade.telefone || 'N/A'}\n` +
                  `💬 WhatsApp: ${unidade.whatsapp || 'N/A'}\n` +
                  `🚚 Taxa Entrega: ${formatarMoeda(unidade.taxa_entrega)}\n` +
                  `💰 Pedido Mínimo: ${formatarMoeda(unidade.pedido_minimo)}\n` +
                  `📏 Raio Entrega: ${unidade.raio_entrega} km\n` +
                  `🕐 Horário: ${unidade.horario_abertura} - ${unidade.horario_fechamento}\n` +
                  `📍 Coordenadas: ${unidade.latitude || 'N/A'}, ${unidade.longitude || 'N/A'}\n` +
                  `Status: ${unidade.ativo ? '✅ Ativo' : '❌ Inativo'}\n\n` +
                  `O que deseja alterar?`;
    
    const teclado = {
        inline_keyboard: [
            [{ text: '✏️ Nome', callback_data: `adm_unid_setnome_${unidadeId}` }],
            [{ text: '📞 Telefone', callback_data: `adm_unid_settel_${unidadeId}` }, { text: '💬 WhatsApp', callback_data: `adm_unid_setwpp_${unidadeId}` }],
            [{ text: '🚚 Taxa Entrega', callback_data: `adm_unid_settaxa_${unidadeId}` }, { text: '💰 Pedido Mínimo', callback_data: `adm_unid_setmin_${unidadeId}` }],
            [{ text: '📏 Raio Entrega', callback_data: `adm_unid_setraio_${unidadeId}` }],
            [{ text: '🕐 Horários', callback_data: `adm_unid_sethora_${unidadeId}` }],
            [{ text: '📍 Atualizar Localização', callback_data: `adm_unid_setloc_${unidadeId}` }],
            [{ text: unidade.ativo ? '❌ Desativar' : '✅ Ativar', callback_data: `adm_unid_toggle_${unidadeId}` }],
            [{ text: '🗑 Excluir', callback_data: `adm_unid_del_${unidadeId}` }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_unidades' }]
        ]
    };
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarUnidadesAdmin(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_unidades') {
        await showUnidadesMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_unid_nova') {
        estado.aguardando = 'nova_unidade_nome';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📍 Digite o *nome* da nova unidade:\n\nExemplo: Pizzaria Centro');
        return;
    }
    
    if (data.startsWith('adm_unid_edit_')) {
        const unidId = data.split('_')[3];
        await showEditarUnidade(bot, chatId, unidId, messageId);
        return;
    }
    
    if (data.startsWith('adm_unid_toggle_')) {
        const unidId = data.split('_')[3];
        const unid = db.prepare('SELECT * FROM unidades WHERE id = ?').get(unidId);
        db.prepare('UPDATE unidades SET ativo = ? WHERE id = ?').run(unid.ativo ? 0 : 1, unidId);
        await showEditarUnidade(bot, chatId, unidId, messageId);
        return;
    }
    
    if (data.startsWith('adm_unid_del_')) {
        const unidId = data.split('_')[3];
        db.prepare('DELETE FROM unidades WHERE id = ?').run(unidId);
        await showUnidadesMenu(bot, chatId, messageId);
        return;
    }
    
    // Campos editáveis
    if (data.startsWith('adm_unid_set')) {
        const partes = data.split('_');
        const campo = partes[2];
        const unidId = partes[3];
        
        if (campo === 'loc') {
            estado.aguardando = `set_loc_unid_${unidId}`;
            estados.set(userId, estado);
            await bot.sendMessage(chatId, '📍 Envie a *localização* da unidade:', {
                reply_markup: {
                    keyboard: [[{ text: '📍 Compartilhar Localização', request_location: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return;
        }
        
        const mapaCampos = {
            'nome': 'Digite o novo nome:',
            'tel': 'Digite o novo telefone:',
            'wpp': 'Digite o novo WhatsApp:',
            'taxa': 'Digite a nova taxa de entrega (ex: 8.00):',
            'min': 'Digite o novo pedido mínimo (ex: 30.00):',
            'raio': 'Digite o novo raio de entrega em km (ex: 10):',
            'hora': 'Digite os novos horários:\nFormato: Abertura, Fechamento\nExemplo: 18:00, 23:00'
        };
        
        estado.aguardando = `set_${campo}_unid_${unidId}`;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, mapaCampos[campo] || 'Digite o novo valor:');
        return;
    }
}

async function processarTextoUnidades(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || !estado.aguardando) return;
    
    const aguardando = estado.aguardando;
    
    // Novo cadastro - etapas
    if (aguardando === 'nova_unidade_nome') {
        estado.novaUnidade = { nome: texto.trim() };
        estado.aguardando = 'nova_unidade_cidade';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🏙️ Digite a *cidade*:');
        return;
    }
    
    if (aguardando === 'nova_unidade_cidade') {
        estado.novaUnidade.cidade = texto.trim();
        estado.aguardando = 'nova_unidade_estado';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🗺️ Digite o *estado* (sigla):\nExemplo: PR');
        return;
    }
    
    if (aguardando === 'nova_unidade_estado') {
        estado.novaUnidade.estado = texto.trim().toUpperCase();
        estado.aguardando = 'nova_unidade_bairro';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🏘️ Digite o *bairro*:');
        return;
    }
    
    if (aguardando === 'nova_unidade_bairro') {
        estado.novaUnidade.bairro = texto.trim();
        estado.aguardando = 'nova_unidade_rua';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🏠 Digite o *logradouro* (rua/avenida):');
        return;
    }
    
    if (aguardando === 'nova_unidade_rua') {
        estado.novaUnidade.logradouro = texto.trim();
        estado.aguardando = 'nova_unidade_numero';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🔢 Digite o *número*:');
        return;
    }
    
    if (aguardando === 'nova_unidade_numero') {
        estado.novaUnidade.numero = texto.trim();
        estado.aguardando = 'nova_unidade_telefone';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📞 Digite o *telefone* (com DDD):');
        return;
    }
    
    if (aguardando === 'nova_unidade_telefone') {
        estado.novaUnidade.telefone = texto.trim();
        estado.aguardando = 'nova_unidade_whatsapp';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '💬 Digite o *WhatsApp* (com DDD):');
        return;
    }
    
    if (aguardando === 'nova_unidade_whatsapp') {
        estado.novaUnidade.whatsapp = texto.trim();
        estado.aguardando = 'nova_unidade_taxa';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🚚 Digite a *taxa de entrega* (ex: 8.00):');
        return;
    }
    
    if (aguardando === 'nova_unidade_taxa') {
        estado.novaUnidade.taxa_entrega = parseFloat(texto.replace(',', '.'));
        estado.aguardando = 'nova_unidade_minimo';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '💰 Digite o *pedido mínimo* (ex: 30.00):');
        return;
    }
    
    if (aguardando === 'nova_unidade_minimo') {
        estado.novaUnidade.pedido_minimo = parseFloat(texto.replace(',', '.'));
        estado.aguardando = 'nova_unidade_raio';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📏 Digite o *raio de entrega* em km (ex: 10):');
        return;
    }
    
    if (aguardando === 'nova_unidade_raio') {
        estado.novaUnidade.raio_entrega = parseFloat(texto.replace(',', '.'));
        estado.aguardando = 'nova_unidade_abertura';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🕐 Digite o *horário de abertura* (ex: 18:00):');
        return;
    }
    
    if (aguardando === 'nova_unidade_abertura') {
        estado.novaUnidade.horario_abertura = texto.trim();
        estado.aguardando = 'nova_unidade_fechamento';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🕐 Digite o *horário de fechamento* (ex: 23:00):');
        return;
    }
    
    if (aguardando === 'nova_unidade_fechamento') {
        estado.novaUnidade.horario_fechamento = texto.trim();
        estado.aguardando = 'nova_unidade_localizacao';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📍 Envie a *localização* da unidade:', {
            reply_markup: {
                keyboard: [[{ text: '📍 Compartilhar Localização', request_location: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }
    
    // Editar campos
    if (aguardando.startsWith('set_')) {
        const partes = aguardando.split('_');
        const campo = partes[1];
        const unidId = partes[3];
        
        const mapaDB = {
            'nome': 'nome',
            'tel': 'telefone',
            'wpp': 'whatsapp',
            'taxa': 'taxa_entrega',
            'min': 'pedido_minimo',
            'raio': 'raio_entrega'
        };
        
        if (campo === 'hora') {
            const horarios = texto.split(',').map(h => h.trim());
            if (horarios.length < 2) return bot.sendMessage(chatId, '❌ Formato: Abertura, Fechamento');
            db.prepare('UPDATE unidades SET horario_abertura = ?, horario_fechamento = ? WHERE id = ?')
                .run(horarios[0], horarios[1], unidId);
        } else {
            const coluna = mapaDB[campo];
            const valor = ['taxa', 'min', 'raio'].includes(campo) ? parseFloat(texto.replace(',', '.')) : texto.trim();
            db.prepare(`UPDATE unidades SET ${coluna} = ? WHERE id = ?`).run(valor, unidId);
        }
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '✅ Atualizado!', { reply_markup: { remove_keyboard: true } });
        return;
    }
}

async function processarLocalizacaoUnidades(bot, chatId, userId, location, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || !estado.aguardando) return;
    
    const { latitude, longitude } = location;
    
    // Se for nova unidade
    if (estado.aguardando === 'nova_unidade_localizacao') {
        const u = estado.novaUnidade;
        
        db.prepare(`INSERT INTO unidades 
            (nome, cidade, estado, bairro, logradouro, numero, telefone, whatsapp, 
             taxa_entrega, pedido_minimo, raio_entrega, horario_abertura, horario_fechamento,
             latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(u.nome, u.cidade, u.estado, u.bairro, u.logradouro, u.numero,
                 u.telefone, u.whatsapp, u.taxa_entrega, u.pedido_minimo, u.raio_entrega,
                 u.horario_abertura, u.horario_fechamento, latitude, longitude);
        
        estado.aguardando = null;
        estado.novaUnidade = null;
        estados.set(userId, estado);
        
        await bot.sendMessage(chatId, `✅ Unidade "${u.nome}" criada com sucesso!`, {
            reply_markup: { remove_keyboard: true }
        });
        return;
    }
    
    // Se for editar unidade existente
    if (aguardando.startsWith('set_loc_unid_')) {
        const unidId = estado.aguardando.split('_')[3];
        
        db.prepare('UPDATE unidades SET latitude = ?, longitude = ? WHERE id = ?')
            .run(latitude, longitude, unidId);
        
        estado.aguardando = null;
        estados.set(userId, estado);
        
        await bot.sendMessage(chatId, '✅ Localização atualizada!', {
            reply_markup: { remove_keyboard: true }
        });
        return;
    }
}

module.exports = { 
    showUnidadesMenu, 
    processarUnidadesAdmin, 
    processarTextoUnidades, 
    processarLocalizacaoUnidades 
};
