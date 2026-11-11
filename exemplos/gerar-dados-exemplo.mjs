/*
 * Gera um conjunto completo de dados FICTÍCIOS para demonstrar o programa.
 *
 * Nada aqui vem de vendas, clientes ou parceiros reais: nomes, valores e
 * campanhas são sorteados com uma semente fixa (os arquivos saem sempre iguais).
 * Os arquivos seguem exatamente o formato exportado por cada plataforma:
 *   - Tray (vendas): CSV em ISO-8859-1 com ";"  (o formato que motivou o leitor universal)
 *   - Tray (visitas): XLSX com "170 de 4370 (3,89%)"
 *   - Google Analytics 4 (resumo e produtos): CSV com blocos de comentários "#"
 *   - Meta Ads: XLSX com linha de resumo
 *
 * Uso:  node exemplos/gerar-dados-exemplo.mjs
 * Saída: exemplos/dados/ (banco de parceiros + histórico mensal) e exemplos/planilhas/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
globalThis.XLSX = require(path.join(RAIZ, 'public/vendor/xlsx.full.min.js'));
const XLSX = globalThis.XLSX;

const importar = caminho => import(pathToFileURL(path.join(RAIZ, 'public/js', caminho)).href);
const { estadoAplicacao } = await importar('estado.js');
const { processarArquivoVendasTray } = await importar('processadores/vendas-tray.js');
const { processarArquivoResumoGa } = await importar('processadores/resumo-ga.js');
const { processarArquivoProdutosGa } = await importar('processadores/produtos-ga.js');
const { processarArquivoVisitasTray } = await importar('processadores/visitas-tray.js');
const { processarArquivoMetaAds } = await importar('processadores/meta-ads.js');
const { criarRegistroMemoria, formatarNomePeriodo } = await importar('relatorio/memoria.js');

/* ------------------------------------------------------------ Sorteio --- */

let semente = 20260911;
function aleatorio() {
    semente = (semente * 1664525 + 1013904223) % 4294967296;
    return semente / 4294967296;
}
const entre = (min, max) => min + aleatorio() * (max - min);
const inteiro = (min, max) => Math.floor(entre(min, max + 1));
const escolher = lista => lista[Math.floor(aleatorio() * lista.length)];

/* -------------------------------------------------------- Nomes falsos --- */

const PRENOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Íris', 'João', 'Larissa', 'Márcio', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sônia', 'Tiago', 'Vânia', 'Wesley'];
const SOBRENOMES = ['Albuquerque', 'Brandão', 'Cardoso', 'Damasceno', 'Esteves', 'Falcão', 'Guimarães', 'Henriques', 'Lacerda', 'Magalhães', 'Nogueira', 'Orleans', 'Peixoto', 'Quintela', 'Ribeiro', 'Simões', 'Toledo', 'Valença'];
const NEGOCIOS = ['Distribuidora', 'Atacado', 'Empório', 'Comercial', 'Embalagens', 'Depósito', 'Central'];
const TEMAS = ['Boa Mesa', 'Sabor Verde', 'Açaí & Cia', 'São João', 'Pão Dourado', 'Marmita Feliz', 'Grão Nobre', 'Café Paraíso', 'Delícias do Sertão', 'Horta Viva', 'Maré Alta', 'Cantinho Mineiro', 'Fogão à Lenha', 'Terra Nossa', 'Bom Prato', 'Ouro Preto', 'Vila Gourmet', 'Sol Nascente', 'Doce Lar', 'Estação Lanches'];
const UFS = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'BA', 'GO', 'PE', 'CE'];

const parceiros = [];
while (parceiros.length < 120) {
    const nome = `${escolher(NEGOCIOS)} ${escolher(TEMAS)} ${escolher(['LTDA', 'ME', 'EIRELI', ''])}`.trim().toUpperCase();
    if (!parceiros.includes(nome)) parceiros.push(nome);
}
const clienteFinal = () => `${escolher(PRENOMES)} ${escolher(SOBRENOMES)}`;

/* ----------------------------------------------------------- Produtos --- */

const PRODUTOS = [
    ['Pote kraft 500ml | 100 unidades', 92],
    ['Embalagem delivery 750ml biodegradável | 100 unidades', 118],
    ['Copo de papel 300ml | 50 unidades', 34],
    ['Bandeja de bagaço de cana 1kg | 200 unidades', 165],
    ['Talher de madeira kit | 250 unidades', 58],
    ['Sacola kraft média com alça | 100 unidades', 76],
    ['Marmita kraft 2 divisões | 100 unidades', 129],
    ['Tampa para copo 300ml | 100 unidades', 29],
    ['Canudo de papel embalado | 500 unidades', 47],
    ['Caixa para hambúrguer kraft | 100 unidades', 84],
    ['Pote para sorvete 240ml | 50 unidades', 39],
    ['Guardanapo reciclado | 2000 unidades', 61],
    ['Pote kraft 250ml | 100 unidades', 68],
    ['Pote kraft 1000ml | 50 unidades', 99],
    ['Copo de papel 500ml | 50 unidades', 44],
    ['Embalagem para pizza 35cm | 50 unidades', 112],
    ['Saco kraft para pão | 500 unidades', 53],
    ['Bowl de fibra 600ml | 100 unidades', 138],
    ['Prato de bagaço de cana 18cm | 100 unidades', 57],
    ['Hashi de bambu | 100 pares', 31],
    ['Caixa para doces 6 divisões | 50 unidades', 72],
    ['Copo térmico 240ml | 25 unidades', 27],
    ['Embalagem para salada 1L | 50 unidades', 88],
    ['Sacola kraft grande | 50 unidades', 95]
];

/* ------------------------------------------------- Cenário dos meses --- */

// Cada mês tem uma "história" diferente para a leitura de tendências ficar interessante.
const MESES = [
    { periodo: '2026-04', pedidos: 540, fatorParceiros: 1.00, google: 2400, meta: 1900, visitas: 3900 },
    { periodo: '2026-05', pedidos: 610, fatorParceiros: 1.06, google: 2700, meta: 2300, visitas: 4300 },
    { periodo: '2026-06', pedidos: 585, fatorParceiros: 1.02, google: 2600, meta: 2000, visitas: 4150 },
    { periodo: '2026-07', pedidos: 640, fatorParceiros: 1.10, google: 2650, meta: 1500, visitas: 4480 },
    { periodo: '2026-08', pedidos: 690, fatorParceiros: 1.15, google: 2700, meta: 1300, visitas: 4720 },
    { periodo: '2026-09', pedidos: 720, fatorParceiros: 1.18, google: 2300, meta: 1200, visitas: 4950 }
];

const SAIDA_DADOS = path.join(AQUI, 'dados');
const SAIDA_PLANILHAS = path.join(AQUI, 'planilhas');
fs.rmSync(SAIDA_DADOS, { recursive: true, force: true });
fs.rmSync(SAIDA_PLANILHAS, { recursive: true, force: true });
fs.mkdirSync(path.join(SAIDA_DADOS, 'memoria'), { recursive: true });

const diasNoMes = periodo => {
    const [ano, mes] = periodo.split('-').map(Number);
    return new Date(ano, mes, 0).getDate();
};
const dataBr = (periodo, dia) => `${String(dia).padStart(2, '0')}/${periodo.slice(5)}/${periodo.slice(0, 4)}`;
const decimalBr = valor => valor.toFixed(2).replace('.', ',');

/* ------------------------------------------------------- Gera um mês --- */

function gerarVendasTray(cenario) {
    const cabecalho = ['Pedido', 'Data', 'Hora', 'Nome do Cliente', 'Subtotal produtos', 'Impostos', 'Canal de venda', 'Frete valor', 'Status pedido', 'Desconto', 'Acréscimo forma', 'Cidade', 'Estado', 'Total', 'UTM Source'];
    const linhas = [cabecalho.join(';')];
    const dias = diasNoMes(cenario.periodo);
    let numero = 100000 + Number(cenario.periodo.replace('-', '')) % 10000 * 10;

    for (let i = 0; i < cenario.pedidos; i++) {
        const ehParceiro = aleatorio() < 0.4;
        const nome = ehParceiro ? escolher(parceiros) : clienteFinal();
        const subtotal = ehParceiro
            ? entre(350, 1500) * cenario.fatorParceiros
            : entre(90, 520);
        const desconto = aleatorio() < 0.2 ? subtotal * 0.05 : 0;
        const frete = ehParceiro || subtotal > 500 ? 0 : entre(25, 70);
        const pix = aleatorio() < 0.35 ? -(subtotal - desconto) * 0.02 : 0;
        const total = subtotal - desconto + frete + pix;
        const utm = ehParceiro
            ? (aleatorio() < 0.05 ? '1-Google Ads' : '')
            : escolher(['1-Google Ads', '1-Google Ads', '5-Google Ads', '', '', 'ig', 'chatgpt.com']);
        linhas.push([
            numero++,
            dataBr(cenario.periodo, inteiro(1, dias)),
            `${String(inteiro(7, 22)).padStart(2, '0')}:${String(inteiro(0, 59)).padStart(2, '0')}:00`,
            nome,
            decimalBr(subtotal),
            '0,00',
            ehParceiro ? escolher(['LOJA VIRTUAL', 'B2B_PORTAL']) : 'LOJA VIRTUAL',
            decimalBr(frete),
            escolher(['FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'ENVIADO', 'A ENVIAR']),
            decimalBr(desconto),
            decimalBr(pix),
            'Cidade Exemplo',
            escolher(UFS),
            decimalBr(total),
            utm
        ].join(';'));
    }

    // A Tray exporta em ISO-8859-1: os acentos ficam em um único byte.
    return Buffer.from(linhas.join('\r\n'), 'latin1');
}

function cabecalhoGa(titulo, periodo) {
    const fim = String(diasNoMes(periodo)).padStart(2, '0');
    const inicio = `${periodo.replace('-', '')}01`;
    return [
        '# ----------------------------------------',
        `# ${titulo}`,
        '# Conta: Loja de Demonstração',
        '# Propriedade: Site de Demonstração – GA4',
        '# ----------------------------------------',
        '#  '
    ].join('\n') + `\n__SEGMENTO__\n# Data de início: ${inicio}\n# Data de término: ${periodo.replace('-', '')}${fim}\n`;
}

function gerarResumoGa(cenario, receitaPagaProdutos) {
    const segmento = (nome, carrinhos, compras, receita) =>
        `# ${nome}\n# Data de início: ${cenario.periodo.replace('-', '')}01\n# Data de término: ${cenario.periodo.replace('-', '')}${diasNoMes(cenario.periodo)}\nAdicionar aos carrinhos,Compras,Receita de compra,ARPPU\n${carrinhos},${compras},${receita.toFixed(6)},${(receita / Math.max(compras, 1)).toFixed(6)}\n`;

    const compras = Math.round(cenario.pedidos * 0.78);
    const fatias = { direto: 0.32, organico: 0.21, pago: 0.29 };
    // A receita do tráfego pago fica próxima da soma dos produtos do tráfego pago,
    // como acontece nas exportações reais (a homologação confere essa coerência).
    const receita = (receitaPagaProdutos * entre(0.98, 1.03)) / fatias.pago;
    const partes = [
        cabecalhoGa('Resumo dos relatórios', cenario.periodo).split('__SEGMENTO__')[0],
        segmento('Todos os usuários', compras * 5, compras, receita),
        '\n',
        segmento('Tráfego direto', Math.round(compras * 5 * fatias.direto), Math.round(compras * fatias.direto), receita * fatias.direto),
        '\n',
        segmento('Tráfego orgânico', Math.round(compras * 5 * fatias.organico), Math.round(compras * fatias.organico), receita * fatias.organico),
        '\n',
        segmento('Tráfego pago', Math.round(compras * 5 * fatias.pago), Math.round(compras * fatias.pago), receita * fatias.pago)
    ];
    return Buffer.from(partes.join(''), 'utf8');
}

function gerarProdutosGa(cenario) {
    let receitaPaga = 0;
    const bloco = (nome, fator) => {
        const linhas = PRODUTOS.map(([produto, preco]) => {
            const comprados = Math.max(1, Math.round(entre(5, 160) * fator * (preco < 50 ? 1.6 : 1)));
            const receita = comprados * preco * entre(0.9, 1.05);
            if (nome === 'Tráfego pago') receitaPaga += receita;
            return `${produto},${Math.round(comprados * entre(6, 12))},${Math.round(comprados * entre(1.5, 3))},${comprados},${receita.toFixed(6)}`;
        });
        return `# ${nome}\n# Data de início: ${cenario.periodo.replace('-', '')}01\n# Data de término: ${cenario.periodo.replace('-', '')}${diasNoMes(cenario.periodo)}\nNome do item,Itens vistos,Itens adicionados ao carrinho,Itens comprados,Receita do item\n${linhas.join('\n')}\n`;
    };
    const cabecalho = cabecalhoGa('Compras de e-commerce', cenario.periodo).split('__SEGMENTO__')[0];
    const conteudo = `${cabecalho}${bloco('Todos os usuários', 2.4)}\n${bloco('Tráfego direto', 0.9)}\n${bloco('Tráfego pago', 1)}`;
    return { arquivo: Buffer.from(conteudo, 'utf8'), receitaPaga };
}

function gerarVisitas(cenario) {
    const dias = diasNoMes(cenario.periodo);
    const visitasDia = Array.from({ length: dias }, () => entre(0.7, 1.3));
    const somaPesos = visitasDia.reduce((a, b) => a + b, 0);
    const visitas = visitasDia.map(peso => Math.round((peso / somaPesos) * cenario.visitas));
    const totalVisitas = visitas.reduce((a, b) => a + b, 0);
    const pageviews = visitas.map(v => Math.round(v * entre(4, 5.5)));
    const totalPageviews = pageviews.reduce((a, b) => a + b, 0);
    const pedidos = visitas.map(v => Math.round(v * entre(0.12, 0.17)));
    const totalPedidos = pedidos.reduce((a, b) => a + b, 0);
    const pct = (parte, total) => `${((parte / total) * 100).toFixed(2).replace('.', ',')}%`;

    const linhas = [['Data', 'Visitas', 'Pageviews', 'Pedidos iniciados', 'Conversão']];
    for (let dia = 1; dia <= dias; dia++) {
        const i = dia - 1;
        linhas.push([
            `${cenario.periodo}-${String(dia).padStart(2, '0')} 00:00:00`,
            `${visitas[i]} de ${totalVisitas} (${pct(visitas[i], totalVisitas)})`,
            `${pageviews[i]} de ${totalPageviews} (${pct(pageviews[i], totalPageviews)})`,
            `${pedidos[i]} de ${totalPedidos} (${pct(pedidos[i], totalPedidos)})`,
            `${((pedidos[i] / Math.max(visitas[i], 1)) * 100).toFixed(2).replace('.', ',')} %`
        ]);
    }
    linhas.push(['TOTAL', String(totalVisitas), String(totalPageviews), String(totalPedidos), `${((totalPedidos / totalVisitas) * 100).toFixed(2).replace('.', ',')} %`]);
    return planilhaXlsx(linhas);
}

function gerarMeta(cenario) {
    const gasto = cenario.meta * entre(0.62, 0.7);
    const campanhas = ['Remarketing catálogo', 'Prospecção delivery', 'Branding reels'];
    const pesos = [0.45, 0.35, 0.2];
    const fim = `${cenario.periodo}-${diasNoMes(cenario.periodo)}`;
    const cab = ['Nome da campanha', 'Nome da conta', 'Veiculação do anúncio', 'Alcance', 'Impressões', 'Cliques (todos)', 'Moeda', 'CPC (todos)', 'Valor usado (BRL)', 'Início', 'Término', 'Compras', 'Início dos relatórios', 'Encerramento dos relatórios'];
    const linhasCampanha = campanhas.map((nome, i) => {
        const valor = gasto * pesos[i];
        const cliques = Math.round(valor / entre(1.1, 1.8));
        return [nome, 'Conta Demonstração', 'active', Math.round(valor * entre(180, 260)), Math.round(valor * entre(300, 420)), cliques, 'BRL', +(valor / cliques).toFixed(4), +valor.toFixed(2), `${cenario.periodo}-01`, fim, Math.round(valor / entre(9, 16)), `${cenario.periodo}-01`, fim];
    });
    const soma = indice => linhasCampanha.reduce((t, linha) => t + Number(linha[indice]), 0);
    const resumo = ['', '', '', soma(3), soma(4), soma(5), 'BRL', +(soma(8) / soma(5)).toFixed(4), +soma(8).toFixed(2), '', '', soma(11), `${cenario.periodo}-01`, fim];
    return planilhaXlsx([cab, resumo, ...linhasCampanha]);
}

function planilhaXlsx(linhas) {
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), 'Planilha1');
    return XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
}

/* ------------------------------------------------------------ Execução --- */

estadoAplicacao.parceiros = parceiros;
fs.writeFileSync(path.join(SAIDA_DADOS, 'banco-distribuidores.json'), JSON.stringify(parceiros, null, 2));

const NOMES_MES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const ultimo = MESES[MESES.length - 1].periodo;

for (const cenario of MESES) {
    const nomeMes = NOMES_MES[Number(cenario.periodo.slice(5)) - 1];
    const pasta = path.join(SAIDA_PLANILHAS, cenario.periodo);
    fs.mkdirSync(pasta, { recursive: true });

    const vendas = gerarVendasTray(cenario);
    const resultadoVendas = await processarArquivoVendasTray(new Uint8Array(vendas), parceiros, cenario.google + cenario.meta, cenario.periodo);
    const produtos = gerarProdutosGa(cenario);
    const arquivos = {
        [`VENDAS_${nomeMes}_TRAY.csv`]: vendas,
        [`Resumo_GA4_${nomeMes}.csv`]: gerarResumoGa(cenario, produtos.receitaPaga),
        [`Compras_de_e-commerce_${nomeMes}.csv`]: produtos.arquivo,
        [`FLUXO_${nomeMes}.xlsx`]: gerarVisitas(cenario),
        [`Relatorio_meta_${nomeMes}.xlsx`]: gerarMeta(cenario)
    };
    for (const [nome, conteudo] of Object.entries(arquivos)) {
        fs.writeFileSync(path.join(pasta, nome), conteudo);
    }

    // Os meses anteriores ao último entram no histórico, como se já tivessem
    // sido processados pelo programa. O último fica para a demonstração.
    if (cenario.periodo === ultimo) continue;

    const ler = nome => new Uint8Array(arquivos[nome]);
    const nomes = Object.keys(arquivos);
    const relatorio = {
        periodo: cenario.periodo,
        periodoFormatado: formatarNomePeriodo(cenario.periodo),
        quantidadeParceirosCadastrados: parceiros.length,
        investimentos: { investimentoGoogle: cenario.google, investimentoMeta: cenario.meta, investimentoTotal: cenario.google + cenario.meta },
        informacoesDoPeriodo: {
            decisoes: 'Manter o orçamento do Google Ads concentrado em campanhas de pesquisa com intenção de compra.',
            proximosPassos: 'Acompanhar a conversão da loja e testar uma nova campanha de remarketing no Meta Ads.'
        },
        resultados: {
            vendasAtual: resultadoVendas,
            gaResumo: await processarArquivoResumoGa(ler(nomes[1]), cenario.periodo),
            produtos: await processarArquivoProdutosGa(ler(nomes[2]), cenario.periodo),
            visitas: await processarArquivoVisitasTray(ler(nomes[3]), cenario.periodo),
            metaAds: await processarArquivoMetaAds(ler(nomes[4]), cenario.periodo)
        }
    };
    const registro = criarRegistroMemoria(relatorio);
    registro.origem = 'dados-ficticios-de-demonstracao';
    registro.analises = {
        conclusao: `Em ${relatorio.periodoFormatado}, o faturamento seguiu concentrado na rede de parceiros, enquanto as vendas sem parceiros mantiveram um patamar estável. (Texto fictício de demonstração.)`
    };
    fs.writeFileSync(path.join(SAIDA_DADOS, 'memoria', `${cenario.periodo}.json`), JSON.stringify(registro, null, 1));
    console.log(`${cenario.periodo}: faturamento ${resultadoVendas.fatGeral.toFixed(2)} | parceiros ${(resultadoVendas.fatParceiros / resultadoVendas.fatGeral * 100).toFixed(1)}%`);
}

console.log(`\nDados fictícios gerados em:\n  ${SAIDA_DADOS}\n  ${SAIDA_PLANILHAS}`);
console.log(`Arraste os arquivos de exemplos/planilhas/${ultimo} na tela "Montar Relatório".`);
