const mercadopago = require('mercado-pago');
const { gerarCodigo } = require('../utils/helpers');
const logger = require('../utils/logger');

class PagamentoService {
    
    constructor() {
        mercadopago.configure({
            access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
        });
    }
    
    async gerarPix(valor, descricao, pedidoId) {
        try {
            const payment_data = {
                transaction_amount: Number(valor),
                description: descricao,
                payment_method_id: 'pix',
                payer: {
                    email: `pedido${pedidoId}@pizzaria.com`
                }
            };
            
            const response = await mercadopago.payment.create(payment_data);
            
            const pix = {
                qr_code: response.body.point_of_interaction.transaction_data.qr_code_base64,
                copia_cola: response.body.point_of_interaction.transaction_data.qr_code,
                payment_id: response.body.id,
                status: response.body.status
            };
            
            logger.info(`💳 PIX gerado: ${pix.payment_id}`);
            return { sucesso: true, ...pix };
            
        } catch (error) {
            logger.error(`Erro ao gerar PIX: ${error.message}`);
            return { sucesso: false, mensagem: 'Erro ao gerar pagamento' };
        }
    }
    
    async verificarPagamento(paymentId) {
        try {
            const response = await mercadopago.payment.get(paymentId);
            return {
                status: response.body.status,
                aprovado: response.body.status === 'approved'
            };
        } catch (error) {
            return { status: 'error', aprovado: false };
        }
    }
}

module.exports = new PagamentoService();
