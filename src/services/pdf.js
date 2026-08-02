const PDFDocument = require('pdfkit');
const { formatarMoeda, formatarData } = require('../utils/helpers');

class PDFService {
    
    static gerarHistoricoCliente(cliente, pedidos, itens) {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        
        return new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
            
            // Cabeçalho
            doc.fontSize(22).fillColor('#e74c3c').text('🍕 Histórico de Pedidos', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#666').text(`Cliente: ${cliente.nome}`, { align: 'center' });
            doc.text(`Gerado em: ${formatarData(new Date())}`, { align: 'center' });
            doc.moveDown(2);
            
            // Linha separadora
            doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e74c3c');
            doc.moveDown();
            
            let totalGeral = 0;
            
            for (const pedido of pedidos) {
                // Status com cor
                const statusCores = {
                    'pendente': '#f39c12',
                    'confirmado': '#2ecc71',
                    'preparo': '#3498db',
                    'entrega': '#9b59b6',
                    'entregue': '#27ae60',
                    'cancelado': '#e74c3c'
                };
                
                doc.fontSize(14).fillColor('#333').text(`Pedido ${pedido.numero}`, { underline: true });
                doc.fontSize(10)
                    .fillColor(statusCores[pedido.status] || '#333')
                    .text(`Status: ${pedido.status.toUpperCase()}`)
                    .fillColor('#666')
                    .text(`Data: ${formatarData(pedido.data_pedido)}`)
                    .text(`Pagamento: ${pedido.pagamento_metodo?.toUpperCase() || 'N/A'} - ${pedido.pagamento_status}`);
                
                if (pedido.observacao) {
                    doc.text(`Obs: ${pedido.observacao}`);
                }
                
                doc.moveDown(0.3);
                
                // Itens
                const itensPedido = itens.filter(i => i.pedido_id === pedido.id);
                doc.fontSize(9).fillColor('#555');
                
                for (const item of itensPedido) {
                    const descricao = `${item.quantidade}x ${item.produto_nome} - ${item.tamanho_nome} - ${item.borda_nome}`;
                    doc.text(`  • ${descricao}`);
                    
                    if (item.adicionais) {
                        doc.text(`    Adicionais: ${item.adicionais}`, { indent: 20 });
                    }
                    
                    doc.text(`    ${formatarMoeda(item.preco_unitario * item.quantidade)}`, { indent: 20, align: 'right' });
                }
                
                doc.moveDown(0.3);
                
                // Valores
                doc.fontSize(9).fillColor('#333');
                doc.text(`Subtotal: ${formatarMoeda(pedido.subtotal)}`, { align: 'right' });
                doc.text(`Entrega: ${formatarMoeda(pedido.taxa_entrega)}`, { align: 'right' });
                
                if (pedido.desconto > 0) {
                    doc.fillColor('#e74c3c').text(`Desconto: -${formatarMoeda(pedido.desconto)}`, { align: 'right' });
                }
                
                doc.fontSize(11).fillColor('#333').text(`Total: ${formatarMoeda(pedido.total)}`, { align: 'right', bold: true });
                
                totalGeral += pedido.total;
                
                doc.moveDown();
                doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
                doc.moveDown();
            }
            
            // Total geral
            doc.moveDown();
            doc.fontSize(14).fillColor('#e74c3c').text(`Total Geral: ${formatarMoeda(totalGeral)}`, { align: 'right', bold: true });
            
            doc.end();
        });
    }
    
    static gerarRelatorioAdmin(pedidos, itens) {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        
        return new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
            
            doc.fontSize(20).fillColor('#333').text('📊 Relatório de Pedidos', { align: 'center' });
            doc.fontSize(10).fillColor('#666').text(`Gerado em: ${formatarData(new Date())}`, { align: 'center' });
            doc.moveDown(2);
            
            let totalGeral = 0;
            
            for (const pedido of pedidos) {
                doc.fontSize(12).fillColor('#333').text(`Pedido ${pedido.numero}`);
                doc.fontSize(9).fillColor('#666')
                    .text(`Cliente ID: ${pedido.cliente_id}`)
                    .text(`Status: ${pedido.status}`)
                    .text(`Data: ${formatarData(pedido.data_pedido)}`);
                
                const itensPedido = itens.filter(i => i.pedido_id === pedido.id);
                for (const item of itensPedido) {
                    doc.text(`  ${item.quantidade}x ${item.produto_nome} - ${formatarMoeda(item.preco_unitario)}`);
                }
                
                doc.text(`Total: ${formatarMoeda(pedido.total)}`, { align: 'right' });
                totalGeral += pedido.total;
                doc.moveDown(0.5);
            }
            
            doc.moveDown();
            doc.fontSize(14).fillColor('#333').text(`Faturamento Total: ${formatarMoeda(totalGeral)}`, { align: 'right', bold: true });
            
            doc.end();
        });
    }
}

module.exports = PDFService;
