const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

async function showCuponsMenu(bot, chatId, messageId) {
    const db = getDatabase();
    const cupons = db.prepare('SELECT * FROM cupons ORDER BY id DESC').all();
    
    let mensagem = '🎟 *GERENCIAR CUPONS*\n\n';
    const teclado = { inline_keyboard: [] };
    
    if (cupons.length === 0) {
        mensagem += 'Nenhum cupom cadastrado.\n';
    } else {
        for (const cupom of cupons) {
            const status = cupom.ativo ? '✅' : '❌';
            const tipo = cupom.tipo === 'percentual' ? '%' : 'R$';
            mensagem += `${status} *${cupom.codigo}*\n`;
            mensagem += `   🎁 ${cupom.valor}${tipo} de desconto\n`;
            mensagem += `   📊 Usos: ${cupom.uso_atual}/${cupom.uso_maximo}\n`;
            if (cupom.valido_ate) {
                mensagem += `   ⏰ Válido até: ${formatarData(cupom.valido_ate)}\n`;
            }
            mensagem += '\n';
            
            teclado.inline_keyboard.push([
                { text: `✏️ ${cupom.codigo}`, callback_data: `adm_cupom_edit_${cupom.id}` },
                { text: cupom.ativo ? '❌' : '✅', callback_data: `adm_cupom_toggle_${cupom.id}` },
                { text: '🗑', callback_data: `adm_cupom_del_${cupom.id}` }
            ]);
        }
    }
    
    teclado.inline_keyboard.push([{ text: '➕ Novo Cupom', callback_data: 'adm_cupom_novo' }]);
    teclado.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar_dashboard' }]);
    
    await bot.editMessageText(mensagem, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: teclado
    });
}

async function processarCuponsAdmin(bot, chatId, userId, data, messageId, estados) {
    const db = getDatabase();
    const estado = estados.get(userId) || {};
    
    if (data === 'adm_cupons') {
        await showCuponsMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'adm_cupom_novo') {
        estado.aguardando = 'novo_cupom';
        estados.set(userId, estado);
        await bot.sendMessage(chatId, '🎟 Digite os dados do cupom:\n\nCódigo, Tipo (percentual/fixo), Valor, Usos Máximos, Validade (dias)\n\nExemplo: PIZZA10, percentual, 10, 100, 30');
        return;
    }
    
    if (data.startsWith('adm_cupom_toggle_')) {
        const cupomId = data.split('_')[3];
        const cupom = db.prepare('SELECT * FROM cupons WHERE id = ?').get(cupomId);
        db.prepare('UPDATE cupons SET ativo = ? WHERE id = ?').run(cupom.ativo ? 0 : 1, cupomId);
        await showCuponsMenu(bot, chatId, messageId);
        return;
    }
    
    if (data.startsWith('adm_cupom_del_')) {
        const cupomId = data.split('_')[3];
        db.prepare('DELETE FROM cupons WHERE id = ?').run(cupomId);
        await showCuponsMenu(bot, chatId, messageId);
        return;
    }
}

async function processarTextoCupons(bot, chatId, userId, texto, estados) {
    const db = getDatabase();
    const estado = estados.get(userId);
    
    if (!estado || estado.aguardando !== 'novo_cupom') return;
    
    const partes = texto.split(',').map(p => p.trim());
    if (partes.length < 5) return bot.sendMessage(chatId, '❌ Formato: Código, Tipo, Valor, Usos, Validade Dias');
    
    const [codigo, tipo, valor, usos, dias] = partes;
    
    if (tipo !== 'percentual' && tipo !== 'fixo') {
        return bot.sendMessage(chatId, '❌ Tipo deve ser "percentual" ou "fixo"');
    }
    
    const valorNum = parseFloat(valor.replace(',', '.'));
    const usosNum = parseInt(usos);
    const diasNum = parseInt(dias);
    
    if (isNaN(valorNum) || isNaN(usosNum) || isNaN(diasNum)) {
        return bot.sendMessage(chatId, '❌ Valores inválidos.');
    }
    
    const validade = new Date();
    validade.setDate(validade.getDate() + diasNum);
    
    try {
        db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?, ?, ?, ?, ?)')
            .run(codigo.toUpperCase(), tipo, valorNum, usosNum, validade.toISOString());
        
        estado.aguardando = null;
        estados.set(userId, estado);
        await bot.sendMessage(chatId, `✅ Cupom "${codigo.toUpperCase()}" criado!`);
    } catch (error) {
        await bot.sendMessage(chatId, '❌ Código já existe. Use outro.');
    }
}

module.exports = { showCuponsMenu, processarCuponsAdmin, processarTextoCupons };
