const { MercadoPagoConfig, Payment } = require('mercadopago');
const logger = require('../utils/logger');

class PagamentoService {
    
    constructor() {
        this.client = new MercadoPagoConfig({
            accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
        });
    }
    
    async gerarPix(valor, descricao, pedidoId) {
        try {
            const payment = new Payment(this.client);
            
            const body = {
                transaction_amount: Number(valor),
                description: descricao,
                payment_method_id: 'pix',
                payer: {
                    email: `pedido${pedidoId}@pizzaria.com`
                }
            };
            
            const response = await payment.create({ body });
            
            const pix = {
                qr_code: response.point_of_interaction.transaction_data.qr_code_base64,
                copia_cola: response.point_of_interaction.transaction_data.qr_code,
                payment_id: response.id,
                status: response.status
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
            const payment = new Payment(this.client);
            const response = await payment.get({ id: paymentId });
            
            return {
                status: response.status,
                aprovado: response.status === 'approved'
            };
        } catch (error) {
            return { status: 'error', aprovado: false };
        }
    }
}

module.exports = new PagamentoService();
