const { getDatabase } = require('../../database/connection');
const Validacao = require('../../services/validacao');
const EmailService = require('../../services/email');
const Geolocalizacao = require('../../services/geolocalizacao');
const { formatarMoeda, gerarCodigo } = require('../../utils/helpers');
const { showMenuPrincipal } = require('./menu');

async function iniciarCadastro(bot, chatId) {
    const mensagem = `📝 *Cadastro*\n\n` +
                    `Como podemos te chamar?\n\n` +
                    `_Digite seu nome completo:_`;
    
    await bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
}

async function processarEtapaCadastro(bot, chatId, userId, data, messageId, estados) {
    const estado = estados.get(userId);
    
    // Compartilhar local
