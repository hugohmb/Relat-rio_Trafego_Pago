import {
    converterParaNumero,
    lerPlanilhaAsync,
    normalizarCabecalho,
    normalizarNome
} from '../utilitarios.js';

function converterDataExcel(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Date(Date.UTC(
            valor.getFullYear(),
            valor.getMonth(),
            valor.getDate()
        ));
    }

    if (typeof valor === 'number' && Number.isFinite(valor)) {
        return new Date(Date.UTC(1899, 11, 30) + Math.round(valor * 86400000));
    }

    const texto = String(valor ?? '').trim();
    if (!texto) return null;

    const br = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (br) {
        const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
        return new Date(Date.UTC(ano, Number(br[2]) - 1, Number(br[1])));
    }

    const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
        return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    }

    const data = new Date(texto);
    return Number.isNaN(data.getTime())
        ? null
        : new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
}

function formatarIso(data) {
    return data?.toISOString().slice(0, 10) || '';
}

function validarPeriodo(datas, periodoEsperado) {
    if (!periodoEsperado || !/^\d{4}-\d{2}$/.test(periodoEsperado)) return;

    const divergente = datas.find(data => !formatarIso(data).startsWith(periodoEsperado));
    if (divergente) {
        throw new Error(
            `A planilha de vendas contém dados de ${formatarIso(divergente).slice(0, 7)}, ` +
            `mas o período esperado é ${periodoEsperado}.`
        );
    }
}

export function processarLinhasVendasTray(linhas, parceiros, periodoEsperado = '') {
    if (!Array.isArray(linhas) || linhas.length === 0) {
        throw new Error('A planilha está vazia.');
    }

    const cabecalho = linhas[0].map(normalizarCabecalho);
    const idxTotal = cabecalho.indexOf('Total');
    const idxCliente = cabecalho.indexOf('Nome do Cliente');
    const idxImpostos = cabecalho.indexOf('Impostos');
    const idxDesconto = cabecalho.indexOf('Desconto');
    const idxFrete = cabecalho.indexOf('Frete valor');
    const idxData = cabecalho.indexOf('Data');
    const idxCanal = cabecalho.indexOf('Canal de venda');
    const idxUtm = cabecalho.indexOf('UTM Source');
    const idxStatus = cabecalho.indexOf('Status pedido');
    const idxPedido = cabecalho.indexOf('Pedido');

    if (idxTotal === -1 || idxCliente === -1) {
        throw new Error(
            "As colunas obrigatórias 'Total' e 'Nome do Cliente' não foram encontradas."
        );
    }

    const parceirosNormalizados = new Set(
        (Array.isArray(parceiros) ? parceiros : []).map(normalizarNome).filter(Boolean)
    );

    let fatGeral = 0;
    let fatParceiros = 0;
    let qtdGeral = 0;
    let qtdParceiros = 0;
    let totalImpostos = 0;
    let totalDescontos = 0;
    let totalFrete = 0;
    let linhasIgnoradas = 0;
    let nomesComCaractereInvalido = 0;
    const datas = [];
    const pedidos = [];
    const porCanal = {};
    const porOrigemUtm = {};
    const porStatus = {};
    const pedidosVistos = new Set();
    let pedidosDuplicados = 0;

    const acumular = (mapa, chave, valor, parceiro) => {
        const nome = String(chave || '').trim() || 'Não informado';
        mapa[nome] ||= { faturamento: 0, pedidos: 0, faturamentoParceiros: 0, pedidosParceiros: 0 };
        mapa[nome].faturamento += valor;
        mapa[nome].pedidos += 1;
        if (parceiro) {
            mapa[nome].faturamentoParceiros += valor;
            mapa[nome].pedidosParceiros += 1;
        }
    };

    for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!Array.isArray(linha)) {
            linhasIgnoradas++;
            continue;
        }

        const total = converterParaNumero(linha[idxTotal]);
        const impostos = idxImpostos !== -1
            ? converterParaNumero(linha[idxImpostos])
            : 0;
        const desconto = idxDesconto !== -1
            ? converterParaNumero(linha[idxDesconto])
            : 0;
        const frete = idxFrete !== -1
            ? converterParaNumero(linha[idxFrete])
            : 0;

        // A coluna Total da Tray já considera o desconto.
        // O faturamento de produtos exclui impostos e frete.
        const valorLiquido = total - Math.abs(impostos) - Math.abs(frete);

        if (!Number.isFinite(total) || total === 0 || !Number.isFinite(valorLiquido)) {
            linhasIgnoradas++;
            continue;
        }

        let dataPedido = null;
        if (idxData !== -1) {
            dataPedido = converterDataExcel(linha[idxData]);
            if (dataPedido) datas.push(dataPedido);
        }

        if (idxPedido !== -1) {
            const numeroPedido = String(linha[idxPedido] ?? '').trim();
            if (numeroPedido && pedidosVistos.has(numeroPedido)) pedidosDuplicados++;
            if (numeroPedido) pedidosVistos.add(numeroPedido);
        }

        fatGeral += valorLiquido;
        totalImpostos += Math.abs(impostos);
        totalDescontos += Math.abs(desconto);
        totalFrete += Math.abs(frete);
        qtdGeral++;

        const nomeCliente = normalizarNome(linha[idxCliente]);
        if (nomeCliente.includes('\uFFFD')) nomesComCaractereInvalido++;
        const ehParceiro = parceirosNormalizados.has(nomeCliente);
        if (ehParceiro) {
            fatParceiros += valorLiquido;
            qtdParceiros++;
        }

        const canal = idxCanal !== -1 ? String(linha[idxCanal] ?? '').trim() : '';
        const origemUtm = idxUtm !== -1 ? String(linha[idxUtm] ?? '').trim() : '';
        const status = idxStatus !== -1 ? String(linha[idxStatus] ?? '').trim() : '';
        acumular(porCanal, canal, valorLiquido, ehParceiro);
        acumular(porOrigemUtm, agruparOrigemUtm(origemUtm), valorLiquido, ehParceiro);
        acumular(porStatus, status, valorLiquido, ehParceiro);

        // Versão compacta do pedido: permite recalcular este mês no futuro com o
        // banco de parceiros atualizado, sem precisar reenviar a planilha.
        pedidos.push([
            nomeCliente,
            Math.round(valorLiquido * 100) / 100,
            formatarIso(dataPedido),
            canal,
            origemUtm
        ]);
    }

    if (!qtdGeral) {
        throw new Error('Nenhuma venda válida foi encontrada na planilha da Tray.');
    }

    validarPeriodo(datas, periodoEsperado);

    const datasOrdenadas = [...datas].sort((a, b) => a - b);
    const dataInicial = formatarIso(datasOrdenadas[0]);
    const dataFinal = formatarIso(datasOrdenadas[datasOrdenadas.length - 1]);
    const periodosDetectados = [...new Set(datas.map(data => formatarIso(data).slice(0, 7)))];
    const avisos = [];

    if (idxData === -1) {
        avisos.push('A coluna Data não foi encontrada; o mês da planilha de vendas não pôde ser conferido.');
    } else if (!datas.length) {
        avisos.push('Nenhuma data válida foi encontrada na planilha de vendas.');
    }

    if (periodosDetectados.length > 1) {
        avisos.push(`A planilha contém vendas de mais de um mês: ${periodosDetectados.join(', ')}.`);
    }

    if (linhasIgnoradas > 0) {
        avisos.push(`${linhasIgnoradas} linha(s) sem venda válida foram ignoradas.`);
    }

    if (nomesComCaractereInvalido > 0) {
        avisos.push(
            `${nomesComCaractereInvalido} nome(s) de cliente contêm caracteres corrompidos (�). ` +
            'Esses clientes podem não ser reconhecidos como parceiros. Exporte novamente a planilha da Tray.'
        );
    }

    if (pedidosDuplicados > 0) {
        avisos.push(`${pedidosDuplicados} número(s) de pedido aparecem repetidos na planilha.`);
    }

    const googleAds = porOrigemUtm['Google Ads'] || null;

    return {
        fatGeral,
        fatParceiros,
        fatSemParceiros: fatGeral - fatParceiros,
        qtdGeral,
        qtdParceiros,
        qtdSemParceiros: qtdGeral - qtdParceiros,
        totalImpostos,
        totalDescontos,
        totalFrete,
        criterioReceita: 'Total menos Impostos e Frete; Desconto não é subtraído novamente.',
        freteExcluidoDaReceita: true,
        periodoDetectado: periodosDetectados.length === 1 ? periodosDetectados[0] : '',
        periodosDetectados,
        dataInicial,
        dataFinal,
        linhasIgnoradas,
        porCanal,
        porOrigemUtm,
        porStatus,
        vendasUtmGoogleAds: googleAds ? {
            faturamento: googleAds.faturamento,
            pedidos: googleAds.pedidos,
            faturamentoSemParceiros: googleAds.faturamento - googleAds.faturamentoParceiros,
            pedidosSemParceiros: googleAds.pedidos - googleAds.pedidosParceiros,
            criterio: 'Pedidos da Tray cuja coluna "UTM Source" contém "Google Ads".'
        } : null,
        pedidos,
        avisos
    };
}

// Junta variações como "1-Google Ads", "5-Google Ads" numa única origem.
export function agruparOrigemUtm(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return 'Sem UTM';
    if (/google\s*ads/i.test(texto)) return 'Google Ads';
    if (/^(ig|instagram|fb|facebook|meta)$/i.test(texto) || /meta|facebook|instagram/i.test(texto)) return 'Meta / Instagram';
    if (/chatgpt|openai|gemini|perplexity|copilot/i.test(texto)) return 'Assistentes de IA';
    return texto;
}

// Recalcula um mês a partir dos pedidos compactos guardados no histórico,
// usando o banco de parceiros atual.
export function recalcularVendasPorPedidos(pedidos, parceiros, investimentoTotal = 0) {
    const conjunto = new Set((Array.isArray(parceiros) ? parceiros : []).map(normalizarNome).filter(Boolean));
    let fatGeral = 0;
    let fatParceiros = 0;
    let qtdParceiros = 0;
    (pedidos || []).forEach(([nome, valor]) => {
        fatGeral += Number(valor) || 0;
        if (conjunto.has(normalizarNome(nome))) {
            fatParceiros += Number(valor) || 0;
            qtdParceiros++;
        }
    });
    const qtdGeral = (pedidos || []).length;
    return calcularIndicadoresVendas({
        fatGeral,
        fatParceiros,
        fatSemParceiros: fatGeral - fatParceiros,
        qtdGeral,
        qtdParceiros,
        qtdSemParceiros: qtdGeral - qtdParceiros
    }, investimentoTotal);
}

export function calcularIndicadoresVendas(dadosBase, investimentoTotal) {
    const {
        fatGeral,
        fatParceiros,
        fatSemParceiros,
        qtdGeral,
        qtdParceiros,
        qtdSemParceiros
    } = dadosBase;

    const tmGeral = qtdGeral > 0 ? fatGeral / qtdGeral : 0;
    const tmParceiros = qtdParceiros > 0 ? fatParceiros / qtdParceiros : 0;
    const tmSemParceiros = qtdSemParceiros > 0
        ? fatSemParceiros / qtdSemParceiros
        : 0;

    const roasGeral = investimentoTotal > 0
        ? fatGeral / investimentoTotal
        : 0;

    const roasSemParceiros = investimentoTotal > 0
        ? fatSemParceiros / investimentoTotal
        : 0;

    const roiEstimado = investimentoTotal > 0
        ? ((fatSemParceiros - investimentoTotal) / investimentoTotal) * 100
        : 0;

    return {
        ...dadosBase,
        investimentoTotal,
        tmGeral,
        tmParceiros,
        tmSemParceiros,
        roasGeral,
        roasSemParceiros,
        roiEstimado
    };
}

export async function processarArquivoVendasTray(
    arquivo,
    parceiros,
    investimentoTotal = 0,
    periodoEsperado = ''
) {
    const linhas = await lerPlanilhaAsync(arquivo);
    const dadosBase = processarLinhasVendasTray(linhas, parceiros, periodoEsperado);
    return calcularIndicadoresVendas(dadosBase, investimentoTotal);
}
