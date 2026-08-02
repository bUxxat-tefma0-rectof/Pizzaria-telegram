const nodemailer = require('nodemailer');
const { gerarCodigo } = require('../utils/helpers');
const logger = require('../utils/logger');

class EmailService {
    
    static async enviarCodigoVerificacao(email) {
        const codigo = gerarCodigo();
        
        // Tenta enviar email mas não trava se falhar
        try {
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
                },
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 5000
            });
            
            const mailOptions = {
                from: `"${process.env.SMTP_FROM}" <${process.env.SMTP_USER}>`,
                to: email,
                subject: '🍕 Codigo de Verificacao - Pizzaria',
                html: `
                    <div style="text-align:center; font-family:Arial;">
                        <h1 style="color:#e74c3c;">🍕 Pizzaria Telegram</h1>
                        <p>Seu codigo de verificacao e:</p>
                        <h2 style="background:#f39c12; color:white; padding:15px; border-radius:10px; display:inline-block;">
                            ${codigo}
                        </h2>
                        <p>Valido por 10 minutos</p>
                    </div>
                `
            };
            
            // Envia sem esperar (fire and forget)
            transporter.sendMail(mailOptions)
                .then(info => logger.info(`📧 Email enviado para ${email}`))
                .catch(err => logger.error(`❌ Falha email: ${err.message}`));
            
        } catch (error) {
            logger.error(`❌ Erro email: ${error.message}`);
        }
        
        // Retorna o código IMEDIATAMENTE
        return { sucesso: true, codigo };
    }
}

module.exports = EmailService;
