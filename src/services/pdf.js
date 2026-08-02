const PDFDocument = require('pdfkit');
const { formatarMoeda, formatarData } = require('../utils/helpers');

class PDFService {
    
    static gerarRelatorioPedidos(pedidos, itens) {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        
        return new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
            
            // Cabeçalho
            doc.fontSize(20).text('🍕 Relatório de Pedidos', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).text(`Gerado em: ${formatarData(new Date())}`, { align: 'center' });
            doc.moveDown(2);
            
            let totalGeral = 0;
            
            for (const pedido of pedidos) {
                doc.fontSize(14).text(`Pedido ${pedido.numero}`, { underline: true });
                doc.fontSize(10)
                    .text(`Status: ${pedido.status}`)
                    .text(`Pagamento: ${pedido.pagamento_status}`)
                    .text(`Data: ${formatarData(pedido.data_pedido)}`);
                
                // Itens
                const itensPedido = itens.filter(i => i.pedido_id === pedido.id);
                for (const item of itensPedido) {
                    doc.text(`  ${item.quantidade}x ${item.produto_nome} - ${item.tamanho_nome} - ${formatarMoeda(item.preco_unitario)}`);
                }
                
                doc.text(`Total: ${formatarMoeda(pedido.total)}`);
                totalGeral += pedido.total;
                doc.moveDown();
            }
            
            doc.moveDown();
            doc.fontSize(14).text(`Total Geral: ${formatarMoeda(totalGeral)}`, { bold: true });
            
            doc.end();
        });
    }
}

module.exports = PDFService;
