// Abre o programa no navegador com os dados FICTÍCIOS de exemplos/dados.
// Uso: npm run demo  →  http://localhost:3000
const path = require('path');
const fs = require('fs');

const dados = path.join(__dirname, 'dados');
if (!fs.existsSync(path.join(dados, 'banco-distribuidores.json'))) {
    console.error('Dados de exemplo não encontrados. Rode antes: npm run dados-exemplo');
    process.exit(1);
}

process.env.AUTOMACAO_DATA_DIR = dados;
process.env.AUTOMACAO_CONFIG_DIR = path.join(__dirname, 'config');

require('../server.js').iniciarServidor().then(({ port }) => {
    console.log(`\nDemonstração aberta em http://localhost:${port}`);
    console.log('Arraste os arquivos de exemplos/planilhas/2026-09 na aba "Montar Relatório".');
});
