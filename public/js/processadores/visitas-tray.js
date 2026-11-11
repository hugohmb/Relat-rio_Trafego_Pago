import { converterParaNumero, lerPlanilhaAsync } from '../utilitarios.js';

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function extrairPrimeiroNumero(valor) {
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : 0;
    }

    const texto = String(valor ?? '').trim();
    const correspondencia = texto.match(/-?\d[\d.]*?(?:,\d+)?(?=\s|$|\n|\r|\t|%|\))/)
        || texto.match(/-?\d[\d.]*(?:,\d+)?/);

    return correspondencia ? converterParaNumero(correspondencia[0]) : 0;
}

function extrairPercentual(valor) {
    const numero = extrairPrimeiroNumero(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function converterDataExcel(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Date(Date.UTC(
            valor.getFullYear(),
            valor.getMonth(),
            valor.getDate()
        ));
    }

    if (typeof valor === 'number' && Number.isFinite(valor)) {
        const milissegundos = Math.round(valor * 86400000);
        return new Date(Date.UTC(1899, 11, 30) + milissegundos);
    }

    const texto = String(valor ?? '').trim();
    if (!texto || normalizarTexto(texto) === 'total') {
        return null;
    }

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
    return Number.isNaN(data.getTime()) ? null : new Date(Date.UTC(
        data.getFullYear(),
        data.getMonth(),
        data.getDate()
    ));
}

function formatarIso(data) {
    return data.toISOString().slice(0, 10);
}

function formatarDataCurta(data) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC'
    }).format(data);
}

function localizarColunas(cabecalho) {
    const normalizado = cabecalho.map(normalizarTexto);
    const aliases = {
        data: ['data'],
        visitas: ['visitas', 'acessos'],
        pageviews: ['pageviews', 'visualizacoes de pagina', 'visualizacoes'],
        pedidos: ['pedidos iniciados', 'pedidos'],
        conversao: ['conversao', 'taxa de conversao']
    };

    const indices = {};
    Object.entries(aliases).forEach(([chave, opcoes]) => {
        indices[chave] = normalizado.findIndex(item => opcoes.includes(item));
    });

    const ausentes = Object.entries(indices)
        .filter(([, indice]) => indice === -1)
        .map(([chave]) => chave);

    if (ausentes.length) {
        throw new Error(
            `Colunas obrigatórias não encontradas: ${ausentes.join(', ')}. ` +
            "A planilha deve conter Data, Visitas, Pageviews, Pedidos iniciados e Conversão."
        );
    }

    return indices;
}

function encontrarExtremo(dias, campo, maior = true) {
    return dias.reduce((selecionado, dia) => {
        if (!selecionado) return dia;
        return maior
            ? (dia[campo] > selecionado[campo] ? dia : selecionado)
            : (dia[campo] < selecionado[campo] ? dia : selecionado);
    }, null);
}

function valoresDiferem(a, b, tolerancia = 0.01) {
    return Math.abs(Number(a) - Number(b)) > tolerancia;
}

function validarPeriodo(dias, periodoEsperado) {
    if (!periodoEsperado || !/^\d{4}-\d{2}$/.test(periodoEsperado)) return;

    const divergentes = dias.filter(dia => !dia.dataIso.startsWith(periodoEsperado));
    if (divergentes.length) {
        const primeiro = divergentes[0];
        throw new Error(
            `A planilha contém dados de ${primeiro.dataFormatada}, fora do mês de referência ${periodoEsperado}.`
        );
    }
}

export function processarLinhasVisitasTray(linhas, periodoEsperado = '') {
    if (!Array.isArray(linhas) || linhas.length < 2) {
        throw new Error('A planilha de visitas está vazia ou sem registros diários.');
    }

    const indiceCabecalho = linhas.findIndex(linha => {
        if (!Array.isArray(linha)) return false;
        const normalizada = linha.map(normalizarTexto);
        return normalizada.includes('data') && normalizada.includes('visitas');
    });

    if (indiceCabecalho === -1) {
        throw new Error('Não foi possível localizar o cabeçalho da planilha de visitas.');
    }

    const indices = localizarColunas(linhas[indiceCabecalho]);
    const dias = [];
    let linhaTotal = null;
    let linhasIgnoradas = 0;

    for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!Array.isArray(linha) || linha.every(celula => String(celula ?? '').trim() === '')) {
            continue;
        }

        if (normalizarTexto(linha[indices.data]) === 'total') {
            linhaTotal = linha;
            continue;
        }

        const data = converterDataExcel(linha[indices.data]);
        if (!data) {
            linhasIgnoradas++;
            continue;
        }

        const visitas = extrairPrimeiroNumero(linha[indices.visitas]);
        const pageviews = extrairPrimeiroNumero(linha[indices.pageviews]);
        const pedidosIniciados = extrairPrimeiroNumero(linha[indices.pedidos]);
        const conversaoInformada = extrairPercentual(linha[indices.conversao]);
        const conversao = conversaoInformada > 0
            ? conversaoInformada
            : (visitas > 0 ? (pedidosIniciados / visitas) * 100 : 0);

        dias.push({
            dataIso: formatarIso(data),
            dataFormatada: formatarDataCurta(data),
            timestamp: data.getTime(),
            visitas,
            pageviews,
            pedidosIniciados,
            conversao
        });
    }

    if (!dias.length) {
        throw new Error('Nenhum registro diário válido foi encontrado na planilha de visitas.');
    }

    dias.sort((a, b) => a.timestamp - b.timestamp);
    validarPeriodo(dias, periodoEsperado);

    const datasUnicas = new Set(dias.map(dia => dia.dataIso));
    if (datasUnicas.size !== dias.length) {
        throw new Error('A planilha de visitas contém datas duplicadas.');
    }

    const somas = dias.reduce((total, dia) => ({
        visitas: total.visitas + dia.visitas,
        pageviews: total.pageviews + dia.pageviews,
        pedidosIniciados: total.pedidosIniciados + dia.pedidosIniciados
    }), { visitas: 0, pageviews: 0, pedidosIniciados: 0 });

    const totaisInformados = linhaTotal ? {
        visitas: extrairPrimeiroNumero(linhaTotal[indices.visitas]),
        pageviews: extrairPrimeiroNumero(linhaTotal[indices.pageviews]),
        pedidosIniciados: extrairPrimeiroNumero(linhaTotal[indices.pedidos]),
        conversao: extrairPercentual(linhaTotal[indices.conversao])
    } : null;

    const totalVisitas = totaisInformados?.visitas || somas.visitas;
    const totalPageviews = totaisInformados?.pageviews || somas.pageviews;
    const totalPedidosIniciados = totaisInformados?.pedidosIniciados || somas.pedidosIniciados;
    const conversaoGeral = totaisInformados?.conversao || (
        totalVisitas > 0 ? (totalPedidosIniciados / totalVisitas) * 100 : 0
    );

    const avisos = [];
    if (!linhaTotal) {
        avisos.push('A linha TOTAL não foi encontrada; os totais foram calculados pelos registros diários.');
    } else {
        if (valoresDiferem(totalVisitas, somas.visitas)) {
            avisos.push(`O total de visitas informado (${totalVisitas}) difere da soma diária (${somas.visitas}).`);
        }
        if (valoresDiferem(totalPageviews, somas.pageviews)) {
            avisos.push(`O total de pageviews informado (${totalPageviews}) difere da soma diária (${somas.pageviews}).`);
        }
        if (valoresDiferem(totalPedidosIniciados, somas.pedidosIniciados)) {
            avisos.push(
                `O total de pedidos iniciados informado (${totalPedidosIniciados}) difere da soma diária (${somas.pedidosIniciados}).`
            );
        }
    }
    if (linhasIgnoradas) {
        avisos.push(`${linhasIgnoradas} linha(s) sem data válida foram ignoradas.`);
    }

    const maiorVisitas = encontrarExtremo(dias, 'visitas', true);
    const menorVisitas = encontrarExtremo(dias, 'visitas', false);
    const maiorPageviews = encontrarExtremo(dias, 'pageviews', true);
    const maiorPedidos = encontrarExtremo(dias, 'pedidosIniciados', true);
    const maiorConversao = encontrarExtremo(dias, 'conversao', true);

    return {
        periodoDetectado: dias[0].dataIso.slice(0, 7),
        dataInicial: dias[0].dataIso,
        dataFinal: dias[dias.length - 1].dataIso,
        quantidadeDias: dias.length,
        totalVisitas,
        totalPageviews,
        totalPedidosIniciados,
        conversaoGeral,
        mediaVisitasDia: totalVisitas / dias.length,
        mediaPageviewsDia: totalPageviews / dias.length,
        mediaPedidosDia: totalPedidosIniciados / dias.length,
        maiorVisitas,
        menorVisitas,
        maiorPageviews,
        maiorPedidos,
        maiorConversao,
        dias,
        grafico: {
            labels: dias.map(dia => dia.dataFormatada),
            visitas: dias.map(dia => dia.visitas),
            pageviews: dias.map(dia => dia.pageviews),
            pedidosIniciados: dias.map(dia => dia.pedidosIniciados),
            conversao: dias.map(dia => dia.conversao)
        },
        avisos
    };
}

export async function processarArquivoVisitasTray(arquivo, periodoEsperado = '') {
    const linhas = await lerPlanilhaAsync(arquivo);
    return processarLinhasVisitasTray(linhas, periodoEsperado);
}
