const nodemailer = require('nodemailer');
const { gerarCodigo } = require('../utils/helpers');
const logger = require('../utils/logger');

class EmailService {
    
    static async enviarCodigoVerificacao(email) {
        const codigo = gerarCodigo();
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
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
            await transporter.sendMail(mailOptions);
            logger.info(`📧 Código enviado para ${email}`);
            return { sucesso: true, codigo };
        } catch (error) {
            logger.error(`Erro ao enviar email: ${error.message}`);
            return { sucesso: false, mensagem: 'Erro ao enviar email' };
        }
    }
}

module.exports = EmailService;
