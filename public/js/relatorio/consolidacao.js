const CAMPOS_COMPARACAO = [
    'fatGeral',
    'fatParceiros',
    'fatSemParceiros',
    'qtdGeral',
    'qtdParceiros',
    'qtdSemParceiros',
    'tmGeral',
    'tmParceiros',
    'tmSemParceiros',
    'investimentoTotal',
    'roasGeral',
    'roasSemParceiros'
];

function numeroSeguro(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function calcularRazao(numerador, denominador) {
    const base = numeroSeguro(denominador);
    return base > 0 ? numeroSeguro(numerador) / base : 0;
}

function criarInvestimentosConsolidados(relatorio) {
    const base = relatorio.investimentos || {};
    const ga = relatorio.resultados?.gaResumo;
    const receitaGoogleExibidaDisponivel = Boolean(ga?.pago);
    const receitaGoogleExibida = receitaGoogleExibidaDisponivel
        ? Math.max(0, numeroSeguro(ga.pago.receita))
        : 0;
    const receitaGoogleDisponivel = Boolean(ga?.pago && ga?.outros);
    const receitaGoogle = receitaGoogleDisponivel
        ? Math.max(0, numeroSeguro(ga.pago.receita) - numeroSeguro(ga.outros.receita))
        : 0;
    const investimentoGoogle = numeroSeguro(base.investimentoGoogle);
    const investimentoMeta = numeroSeguro(base.investimentoMeta);
    const receitaMetaDisponivel = Boolean(base.receitaMetaDisponivel) && numeroSeguro(base.receitaMeta) > 0;
    const receitaMeta = receitaMetaDisponivel ? numeroSeguro(base.receitaMeta) : 0;

    return {
        investimentoGoogle,
        investimentoMeta,
        investimentoTotal: investimentoGoogle + investimentoMeta,
        receitaGoogle,
        receitaGoogleDisponivel,
        criterioReceitaGoogle: 'Receita do tráfego pago no GA4 menos a receita de Outros.',
        receitaGoogleExibida,
        receitaGoogleExibidaDisponivel,
        criterioReceitaGoogleExibida: 'Receita da categoria Tráfego pago no GA4.',
        receitaMeta,
        receitaMetaDisponivel,
        origemReceitaMeta: String(base.origemReceitaMeta || '').trim(),
        receitaAtribuidaTotal: receitaGoogle
    };
}

export function calcularVariacaoPercentual(atual, anterior) {
    const valorAtual = numeroSeguro(atual);
    const valorAnterior = numeroSeguro(anterior);

    if (valorAnterior === 0) {
        return null;
    }

    return ((valorAtual - valorAnterior) / Math.abs(valorAnterior)) * 100;
}

function calcularVariacoes(atual, anterior) {
    if (!atual || !anterior) {
        return null;
    }

    return CAMPOS_COMPARACAO.reduce((resultado, campo) => {
        resultado[campo] = calcularVariacaoPercentual(atual[campo], anterior[campo]);
        return resultado;
    }, {});
}

function criarPeriodoAtual(relatorio) {
    const vendas = relatorio.resultados?.vendasAtual;
    if (!vendas) return null;

    const investimentos = relatorio.investimentos || {};

    return {
        nome: relatorio.periodoFormatado || relatorio.periodo || 'Mês atual',
        periodo: relatorio.periodo || '',
        tipo: 'atual',
        investimentoGoogle: numeroSeguro(investimentos.investimentoGoogle),
        investimentoMeta: numeroSeguro(investimentos.investimentoMeta),
        ...vendas
    };
}

function criarComparativos(relatorio) {
    const historico = Array.isArray(relatorio.resultados?.historico)
        ? relatorio.resultados.historico
        : [];
    const atual = criarPeriodoAtual(relatorio);
    const recentes = historico.filter(periodo => periodo.tipo === 'recente');
    const anoAnterior = historico.find(periodo => periodo.tipo === 'anual') || null;
    const sequenciaRecente = atual ? [...recentes, atual] : recentes;
    const mesAnterior = recentes.length ? recentes[recentes.length - 1] : null;

    return {
        sequenciaRecente,
        atual,
        mesAnterior,
        anoAnterior,
        variacaoMensal: calcularVariacoes(atual, mesAnterior),
        variacaoAnual: calcularVariacoes(atual, anoAnterior)
    };
}

function pagina(numero, titulo, bloqueios = [], avisos = [], detalhe = '') {
    const status = bloqueios.length
        ? 'pendente'
        : avisos.length
            ? 'atencao'
            : 'pronto';

    return {
        numero,
        titulo,
        status,
        detalhe,
        bloqueios,
        avisos
    };
}

function temTexto(...valores) {
    return valores.some(valor => String(valor || '').trim());
}

function criarPaginas(relatorio, comparativos) {
    const resultados = relatorio.resultados || {};
    const informacoes = relatorio.informacoesDoPeriodo || {};
    const investimentos = relatorio.investimentos || {};
    const produtos = resultados.produtos;
    const historicoRecenteCompleto = comparativos.sequenciaRecente.length >= 3;
    const possuiComparativoAnual = Boolean(comparativos.anoAnterior);

    const paginas = [
        pagina(
            1,
            'Capa e identificação',
            relatorio.periodo ? [] : ['Mês de referência não informado.'],
            informacoes.focoAnalise ? [] : ['O foco da análise está vazio.'],
            relatorio.periodoFormatado || 'Período não definido'
        ),
        pagina(
            2,
            'Implementações do período',
            [],
            temTexto(informacoes.implementacoes, informacoes.correcoes, informacoes.decisoes)
                ? []
                : ['Nenhuma implementação, correção ou decisão foi registrada.'],
            'Conteúdo manual e editável'
        ),
        pagina(
            3,
            'Resumo do Google Analytics',
            resultados.gaResumo ? [] : ['Resumo do Google Analytics indisponível.'],
            resultados.gaResumo?.avisos || [],
            resultados.gaResumo
                ? `${resultados.gaResumo.todos.compras} compras no resumo geral`
                : 'Sem dados'
        ),
        pagina(
            4,
            'Produtos mais vendidos — posições 1 a 10',
            produtos?.pagina1?.length ? [] : ['Primeira parte do ranking indisponível.'],
            produtos?.pagina1?.length < 10
                ? [`A primeira página possui somente ${produtos?.pagina1?.length || 0} produto(s).`]
                : [],
            produtos?.pagina1?.length
                ? `${produtos.pagina1.length} produtos preparados`
                : 'Sem dados'
        ),
        pagina(
            5,
            'Produtos mais vendidos — posições 11 a 20',
            produtos?.pagina2?.length ? [] : ['Segunda parte do ranking indisponível.'],
            produtos?.pagina2?.length < 10
                ? [`A segunda página possui somente ${produtos?.pagina2?.length || 0} produto(s).`]
                : [],
            produtos?.pagina2?.length
                ? `${produtos.pagina2.length} produtos preparados`
                : 'Sem dados'
        ),
        pagina(
            6,
            'Investimentos e retorno calculado',
            [],
            numeroSeguro(investimentos.investimentoTotal) > 0
                ? []
                : ['O investimento total está zerado; os indicadores de retorno não poderão ser calculados.'],
            'Google Ads + Meta Ads'
        ),
        pagina(
            7,
            'Desempenho das vendas',
            resultados.vendasAtual ? [] : ['Planilha de vendas do mês atual indisponível.'],
            resultados.vendasAtual?.avisos || [],
            resultados.vendasAtual
                ? `${resultados.vendasAtual.qtdGeral} pedidos processados`
                : 'Sem dados'
        ),
        pagina(
            8,
            'ROAS e eficiência de mídia',
            resultados.vendasAtual ? [] : ['Dados de vendas necessários para calcular o ROAS.'],
            numeroSeguro(investimentos.investimentoTotal) > 0
                ? []
                : ['Investimento total zerado.'],
            resultados.vendasAtual
                ? `ROAS sem parceiros: ${resultados.vendasAtual.roasSemParceiros.toFixed(2)}x`
                : 'Sem dados'
        ),
        pagina(
            9,
            'Comportamento de visitas',
            resultados.visitas ? [] : ['Planilha de visitas indisponível.'],
            resultados.visitas?.avisos || [],
            resultados.visitas
                ? `${resultados.visitas.totalVisitas} visitas em ${resultados.visitas.quantidadeDias} dias`
                : 'Sem dados'
        ),
        pagina(
            10,
            'Histórico recente e comparação anual',
            historicoRecenteCompleto
                ? []
                : ['São necessários dois meses anteriores e o mês atual para montar o histórico recente.'],
            possuiComparativoAnual
                ? []
                : ['O mesmo mês do ano anterior não foi informado; a comparação anual será omitida.'],
            historicoRecenteCompleto
                ? possuiComparativoAnual
                    ? 'Histórico recente e comparação anual preparados'
                    : 'Histórico recente preparado; comparação anual opcional omitida'
                : 'Histórico recente incompleto'
        ),
        pagina(
            11,
            'Desempenho do Meta Ads',
            resultados.metaAds ? [] : ['Planilha de desempenho do Meta Ads indisponível.'],
            resultados.metaAds?.avisos || [],
            resultados.metaAds
                ? `${resultados.metaAds.quantidadeCampanhas} campanhas processadas`
                : 'Sem dados'
        ),
        pagina(
            12,
            'Conclusão e próximos passos',
            resultados.vendasAtual && resultados.gaResumo && resultados.metaAds
                ? []
                : ['As principais fontes quantitativas ainda não estão completas.'],
            temTexto(informacoes.proximosPassos, informacoes.observacoesConclusao)
                ? []
                : ['Próximos passos e observações para a conclusão estão vazios.'],
            'Base preparada para análise do Gemini'
        ),
        pagina(
            13,
            'Tendências e direcionamento',
            [],
            [],
            'Série histórica e leitura de tendências'
        )
    ];

    return paginas;
}

function coletarAvisos(relatorio, paginas, comparativos) {
    const resultados = relatorio.resultados || {};
    const investimentos = relatorio.investimentos || {};
    const avisos = [];

    const adicionarAvisos = (origem, itens) => {
        (itens || []).forEach(item => avisos.push(`${origem}: ${item}`));
    };

    adicionarAvisos('Vendas do mês atual', resultados.vendasAtual?.avisos);
    (resultados.historico || []).forEach(item => adicionarAvisos(`Vendas históricas — ${item.nome || item.periodo || 'período'}`, item.avisos));
    adicionarAvisos('Google Analytics', resultados.gaResumo?.avisos);
    adicionarAvisos('Produtos', resultados.produtos?.avisos);
    adicionarAvisos('Visitas', resultados.visitas?.avisos);
    adicionarAvisos('Meta Ads', resultados.metaAds?.avisos);

    const investimentoManualMeta = numeroSeguro(investimentos.investimentoMeta);
    const investimentoArquivoMeta = numeroSeguro(resultados.metaAds?.valorUsado);
    const toleranciaMeta = Math.max(1, investimentoManualMeta * 0.01);

    if (
        resultados.metaAds
        && Math.abs(investimentoManualMeta - investimentoArquivoMeta) > toleranciaMeta
    ) {
        avisos.push(
            `O investimento manual do Meta Ads difere do valor usado na planilha em ` +
            `${Math.abs(investimentoManualMeta - investimentoArquivoMeta).toFixed(2)}.`
        );
    }

    if (resultados.produtos?.quantidadeProdutosSelecionados < 20) {
        avisos.push('O ranking possui menos de 20 produtos com compras.');
    }

    if (comparativos.variacaoAnual) {
        const semBase = Object.entries(comparativos.variacaoAnual)
            .filter(([, valor]) => valor === null)
            .map(([campo]) => campo);

        if (semBase.length) {
            avisos.push(
                `Algumas variações anuais não puderam ser calculadas porque a base do ano anterior é zero: ` +
                `${semBase.join(', ')}.`
            );
        }
    }

    paginas
        .filter(item => item.status === 'atencao')
        .forEach(item => item.avisos.forEach(aviso =>
            avisos.push(`Página ${item.numero}: ${aviso}`)
        ));

    return [...new Set(avisos)];
}

function criarIndicadores(relatorio, comparativos, investimentosConsolidados) {
    const resultados = relatorio.resultados || {};
    const investimentos = investimentosConsolidados || criarInvestimentosConsolidados(relatorio);
    const vendas = resultados.vendasAtual || {};
    const ga = resultados.gaResumo;
    const produtos = resultados.produtos;
    const visitas = resultados.visitas;
    const meta = resultados.metaAds;

    return {
        vendas: {
            faturamentoGeral: numeroSeguro(vendas.fatGeral),
            faturamentoParceiros: numeroSeguro(vendas.fatParceiros),
            faturamentoSemParceiros: numeroSeguro(vendas.fatSemParceiros),
            participacaoParceiros: calcularRazao(vendas.fatParceiros, vendas.fatGeral) * 100,
            participacaoSemParceiros: calcularRazao(vendas.fatSemParceiros, vendas.fatGeral) * 100,
            pedidos: numeroSeguro(vendas.qtdGeral),
            ticketMedio: numeroSeguro(vendas.tmGeral),
            roasGeral: numeroSeguro(vendas.roasGeral),
            roasSemParceiros: numeroSeguro(vendas.roasSemParceiros)
        },
        plataformas: {
            receitaGoogle: numeroSeguro(investimentos.receitaGoogle),
            receitaGoogleExibida: numeroSeguro(investimentos.receitaGoogleExibida),
            receitaGoogleExibidaDisponivel: Boolean(investimentos.receitaGoogleExibidaDisponivel),
            criterioReceitaGoogleExibida: investimentos.criterioReceitaGoogleExibida,
            investimentoGoogle: numeroSeguro(investimentos.investimentoGoogle),
            roasGoogle: calcularRazao(
                investimentos.receitaGoogle,
                investimentos.investimentoGoogle
            ),
            receitaGoogleDisponivel: Boolean(investimentos.receitaGoogleDisponivel),
            criterioReceitaGoogle: investimentos.criterioReceitaGoogle,
            receitaMeta: numeroSeguro(investimentos.receitaMeta),
            receitaMetaDisponivel: Boolean(investimentos.receitaMetaDisponivel),
            origemReceitaMeta: investimentos.origemReceitaMeta || '',
            investimentoMeta: numeroSeguro(investimentos.investimentoMeta),
            roasMeta: investimentos.receitaMetaDisponivel
                ? calcularRazao(investimentos.receitaMeta, investimentos.investimentoMeta)
                : null,
            receitaAtribuidaTotal: numeroSeguro(investimentos.receitaAtribuidaTotal),
            investimentoTotal: numeroSeguro(investimentos.investimentoTotal),
            roasAtribuidoTotal: null
        },
        googleAnalytics: ga ? {
            compras: ga.todos.compras,
            receita: ga.todos.receita,
            comprasPagas: ga.pago.compras,
            receitaPaga: ga.pago.receita,
            participacaoReceitaPaga: ga.participacaoPago.receita
        } : null,
        produtos: produtos ? {
            quantidadeComCompra: produtos.quantidadeProdutosComCompra,
            quantidadeSelecionada: produtos.quantidadeProdutosSelecionados,
            produtoLider: produtos.produtosTop20[0] || null,
            participacaoTop20Receita: produtos.participacaoTop20Receita
        } : null,
        visitas: visitas ? {
            total: visitas.totalVisitas,
            mediaDiaria: visitas.mediaVisitasDia,
            conversao: visitas.conversaoGeral,
            pico: visitas.maiorVisitas,
            menorVolume: visitas.menorVisitas
        } : null,
        metaAds: meta ? {
            alcance: meta.alcance,
            impressoes: meta.impressoes,
            cliques: meta.cliques,
            compras: meta.compras,
            investimento: meta.valorUsado,
            ctr: meta.ctr,
            cpc: meta.cpc,
            campanhaDestaque: meta.melhorConversao || meta.maiorAlcance || null
        } : null,
        comparacoes: {
            variacaoMensal: comparativos.variacaoMensal,
            variacaoAnual: comparativos.variacaoAnual
        }
    };
}

export function consolidarDadosRelatorio(relatorio) {
    const comparativos = criarComparativos(relatorio);
    const investimentosConsolidados = criarInvestimentosConsolidados(relatorio);
    const paginas = criarPaginas(relatorio, comparativos);
    const avisos = coletarAvisos(relatorio, paginas, comparativos);
    const totalProntas = paginas.filter(item => item.status === 'pronto').length;
    const totalAtencao = paginas.filter(item => item.status === 'atencao').length;
    const totalPendentes = paginas.filter(item => item.status === 'pendente').length;

    return {
        versaoEstrutura: 1,
        consolidadoEm: new Date().toISOString(),
        periodo: relatorio.periodo || '',
        periodoFormatado: relatorio.periodoFormatado || '',
        quantidadeParceirosCadastrados: Number(relatorio.quantidadeParceirosCadastrados || 0),
        informacoesDoPeriodo: { ...(relatorio.informacoesDoPeriodo || {}) },
        investimentos: investimentosConsolidados,
        arquivos: Object.fromEntries(
            Object.entries(relatorio.arquivos || {}).map(([chave, arquivo]) => [
                chave,
                arquivo?.name || ''
            ])
        ),
        fontes: {
            vendasAtual: relatorio.resultados?.vendasAtual || null,
            gaResumo: relatorio.resultados?.gaResumo || null,
            produtos: relatorio.resultados?.produtos || null,
            visitas: relatorio.resultados?.visitas || null,
            metaAds: relatorio.resultados?.metaAds || null,
            historico: relatorio.resultados?.historico || []
        },
        indicadores: criarIndicadores(relatorio, comparativos, investimentosConsolidados),
        comparativos,
        paginas,
        verificacao: {
            totalPaginas: paginas.length,
            totalProntas,
            totalAtencao,
            totalPendentes,
            prontoParaProximaEtapa: totalPendentes === 0,
            avisos
        }
    };
}
