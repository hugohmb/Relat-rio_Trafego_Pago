import { converterParaNumero, lerPlanilhaAsync } from '../utilitarios.js';

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^#+\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function textoDaLinha(linha) {
    return Array.isArray(linha)
        ? linha.map(celula => String(celula ?? '')).join(' ').trim()
        : String(linha ?? '').trim();
}

function localizarIndice(cabecalhoNormalizado, aliases) {
    return cabecalhoNormalizado.findIndex(item => aliases.includes(item));
}

function localizarColunas(cabecalho) {
    const normalizado = cabecalho.map(normalizarTexto);
    const indices = {
        nome: localizarIndice(normalizado, ['nome do item', 'item', 'produto']),
        vistos: localizarIndice(normalizado, ['itens vistos', 'visualizacoes do item', 'visualizacoes']),
        carrinho: localizarIndice(normalizado, [
            'itens adicionados ao carrinho',
            'adicoes ao carrinho',
            'adicionados ao carrinho'
        ]),
        comprados: localizarIndice(normalizado, [
            'itens comprados',
            'quantidade comprada',
            'compras'
        ]),
        receita: localizarIndice(normalizado, [
            'receita do item',
            'receita de item',
            'receita'
        ])
    };

    const obrigatorias = ['nome', 'comprados', 'receita'];
    const ausentes = obrigatorias.filter(chave => indices[chave] === -1);

    if (ausentes.length) {
        const rotulos = {
            nome: 'Nome do item',
            comprados: 'Itens comprados',
            receita: 'Receita do item'
        };
        throw new Error(
            `Colunas obrigatórias não encontradas no bloco de Tráfego pago: ` +
            `${ausentes.map(chave => rotulos[chave]).join(', ')}.`
        );
    }

    return indices;
}

function extrairDataComentario(texto, tipo) {
    const normalizado = normalizarTexto(texto);
    const marcador = tipo === 'inicio' ? 'data de inicio' : 'data de termino';
    if (!normalizado.includes(marcador)) return '';

    const correspondencia = String(texto ?? '').match(/(20\d{2})[\/-]?(\d{2})[\/-]?(\d{2})/);
    return correspondencia
        ? `${correspondencia[1]}-${correspondencia[2]}-${correspondencia[3]}`
        : '';
}

function validarPeriodo(dataInicial, dataFinal, periodoEsperado) {
    if (!periodoEsperado || !/^\d{4}-\d{2}$/.test(periodoEsperado)) return;

    const divergente = [dataInicial, dataFinal]
        .filter(Boolean)
        .find(data => !data.startsWith(periodoEsperado));

    if (divergente) {
        throw new Error(
            `A planilha de produtos pertence ao período ${divergente.slice(0, 7)}, ` +
            `mas o relatório está configurado para ${periodoEsperado}.`
        );
    }
}

function calcularTaxa(numerador, denominador) {
    return denominador > 0 ? (numerador / denominador) * 100 : 0;
}

function consolidarProdutos(produtos) {
    const mapa = new Map();

    produtos.forEach(produto => {
        const chave = normalizarTexto(produto.nome);
        const existente = mapa.get(chave);

        if (!existente) {
            mapa.set(chave, { ...produto });
            return;
        }

        existente.itensVistos += produto.itensVistos;
        existente.itensAdicionadosCarrinho += produto.itensAdicionadosCarrinho;
        existente.itensComprados += produto.itensComprados;
        existente.receita += produto.receita;
    });

    return [...mapa.values()].map(produto => ({
        ...produto,
        taxaCarrinhoPorVisualizacao: calcularTaxa(
            produto.itensAdicionadosCarrinho,
            produto.itensVistos
        ),
        taxaCompraPorCarrinho: calcularTaxa(
            produto.itensComprados,
            produto.itensAdicionadosCarrinho
        ),
        taxaCompraPorVisualizacao: calcularTaxa(
            produto.itensComprados,
            produto.itensVistos
        ),
        receitaMediaPorItem: produto.itensComprados > 0
            ? produto.receita / produto.itensComprados
            : 0
    }));
}

function compararProdutos(a, b) {
    if (b.itensComprados !== a.itensComprados) {
        return b.itensComprados - a.itensComprados;
    }

    if (b.receita !== a.receita) {
        return b.receita - a.receita;
    }

    return a.nome.localeCompare(b.nome, 'pt-BR');
}

export function processarLinhasProdutosGa(linhas, periodoEsperado = '') {
    if (!Array.isArray(linhas) || linhas.length < 2) {
        throw new Error('A planilha de produtos está vazia ou sem dados utilizáveis.');
    }

    const indiceBlocoPago = linhas.findIndex(linha =>
        normalizarTexto(textoDaLinha(linha)).includes('trafego pago')
    );

    if (indiceBlocoPago === -1) {
        throw new Error('O bloco "Tráfego pago" não foi encontrado na planilha de produtos.');
    }

    let dataInicial = '';
    let dataFinal = '';
    let indiceCabecalho = -1;

    for (let indice = indiceBlocoPago + 1; indice < linhas.length; indice++) {
        const linha = linhas[indice];
        const texto = textoDaLinha(linha);

        dataInicial ||= extrairDataComentario(texto, 'inicio');
        dataFinal ||= extrairDataComentario(texto, 'termino');

        if (Array.isArray(linha)) {
            const normalizada = linha.map(normalizarTexto);
            const possuiNome = normalizada.includes('nome do item');
            const possuiComprados = normalizada.includes('itens comprados');
            const possuiReceita = normalizada.includes('receita do item');

            if (possuiNome && possuiComprados && possuiReceita) {
                indiceCabecalho = indice;
                break;
            }
        }
    }

    if (indiceCabecalho === -1) {
        throw new Error('Não foi possível localizar o cabeçalho do bloco de Tráfego pago.');
    }

    validarPeriodo(dataInicial, dataFinal, periodoEsperado);

    const indices = localizarColunas(linhas[indiceCabecalho]);
    const produtosLidos = [];
    let linhasIgnoradas = 0;

    for (let indice = indiceCabecalho + 1; indice < linhas.length; indice++) {
        const linha = linhas[indice];
        if (!Array.isArray(linha) || linha.every(celula => String(celula ?? '').trim() === '')) {
            continue;
        }

        const primeiraCelulaBruta = String(linha[0] ?? '').trim();
        const primeiraCelula = normalizarTexto(primeiraCelulaBruta);
        if (primeiraCelulaBruta.startsWith('#') || primeiraCelula.includes('todos os usuarios')) {
            break;
        }

        const nome = String(linha[indices.nome] ?? '').replace(/\s+/g, ' ').trim();
        const itensComprados = Math.max(0, converterParaNumero(linha[indices.comprados]));
        const receita = Math.max(0, converterParaNumero(linha[indices.receita]));

        if (
            receita > 1_000_000 &&
            receita / Math.max(1, itensComprados) > 100_000
        ) {
            throw new Error(
                `A receita do produto "${nome || 'não identificado'}" perdeu o separador decimal durante a conversão para XLSX. ` +
                'Use o arquivo CSV original exportado pelo Google Analytics, sem abrir e salvar novamente no Excel.'
            );
        }

        const itensVistos = indices.vistos === -1
            ? 0
            : Math.max(0, converterParaNumero(linha[indices.vistos]));
        const itensAdicionadosCarrinho = indices.carrinho === -1
            ? 0
            : Math.max(0, converterParaNumero(linha[indices.carrinho]));

        if (!nome) {
            linhasIgnoradas++;
            continue;
        }

        if (itensComprados <= 0) {
            continue;
        }

        produtosLidos.push({
            nome,
            itensVistos,
            itensAdicionadosCarrinho,
            itensComprados,
            receita
        });
    }

    if (!produtosLidos.length) {
        throw new Error('Nenhum produto com compra foi encontrado no bloco de Tráfego pago.');
    }

    const produtosComCompra = consolidarProdutos(produtosLidos).sort(compararProdutos);
    const produtosTop20 = produtosComCompra.slice(0, 20).map((produto, indice) => ({
        ...produto,
        posicao: indice + 1
    }));

    const totais = produtosComCompra.reduce((acumulado, produto) => ({
        itensComprados: acumulado.itensComprados + produto.itensComprados,
        receita: acumulado.receita + produto.receita
    }), { itensComprados: 0, receita: 0 });

    const totaisTop20 = produtosTop20.reduce((acumulado, produto) => ({
        itensComprados: acumulado.itensComprados + produto.itensComprados,
        receita: acumulado.receita + produto.receita
    }), { itensComprados: 0, receita: 0 });

    const avisos = [];
    if (!dataInicial || !dataFinal) {
        avisos.push('O período não foi encontrado nos comentários da planilha.');
    }
    if (produtosTop20.length < 20) {
        avisos.push(`Foram encontrados apenas ${produtosTop20.length} produtos com compras.`);
    }
    if (linhasIgnoradas) {
        avisos.push(`${linhasIgnoradas} linha(s) sem nome de produto foram ignoradas.`);
    }

    return {
        origem: 'Tráfego pago',
        periodoDetectado: dataInicial ? dataInicial.slice(0, 7) : '',
        dataInicial,
        dataFinal,
        quantidadeProdutosComCompra: produtosComCompra.length,
        quantidadeProdutosSelecionados: produtosTop20.length,
        totalItensComprados: totais.itensComprados,
        receitaTotal: totais.receita,
        totalItensTop20: totaisTop20.itensComprados,
        receitaTop20: totaisTop20.receita,
        participacaoTop20Itens: calcularTaxa(totaisTop20.itensComprados, totais.itensComprados),
        participacaoTop20Receita: calcularTaxa(totaisTop20.receita, totais.receita),
        produtosTop20,
        pagina1: produtosTop20.slice(0, 10),
        pagina2: produtosTop20.slice(10, 20),
        grafico: {
            labels: produtosTop20.slice(0, 10).map(produto => produto.nome),
            itensComprados: produtosTop20.slice(0, 10).map(produto => produto.itensComprados),
            receita: produtosTop20.slice(0, 10).map(produto => produto.receita)
        },
        avisos
    };
}

export async function processarArquivoProdutosGa(arquivo, periodoEsperado = '') {
    const linhas = await lerPlanilhaAsync(arquivo);
    return processarLinhasProdutosGa(linhas, periodoEsperado);
}
