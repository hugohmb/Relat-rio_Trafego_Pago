import { estadoAplicacao } from '../estado.js';
import { escaparHtml, formatarMoeda } from '../utilitarios.js';

const ROTULOS_STATUS = {
    ok: 'Aprovado',
    aviso: 'Atenção',
    erro: 'Erro',
    info: 'Informativo'
};

const ICONES_STATUS = {
    ok: '✅',
    aviso: '⚠️',
    erro: '❌',
    info: 'ℹ️'
};

function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
}

function quaseIgual(a, b, toleranciaAbsoluta = 0.02, toleranciaRelativa = 0.0001) {
    const valorA = numero(a);
    const valorB = numero(b);
    const diferenca = Math.abs(valorA - valorB);
    const base = Math.max(Math.abs(valorA), Math.abs(valorB), 1);
    return diferenca <= toleranciaAbsoluta || diferenca / base <= toleranciaRelativa;
}

function diferencaPercentual(a, b) {
    const valorA = numero(a);
    const valorB = numero(b);
    if (valorB === 0) return null;
    return ((valorA - valorB) / Math.abs(valorB)) * 100;
}

function formatarNumero(valor, casas = 0) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    }).format(numero(valor));
}

function formatarPercentual(valor, casas = 1) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
        return 'indisponível';
    }
    const sinal = Number(valor) > 0 ? '+' : '';
    return `${sinal}${formatarNumero(valor, casas)}%`;
}

function criarCheck(id, titulo, status, detalhe, dados = {}) {
    return { id, titulo, status, detalhe, dados };
}

function criarGrupo(id, titulo, checks) {
    return { id, titulo, checks };
}

function obterDiasDoMes(periodo) {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return 0;
    const [ano, mes] = periodo.split('-').map(Number);
    return new Date(ano, mes, 0).getDate();
}

function verificarPeriodos(consolidado) {
    const fontes = consolidado.fontes || {};
    const atual = consolidado.periodo;
    const checks = [];
    const fontesComPeriodo = [
        ['Vendas Tray', fontes.vendasAtual?.periodoDetectado],
        ['Resumo Google Analytics', fontes.gaResumo?.periodoDetectado],
        ['Produtos Google Analytics', fontes.produtos?.periodoDetectado],
        ['Visitas Tray', fontes.visitas?.periodoDetectado],
        ['Meta Ads', fontes.metaAds?.periodoDetectado]
    ];

    fontesComPeriodo.forEach(([nome, periodo]) => {
        if (!periodo) {
            checks.push(criarCheck(
                `periodo-${nome}`,
                `${nome}: identificação do período`,
                'aviso',
                'O processador não conseguiu identificar o mês no arquivo.'
            ));
            return;
        }

        checks.push(criarCheck(
            `periodo-${nome}`,
            `${nome}: identificação do período`,
            periodo === atual ? 'ok' : 'erro',
            periodo === atual
                ? `Período confirmado: ${periodo}.`
                : `O arquivo pertence a ${periodo}, mas o relatório está configurado para ${atual}.`
        ));
    });

    const historico = Array.isArray(fontes.historico) ? fontes.historico : [];
    const recentes = historico.filter(item => item.tipo === 'recente');
    const anual = historico.find(item => item.tipo === 'anual');

    const historicoRecenteCompleto = recentes.length === 2;
    checks.push(criarCheck(
        'historico-quantidade',
        'Quantidade de períodos comparativos',
        historicoRecenteCompleto ? (anual ? 'ok' : 'aviso') : 'erro',
        historicoRecenteCompleto
            ? anual
                ? 'Os dois meses recentes e o mesmo mês do ano anterior foram processados.'
                : 'Os dois meses recentes foram processados. O comparativo anual é opcional e não foi informado.'
            : `Foram encontrados ${recentes.length} de 2 períodos recentes obrigatórios.`
    ));

    [...recentes, ...(anual ? [anual] : [])].forEach((item, indice) => {
        if (!item.periodo) {
            checks.push(criarCheck(
                `historico-periodo-${indice}`,
                `Período histórico: ${item.nome || `item ${indice + 1}`}`,
                'aviso',
                'O período histórico não possui um mês estruturado para conferência automática.'
            ));
            return;
        }

        const coincide = !item.periodoDetectado || item.periodoDetectado === item.periodo;
        checks.push(criarCheck(
            `historico-periodo-${indice}`,
            `Período histórico: ${item.nome || item.periodo}`,
            coincide ? 'ok' : 'erro',
            coincide
                ? `Arquivo confirmado para ${item.periodo}.`
                : `O arquivo foi identificado como ${item.periodoDetectado}, mas o período informado é ${item.periodo}.`
        ));
    });

    if (/^\d{4}-\d{2}$/.test(atual) && anual?.periodo) {
        const [anoAtual, mesAtual] = atual.split('-').map(Number);
        const esperado = `${anoAtual - 1}-${String(mesAtual).padStart(2, '0')}`;
        checks.push(criarCheck(
            'historico-anual-correspondencia',
            'Mesmo mês do ano anterior',
            anual.periodo === esperado ? 'ok' : 'erro',
            anual.periodo === esperado
                ? `Comparação anual corretamente configurada para ${esperado}.`
                : `Era esperado ${esperado}, mas foi informado ${anual.periodo}.`
        ));
    }

    return criarGrupo('periodos', 'Arquivos e períodos', checks);
}

function verificarVendas(consolidado) {
    const vendas = consolidado.fontes?.vendasAtual;
    const investimento = numero(consolidado.investimentos?.investimentoTotal);
    const parceirosCadastrados = numero(consolidado.quantidadeParceirosCadastrados);
    const checks = [];

    if (!vendas) {
        return criarGrupo('vendas', 'Vendas Tray e cálculos financeiros', [
            criarCheck('vendas-ausentes', 'Planilha de vendas', 'erro', 'Os dados de vendas não estão disponíveis.')
        ]);
    }

    checks.push(criarCheck(
        'parceiros-cadastrados',
        'Banco de parceiros carregado',
        parceirosCadastrados > 0 ? 'ok' : 'erro',
        parceirosCadastrados > 0
            ? `${formatarNumero(parceirosCadastrados)} parceiro(s) disponível(is) para a classificação.`
            : 'O Banco de Parceiros está vazio. A separação entre parceiros e demais vendas ficará incorreta.'
    ));

    checks.push(criarCheck(
        'vendas-receita-fechamento',
        'Fechamento do faturamento',
        quaseIgual(vendas.fatGeral, numero(vendas.fatParceiros) + numero(vendas.fatSemParceiros)) ? 'ok' : 'erro',
        `${formatarMoeda(vendas.fatParceiros)} + ${formatarMoeda(vendas.fatSemParceiros)} = ${formatarMoeda(vendas.fatGeral)}.`
    ));

    checks.push(criarCheck(
        'vendas-pedidos-fechamento',
        'Fechamento da quantidade de pedidos',
        numero(vendas.qtdGeral) === numero(vendas.qtdParceiros) + numero(vendas.qtdSemParceiros) ? 'ok' : 'erro',
        `${formatarNumero(vendas.qtdParceiros)} + ${formatarNumero(vendas.qtdSemParceiros)} = ${formatarNumero(vendas.qtdGeral)} pedidos.`
    ));

    const tmGeralEsperado = numero(vendas.qtdGeral) > 0 ? numero(vendas.fatGeral) / numero(vendas.qtdGeral) : 0;
    const tmParceirosEsperado = numero(vendas.qtdParceiros) > 0 ? numero(vendas.fatParceiros) / numero(vendas.qtdParceiros) : 0;
    const tmSemEsperado = numero(vendas.qtdSemParceiros) > 0 ? numero(vendas.fatSemParceiros) / numero(vendas.qtdSemParceiros) : 0;
    const ticketsCorretos = quaseIgual(vendas.tmGeral, tmGeralEsperado)
        && quaseIgual(vendas.tmParceiros, tmParceirosEsperado)
        && quaseIgual(vendas.tmSemParceiros, tmSemEsperado);

    checks.push(criarCheck(
        'vendas-ticket',
        'Cálculo dos tickets médios',
        ticketsCorretos ? 'ok' : 'erro',
        ticketsCorretos
            ? 'Os três tickets médios correspondem à receita dividida pela quantidade de pedidos.'
            : 'Um ou mais tickets médios não correspondem à fórmula esperada.'
    ));

    const roasGeralEsperado = investimento > 0 ? numero(vendas.fatGeral) / investimento : 0;
    const roasSemEsperado = investimento > 0 ? numero(vendas.fatSemParceiros) / investimento : 0;
    const roasCorretos = quaseIgual(vendas.roasGeral, roasGeralEsperado, 0.001)
        && quaseIgual(vendas.roasSemParceiros, roasSemEsperado, 0.001);

    checks.push(criarCheck(
        'vendas-roas',
        'Cálculo dos indicadores de ROAS',
        investimento > 0 && roasCorretos ? 'ok' : 'erro',
        investimento > 0
            ? `Investimento total usado: ${formatarMoeda(investimento)}.`
            : 'O investimento total está zerado.'
    ));

    checks.push(criarCheck(
        'vendas-desconto',
        'Tratamento do desconto',
        'info',
        `${formatarMoeda(vendas.totalDescontos)} em descontos foram encontrados. ` +
        'Eles não são subtraídos novamente porque a coluna Total já os considera.'
    ));

    const freteExcluido = vendas.freteExcluidoDaReceita === true;
    checks.push(criarCheck(
        'vendas-frete',
        'Tratamento do frete',
        numero(vendas.totalFrete) > 0 && !freteExcluido ? 'erro' : 'ok',
        numero(vendas.totalFrete) > 0
            ? freteExcluido
                ? `${formatarMoeda(vendas.totalFrete)} em frete foram encontrados e integralmente excluídos do faturamento.`
                : `${formatarMoeda(vendas.totalFrete)} em frete foram encontrados, mas estes resultados vieram de uma versão antiga que ainda incluía o frete na receita. Selecione novamente a planilha Tray e valide os dados.`
            : 'Não foi identificado valor de frete; a regra de receita permanece Total menos Impostos e Frete.'
    ));

    return criarGrupo('vendas', 'Vendas Tray e cálculos financeiros', checks);
}

function verificarGoogleAnalytics(consolidado) {
    const ga = consolidado.fontes?.gaResumo;
    const produtos = consolidado.fontes?.produtos;
    const checks = [];

    if (!ga) {
        checks.push(criarCheck('ga-ausente', 'Resumo do Google Analytics', 'erro', 'Os dados do Google Analytics estão ausentes.'));
    } else {
        const somaCarrinhos = numero(ga.direto?.carrinhos) + numero(ga.organico?.carrinhos)
            + numero(ga.pago?.carrinhos) + numero(ga.outros?.carrinhos);
        const somaCompras = numero(ga.direto?.compras) + numero(ga.organico?.compras)
            + numero(ga.pago?.compras) + numero(ga.outros?.compras);
        const somaReceita = numero(ga.direto?.receita) + numero(ga.organico?.receita)
            + numero(ga.pago?.receita) + numero(ga.outros?.receita);
        const fecha = quaseIgual(ga.todos?.carrinhos, somaCarrinhos, 1)
            && quaseIgual(ga.todos?.compras, somaCompras, 1)
            && quaseIgual(ga.todos?.receita, somaReceita, 0.05);

        checks.push(criarCheck(
            'ga-fechamento',
            'Fechamento das origens do Google Analytics',
            fecha ? 'ok' : 'erro',
            fecha
                ? 'Direto + orgânico + pago + outros correspondem ao total de usuários.'
                : 'A soma das origens não corresponde ao bloco Todos os usuários.'
        ));

        const semNegativos = ['carrinhos', 'compras', 'receita', 'arppu']
            .every(campo => numero(ga.outros?.[campo]) >= 0);
        checks.push(criarCheck(
            'ga-outros',
            'Categoria Outros',
            semNegativos ? 'ok' : 'erro',
            semNegativos
                ? 'A diferença residual foi calculada sem valores negativos.'
                : 'A categoria Outros produziu valores negativos e precisa ser revisada.'
        ));


        const categoriasGa = [ga.todos, ga.direto, ga.organico, ga.pago, ga.outros].filter(Boolean);
        const escalaGaValida = categoriasGa.every(categoria =>
            numero(categoria.receita) <= 50_000_000
            && numero(categoria.arppu) <= 1_000_000
        );

        checks.push(criarCheck(
            'ga-escala-monetaria',
            'Escala dos valores monetários do Google Analytics',
            escalaGaValida ? 'ok' : 'erro',
            escalaGaValida
                ? 'Receitas e ARPPU estão em uma faixa monetária coerente.'
                : 'Foram encontrados valores em escala incompatível. Use o CSV original do Google Analytics; a conversão manual para XLSX pode remover o separador decimal.'
        ));
    }

    if (!produtos) {
        checks.push(criarCheck('produtos-ausentes', 'Ranking de produtos', 'erro', 'O ranking de produtos não está disponível.'));
    } else {
        const top20 = produtos.produtosTop20 || [];
        const ordenado = top20.every((item, indice) => {
            if (indice === 0) return item.posicao === 1;
            const anterior = top20[indice - 1];
            if (anterior.itensComprados < item.itensComprados) return false;
            if (anterior.itensComprados === item.itensComprados && anterior.receita < item.receita) return false;
            return item.posicao === indice + 1;
        });

        checks.push(criarCheck(
            'produtos-top20',
            'Seleção e ordenação do Top 20',
            top20.length === 20 && ordenado ? 'ok' : 'erro',
            `${top20.length} produto(s) selecionado(s); ordenação ${ordenado ? 'correta' : 'incorreta'}.`
        ));

        checks.push(criarCheck(
            'produtos-paginas',
            'Divisão das páginas 4 e 5',
            produtos.pagina1?.length === 10 && produtos.pagina2?.length === 10 ? 'ok' : 'erro',
            `${produtos.pagina1?.length || 0} produto(s) na primeira página e ${produtos.pagina2?.length || 0} na segunda.`
        ));


        const receitasProdutosValidas = top20.every(produto => {
            const receita = numero(produto.receita);
            const quantidade = Math.max(1, numero(produto.itensComprados));
            return receita <= 1_000_000 && receita / quantidade <= 100_000;
        });

        checks.push(criarCheck(
            'produtos-escala-monetaria',
            'Escala das receitas dos produtos',
            receitasProdutosValidas ? 'ok' : 'erro',
            receitasProdutosValidas
                ? 'As receitas dos produtos estão em uma faixa coerente.'
                : 'Foram encontradas receitas de produtos em escala incompatível. Use o CSV original exportado pelo Google Analytics.'
        ));

        if (ga) {
            const variacao = diferencaPercentual(produtos.receitaTotal, ga.pago?.receita);
            const abs = Math.abs(numero(variacao));
            checks.push(criarCheck(
                'produtos-receita-ga',
                'Receita dos produtos × receita do tráfego pago',
                abs <= 3 ? 'ok' : abs <= 10 ? 'aviso' : 'aviso',
                `Produtos: ${formatarMoeda(produtos.receitaTotal)}; GA pago: ${formatarMoeda(ga.pago?.receita)}; diferença: ${formatarPercentual(variacao)}. ` +
                'Pequenas diferenças podem ocorrer por atribuição e arredondamento.'
            ));
        }
    }

    return criarGrupo('google-analytics', 'Google Analytics e produtos', checks);
}

function verificarVisitas(consolidado) {
    const visitas = consolidado.fontes?.visitas;
    const checks = [];

    if (!visitas) {
        return criarGrupo('visitas', 'Comportamento de visitas', [
            criarCheck('visitas-ausentes', 'Planilha de visitas', 'erro', 'Os dados de visitas estão ausentes.')
        ]);
    }

    const soma = (campo) => (visitas.dias || []).reduce((total, dia) => total + numero(dia[campo]), 0);
    const totalCorreto = quaseIgual(visitas.totalVisitas, soma('visitas'), 1)
        && quaseIgual(visitas.totalPageviews, soma('pageviews'), 1)
        && quaseIgual(visitas.totalPedidosIniciados, soma('pedidosIniciados'), 1);

    checks.push(criarCheck(
        'visitas-totais',
        'Soma dos dados diários',
        totalCorreto ? 'ok' : 'erro',
        totalCorreto
            ? 'Visitas, pageviews e pedidos iniciados fecham com a soma dos dias.'
            : 'Um ou mais totais não correspondem à soma diária.'
    ));

    const diasEsperados = obterDiasDoMes(consolidado.periodo);
    checks.push(criarCheck(
        'visitas-dias',
        'Cobertura de todos os dias do mês',
        numero(visitas.quantidadeDias) === diasEsperados ? 'ok' : 'aviso',
        `${formatarNumero(visitas.quantidadeDias)} dia(s) encontrados de ${diasEsperados} esperado(s).`
    ));

    const conversaoCalculada = numero(visitas.totalVisitas) > 0
        ? (numero(visitas.totalPedidosIniciados) / numero(visitas.totalVisitas)) * 100
        : 0;
    checks.push(criarCheck(
        'visitas-conversao',
        'Taxa de conversão geral',
        quaseIgual(visitas.conversaoGeral, conversaoCalculada, 0.05, 0.001) ? 'ok' : 'erro',
        `Informada: ${formatarNumero(visitas.conversaoGeral, 2)}%; calculada: ${formatarNumero(conversaoCalculada, 2)}%.`
    ));

    return criarGrupo('visitas', 'Comportamento de visitas', checks);
}

function verificarMeta(consolidado) {
    const meta = consolidado.fontes?.metaAds;
    const investimentoManual = numero(consolidado.investimentos?.investimentoMeta);
    const checks = [];

    if (!meta) {
        return criarGrupo('meta', 'Meta Ads', [
            criarCheck('meta-ausente', 'Planilha do Meta Ads', 'erro', 'Os dados do Meta Ads estão ausentes.')
        ]);
    }

    const diferencaInvestimento = diferencaPercentual(investimentoManual, meta.valorUsado);
    checks.push(criarCheck(
        'meta-investimento',
        'Investimento manual × planilha Meta Ads',
        Math.abs(numero(diferencaInvestimento)) <= 1 ? 'ok' : 'aviso',
        `Manual: ${formatarMoeda(investimentoManual)}; planilha: ${formatarMoeda(meta.valorUsado)}; diferença: ${formatarPercentual(diferencaInvestimento)}.`
    ));

    const ctrCalculado = numero(meta.impressoes) > 0 ? numero(meta.cliques) / numero(meta.impressoes) * 100 : 0;
    const cpcCalculado = numero(meta.cliques) > 0 ? numero(meta.valorUsado) / numero(meta.cliques) : 0;
    const cpmCalculado = numero(meta.impressoes) > 0 ? numero(meta.valorUsado) / numero(meta.impressoes) * 1000 : 0;
    const cppCalculado = numero(meta.compras) > 0 ? numero(meta.valorUsado) / numero(meta.compras) : 0;
    const formulasCorretas = quaseIgual(meta.ctr, ctrCalculado, 0.001)
        && quaseIgual(meta.cpc, cpcCalculado, 0.001)
        && quaseIgual(meta.cpm, cpmCalculado, 0.001)
        && quaseIgual(meta.custoPorCompra, cppCalculado, 0.001);

    checks.push(criarCheck(
        'meta-formulas',
        'CTR, CPC, CPM e custo por compra',
        formulasCorretas ? 'ok' : 'erro',
        formulasCorretas
            ? `CTR: ${formatarNumero(meta.ctr, 2)}%; CPC: ${formatarMoeda(meta.cpc)}; ` +
              `CPM: ${formatarMoeda(meta.cpm)}; custo por compra: ${formatarMoeda(meta.custoPorCompra)}.`
            : `Calculados pela automação — CTR: ${formatarNumero(ctrCalculado, 2)}%; ` +
              `CPC: ${formatarMoeda(cpcCalculado)}; CPM: ${formatarMoeda(cpmCalculado)}; ` +
              `custo por compra: ${formatarMoeda(cppCalculado)}.`
    ));

    checks.push(criarCheck(
        'meta-campanhas',
        'Campanhas processadas',
        numero(meta.quantidadeCampanhas) > 0 ? 'ok' : 'erro',
        `${formatarNumero(meta.quantidadeCampanhas)} campanha(s) válida(s) encontrada(s).`
    ));

    (meta.avisos || []).forEach((aviso, indice) => {
        checks.push(criarCheck(`meta-aviso-${indice}`, 'Conferência da linha consolidada', 'aviso', aviso));
    });

    return criarGrupo('meta', 'Meta Ads', checks);
}

function verificarCruzamentos(consolidado) {
    const vendas = consolidado.fontes?.vendasAtual;
    const ga = consolidado.fontes?.gaResumo;
    const meta = consolidado.fontes?.metaAds;
    const inv = consolidado.investimentos || {};
    const checks = [];

    if (ga && vendas) {
        const variacao = diferencaPercentual(ga.todos?.receita, vendas.fatGeral);
        checks.push(criarCheck(
            'cruzamento-ga-tray',
            'Receita do GA4 × faturamento da Tray',
            'info',
            `GA4: ${formatarMoeda(ga.todos?.receita)}; Tray: ${formatarMoeda(vendas.fatGeral)}; diferença: ${formatarPercentual(variacao)}. ` +
            'As fontes possuem critérios de atribuição diferentes e não precisam fechar exatamente.'
        ));
    }

    if (ga) {
        const receitaExibidaEsperada = Math.max(0, numero(ga.pago?.receita));
        const diferencaExibida = numero(inv.receitaGoogleExibida) - receitaExibidaEsperada;
        checks.push(criarCheck(
            'cruzamento-receita-google-exibida',
            'Receita exibida na linha Google Ads',
            Math.abs(diferencaExibida) <= 0.01 ? 'ok' : 'erro',
            `GA4 — categoria Tráfego pago: ${formatarMoeda(ga.pago?.receita)}; ` +
            `valor preparado para a página 6: ${formatarMoeda(inv.receitaGoogleExibida)}.`
        ));

        const esperado = Math.max(0, numero(ga.pago?.receita) - numero(ga.outros?.receita));
        const diferenca = numero(inv.receitaGoogle) - esperado;
        checks.push(criarCheck(
            'cruzamento-retorno-google',
            'Cálculo automático do retorno disponível',
            Math.abs(diferenca) <= 0.01 ? 'ok' : 'erro',
            `Tráfego pago: ${formatarMoeda(ga.pago?.receita)}; Outros: ${formatarMoeda(ga.outros?.receita)}; ` +
            `retorno disponível: ${formatarMoeda(inv.receitaGoogle)}.`
        ));
    }

    if (vendas && inv.receitaGoogleDisponivel) {
        const variacao = diferencaPercentual(inv.receitaGoogle, vendas.fatSemParceiros);
        checks.push(criarCheck(
            'cruzamento-sem-parceiros',
            'Retorno calculado do Google × vendas sem parceiros',
            'info',
            `Google calculado pelo GA4: ${formatarMoeda(inv.receitaGoogle)}; vendas sem parceiros na Tray: ${formatarMoeda(vendas.fatSemParceiros)}; diferença: ${formatarPercentual(variacao)}. ` +
            'São métricas de fontes e critérios diferentes.'
        ));
    }

    if (ga && meta) {
        checks.push(criarCheck(
            'cruzamento-compras-meta-ga',
            'Compras Meta Ads × compras do tráfego pago no GA4',
            'info',
            `Meta Ads: ${formatarNumero(meta.compras)}; GA4 pago: ${formatarNumero(ga.pago?.compras)}. ` +
            'A diferença é apenas informativa porque as plataformas usam janelas e modelos de atribuição distintos.'
        ));
    }

    return criarGrupo('cruzamentos', 'Cruzamentos entre fontes', checks);
}

function verificarPaginas(consolidado) {
    const paginas = consolidado.paginas || [];
    const checks = paginas.map(pagina => criarCheck(
        `pagina-${pagina.numero}`,
        `Página ${pagina.numero} — ${pagina.titulo}`,
        pagina.status === 'pendente' ? 'erro' : pagina.status === 'atencao' ? 'aviso' : 'ok',
        [...(pagina.bloqueios || []), ...(pagina.avisos || [])].join(' ') || pagina.detalhe || 'Página preparada.'
    ));

    return criarGrupo('paginas', 'Completude das 13 páginas', checks);
}

export function executarHomologacao(consolidado) {
    if (!consolidado) {
        throw new Error('Os dados precisam ser consolidados antes da homologação.');
    }

    const grupos = [
        verificarPeriodos(consolidado),
        verificarVendas(consolidado),
        verificarGoogleAnalytics(consolidado),
        verificarVisitas(consolidado),
        verificarMeta(consolidado),
        verificarCruzamentos(consolidado),
        verificarPaginas(consolidado)
    ];

    const checks = grupos.flatMap(grupo => grupo.checks);
    const totais = {
        ok: checks.filter(item => item.status === 'ok').length,
        aviso: checks.filter(item => item.status === 'aviso').length,
        erro: checks.filter(item => item.status === 'erro').length,
        info: checks.filter(item => item.status === 'info').length
    };

    return {
        executadaEm: new Date().toISOString(),
        periodo: consolidado.periodo,
        grupos,
        totais,
        status: totais.erro > 0 ? 'reprovado' : totais.aviso > 0 ? 'com-atencoes' : 'aprovado',
        prontoParaVisual: totais.erro === 0,
        aprovadaManualmente: false
    };
}

function montarCheckHtml(check) {
    return `
        <article class="homologacao-check homologacao-${check.status}">
            <span class="homologacao-check-icone">${ICONES_STATUS[check.status]}</span>
            <div>
                <h5>${escaparHtml(check.titulo)}</h5>
                <p>${escaparHtml(check.detalhe)}</p>
            </div>
            <span class="homologacao-check-status">${ROTULOS_STATUS[check.status]}</span>
        </article>
    `;
}

function renderizarHomologacao(homologacao) {
    const painel = document.getElementById('relPainelHomologacao');
    if (!painel) return;

    const selo = homologacao.prontoParaVisual
        ? homologacao.totais.aviso > 0 ? 'Pronta com pontos de atenção' : 'Homologação aprovada'
        : 'Correções necessárias';

    painel.hidden = false;
    painel.innerHTML = `
        <div class="homologacao-cabecalho">
            <div>
                <span class="relatorio-etapa">ETAPA 11</span>
                <h3>Homologação funcional dos dados</h3>
                <p>Conferência automática de períodos, fórmulas, totais, cruzamentos e completude das páginas.</p>
            </div>
            <div class="homologacao-acoes">
                <span class="homologacao-selo homologacao-selo-${homologacao.status}">${escaparHtml(selo)}</span>
                <button type="button" id="btnExecutarHomologacao" class="btn-secundario">Executar novamente</button>
            </div>
        </div>

        <div class="homologacao-resumo">
            <div><span>Aprovados</span><strong>${homologacao.totais.ok}</strong></div>
            <div><span>Atenções</span><strong>${homologacao.totais.aviso}</strong></div>
            <div><span>Erros</span><strong>${homologacao.totais.erro}</strong></div>
            <div><span>Informativos</span><strong>${homologacao.totais.info}</strong></div>
        </div>

        <div class="homologacao-grupos">
            ${homologacao.grupos.map((grupo, indice) => `
                <details class="homologacao-grupo" ${indice < 2 || grupo.checks.some(item => item.status === 'erro') ? 'open' : ''}>
                    <summary>
                        <strong>${escaparHtml(grupo.titulo)}</strong>
                        <span>${grupo.checks.filter(item => item.status === 'erro').length} erro(s) · ${grupo.checks.filter(item => item.status === 'aviso').length} atenção(ões)</span>
                    </summary>
                    <div>${grupo.checks.map(montarCheckHtml).join('')}</div>
                </details>
            `).join('')}
        </div>

        <div class="homologacao-rodape">
            <div>
                <strong>${homologacao.prontoParaVisual
                    ? 'A estrutura lógica pode avançar para o trabalho visual.'
                    : 'Corrija os erros indicados e valide as entradas novamente.'}</strong>
                <small>Verificação executada em ${new Date(homologacao.executadaEm).toLocaleString('pt-BR')}.</small>
            </div>
            <button
                type="button"
                id="btnAprovarHomologacao"
                class="${homologacao.aprovadaManualmente ? 'btn-homologacao-aprovada' : 'btn-principal'}"
                ${homologacao.prontoParaVisual ? '' : 'disabled'}
            >${homologacao.aprovadaManualmente ? 'Homologação revisada e aprovada' : 'Confirmar revisão dos dados'}</button>
        </div>
    `;
}

export function executarHomologacaoAtual() {
    const consolidado = estadoAplicacao.relatorio.consolidado;
    if (!consolidado) return null;

    const homologacao = executarHomologacao(consolidado);
    estadoAplicacao.relatorio.homologacao = homologacao;
    renderizarHomologacao(homologacao);
    window.dispatchEvent(new CustomEvent('relatorio:homologado', { detail: homologacao }));
    return homologacao;
}

function limparHomologacao() {
    estadoAplicacao.relatorio.homologacao = null;
    const painel = document.getElementById('relPainelHomologacao');
    if (painel) {
        painel.hidden = true;
        painel.innerHTML = '';
    }
}

function tratarClique(evento) {
    if (evento.target.closest('#btnExecutarHomologacao')) {
        executarHomologacaoAtual();
        return;
    }

    if (evento.target.closest('#btnAprovarHomologacao')) {
        const homologacao = estadoAplicacao.relatorio.homologacao;
        if (!homologacao?.prontoParaVisual) return;
        homologacao.aprovadaManualmente = true;
        renderizarHomologacao(homologacao);
        window.dispatchEvent(new CustomEvent('relatorio:homologacao-aprovada'));
    }
}

function restaurarHomologacaoProjeto() {
    const homologacao = estadoAplicacao.relatorio.homologacao;
    const consolidado = estadoAplicacao.relatorio.consolidado;

    if (!consolidado) {
        limparHomologacao();
        return;
    }

    if (homologacao && homologacao.periodo === consolidado.periodo) {
        renderizarHomologacao(homologacao);
        window.dispatchEvent(new CustomEvent('relatorio:homologado', { detail: homologacao }));
        if (homologacao.aprovadaManualmente) {
            window.dispatchEvent(new CustomEvent('relatorio:homologacao-aprovada'));
        }
        return;
    }

    executarHomologacaoAtual();
}

export function inicializarHomologacao() {
    document.addEventListener('click', tratarClique);
    window.addEventListener('relatorio:consolidado', executarHomologacaoAtual);
    window.addEventListener('relatorio:invalidado', limparHomologacao);
    window.addEventListener('relatorio:projeto-carregado', restaurarHomologacaoProjeto);
}
