function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function formatarTelefone(telefone) {
    const limpo = String(telefone).replace(/\D/g, '');
    if (limpo.length === 11) {
        return limpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return limpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

function formatarCEP(cep) {
    const limpo = String(cep).replace(/\D/g, '');
    return limpo.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatarData(data) {
    return new Date(data).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function gerarCodigo() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function gerarNumeroPedido() {
    const agora = new Date();
    const ano = agora.getFullYear().toString().slice(-2);
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const random = String(Math.floor(1000 + Math.random() * 9000));
    return `#${ano}${mes}${random}`;
}

function escapeMarkdown(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = {
    formatarMoeda,
    formatarTelefone,
    formatarCEP,
    formatarData,
    gerarCodigo,
    gerarNumeroPedido,
    escapeMarkdown
};
