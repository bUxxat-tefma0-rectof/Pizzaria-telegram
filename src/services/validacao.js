const axios = require('axios');
const { formatarTelefone, formatarCEP } = require('../utils/helpers');

class Validacao {
    
    static validarNome(nome) {
        if (!nome || nome.trim().length < 3) {
            return { valido: false, mensagem: '❌ Nome deve ter pelo menos 3 caracteres' };
        }
        if (nome.trim().split(' ').length < 2) {
            return { valido: false, mensagem: '❌ Informe nome e sobrenome' };
        }
        return { valido: true, nome: nome.trim() };
    }
    
    static validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regex.test(email)) {
            return { valido: false, mensagem: '❌ Email inválido' };
        }
        return { valido: true, email: email.toLowerCase().trim() };
    }
    
    static validarTelefone(telefone) {
        const limpo = String(telefone).replace(/\D/g, '');
        if (limpo.length < 10 || limpo.length > 11) {
            return { valido: false, mensagem: '❌ Telefone inválido' };
        }
        return { valido: true, telefone: limpo, formatado: formatarTelefone(limpo) };
    }
    
    static async validarCEP(cep) {
        const limpo = String(cep).replace(/\D/g, '');
        if (limpo.length !== 8) {
            return { valido: false, mensagem: '❌ CEP deve ter 8 dígitos' };
        }
        
        try {
            const response = await axios.get(`${process.env.VIA_CEP_URL}/${limpo}/json/`);
            if (response.data.erro) {
                return { valido: false, mensagem: '❌ CEP não encontrado' };
            }
            return {
                valido: true,
                formatado: formatarCEP(limpo),
                dados: response.data
            };
        } catch (error) {
            return { valido: false, mensagem: '❌ Erro ao consultar CEP' };
        }
    }
}

module.exports = Validacao;
