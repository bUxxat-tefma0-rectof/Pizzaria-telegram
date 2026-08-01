const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let db = null;

function getDatabase() {
    if (!db) {
        const dbPath = process.env.DATABASE_PATH || './pizzaria.db';
        const dir = path.dirname(dbPath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

async function initDatabase() {
    const db = getDatabase();
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id BIGINT UNIQUE NOT NULL,
            nome TEXT,
            email TEXT,
            email_verificado INTEGER DEFAULT 0,
            codigo_email TEXT,
            telefone TEXT,
            cep TEXT,
            logradouro TEXT,
            numero TEXT,
            complemento TEXT,
            bairro TEXT,
            cidade TEXT,
            estado TEXT,
            latitude REAL,
            longitude REAL,
            unidade_proxima_id INTEGER,
            total_gasto REAL DEFAULT 0,
            fidelidade_pontos INTEGER DEFAULT 0,
            bloqueado INTEGER DEFAULT 0,
            etapa_cadastro TEXT DEFAULT 'inicio',
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (unidade_proxima_id) REFERENCES unidades(id)
        );

        CREATE TABLE IF NOT EXISTS unidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cidade TEXT NOT NULL,
            estado TEXT NOT NULL,
            bairro TEXT,
            logradouro TEXT,
            numero TEXT,
            cep TEXT,
            latitude REAL,
            longitude REAL,
            raio_entrega REAL DEFAULT 10.0,
            taxa_entrega REAL DEFAULT 8.0,
            pedido_minimo REAL DEFAULT 30.0,
            telefone TEXT,
            whatsapp TEXT,
            horario_abertura TEXT DEFAULT '18:00',
            horario_fechamento TEXT DEFAULT '23:00',
            dias_funcionamento TEXT DEFAULT '1,2,3,4,5,6,7',
            ativo INTEGER DEFAULT 1,
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            emoji TEXT DEFAULT '🍕',
            ordem INTEGER DEFAULT 0,
            ativo INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER,
            nome TEXT NOT NULL,
            descricao TEXT,
            ingredientes TEXT,
            foto TEXT,
            disponivel INTEGER DEFAULT 1,
            ordem INTEGER DEFAULT 0,
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        );

        CREATE TABLE IF NOT EXISTS tamanhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER,
            nome TEXT NOT NULL,
            preco REAL NOT NULL,
            fatias INTEGER DEFAULT 8,
            ativo INTEGER DEFAULT 1,
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );

        CREATE TABLE IF NOT EXISTS bordas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco REAL DEFAULT 0,
            ativo INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS adicionais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco REAL DEFAULT 0,
            categoria TEXT DEFAULT 'geral',
            disponivel INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS carrinhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            produto_id INTEGER,
            tamanho_id INTEGER,
            borda_id INTEGER,
            quantidade INTEGER DEFAULT 1,
            observacao TEXT,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );

        CREATE TABLE IF NOT EXISTS carrinho_adicionais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            carrinho_id INTEGER,
            adicional_id INTEGER,
            FOREIGN KEY (carrinho_id) REFERENCES carrinhos(id),
            FOREIGN KEY (adicional_id) REFERENCES adicionais(id)
        );

        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            cliente_id INTEGER NOT NULL,
            unidade_id INTEGER,
            status TEXT DEFAULT 'recebido',
            subtotal REAL,
            taxa_entrega REAL DEFAULT 0,
            desconto REAL DEFAULT 0,
            total REAL,
            cupom TEXT,
            pagamento_metodo TEXT,
            pagamento_id TEXT,
            pagamento_status TEXT DEFAULT 'pendente',
            pagamento_qrcode TEXT,
            observacao TEXT,
            data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
            data_entrega DATETIME,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (unidade_id) REFERENCES unidades(id)
        );

        CREATE TABLE IF NOT EXISTS itens_pedido (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER,
            produto_nome TEXT,
            tamanho_nome TEXT,
            borda_nome TEXT,
            adicionais TEXT,
            quantidade INTEGER DEFAULT 1,
            preco_unitario REAL,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        );

        CREATE TABLE IF NOT EXISTS cupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE NOT NULL,
            tipo TEXT DEFAULT 'percentual',
            valor REAL NOT NULL,
            uso_maximo INTEGER DEFAULT 100,
            uso_atual INTEGER DEFAULT 0,
            valido_ate DATETIME,
            ativo INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS avaliacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER,
            cliente_id INTEGER,
            nota INTEGER CHECK(nota >= 1 AND nota <= 5),
            comentario TEXT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id BIGINT,
            acao TEXT NOT NULL,
            detalhes TEXT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Insere dados padrão se estiver vazio
    const categorias = db.prepare('SELECT COUNT(*) as total FROM categorias').get();
    if (categorias.total === 0) {
        inserirDadosPadrao(db);
    }
    
    logger.info('✅ Tabelas criadas e dados padrão inseridos');
}

function inserirDadosPadrao(db) {
    const insertCategoria = db.prepare('INSERT INTO categorias (nome, emoji, ordem) VALUES (?, ?, ?)');
    insertCategoria.run('Pizzas Tradicionais', '🍕', 1);
    insertCategoria.run('Pizzas Especiais', '🍕', 2);
    insertCategoria.run('Pizzas Doces', '🍫', 3);
    insertCategoria.run('Bebidas', '🥤', 4);
    insertCategoria.run('Porções', '🍟', 5);
    insertCategoria.run('Sobremesas', '🍰', 6);
    
    const insertBorda = db.prepare('INSERT INTO bordas (nome, preco) VALUES (?, ?)');
    insertBorda.run('Sem Borda', 0);
    insertBorda.run('Catupiry', 8);
    insertBorda.run('Cheddar', 7);
    insertBorda.run('Chocolate', 10);
    
    const insertAdicional = db.prepare('INSERT INTO adicionais (nome, preco, categoria) VALUES (?, ?, ?)');
    insertAdicional.run('Bacon', 5, 'carnes');
    insertAdicional.run('Catupiry', 4, 'queijos');
    insertAdicional.run('Muçarela', 4, 'queijos');
    insertAdicional.run('Calabresa', 5, 'carnes');
    insertAdicional.run('Cebola', 3, 'vegetais');
    insertAdicional.run('Tomate', 3, 'vegetais');
    insertAdicional.run('Azeitona', 3, 'extras');
    insertAdicional.run('Orégano', 2, 'temperos');
    
    // Produto de exemplo
    const insertProduto = db.prepare('INSERT INTO produtos (categoria_id, nome, descricao, ingredientes, foto) VALUES (?, ?, ?, ?, ?)');
    const info = insertProduto.run(1, 'Calabresa', 'Pizza de calabresa com queijo', 'Calabresa, Queijo, Molho de tomate', 'https://i.imgur.com/example.jpg');
    
    const insertTamanho = db.prepare('INSERT INTO tamanhos (produto_id, nome, preco, fatias) VALUES (?, ?, ?, ?)');
    insertTamanho.run(info.lastInsertRowid, 'Broto', 29.90, 4);
    insertTamanho.run(info.lastInsertRowid, 'Média', 39.90, 6);
    insertTamanho.run(info.lastInsertRowid, 'Grande', 49.90, 8);
    insertTamanho.run(info.lastInsertRowid, 'Família', 59.90, 12);
    
    // Unidade de exemplo
    const insertUnidade = db.prepare('INSERT INTO unidades (nome, cidade, estado, bairro, logradouro, numero, latitude, longitude, taxa_entrega) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertUnidade.run('Pizzaria Central', 'Paranavaí', 'PR', 'Centro', 'Rua Principal', '100', -23.0775, -52.4636, 8.0);
}

module.exports = { getDatabase, initDatabase };
