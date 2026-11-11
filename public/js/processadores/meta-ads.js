import { converterParaNumero, lerPlanilhaAsync } from '../utilitarios.js';

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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
    if (!texto) return null;

    const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
        return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    }

    const br = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (br) {
        const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
        return new Date(Date.UTC(ano, Number(br[2]) - 1, Number(br[1])));
    }

    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return null;

    return new Date(Date.UTC(
        data.getFullYear(),
        data.getMonth(),
        data.getDate()
    ));
}

function formatarIso(data) {
    return data ? data.toISOString().slice(0, 10) : '';
}

function localizarIndice(cabecalhoNormalizado, aliases) {
    return cabecalhoNormalizado.findIndex(item => aliases.includes(item));
}

function localizarColunas(cabecalho) {
    const normalizado = cabecalho.map(normalizarTexto);
    const indices = {
        campanha: localizarIndice(normalizado, ['nome da campanha', 'campanha']),
        conta: localizarIndice(normalizado, ['nome da conta', 'conta']),
        alcance: localizarIndice(normalizado, ['alcance']),
        impressoes: localizarIndice(normalizado, ['impressoes']),
        cliques: localizarIndice(normalizado, [
            'cliques (todos)',
            'cliques todos',
            'cliques',
            'cliques no link'
        ]),
        moeda: localizarIndice(normalizado, ['moeda']),
        cpc: localizarIndice(normalizado, ['cpc (todos)', 'cpc todos', 'cpc']),
        valorUsado: localizarIndice(normalizado, [
            'valor usado (brl)',
            'valor usado',
            'valor gasto (brl)',
            'valor gasto',
            'investimento'
        ]),
        compras: localizarIndice(normalizado, ['compras', 'compras no site']),
        inicioRelatorio: localizarIndice(normalizado, [
            'inicio dos relatorios',
            'inicio do relatorio',
            'data de inicio dos relatorios'
        ]),
        fimRelatorio: localizarIndice(normalizado, [
            'encerramento dos relatorios',
            'fim dos relatorios',
            'termino dos relatorios',
            'data de encerramento dos relatorios'
        ])
    };

    const obrigatorias = ['campanha', 'alcance', 'impressoes', 'cliques', 'valorUsado', 'compras'];
    const ausentes = obrigatorias.filter(chave => indices[chave] === -1);

    if (ausentes.length) {
        const rotulos = {
            campanha: 'Nome da campanha',
            alcance: 'Alcance',
            impressoes: 'Impressões',
            cliques: 'Cliques',
            valorUsado: 'Valor usado',
            compras: 'Compras'
        };
        throw new Error(
            `Colunas obrigatórias não encontradas: ${ausentes.map(chave => rotulos[chave]).join(', ')}.`
        );
    }

    return indices;
}

function obterValor(linha, indice) {
    return indice === -1 ? '' : linha[indice];
}

function calcularMetricasBase(metricas) {
    const alcance = Math.max(0, metricas.alcance || 0);
    const impressoes = Math.max(0, metricas.impressoes || 0);
    const cliques = Math.max(0, metricas.cliques || 0);
    const valorUsado = Math.max(0, metricas.valorUsado || 0);
    const compras = Math.max(0, metricas.compras || 0);
    const cpcInformado = Math.max(0, metricas.cpcInformado || 0);

    // Os indicadores derivados são sempre recalculados usando os dados-base.
    // A coluna CPC exportada pelo Meta pode perder a vírgula decimal ao ser
    // convertida de CSV para XLSX (ex.: 1,53568262 vira 153568262).
    const cpcCalculado = cliques > 0 ? valorUsado / cliques : 0;

    return {
        alcance,
        impressoes,
        cliques,
        valorUsado,
        compras,
        cpcInformado,
        frequencia: alcance > 0 ? impressoes / alcance : 0,
        ctr: impressoes > 0 ? (cliques / impressoes) * 100 : 0,
        cpc: cpcCalculado,
        cpm: impressoes > 0 ? (valorUsado / impressoes) * 1000 : 0,
        custoPorCompra: compras > 0 ? valorUsado / compras : 0,
        taxaCompraPorClique: cliques > 0 ? (compras / cliques) * 100 : 0
    };
}

function lerMetricasLinha(linha, indices) {
    return calcularMetricasBase({
        alcance: converterParaNumero(obterValor(linha, indices.alcance)),
        impressoes: converterParaNumero(obterValor(linha, indices.impressoes)),
        cliques: converterParaNumero(obterValor(linha, indices.cliques)),
        valorUsado: converterParaNumero(obterValor(linha, indices.valorUsado)),
        compras: converterParaNumero(obterValor(linha, indices.compras)),
        cpcInformado: converterParaNumero(obterValor(linha, indices.cpc))
    });
}

function somarCampanhas(campanhas) {
    return campanhas.reduce((total, campanha) => ({
        alcance: total.alcance + campanha.alcance,
        impressoes: total.impressoes + campanha.impressoes,
        cliques: total.cliques + campanha.cliques,
        valorUsado: total.valorUsado + campanha.valorUsado,
        compras: total.compras + campanha.compras
    }), {
        alcance: 0,
        impressoes: 0,
        cliques: 0,
        valorUsado: 0,
        compras: 0
    });
}

function diferencaRelevante(valorA, valorB, toleranciaAbsoluta = 0.01) {
    return Math.abs(Number(valorA) - Number(valorB)) > toleranciaAbsoluta;
}

function selecionarMaior(campanhas, campo, filtro = () => true, desempate = null) {
    const candidatas = campanhas.filter(filtro);
    if (!candidatas.length) return null;

    return candidatas.reduce((melhor, atual) => {
        if (!melhor) return atual;
        if (atual[campo] > melhor[campo]) return atual;
        if (atual[campo] < melhor[campo]) return melhor;
        return desempate ? desempate(melhor, atual) : melhor;
    }, null);
}

function validarPeriodo(dataInicial, dataFinal, periodoEsperado) {
    if (!periodoEsperado || !/^\d{4}-\d{2}$/.test(periodoEsperado)) return;

    const datas = [dataInicial, dataFinal].filter(Boolean);
    const divergente = datas.find(data => !data.startsWith(periodoEsperado));

    if (divergente) {
        throw new Error(
            `A planilha do Meta Ads pertence ao período ${divergente.slice(0, 7)}, ` +
            `mas o relatório está configurado para ${periodoEsperado}.`
        );
    }
}

export function processarLinhasMetaAds(linhas, periodoEsperado = '') {
    if (!Array.isArray(linhas) || linhas.length < 2) {
        throw new Error('A planilha do Meta Ads está vazia ou sem campanhas.');
    }

    const indiceCabecalho = linhas.findIndex(linha => {
        if (!Array.isArray(linha)) return false;
        const normalizada = linha.map(normalizarTexto);
        return normalizada.includes('nome da campanha')
            && normalizada.includes('alcance')
            && normalizada.includes('impressoes');
    });

    if (indiceCabecalho === -1) {
        throw new Error('Não foi possível localizar o cabeçalho da planilha do Meta Ads.');
    }

    const indices = localizarColunas(linhas[indiceCabecalho]);
    const campanhas = [];
    let linhaResumo = null;
    let linhasIgnoradas = 0;

    for (let indice = indiceCabecalho + 1; indice < linhas.length; indice++) {
        const linha = linhas[indice];
        if (!Array.isArray(linha) || linha.every(celula => String(celula ?? '').trim() === '')) {
            continue;
        }

        const nomeCampanha = String(obterValor(linha, indices.campanha) ?? '').trim();
        const metricas = lerMetricasLinha(linha, indices);
        const possuiMetricas = metricas.alcance > 0
            || metricas.impressoes > 0
            || metricas.cliques > 0
            || metricas.valorUsado > 0
            || metricas.compras > 0;

        if (!nomeCampanha && possuiMetricas && !linhaResumo) {
            linhaResumo = linha;
            continue;
        }

        if (!nomeCampanha || !possuiMetricas) {
            linhasIgnoradas++;
            continue;
        }

        const inicio = converterDataExcel(obterValor(linha, indices.inicioRelatorio));
        const fim = converterDataExcel(obterValor(linha, indices.fimRelatorio));

        campanhas.push({
            nome: nomeCampanha,
            conta: String(obterValor(linha, indices.conta) ?? '').trim(),
            moeda: String(obterValor(linha, indices.moeda) ?? '').trim() || 'BRL',
            dataInicial: formatarIso(inicio),
            dataFinal: formatarIso(fim),
            ...metricas
        });
    }

    if (!campanhas.length) {
        throw new Error('Nenhuma campanha válida foi encontrada na planilha do Meta Ads.');
    }

    const agregadoCampanhas = somarCampanhas(campanhas);
    const metricasResumo = linhaResumo ? lerMetricasLinha(linhaResumo, indices) : null;
    const inicioResumo = linhaResumo
        ? converterDataExcel(obterValor(linhaResumo, indices.inicioRelatorio))
        : null;
    const fimResumo = linhaResumo
        ? converterDataExcel(obterValor(linhaResumo, indices.fimRelatorio))
        : null;

    const datasIniciais = campanhas.map(item => item.dataInicial).filter(Boolean).sort();
    const datasFinais = campanhas.map(item => item.dataFinal).filter(Boolean).sort();
    const dataInicial = formatarIso(inicioResumo) || datasIniciais[0] || '';
    const dataFinal = formatarIso(fimResumo) || datasFinais[datasFinais.length - 1] || '';

    validarPeriodo(dataInicial, dataFinal, periodoEsperado);

    const totais = calcularMetricasBase({
        alcance: metricasResumo?.alcance || agregadoCampanhas.alcance,
        impressoes: metricasResumo?.impressoes || agregadoCampanhas.impressoes,
        cliques: metricasResumo?.cliques || agregadoCampanhas.cliques,
        valorUsado: metricasResumo?.valorUsado || agregadoCampanhas.valorUsado,
        compras: metricasResumo?.compras || agregadoCampanhas.compras,
        cpcInformado: metricasResumo?.cpcInformado || 0
    });

    const avisos = [];

    if (!linhaResumo) {
        avisos.push(
            'A linha consolidada do Meta Ads não foi encontrada. Os totais foram calculados pela soma das campanhas; ' +
            'o alcance pode ficar superestimado por sobreposição de público.'
        );
    } else {
        const comparacoes = [
            ['impressões', totais.impressoes, agregadoCampanhas.impressoes, 1],
            ['cliques', totais.cliques, agregadoCampanhas.cliques, 1],
            ['investimento', totais.valorUsado, agregadoCampanhas.valorUsado, 0.02],
            ['compras', totais.compras, agregadoCampanhas.compras, 1]
        ];

        comparacoes.forEach(([rotulo, totalInformado, somaCampanhas, tolerancia]) => {
            if (diferencaRelevante(totalInformado, somaCampanhas, tolerancia)) {
                avisos.push(
                    `O total de ${rotulo} (${totalInformado}) difere da soma das campanhas (${somaCampanhas}).`
                );
            }
        });
    }

    if (!dataInicial || !dataFinal) {
        avisos.push('O período dos relatórios não pôde ser identificado nas colunas de data.');
    }

    if (linhasIgnoradas) {
        avisos.push(`${linhasIgnoradas} linha(s) vazia(s) ou sem métricas foram ignoradas.`);
    }

    const melhorConversao = selecionarMaior(
        campanhas,
        'compras',
        campanha => campanha.compras > 0,
        (melhor, atual) => atual.custoPorCompra < melhor.custoPorCompra ? atual : melhor
    );
    const maiorAlcance = selecionarMaior(campanhas, 'alcance');
    const maiorInvestimento = selecionarMaior(campanhas, 'valorUsado');
    const maiorVolumeCliques = selecionarMaior(campanhas, 'cliques');

    campanhas.sort((a, b) => {
        if (b.compras !== a.compras) return b.compras - a.compras;
        if (b.valorUsado !== a.valorUsado) return b.valorUsado - a.valorUsado;
        return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return {
        periodoDetectado: dataInicial ? dataInicial.slice(0, 7) : '',
        dataInicial,
        dataFinal,
        possuiLinhaResumo: Boolean(linhaResumo),
        quantidadeCampanhas: campanhas.length,
        moeda: campanhas.find(item => item.moeda)?.moeda || 'BRL',
        ...totais,
        melhorConversao,
        maiorAlcance,
        maiorInvestimento,
        maiorVolumeCliques,
        campanhas,
        grafico: {
            labels: campanhas.map(item => item.nome),
            alcance: campanhas.map(item => item.alcance),
            impressoes: campanhas.map(item => item.impressoes),
            cliques: campanhas.map(item => item.cliques),
            investimento: campanhas.map(item => item.valorUsado),
            compras: campanhas.map(item => item.compras)
        },
        avisos
    };
}

export async function processarArquivoMetaAds(arquivo, periodoEsperado = '') {
    const linhas = await lerPlanilhaAsync(arquivo);
    return processarLinhasMetaAds(linhas, periodoEsperado);
}
