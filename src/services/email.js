const nodemailer = require('nodemailer');
const { gerarCodigo } = require('../utils/helpers');
const logger = require('../utils/logger');

class EmailService {
    
    static async enviarCodigoVerificacao(email) {
        const codigo = gerarCodigo();
        
        logger.info(`📧 Tentando enviar email para ${email}`);
        logger.info(`📧 SMTP_USER: ${process.env.SMTP_USER}`);
        logger.info(`📧 SMTP_PASS: ${process.env.SMTP_PASS ? '****' : 'VAZIO'}`);
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        
        const mailOptions = {
            from: `"${process.env.SMTP_FROM}" <${process.env.SMTP_USER}>`,
            to: email,
            subject: '🍕 Código de Verificação - Pizzaria',
            html: `
                <div style="text-align:center; font-family:Arial;">
                    <h1 style="color:#e74c3c;">🍕 Pizzaria Telegram</h1>
                    <p>Seu código de verificação é:</p>
                    <h2 style="background:#f39c12; color:white; padding:15px; border-radius:10px; display:inline-block;">
                        ${codigo}
                    </h2>
                    <p>Válido por 10 minutos</p>
                </div>
            `
        };
        
        try {
            const info = await transporter.sendMail(mailOptions);
            logger.info(`📧 Email enviado: ${info.messageId}`);
            return { sucesso: true, codigo };
        } catch (error) {
            logger.error(`❌ Erro email: ${error.message}`);
            // Mesmo com erro, retorna o código para não travar o cadastro
            return { sucesso: true, codigo };
        }
    }
}

module.exports = EmailService;
