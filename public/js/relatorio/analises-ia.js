import { estadoAplicacao } from '../estado.js';
import { gerarAnaliseSecaoApi, gerarAnalisesRelatorioApi } from '../api.js';
import { escaparHtml } from '../utilitarios.js';
import { agendarSalvarAnalisesNaMemoria } from './memoria.js';

const CHAVE_AUTOMATICO = 'automacao-gerar-analises-auto';

const SECOES_ANALISE = [
    {
        id: 'implementacoes',
        titulo: 'Implementações do período',
        pagina: 2,
        descricao: 'Organiza as ações técnicas e estratégicas informadas para o mês.',
        disponivel: consolidado => Boolean(
            consolidado?.informacoesDoPeriodo?.implementacoes
            || consolidado?.informacoesDoPeriodo?.correcoes
            || consolidado?.informacoesDoPeriodo?.decisoes
        ),
        motivoIndisponivel: 'Informe implementações, correções ou decisões do período.'
    },
    {
        id: 'google-analytics',
        titulo: 'Resumo do Google Analytics',
        pagina: 3,
        descricao: 'Interpreta o funil e a participação das principais origens de tráfego.',
        disponivel: consolidado => Boolean(consolidado?.fontes?.gaResumo),
        motivoIndisponivel: 'O resumo do Google Analytics ainda não foi processado.'
    },
    {
        id: 'investimentos',
        titulo: 'Investimentos e plataformas',
        pagina: 6,
        descricao: 'Compara investimentos e o retorno do Google calculado automaticamente pelo GA4.',
        disponivel: consolidado => Number(consolidado?.investimentos?.investimentoTotal || 0) > 0,
        motivoIndisponivel: 'Informe os investimentos do Google Ads e Meta Ads.'
    },
    {
        id: 'vendas',
        titulo: 'Desempenho das vendas',
        pagina: 7,
        descricao: 'Analisa faturamento, pedidos, parceiros e ticket médio.',
        disponivel: consolidado => Boolean(consolidado?.fontes?.vendasAtual),
        motivoIndisponivel: 'A planilha de vendas do mês atual ainda não foi processada.'
    },
    {
        id: 'roas',
        titulo: 'ROAS e eficiência de mídia',
        pagina: 8,
        descricao: 'Interpreta os retornos sem confundir vendas sem parceiros com atribuição paga.',
        disponivel: consolidado => Boolean(
            consolidado?.fontes?.vendasAtual
            && Number(consolidado?.investimentos?.investimentoTotal || 0) > 0
        ),
        motivoIndisponivel: 'São necessários dados de vendas e investimento total maior que zero.'
    },
    {
        id: 'visitas',
        titulo: 'Comportamento de visitas',
        pagina: 9,
        descricao: 'Identifica estabilidade, picos, quedas e comportamento diário da loja.',
        disponivel: consolidado => Boolean(consolidado?.fontes?.visitas),
        motivoIndisponivel: 'A planilha de comportamento de visitas ainda não foi processada.'
    },
    {
        id: 'historico',
        titulo: 'Histórico e comparação anual',
        pagina: 10,
        descricao: 'Compara o mês atual com os meses recentes e, quando disponível, com o mesmo mês do ano anterior.',
        disponivel: consolidado => Boolean(
            consolidado?.comparativos?.atual
            && consolidado?.comparativos?.mesAnterior
        ),
        motivoIndisponivel: 'O histórico recente está incompleto. O comparativo anual é opcional.'
    },
    {
        id: 'meta-ads',
        titulo: 'Desempenho do Meta Ads',
        pagina: 11,
        descricao: 'Interpreta alcance, cliques, investimento, compras e destaques das campanhas.',
        disponivel: consolidado => Boolean(consolidado?.fontes?.metaAds),
        motivoIndisponivel: 'A planilha de desempenho do Meta Ads ainda não foi processada.'
    },
    {
        id: 'tendencias',
        titulo: 'Tendências e direcionamento',
        pagina: 13,
        descricao: 'Lê a série dos meses anteriores guardada pelo programa, aponta padrões e sugere caminhos para o próximo mês.',
        disponivel: consolidado => Boolean(consolidado?.fontes?.vendasAtual && consolidado?.memoria?.serie?.length >= 2),
        motivoIndisponivel: 'São necessários pelo menos dois meses no histórico do programa (o atual e um anterior).'
    },
    {
        id: 'conclusao',
        titulo: 'Conclusão e próximos passos',
        pagina: 12,
        descricao: 'Sintetiza os resultados e transforma as orientações do período em próximos passos.',
        disponivel: consolidado => Boolean(
            consolidado?.fontes?.vendasAtual
            && consolidado?.fontes?.gaResumo
            && consolidado?.fontes?.metaAds
        ),
        motivoIndisponivel: 'As principais fontes quantitativas ainda não estão completas.'
    }
];

let painelInicializado = false;
let geracaoEmLote = false;

function obterElemento(id) {
    return document.getElementById(id);
}

function numeroSeguro(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function compactarVendas(vendas) {
    if (!vendas) return null;

    return {
        faturamentoGeral: numeroSeguro(vendas.fatGeral),
        faturamentoParceiros: numeroSeguro(vendas.fatParceiros),
        faturamentoSemParceiros: numeroSeguro(vendas.fatSemParceiros),
        pedidosGerais: numeroSeguro(vendas.qtdGeral),
        pedidosParceiros: numeroSeguro(vendas.qtdParceiros),
        pedidosSemParceiros: numeroSeguro(vendas.qtdSemParceiros),
        ticketMedioGeral: numeroSeguro(vendas.tmGeral),
        ticketMedioParceiros: numeroSeguro(vendas.tmParceiros),
        ticketMedioSemParceiros: numeroSeguro(vendas.tmSemParceiros),
        investimentoTotal: numeroSeguro(vendas.investimentoTotal),
        roasGeral: numeroSeguro(vendas.roasGeral),
        roasSemParceiros: numeroSeguro(vendas.roasSemParceiros),
        roiEstimadoSemParceiros: numeroSeguro(vendas.roiEstimado)
    };
}

function compactarPeriodo(periodo) {
    if (!periodo) return null;

    return {
        nome: periodo.nome || '',
        tipo: periodo.tipo || '',
        investimentoGoogle: numeroSeguro(periodo.investimentoGoogle),
        investimentoMeta: numeroSeguro(periodo.investimentoMeta),
        ...compactarVendas(periodo)
    };
}

function memoriaResumida(consolidado, { comSerie = true } = {}) {
    const memoria = consolidado.memoria;
    if (!memoria?.serie?.length) return null;
    return {
        mesesAnterioresDisponiveis: memoria.mesesDisponiveis,
        criterio: memoria.criterio,
        ...(comSerie ? { serieMensal: memoria.serie } : {}),
        tendenciasCalculadas: memoria.tendencias,
        mesmoMesAnoAnterior: memoria.mesmoMesAnoAnterior
    };
}

function contextoDaSecao(secaoId, consolidado) {
    const informacoes = consolidado.informacoesDoPeriodo || {};
    const fontes = consolidado.fontes || {};
    const indicadores = consolidado.indicadores || {};
    const comparativos = consolidado.comparativos || {};

    switch (secaoId) {
        case 'implementacoes':
            return {
                focoDaAnalise: informacoes.focoAnalise || '',
                implementacoes: informacoes.implementacoes || '',
                correcoes: informacoes.correcoes || '',
                decisoesEstrategicas: informacoes.decisoes || '',
                proximosPassosInformados: informacoes.proximosPassos || ''
            };

        case 'google-analytics': {
            const ga = fontes.gaResumo;
            return {
                todosOsUsuarios: ga?.todos || null,
                trafegoDireto: ga?.direto || null,
                trafegoOrganico: ga?.organico || null,
                trafegoPago: ga?.pago || null,
                outros: ga?.outros || null,
                participacaoDoPago: ga?.participacaoPago || null,
                avisosDaFonte: ga?.avisos || []
            };
        }

        case 'investimentos':
            return {
                plataformas: indicadores.plataformas || null,
                decisoesEstrategicas: informacoes.decisoes || '',
                observacoesParaConclusao: informacoes.observacoesConclusao || ''
            };

        case 'vendas':
            return {
                vendas: compactarVendas(fontes.vendasAtual),
                participacoes: indicadores.vendas ? {
                    parceirosNoFaturamento: indicadores.vendas.participacaoParceiros,
                    semParceirosNoFaturamento: indicadores.vendas.participacaoSemParceiros
                } : null,
                criterioDeClassificacao: 'A classificação é feita por correspondência exata do nome com o Banco de Parceiros.',
                vendasPorCanal: fontes.vendasAtual?.porCanal || null,
                vendasComUtmGoogleAds: fontes.vendasAtual?.vendasUtmGoogleAds || null
            };

        case 'roas':
            return {
                vendas: compactarVendas(fontes.vendasAtual),
                plataformas: indicadores.plataformas || null,
                vendasComUtmGoogleAds: fontes.vendasAtual?.vendasUtmGoogleAds || null,
                regras: [
                    'As vendas com UTM Google Ads vêm da coluna UTM Source da Tray: é uma referência complementar de rastreamento, não substitui o retorno calculado pelo GA4.',
                    'Vendas sem parceiros não significam automaticamente vendas atribuídas ao tráfego pago.',
                    'O retorno do Google Ads foi calculado automaticamente pela receita do tráfego pago menos a receita de Outros no GA4.',
                    'O retorno e o ROAS do Meta Ads não estão disponíveis porque o arquivo atual não informa receita.',
                    'Os cálculos foram realizados pela automação e não devem ser recalculados pelo texto.'
                ]
            };

        case 'visitas': {
            const visitas = fontes.visitas;
            return {
                periodo: visitas ? {
                    dataInicial: visitas.dataInicial,
                    dataFinal: visitas.dataFinal,
                    quantidadeDias: visitas.quantidadeDias
                } : null,
                totais: visitas ? {
                    visitas: visitas.totalVisitas,
                    pageviews: visitas.totalPageviews,
                    pedidosIniciados: visitas.totalPedidosIniciados,
                    conversao: visitas.conversaoGeral,
                    mediaVisitasPorDia: visitas.mediaVisitasDia,
                    mediaPageviewsPorDia: visitas.mediaPageviewsDia,
                    mediaPedidosPorDia: visitas.mediaPedidosDia
                } : null,
                destaques: visitas ? {
                    maiorVolumeDeVisitas: visitas.maiorVisitas,
                    menorVolumeDeVisitas: visitas.menorVisitas,
                    maiorVolumeDePageviews: visitas.maiorPageviews,
                    maiorVolumeDePedidos: visitas.maiorPedidos,
                    maiorConversao: visitas.maiorConversao
                } : null,
                serieDiaria: (visitas?.dias || []).map(dia => ({
                    data: dia.dataFormatada,
                    visitas: dia.visitas,
                    pageviews: dia.pageviews,
                    pedidosIniciados: dia.pedidosIniciados,
                    conversao: dia.conversao
                })),
                avisosDaFonte: visitas?.avisos || []
            };
        }

        case 'historico':
            return {
                sequenciaRecente: (comparativos.sequenciaRecente || []).map(compactarPeriodo),
                mesAtual: compactarPeriodo(comparativos.atual),
                mesAnterior: compactarPeriodo(comparativos.mesAnterior),
                mesmoMesAnoAnterior: compactarPeriodo(comparativos.anoAnterior),
                variacaoMensalPercentual: comparativos.variacaoMensal || null,
                variacaoAnualPercentual: comparativos.variacaoAnual || null,
                memoriaMensal: memoriaResumida(consolidado, { comSerie: false })
            };

        case 'tendencias':
            return {
                mesAtual: consolidado.periodoFormatado || consolidado.periodo,
                memoriaMensal: memoriaResumida(consolidado),
                recomendacoesAnteriores: consolidado.memoria?.recomendacoesAnteriores || [],
                decisoesDoMes: informacoes.decisoes || '',
                proximosPassosDoMes: informacoes.proximosPassos || '',
                avisosDaConsolidacao: consolidado.verificacao?.avisos || []
            };

        case 'meta-ads': {
            const meta = fontes.metaAds;
            return {
                resumo: meta ? {
                    alcance: meta.alcance,
                    impressoes: meta.impressoes,
                    frequencia: meta.frequencia,
                    cliques: meta.cliques,
                    ctr: meta.ctr,
                    cpc: meta.cpc,
                    cpm: meta.cpm,
                    investimento: meta.valorUsado,
                    compras: meta.compras,
                    custoPorCompra: meta.custoPorCompra,
                    taxaCompraPorClique: meta.taxaCompraPorClique
                } : null,
                campanhas: (meta?.campanhas || []).map(campanha => ({
                    nome: campanha.nome,
                    alcance: campanha.alcance,
                    impressoes: campanha.impressoes,
                    cliques: campanha.cliques,
                    ctr: campanha.ctr,
                    cpc: campanha.cpc,
                    investimento: campanha.valorUsado,
                    compras: campanha.compras,
                    custoPorCompra: campanha.custoPorCompra
                })),
                destaques: meta ? {
                    maisCompras: meta.melhorConversao,
                    maiorAlcance: meta.maiorAlcance,
                    maiorInvestimento: meta.maiorInvestimento,
                    maisCliques: meta.maiorVolumeCliques
                } : null,
                decisoesEstrategicas: informacoes.decisoes || '',
                avisosDaFonte: meta?.avisos || []
            };
        }

        case 'conclusao':
            return {
                focoDaAnalise: informacoes.focoAnalise || '',
                vendas: compactarVendas(fontes.vendasAtual),
                plataformas: indicadores.plataformas || null,
                googleAnalytics: indicadores.googleAnalytics || null,
                visitas: indicadores.visitas || null,
                metaAds: indicadores.metaAds || null,
                variacaoMensalPercentual: comparativos.variacaoMensal || null,
                variacaoAnualPercentual: comparativos.variacaoAnual || null,
                decisoesEstrategicas: informacoes.decisoes || '',
                proximosPassos: informacoes.proximosPassos || '',
                observacoesObrigatorias: informacoes.observacoesConclusao || '',
                avisosDaConsolidacao: consolidado.verificacao?.avisos || [],
                memoriaMensal: memoriaResumida(consolidado, { comSerie: false })
            };

        default:
            return {};
    }
}

function obterRegistro(secaoId) {
    return estadoAplicacao.relatorio.analisesIA?.[secaoId] || null;
}

function sincronizarComConsolidado() {
    if (estadoAplicacao.relatorio.consolidado) {
        estadoAplicacao.relatorio.consolidado.analisesIA = {
            ...(estadoAplicacao.relatorio.analisesIA || {})
        };
    }
}

function salvarRegistro(secao, alteracoes) {
    const atual = obterRegistro(secao.id) || {};
    const agora = new Date().toISOString();

    estadoAplicacao.relatorio.analisesIA[secao.id] = {
        secao: secao.id,
        titulo: secao.titulo,
        pagina: secao.pagina,
        texto: '',
        status: 'pendente',
        versao: 0,
        geradoEm: null,
        atualizadoEm: agora,
        ...atual,
        ...alteracoes,
        atualizadoEm: agora
    };

    sincronizarComConsolidado();
    if (['gerado', 'editado', 'manual'].includes(estadoAplicacao.relatorio.analisesIA[secao.id].status)) {
        agendarSalvarAnalisesNaMemoria();
    }
    window.dispatchEvent(new CustomEvent('relatorio:analise-alterada', {
        detail: { secao: secao.id }
    }));
    return estadoAplicacao.relatorio.analisesIA[secao.id];
}

function rotuloStatus(registro, disponivel) {
    if (!disponivel && !registro?.texto) return { classe: 'indisponivel', texto: 'Indisponível' };

    const status = registro?.status || 'pendente';
    const mapa = {
        pendente: { classe: 'pendente', texto: 'Pendente' },
        processando: { classe: 'processando', texto: 'Gerando...' },
        gerado: { classe: 'gerado', texto: 'Gerada pela IA' },
        editado: { classe: 'editado', texto: 'Editada' },
        manual: { classe: 'editado', texto: 'Texto manual' },
        erro: { classe: 'erro', texto: 'Erro' }
    };

    return mapa[status] || mapa.pendente;
}

function formatarDataHora(valor) {
    if (!valor) return 'Ainda não gerada';

    const data = new Date(valor);
    return Number.isNaN(data.getTime())
        ? 'Data indisponível'
        : data.toLocaleString('pt-BR');
}

function montarCard(secao, consolidado) {
    const registro = obterRegistro(secao.id);
    const disponivel = secao.disponivel(consolidado);
    const status = rotuloStatus(registro, disponivel);
    const possuiTexto = Boolean(registro?.texto?.trim());
    const textoBotao = possuiTexto ? 'Gerar nova versão' : 'Gerar análise';
    const desabilitado = !disponivel || registro?.status === 'processando' || geracaoEmLote;

    return `
        <article class="relatorio-analise-card" data-analise-card="${secao.id}">
            <div class="relatorio-analise-card-topo">
                <div class="relatorio-analise-identificacao">
                    <span class="relatorio-analise-pagina">Página ${secao.pagina}</span>
                    <div>
                        <h4>${escaparHtml(secao.titulo)}</h4>
                        <p>${escaparHtml(secao.descricao)}</p>
                    </div>
                </div>
                <span class="relatorio-analise-status analise-status-${status.classe}">${status.texto}</span>
            </div>

            ${!disponivel
                ? `<p class="relatorio-analise-indisponivel">⚠️ ${escaparHtml(secao.motivoIndisponivel)} O campo continua livre para texto manual.</p>`
                : ''}

            <textarea
                class="relatorio-analise-texto"
                data-analise-texto="${secao.id}"
                rows="7"
                placeholder="A análise aparecerá aqui e poderá ser editada antes da criação da prévia."
                ${registro?.status === 'processando' ? 'disabled' : ''}
            >${escaparHtml(registro?.texto || '')}</textarea>

            <div class="relatorio-analise-card-rodape">
                <small>
                    ${registro?.status === 'erro'
                        ? `Erro: ${escaparHtml(registro.erro || 'não foi possível gerar a análise')}`
                        : `Última atualização: ${formatarDataHora(registro?.atualizadoEm)}`}
                </small>
                <button
                    type="button"
                    class="btn-analise-gerar"
                    data-gerar-analise="${secao.id}"
                    ${desabilitado ? 'disabled' : ''}
                >${registro?.status === 'processando' ? 'Gerando...' : textoBotao}</button>
            </div>
        </article>
    `;
}

function atualizarResumo() {
    const total = SECOES_ANALISE.length;
    const consolidado = estadoAplicacao.relatorio.consolidado;
    const registros = estadoAplicacao.relatorio.analisesIA || {};
    const prontas = SECOES_ANALISE.filter(secao => Boolean(registros[secao.id]?.texto?.trim())).length;
    const indisponiveis = SECOES_ANALISE.filter(secao => (
        !secao.disponivel(consolidado)
        && !registros[secao.id]?.texto?.trim()
    )).length;
    const erros = SECOES_ANALISE.filter(secao => registros[secao.id]?.status === 'erro').length;
    const pendentesDisponiveis = SECOES_ANALISE.filter(secao => (
        secao.disponivel(consolidado)
        && !registros[secao.id]?.texto?.trim()
    )).length;

    const resumo = obterElemento('relResumoAnalisesIA');
    if (resumo) {
        resumo.innerHTML = `
            <div><span>Análises com texto</span><strong>${prontas}/${total}</strong></div>
            <div><span>Pendentes disponíveis</span><strong>${pendentesDisponiveis}</strong></div>
            <div><span>Sem dados suficientes</span><strong>${indisponiveis}</strong></div>
            <div><span>Com erro</span><strong>${erros}</strong></div>
        `;
    }

    const botaoRelatorio = obterElemento('btnGerarRelatorio');
    if (botaoRelatorio && consolidado) {
        const homologacao = estadoAplicacao.relatorio.homologacao;
        const liberado = Boolean(homologacao?.prontoParaVisual);
        botaoRelatorio.disabled = !liberado;
        botaoRelatorio.className = liberado
            ? 'btn-principal btn-gerar-previa'
            : 'btn-relatorio-bloqueado';
        botaoRelatorio.textContent = liberado
            ? `Gerar/atualizar prévia do relatório — ${prontas}/${total} análises`
            : 'Corrija os erros da homologação para liberar a prévia';
    }
}

function renderizarCards() {
    const consolidado = estadoAplicacao.relatorio.consolidado;
    const lista = obterElemento('relListaAnalisesIA');
    if (!lista || !consolidado) return;

    lista.innerHTML = SECOES_ANALISE
        .map(secao => montarCard(secao, consolidado))
        .join('');

    const botaoLote = obterElemento('btnGerarAnalisesPendentes');
    if (botaoLote) {
        const existemPendentesDisponiveis = SECOES_ANALISE.some(secao => {
            const registro = obterRegistro(secao.id);
            return secao.disponivel(consolidado) && !registro?.texto?.trim();
        });

        botaoLote.disabled = geracaoEmLote || !existemPendentesDisponiveis;
        botaoLote.textContent = geracaoEmLote
            ? 'Gerando análises...'
            : existemPendentesDisponiveis
                ? 'Gerar análises pendentes'
                : 'Todas as análises disponíveis possuem texto';
    }

    atualizarResumo();
}

function atualizarProgresso(atual, total, mensagem = '') {
    const barra = obterElemento('relBarraAnalisesIA');
    const status = obterElemento('relStatusAnalisesIA');
    const percentual = total > 0 ? Math.round((atual / total) * 100) : 0;

    if (barra) barra.style.width = `${percentual}%`;
    if (status) status.textContent = mensagem || `${atual} de ${total} análises processadas.`;
}

async function gerarAnalise(secaoId, { confirmarSobrescrita = true } = {}) {
    const consolidado = estadoAplicacao.relatorio.consolidado;
    const secao = SECOES_ANALISE.find(item => item.id === secaoId);

    if (!consolidado || !secao) return false;

    if (!secao.disponivel(consolidado)) {
        alert(secao.motivoIndisponivel);
        return false;
    }

    const registroAtual = obterRegistro(secaoId);
    if (
        confirmarSobrescrita
        && registroAtual?.texto?.trim()
        && registroAtual.status === 'editado'
        && !window.confirm('Esta análise foi editada manualmente. Deseja substituir o texto por uma nova versão do Gemini?')
    ) {
        return false;
    }

    salvarRegistro(secao, {
        status: 'processando',
        erro: null
    });
    renderizarCards();

    try {
        const resposta = await gerarAnaliseSecaoApi({
            secao: secao.id,
            periodo: consolidado.periodoFormatado || consolidado.periodo,
            contexto: contextoDaSecao(secao.id, consolidado)
        });

        const texto = String(resposta?.analise || '').trim();
        if (!texto) {
            throw new Error('O Gemini retornou uma análise vazia.');
        }

        salvarRegistro(secao, {
            texto,
            status: 'gerado',
            versao: Number(registroAtual?.versao || 0) + 1,
            geradoEm: new Date().toISOString(),
            erro: null
        });
        renderizarCards();
        return true;
    } catch (erro) {
        console.error(`Erro ao gerar a análise ${secao.id}:`, erro);
        salvarRegistro(secao, {
            status: 'erro',
            erro: erro.message || 'Falha ao gerar a análise.'
        });
        renderizarCards();
        return false;
    }
}

async function gerarAnalisesPendentes({ silencioso = false } = {}) {
    const consolidado = estadoAplicacao.relatorio.consolidado;
    if (!consolidado || geracaoEmLote) return;

    const pendentes = SECOES_ANALISE.filter(secao => {
        const registro = obterRegistro(secao.id);
        return secao.disponivel(consolidado) && !registro?.texto?.trim();
    });

    if (!pendentes.length) {
        if (silencioso) return;
        alert('Todas as análises disponíveis já possuem texto. Use o botão individual para gerar uma nova versão.');
        return;
    }

    geracaoEmLote = true;

    pendentes.forEach(secao => {
        salvarRegistro(secao, {
            status: 'processando',
            erro: null
        });
    });

    renderizarCards();
    atualizarProgresso(0, pendentes.length, `Enviando ${pendentes.length} seção(ões) em uma única solicitação ao Gemini...`);

    try {
        const resposta = await gerarAnalisesRelatorioApi({
            periodo: consolidado.periodoFormatado || consolidado.periodo,
            secoes: pendentes.map(secao => ({
                id: secao.id,
                contexto: contextoDaSecao(secao.id, consolidado)
            }))
        });

        const analisesRecebidas = resposta?.analises && typeof resposta.analises === 'object'
            ? resposta.analises
            : {};

        let concluidas = 0;
        let erros = 0;
        const geradoEm = resposta?.geradoEm || new Date().toISOString();

        pendentes.forEach(secao => {
            const texto = String(analisesRecebidas[secao.id] || '').trim();
            const registroAtual = obterRegistro(secao.id);

            if (!texto) {
                erros++;
                salvarRegistro(secao, {
                    status: 'erro',
                    erro: 'O Gemini não devolveu texto para esta seção.'
                });
                return;
            }

            concluidas++;
            salvarRegistro(secao, {
                texto,
                status: 'gerado',
                versao: Number(registroAtual?.versao || 0) + 1,
                geradoEm,
                erro: null
            });
        });

        renderizarCards();
        atualizarProgresso(
            concluidas,
            pendentes.length,
            erros
                ? `${concluidas} análise(s) preenchida(s) e ${erros} seção(ões) sem resposta. Os textos recebidos foram preservados.`
                : `${concluidas} análise(s) distribuída(s) automaticamente com uma única chamada ao Gemini.`
        );
    } catch (erro) {
        console.error('Erro ao gerar as análises em conjunto:', erro);

        pendentes.forEach(secao => {
            salvarRegistro(secao, {
                status: 'erro',
                erro: erro.message || 'Falha ao gerar as análises em conjunto.'
            });
        });

        renderizarCards();
        atualizarProgresso(0, pendentes.length, erro.message || 'Não foi possível gerar as análises em conjunto.');
    } finally {
        geracaoEmLote = false;
        renderizarCards();
    }
}

function editarTexto(evento) {
    const textarea = evento.target.closest('[data-analise-texto]');
    if (!textarea) return;

    const secaoId = textarea.dataset.analiseTexto;
    const secao = SECOES_ANALISE.find(item => item.id === secaoId);
    if (!secao) return;

    const texto = textarea.value;
    const atual = obterRegistro(secaoId);
    const status = texto.trim()
        ? (atual?.geradoEm ? 'editado' : 'manual')
        : 'pendente';

    salvarRegistro(secao, {
        texto,
        status,
        erro: null
    });

    const card = textarea.closest('[data-analise-card]');
    const statusElemento = card?.querySelector('.relatorio-analise-status');
    const botao = card?.querySelector('[data-gerar-analise]');
    const rodape = card?.querySelector('.relatorio-analise-card-rodape small');

    if (statusElemento) {
        const novoStatus = rotuloStatus(obterRegistro(secaoId), true);
        statusElemento.className = `relatorio-analise-status analise-status-${novoStatus.classe}`;
        statusElemento.textContent = novoStatus.texto;
    }

    if (botao) {
        botao.textContent = texto.trim() ? 'Gerar nova versão' : 'Gerar análise';
    }

    if (rodape) {
        rodape.textContent = `Última atualização: ${formatarDataHora(obterRegistro(secaoId)?.atualizadoEm)}`;
    }

    atualizarResumo();
}

function tratarClique(evento) {
    const botaoIndividual = evento.target.closest('[data-gerar-analise]');
    if (botaoIndividual) {
        gerarAnalise(botaoIndividual.dataset.gerarAnalise);
        return;
    }

    if (evento.target.closest('#btnGerarAnalisesPendentes')) {
        gerarAnalisesPendentes();
    }
}

export function prepararPainelAnalisesIA(consolidado) {
    const painel = obterElemento('relPainelAnalisesIA');
    if (!painel || !consolidado) return;

    estadoAplicacao.relatorio.analisesIA = {};
    consolidado.analisesIA = {};
    painel.hidden = false;
    atualizarProgresso(0, SECOES_ANALISE.length, 'Dados consolidados. O botão principal gera todas as análises pendentes em uma única chamada; os botões individuais regeneram apenas uma seção.');
    renderizarCards();
    gerarAutomaticamenteSePossivel();
}

function geracaoAutomaticaAtiva() {
    const caixa = obterElemento('relGerarAnalisesAutomaticamente');
    return caixa ? caixa.checked : true;
}

// Gera todas as análises disponíveis logo após a validação, sem precisar de clique.
async function gerarAutomaticamenteSePossivel() {
    if (!geracaoAutomaticaAtiva() || geracaoEmLote) return;
    try {
        const resposta = await fetch('/api/configuracao-gemini');
        const configuracao = await resposta.json();
        if (!configuracao?.configurado) {
            atualizarProgresso(0, SECOES_ANALISE.length, 'Configure a chave do Gemini (botão Configurações) para gerar as análises automaticamente.');
            return;
        }
    } catch {
        return;
    }
    atualizarProgresso(0, SECOES_ANALISE.length, 'Gerando as análises automaticamente com base nos dados do mês e no histórico...');
    await gerarAnalisesPendentes({ silencioso: true });
}

export function restaurarPainelAnalisesIA(consolidado, analises = {}) {
    const painel = obterElemento('relPainelAnalisesIA');
    if (!painel || !consolidado) return;

    estadoAplicacao.relatorio.analisesIA = { ...(analises || {}) };
    consolidado.analisesIA = { ...(analises || {}) };
    painel.hidden = false;

    const prontas = Object.values(estadoAplicacao.relatorio.analisesIA)
        .filter(registro => Boolean(registro?.texto?.trim())).length;

    atualizarProgresso(
        prontas,
        SECOES_ANALISE.length,
        `Projeto carregado com ${prontas} de ${SECOES_ANALISE.length} análise(s) preenchida(s).`
    );
    renderizarCards();
}

export function invalidarPainelAnalisesIA() {
    estadoAplicacao.relatorio.analisesIA = {};

    if (estadoAplicacao.relatorio.consolidado) {
        estadoAplicacao.relatorio.consolidado.analisesIA = {};
    }

    const painel = obterElemento('relPainelAnalisesIA');
    if (painel) painel.hidden = true;

    const barra = obterElemento('relBarraAnalisesIA');
    if (barra) barra.style.width = '0%';
}

export function inicializarAnalisesIA() {
    if (painelInicializado) return;

    const painel = obterElemento('relPainelAnalisesIA');
    if (!painel) return;

    painel.addEventListener('click', tratarClique);
    painel.addEventListener('input', editarTexto);

    const caixa = obterElemento('relGerarAnalisesAutomaticamente');
    if (caixa) {
        try {
            const salvo = localStorage.getItem(CHAVE_AUTOMATICO);
            if (salvo !== null) caixa.checked = salvo === '1';
        } catch {
            // Preferência apenas local.
        }
        caixa.addEventListener('change', () => {
            try { localStorage.setItem(CHAVE_AUTOMATICO, caixa.checked ? '1' : '0'); } catch { /* ignora */ }
        });
    }
    painelInicializado = true;
}
