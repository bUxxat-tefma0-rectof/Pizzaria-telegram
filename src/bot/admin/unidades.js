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
        estado.aguardando = 'nova_unidade';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '📍 Digite os dados da nova unidade:\n\nNome, Cidade, Estado, Bairro, Logradouro, Número, CEP, Telefone, WhatsApp, Taxa Entrega, Pedido Mínimo, Raio Entrega, Horário Abertura, Horário Fechamento\n\nExemplo: Pizzaria Centro, Paranavaí, PR, Centro, Rua Principal, 100, 87700000, 44999525600, 44999525600, 8.00, 30.00, 10, 18:00, 23:00');
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
    
    // Nova unidade
    if (aguardando === 'nova_unidade') {
        const partes = texto.split(',').map(p => p.trim());
        if (partes.length < 14) return bot.sendMessage(chatId, '❌ Preencha todos os campos.');
        
        const [nome, cidade, estado_uf, bairro, logradouro, numero, cep, telefone, whatsapp, taxa, minimo, raio, abre, fecha] = partes;
        
        db.prepare(`INSERT INTO unidades (nome, cidade, estado, bairro, logradouro, numero, cep, telefone, whatsapp, taxa_entrega, pedido_minimo, raio_entrega, horario_abertura, horario_fechamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(nome, cidade, estado_uf, bairro, logradouro, numero, cep, telefone, whatsapp, parseFloat(taxa), parseFloat(minimo), parseFloat(raio), abre, fecha);
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Unidade "${nome}" criada!`);
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
        await bot.sendMessage(chatId, '✅ Atualizado!');
        return;
    }
}

module.exports = { showUnidadesMenu, processarUnidadesAdmin, processarTextoUnidades };
