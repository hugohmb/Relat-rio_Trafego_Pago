import { aplicarTemaNosGraficosInterface } from '../tema.js';
import { estadoAplicacao } from '../estado.js';
import { processarArquivoVendasTray } from '../processadores/vendas-tray.js';
import { processarArquivoVisitasTray } from '../processadores/visitas-tray.js';
import { processarArquivoMetaAds } from '../processadores/meta-ads.js';
import { processarArquivoProdutosGa } from '../processadores/produtos-ga.js';
import { processarArquivoResumoGa } from '../processadores/resumo-ga.js';
import { consolidarDadosRelatorio } from '../relatorio/consolidacao.js';
import {
    invalidarPainelAnalisesIA,
    prepararPainelAnalisesIA,
    restaurarPainelAnalisesIA
} from '../relatorio/analises-ia.js';
import {
    converterParaNumero,
    escaparHtml,
    formatarMoeda,
    lerPlanilhaAsync
} from '../utilitarios.js';
import {
    EXTENSOES_ACEITAS,
    identificarPlanilha,
    lerPlanilhaDetalhada
} from '../leitor-arquivos.js';
import {
    carregarMemorias,
    construirContextoMemoria,
    obterMemoria,
    salvarMemoriaDoRelatorio,
    vendasDaMemoria
} from '../relatorio/memoria.js';

// Tipo identificado pelo conteúdo do arquivo → tipo esperado em cada campo.
const TIPO_CONTEUDO_POR_CAMPO = {
    'ga-resumo': 'ga-resumo',
    'produtos-ga': 'ga-produtos',
    'tray-atual': 'tray-vendas',
    'tray-historico': 'tray-vendas',
    'visitas-tray': 'tray-visitas',
    'meta-ads': 'meta-ads'
};

const ARQUIVOS_RELATORIO = [
    {
        chave: 'gaResumo',
        inputId: 'relArquivoGaResumo',
        nomeId: 'relNomeGaResumo',
        statusId: 'relStatusGaResumo',
        titulo: 'Resumo do Google Analytics',
        tipo: 'ga-resumo'
    },
    {
        chave: 'produtos',
        inputId: 'relArquivoProdutos',
        nomeId: 'relNomeProdutos',
        statusId: 'relStatusProdutos',
        titulo: 'Produtos mais vendidos',
        tipo: 'produtos-ga'
    },
    {
        chave: 'vendasAtual',
        inputId: 'relArquivoVendasAtual',
        nomeId: 'relNomeVendasAtual',
        statusId: 'relStatusVendasAtual',
        titulo: 'Vendas Tray — mês atual',
        tipo: 'tray-atual'
    },
    {
        chave: 'visitas',
        inputId: 'relArquivoVisitas',
        nomeId: 'relNomeVisitas',
        statusId: 'relStatusVisitas',
        titulo: 'Comportamento de visitas',
        tipo: 'visitas-tray'
    },
    {
        chave: 'hist1',
        inputId: 'relHistArquivo1',
        nomeId: 'relNomeHist1',
        statusId: 'relStatusHist1',
        titulo: 'Vendas Tray — dois meses atrás',
        tipo: 'tray-historico',
        nomeInputId: 'relHistNome1',
        googleInputId: 'relHistGoogle1',
        metaInputId: 'relHistMeta1',
        tipoPeriodo: 'recente'
    },
    {
        chave: 'hist2',
        inputId: 'relHistArquivo2',
        nomeId: 'relNomeHist2',
        statusId: 'relStatusHist2',
        titulo: 'Vendas Tray — mês anterior',
        tipo: 'tray-historico',
        nomeInputId: 'relHistNome2',
        googleInputId: 'relHistGoogle2',
        metaInputId: 'relHistMeta2',
        tipoPeriodo: 'recente'
    },
    {
        chave: 'histAno',
        inputId: 'relHistArquivoAno',
        nomeId: 'relNomeHistAno',
        statusId: 'relStatusHistAno',
        titulo: 'Vendas Tray — mesmo mês do ano anterior',
        tipo: 'tray-historico',
        nomeInputId: 'relHistNomeAno',
        googleInputId: 'relHistGoogleAno',
        metaInputId: 'relHistMetaAno',
        tipoPeriodo: 'anual',
        opcional: true
    },
    {
        chave: 'metaAds',
        inputId: 'relArquivoMetaAds',
        nomeId: 'relNomeMetaAds',
        statusId: 'relStatusMetaAds',
        titulo: 'Desempenho Meta Ads',
        tipo: 'meta-ads'
    }
];

const CAMPOS_MONETARIOS_ATUAIS = [
    'relInvestGoogle',
    'relInvestMeta',
    'relReceitaMetaManual'
];

const CAMPOS_QUE_INVALIDAM_CONSOLIDACAO = [
    'relFocoAnalise',
    'relImplementacoes',
    'relCorrecoes',
    'relDecisoes',
    'relProximosPassos',
    'relObservacoesConclusao',
    'relOrigemReceitaMeta',
    'relHistNome1',
    'relHistGoogle1',
    'relHistMeta1',
    'relHistNome2',
    'relHistGoogle2',
    'relHistMeta2',
    'relHistNomeAno',
    'relHistGoogleAno',
    'relHistMetaAno'
];

let graficoVisitasRelatorio = null;
let graficoMetaAdsRelatorio = null;
let graficoProdutosRelatorio = null;
let graficoResumoGaRelatorio = null;

function obterElemento(id) {
    return document.getElementById(id);
}

function obterArquivo(configuracao) {
    return obterElemento(configuracao.inputId)?.files?.[0] || null;
}

function invalidarConsolidacao() {
    if (
        estadoAplicacao.relatorio.status === 'processando'
        || (!estadoAplicacao.relatorio.validacao && !estadoAplicacao.relatorio.consolidado)
    ) {
        return;
    }

    estadoAplicacao.relatorio.status = 'desatualizado';
    estadoAplicacao.relatorio.validacao = null;
    estadoAplicacao.relatorio.consolidado = null;
    estadoAplicacao.relatorio.homologacao = null;
    estadoAplicacao.relatorio.previa = null;
    invalidarPainelAnalisesIA();
    window.dispatchEvent(new CustomEvent('relatorio:invalidado'));

    const resumo = obterElemento('relResumoValidacao');
    const painelConsolidacao = obterElemento('relPainelConsolidacao');
    const painelHomologacao = obterElemento('relPainelHomologacao');
    if (resumo) resumo.hidden = true;
    if (painelConsolidacao) painelConsolidacao.hidden = true;
    if (painelHomologacao) painelHomologacao.hidden = true;

    [
        'relResumoVendasAtual',
        'relResumoGa',
        'relResumoProdutos',
        'relResumoVisitas',
        'relResumoMetaAds'
    ].forEach(id => {
        const painel = obterElemento(id);
        if (painel) painel.hidden = true;
    });

    atualizarStatusGeral(
        'As entradas foram alteradas. Execute a validação novamente para atualizar a consolidação.',
        'aviso'
    );

    const situacao = obterElemento('relResumoSituacao');
    if (situacao) situacao.textContent = 'Alterações aguardando nova validação';
}

function ehArquivoExcel(arquivo) {
    return Boolean(arquivo && EXTENSOES_ACEITAS.test(arquivo.name));
}

function memoriaDoCampoHistorico(configuracao) {
    if (configuracao.tipo !== 'tray-historico') return null;
    const periodo = obterElemento(configuracao.nomeInputId)?.value || '';
    return periodo ? obterMemoria(periodo) : null;
}

function campoHistoricoCoberto(configuracao) {
    return Boolean(obterArquivo(configuracao) || memoriaDoCampoHistorico(configuracao));
}

// Mostra em cada card de histórico se o mês já está salvo e preenche os
// investimentos daquele mês automaticamente (sem sobrescrever o que foi digitado).
function atualizarHistoricoPelaMemoria() {
    ARQUIVOS_RELATORIO.filter(item => item.tipo === 'tray-historico').forEach(configuracao => {
        const memoria = memoriaDoCampoHistorico(configuracao);
        const aviso = obterElemento(configuracao.statusId?.replace('relStatus', 'relMemoria'));
        const formatar = valor => Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (memoria) {
            const google = obterElemento(configuracao.googleInputId);
            const meta = obterElemento(configuracao.metaInputId);
            if (google && !google.value.trim()) google.value = formatar(memoria.investimentos?.google);
            if (meta && !meta.value.trim()) meta.value = formatar(memoria.investimentos?.meta);
        }

        if (aviso) {
            aviso.hidden = !memoria;
            aviso.textContent = memoria
                ? (obterArquivo(configuracao)
                    ? 'Histórico salvo encontrado — a planilha selecionada terá prioridade.'
                    : '✓ Usando o histórico salvo (recalculado com o banco de parceiros atual).')
                : '';
        }

        if (!obterArquivo(configuracao)) {
            atualizarStatusArquivo(
                configuracao,
                memoria ? 'valido' : configuracao.opcional ? 'opcional' : 'aguardando',
                memoria ? 'Histórico' : configuracao.opcional ? 'Opcional' : 'Aguardando'
            );
        }
    });
    atualizarContadorArquivos();
}

function atualizarStatusArquivo(configuracao, tipo, texto) {
    const status = obterElemento(configuracao.statusId);
    if (!status) return;

    status.className = `relatorio-status-arquivo status-${tipo}`;
    status.textContent = texto;
}

function atualizarNomeArquivo(configuracao) {
    const arquivo = obterArquivo(configuracao);
    const nome = obterElemento(configuracao.nomeId);

    if (nome) {
        nome.textContent = arquivo?.name || (
            configuracao.tipo === 'tray-historico'
                ? 'Selecionar planilha'
                : 'Nenhum arquivo selecionado'
        );
    }

    atualizarStatusArquivo(
        configuracao,
        arquivo ? 'selecionado' : configuracao.opcional ? 'opcional' : 'aguardando',
        arquivo ? 'Selecionado' : configuracao.opcional ? 'Opcional' : 'Aguardando'
    );

    invalidarConsolidacao();
    atualizarContadorArquivos();
    if (configuracao.tipo === 'tray-historico') atualizarHistoricoPelaMemoria();
}

function atualizarContadorArquivos() {
    const obrigatorios = ARQUIVOS_RELATORIO.filter(item => !item.opcional);
    const opcionais = ARQUIVOS_RELATORIO.filter(item => item.opcional);
    const obrigatoriosSelecionados = obrigatorios.filter(campoHistoricoCoberto).length;
    const opcionaisSelecionados = opcionais.filter(campoHistoricoCoberto).length;
    const contador = obterElemento('relContadorEntradas');
    const situacao = obterElemento('relResumoSituacao');

    if (contador) {
        const opcionalTexto = opcionais.length
            ? ` · ${opcionaisSelecionados}/${opcionais.length} opcional(is)`
            : '';
        contador.textContent = `${obrigatoriosSelecionados}/${obrigatorios.length} obrigatórios${opcionalTexto}`;
    }

    if (situacao) {
        situacao.textContent = obrigatoriosSelecionados === obrigatorios.length
            ? opcionaisSelecionados
                ? 'Arquivos obrigatórios e comparativo anual selecionados'
                : 'Arquivos obrigatórios prontos; comparativo anual não informado'
            : 'Preenchimento em andamento';
    }
}

function obterPeriodoFormatado() {
    const valor = obterElemento('relPeriodoReferencia')?.value;
    if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return '';

    const [ano, mes] = valor.split('-').map(Number);
    const data = new Date(ano, mes - 1, 1);
    const texto = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).format(data);

    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function atualizarPeriodoReutilizado() {
    const elemento = obterElemento('relPeriodoAtualReutilizado');
    if (!elemento) return;

    const periodo = obterPeriodoFormatado();
    elemento.textContent = periodo || 'Aguardando mês de referência';
}

function deslocarPeriodo(periodo, meses) {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return '';
    const [ano, mes] = periodo.split('-').map(Number);
    const data = new Date(ano, mes - 1 + meses, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function atualizarPeriodosHistoricosSugeridos() {
    const atual = obterElemento('relPeriodoReferencia')?.value || '';
    if (!atual) return;

    const sugestoes = {
        relHistNome1: deslocarPeriodo(atual, -2),
        relHistNome2: deslocarPeriodo(atual, -1),
        relHistNomeAno: deslocarPeriodo(atual, -12)
    };

    Object.entries(sugestoes).forEach(([id, valor]) => {
        const campo = obterElemento(id);
        if (campo && campo.value !== valor) {
            campo.value = valor;
            // Mês mudou: limpa investimentos para serem preenchidos pelo histórico.
            const sufixo = id.replace('relHistNome', '');
            ['relHistGoogle', 'relHistMeta'].forEach(prefixo => {
                const investimento = obterElemento(`${prefixo}${sufixo}`);
                if (investimento) investimento.value = '';
            });
        }
    });
    atualizarHistoricoPelaMemoria();
}

function calcularRetornoGooglePeloGa(dadosGa = estadoAplicacao.relatorio.resultados?.gaResumo) {
    if (!dadosGa?.pago || !dadosGa?.outros) {
        return null;
    }

    const receitaPaga = converterParaNumero(dadosGa.pago.receita);
    const receitaOutros = converterParaNumero(dadosGa.outros.receita);
    return Math.max(0, receitaPaga - receitaOutros);
}

function calcularReceitaGoogleExibidaPeloGa(dadosGa = estadoAplicacao.relatorio.resultados?.gaResumo) {
    if (!dadosGa?.pago) {
        return null;
    }

    return Math.max(0, converterParaNumero(dadosGa.pago.receita));
}

function obterValoresAtuais() {
    const investimentoGoogle = converterParaNumero(obterElemento('relInvestGoogle')?.value);
    const investimentoMeta = converterParaNumero(obterElemento('relInvestMeta')?.value);
    const receitaGoogleCalculada = calcularRetornoGooglePeloGa();
    const receitaGoogleDisponivel = receitaGoogleCalculada !== null;
    const receitaGoogle = receitaGoogleDisponivel ? receitaGoogleCalculada : 0;
    const receitaGoogleExibidaCalculada = calcularReceitaGoogleExibidaPeloGa();
    const receitaGoogleExibidaDisponivel = receitaGoogleExibidaCalculada !== null;
    const receitaGoogleExibida = receitaGoogleExibidaDisponivel ? receitaGoogleExibidaCalculada : 0;
    const campoReceitaMeta = obterElemento('relReceitaMetaManual')?.value?.trim() || '';
    const receitaMeta = converterParaNumero(campoReceitaMeta);
    const receitaMetaDisponivel = Boolean(campoReceitaMeta) && receitaMeta > 0;
    const origemReceitaMeta = obterElemento('relOrigemReceitaMeta')?.value?.trim() || '';

    return {
        receitaGoogle,
        receitaGoogleDisponivel,
        criterioReceitaGoogle: 'Receita do tráfego pago no GA4 menos a receita de Outros.',
        receitaGoogleExibida,
        receitaGoogleExibidaDisponivel,
        criterioReceitaGoogleExibida: 'Receita da categoria Tráfego pago no GA4.',
        investimentoGoogle,
        receitaMeta: receitaMetaDisponivel ? receitaMeta : 0,
        receitaMetaDisponivel,
        origemReceitaMeta,
        investimentoMeta,
        receitaAtribuidaTotal: receitaGoogle,
        investimentoTotal: investimentoGoogle + investimentoMeta
    };
}

function atualizarTotaisManuais() {
    const valores = obterValoresAtuais();
    const retornoGoogle = obterElemento('relReceitaGoogleCalculada');
    const criterioGoogle = obterElemento('relCriterioReceitaGoogle');
    const situacaoMeta = obterElemento('relReceitaMetaSituacao');
    const retornoDisponivel = obterElemento('relReceitaAtribuidaTotal');

    obterElemento('relInvestimentoTotal').textContent = formatarMoeda(valores.investimentoTotal);

    if (retornoGoogle) {
        retornoGoogle.textContent = valores.receitaGoogleExibidaDisponivel
            ? formatarMoeda(valores.receitaGoogleExibida)
            : 'Aguardando GA4';
    }

    if (criterioGoogle) {
        criterioGoogle.textContent = valores.receitaGoogleExibidaDisponivel
            ? 'GA4 — categoria “Tráfego pago”'
            : 'Categoria “Tráfego pago”';
    }

    if (situacaoMeta) {
        situacaoMeta.textContent = valores.receitaMetaDisponivel
            ? `${formatarMoeda(valores.receitaMeta)} informado manualmente.`
            : 'Não apurado enquanto o campo estiver vazio.';
    }

    if (retornoDisponivel) {
        retornoDisponivel.textContent = valores.receitaGoogleDisponivel
            ? formatarMoeda(valores.receitaAtribuidaTotal)
            : 'Aguardando GA4';
    }
}

function campoFoiPreenchido(id) {
    return Boolean(obterElemento(id)?.value?.trim());
}

function validarCamposObrigatorios() {
    const erros = [];

    if (!obterElemento('relPeriodoReferencia')?.value) {
        erros.push('Informe o mês de referência.');
    }

    [
        ['relHistNome1', 'Mês de dois meses atrás'],
        ['relHistNome2', 'Mês anterior']
    ].forEach(([id, rotulo]) => {
        if (!obterElemento(id)?.value) erros.push(`Preencha: ${rotulo}.`);
    });

    const camposMonetarios = [
        ['relInvestGoogle', 'Investimento Google Ads'],
        ['relInvestMeta', 'Investimento Meta Ads'],
        ['relHistGoogle1', 'Investimento Google Ads de dois meses atrás'],
        ['relHistMeta1', 'Investimento Meta Ads de dois meses atrás'],
        ['relHistGoogle2', 'Investimento Google Ads do mês anterior'],
        ['relHistMeta2', 'Investimento Meta Ads do mês anterior']
    ];

    camposMonetarios.forEach(([id, rotulo]) => {
        const periodoHistorico = id.match(/^relHist(?:Google|Meta)(\d)$/)?.[1];
        const cobertoPelaMemoria = periodoHistorico
            && obterMemoria(obterElemento(`relHistNome${periodoHistorico}`)?.value || '');
        if (!campoFoiPreenchido(id) && !cobertoPelaMemoria) {
            erros.push(`Preencha: ${rotulo}.`);
        }
    });

    return erros;
}

async function validarArquivoBasico(arquivo) {
    const linhas = await lerPlanilhaAsync(arquivo);
    const linhasComConteudo = linhas.filter(linha =>
        Array.isArray(linha) && linha.some(celula => String(celula ?? '').trim() !== '')
    );

    if (linhasComConteudo.length === 0) {
        throw new Error('A planilha não possui dados utilizáveis.');
    }

    return {
        quantidadeLinhas: linhasComConteudo.length,
        quantidadeColunas: Math.max(...linhasComConteudo.map(linha => linha.length), 0)
    };
}

function formatarPeriodoHistorico(periodo, fallback = '') {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return fallback;
    const [ano, mes] = periodo.split('-').map(Number);
    const texto = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).format(new Date(ano, mes - 1, 1));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function obterDadosPeriodoHistorico(configuracao) {
    const periodo = obterElemento(configuracao.nomeInputId)?.value?.trim() || '';
    const nome = formatarPeriodoHistorico(
        periodo,
        configuracao.titulo.replace('Vendas Tray — ', '')
    );
    const investimentoGoogle = converterParaNumero(
        obterElemento(configuracao.googleInputId)?.value
    );
    const investimentoMeta = converterParaNumero(
        obterElemento(configuracao.metaInputId)?.value
    );

    return {
        nome,
        periodo,
        tipo: configuracao.tipoPeriodo,
        investimentoGoogle,
        investimentoMeta,
        investimentoTotal: investimentoGoogle + investimentoMeta
    };
}

function atualizarBarraProgresso(atual, total) {
    const percentual = total > 0 ? Math.round((atual / total) * 100) : 0;
    const barra = obterElemento('relBarraProgresso');
    if (barra) barra.style.width = `${percentual}%`;
}

function atualizarStatusGeral(mensagem, tipo = '') {
    const elemento = obterElemento('relStatusGeral');
    if (!elemento) return;

    elemento.className = `relatorio-status-geral ${tipo ? `relatorio-status-geral-${tipo}` : ''}`;
    elemento.textContent = mensagem;
}

function adicionarEtapaProcessamento(titulo, estado, detalhe = '') {
    const lista = obterElemento('relListaProcessamento');
    if (!lista) return;

    const icones = {
        processando: '⏳',
        sucesso: '✅',
        erro: '❌',
        aviso: '⚠️'
    };

    const itemExistente = lista.querySelector(`[data-etapa="${CSS.escape(titulo)}"]`);
    const conteudo = `
        <span class="relatorio-processamento-icone">${icones[estado] || '•'}</span>
        <div>
            <strong>${escaparHtml(titulo)}</strong>
            ${detalhe ? `<small>${escaparHtml(detalhe)}</small>` : ''}
        </div>
    `;

    if (itemExistente) {
        itemExistente.className = `relatorio-processamento-item processamento-${estado}`;
        itemExistente.innerHTML = conteudo;
        return;
    }

    const item = document.createElement('div');
    item.dataset.etapa = titulo;
    item.className = `relatorio-processamento-item processamento-${estado}`;
    item.innerHTML = conteudo;
    lista.appendChild(item);
}

function montarResumoVendasAtual(dados) {
    const painel = obterElemento('relResumoVendasAtual');
    if (!painel) return;

    painel.hidden = false;
    painel.innerHTML = `
        <div><span>Faturamento geral</span><strong>${formatarMoeda(dados.fatGeral)}</strong></div>
        <div><span>Parceiros</span><strong>${formatarMoeda(dados.fatParceiros)}</strong></div>
        <div><span>Sem parceiros</span><strong>${formatarMoeda(dados.fatSemParceiros)}</strong></div>
        <div><span>Pedidos</span><strong>${dados.qtdGeral}</strong></div>
    `;
}

function formatarNumero(valor, casas = 0) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    }).format(valor);
}

function gerarGraficoResumoGa(dados) {
    const canvas = obterElemento('relGraficoResumoGa');
    if (!canvas || typeof Chart === 'undefined') return;

    if (graficoResumoGaRelatorio) {
        graficoResumoGaRelatorio.destroy();
    }

    graficoResumoGaRelatorio = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dados.grafico.labels,
            datasets: [
                {
                    label: 'Adições ao carrinho',
                    data: dados.grafico.carrinhos,
                    backgroundColor: 'rgba(52, 87, 45, 0.76)',
                    borderColor: '#34572d',
                    borderWidth: 1,
                    borderRadius: 5
                },
                {
                    label: 'Compras',
                    data: dados.grafico.compras,
                    backgroundColor: 'rgba(230, 126, 34, 0.76)',
                    borderColor: '#c76712',
                    borderWidth: 1,
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: contexto =>
                            `${contexto.dataset.label}: ${formatarNumero(contexto.parsed.y)}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Quantidade' }
                }
            }
        }
    });
    aplicarTemaNosGraficosInterface();
}

function montarCartaoResumoGa(categoria) {
    const observacaoArppu = categoria.arppuEstimado
        ? '<small>Estimativa por receita ÷ compras</small>'
        : '<small>ARPPU informado pelo GA4</small>';

    return `
        <article class="relatorio-ga-cartao relatorio-ga-cartao-${categoria.chave}">
            <h4>${escaparHtml(categoria.titulo)}</h4>
            <dl>
                <div><dt>Adicionar ao carrinho</dt><dd>${formatarNumero(categoria.carrinhos)}</dd></div>
                <div><dt>Compras</dt><dd>${formatarNumero(categoria.compras)}</dd></div>
                <div><dt>Receita de compra</dt><dd>${formatarMoeda(categoria.receita)}</dd></div>
                <div><dt>ARPPU</dt><dd>${formatarMoeda(categoria.arppu)}</dd></div>
            </dl>
            ${observacaoArppu}
        </article>
    `;
}

function montarResumoGa(dados) {
    const painel = obterElemento('relResumoGa');
    if (!painel) return;

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-ga-kpis">
            <div><span>Adições ao carrinho</span><strong>${formatarNumero(dados.todos.carrinhos)}</strong></div>
            <div><span>Compras</span><strong>${formatarNumero(dados.todos.compras)}</strong></div>
            <div><span>Receita total</span><strong>${formatarMoeda(dados.todos.receita)}</strong></div>
            <div><span>Participação paga na receita</span><strong>${formatarNumero(dados.participacaoPago.receita, 1)}%</strong></div>
        </div>

        <div class="relatorio-ga-cartoes">
            ${dados.categorias.map(montarCartaoResumoGa).join('')}
        </div>

        <div class="relatorio-ga-destaques">
            <p><strong>Tráfego pago:</strong> ${formatarNumero(dados.pago.compras)} compras e ${formatarMoeda(dados.pago.receita)}, correspondendo a ${formatarNumero(dados.participacaoPago.compras, 1)}% das compras e ${formatarNumero(dados.participacaoPago.receita, 1)}% da receita registrada no resumo.</p>
            ${dados.avisos.length
                ? `<div class="relatorio-ga-avisos">${dados.avisos.map(aviso => `<p>⚠️ ${escaparHtml(aviso)}</p>`).join('')}</div>`
                : '<p class="relatorio-ga-ok">Todos os blocos do resumo foram processados sem avisos.</p>'}
        </div>

        <div class="relatorio-ga-grafico"><canvas id="relGraficoResumoGa"></canvas></div>
    `;

    gerarGraficoResumoGa(dados);
}

function gerarGraficoVisitas(dados) {
    const canvas = obterElemento('relGraficoVisitas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (graficoVisitasRelatorio) {
        graficoVisitasRelatorio.destroy();
    }

    graficoVisitasRelatorio = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dados.grafico.labels,
            datasets: [{
                label: 'Visitas diárias',
                data: dados.grafico.visitas,
                borderColor: '#34572d',
                backgroundColor: 'rgba(52, 87, 45, 0.12)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.25,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: contexto => `${contexto.parsed.y} visitas`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 15 }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Visitas' }
                }
            }
        }
    });
    aplicarTemaNosGraficosInterface();
}

function montarResumoVisitas(dados) {
    const painel = obterElemento('relResumoVisitas');
    if (!painel) return;

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-visitas-kpis">
            <div><span>Total de visitas</span><strong>${formatarNumero(dados.totalVisitas)}</strong></div>
            <div><span>Pageviews</span><strong>${formatarNumero(dados.totalPageviews)}</strong></div>
            <div><span>Pedidos iniciados</span><strong>${formatarNumero(dados.totalPedidosIniciados)}</strong></div>
            <div><span>Conversão</span><strong>${formatarNumero(dados.conversaoGeral, 2)}%</strong></div>
            <div><span>Média diária</span><strong>${formatarNumero(dados.mediaVisitasDia, 1)}</strong></div>
            <div><span>Dias analisados</span><strong>${dados.quantidadeDias}</strong></div>
        </div>
        <div class="relatorio-visitas-destaques">
            <p><strong>Maior volume:</strong> ${formatarNumero(dados.maiorVisitas.visitas)} visitas em ${escaparHtml(dados.maiorVisitas.dataFormatada)}.</p>
            <p><strong>Menor volume:</strong> ${formatarNumero(dados.menorVisitas.visitas)} visitas em ${escaparHtml(dados.menorVisitas.dataFormatada)}.</p>
            ${dados.avisos.length
                ? `<p class="relatorio-visitas-aviso"><strong>Aviso:</strong> ${escaparHtml(dados.avisos.join(' '))}</p>`
                : '<p class="relatorio-visitas-ok">Os totais da planilha conferem com a soma dos dados diários.</p>'}
        </div>
        <div class="relatorio-visitas-grafico"><canvas id="relGraficoVisitas"></canvas></div>
    `;

    gerarGraficoVisitas(dados);
}


function abreviarNomeProduto(nome, limite = 46) {
    const texto = String(nome || '').trim();
    return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

function gerarGraficoProdutos(dados) {
    const canvas = obterElemento('relGraficoProdutos');
    if (!canvas || typeof Chart === 'undefined') return;

    if (graficoProdutosRelatorio) {
        graficoProdutosRelatorio.destroy();
    }

    graficoProdutosRelatorio = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dados.grafico.labels.map(nome => abreviarNomeProduto(nome)),
            datasets: [{
                label: 'Itens comprados',
                data: dados.grafico.itensComprados,
                backgroundColor: 'rgba(52, 87, 45, 0.78)',
                borderColor: '#34572d',
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: itens => dados.grafico.labels[itens[0]?.dataIndex] || '',
                        label: contexto => `${formatarNumero(contexto.parsed.x)} itens comprados`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: 'Itens comprados' }
                },
                y: {
                    grid: { display: false },
                    ticks: { autoSkip: false }
                }
            }
        }
    });
    aplicarTemaNosGraficosInterface();
}

function montarLinhasProdutos(produtos) {
    return produtos.map(produto => `
        <tr>
            <td class="relatorio-produtos-posicao">${produto.posicao}</td>
            <td title="${escaparHtml(produto.nome)}">${escaparHtml(produto.nome)}</td>
            <td>${formatarNumero(produto.itensComprados)}</td>
            <td>${formatarMoeda(produto.receita)}</td>
        </tr>
    `).join('');
}

function montarTabelaProdutos(titulo, produtos) {
    return `
        <div class="relatorio-produtos-grupo">
            <h4>${escaparHtml(titulo)}</h4>
            <div class="relatorio-produtos-tabela-container">
                <table class="relatorio-produtos-tabela">
                    <thead>
                        <tr>
                            <th>Pos.</th>
                            <th>Produto</th>
                            <th>Comprados</th>
                            <th>Receita</th>
                        </tr>
                    </thead>
                    <tbody>${montarLinhasProdutos(produtos)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function montarResumoProdutos(dados) {
    const painel = obterElemento('relResumoProdutos');
    if (!painel) return;

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-produtos-kpis">
            <div><span>Produtos com vendas</span><strong>${formatarNumero(dados.quantidadeProdutosComCompra)}</strong></div>
            <div><span>Itens comprados</span><strong>${formatarNumero(dados.totalItensComprados)}</strong></div>
            <div><span>Receita total</span><strong>${formatarMoeda(dados.receitaTotal)}</strong></div>
            <div><span>Participação do Top 20</span><strong>${formatarNumero(dados.participacaoTop20Receita, 1)}%</strong></div>
        </div>
        <div class="relatorio-produtos-destaques">
            <p><strong>1º colocado:</strong> ${escaparHtml(dados.produtosTop20[0].nome)} — ${formatarNumero(dados.produtosTop20[0].itensComprados)} itens e ${formatarMoeda(dados.produtosTop20[0].receita)}.</p>
            ${dados.avisos.length
                ? `<div class="relatorio-produtos-avisos">${dados.avisos.map(aviso => `<p>⚠️ ${escaparHtml(aviso)}</p>`).join('')}</div>`
                : '<p class="relatorio-produtos-ok">Os 20 produtos foram localizados, ordenados e separados para as páginas 4 e 5.</p>'}
        </div>
        <div class="relatorio-produtos-grafico"><canvas id="relGraficoProdutos"></canvas></div>
        <div class="relatorio-produtos-tabelas">
            ${montarTabelaProdutos('Página 4 — posições 1 a 10', dados.pagina1)}
            ${montarTabelaProdutos('Página 5 — posições 11 a 20', dados.pagina2)}
        </div>
    `;

    gerarGraficoProdutos(dados);
}

function abreviarRotuloCampanha(nome, limite = 34) {
    const texto = String(nome || '').trim();
    return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

function gerarGraficoMetaAds(dados) {
    const canvas = obterElemento('relGraficoMetaAds');
    if (!canvas || typeof Chart === 'undefined') return;

    if (graficoMetaAdsRelatorio) {
        graficoMetaAdsRelatorio.destroy();
    }

    graficoMetaAdsRelatorio = new Chart(canvas.getContext('2d'), {
        data: {
            labels: dados.grafico.labels.map(nome => abreviarRotuloCampanha(nome)),
            datasets: [
                {
                    type: 'bar',
                    label: 'Investimento (R$)',
                    data: dados.grafico.investimento,
                    backgroundColor: 'rgba(52, 87, 45, 0.72)',
                    borderColor: '#34572d',
                    borderWidth: 1,
                    yAxisID: 'yInvestimento'
                },
                {
                    type: 'line',
                    label: 'Compras',
                    data: dados.grafico.compras,
                    borderColor: '#e67e22',
                    backgroundColor: '#e67e22',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.2,
                    yAxisID: 'yCompras'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        title: itens => dados.grafico.labels[itens[0]?.dataIndex] || '',
                        label: contexto => contexto.dataset.yAxisID === 'yInvestimento'
                            ? `Investimento: ${formatarMoeda(contexto.parsed.y)}`
                            : `Compras: ${formatarNumero(contexto.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: false }
                },
                yInvestimento: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'Investimento (R$)' },
                    ticks: {
                        callback: valor => new Intl.NumberFormat('pt-BR', {
                            notation: 'compact',
                            maximumFractionDigits: 1
                        }).format(valor)
                    }
                },
                yCompras: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Compras' }
                }
            }
        }
    });
    aplicarTemaNosGraficosInterface();
}

function montarTabelaCampanhasMeta(campanhas) {
    return campanhas.map(campanha => `
        <tr>
            <td title="${escaparHtml(campanha.nome)}">${escaparHtml(campanha.nome)}</td>
            <td>${formatarNumero(campanha.alcance)}</td>
            <td>${formatarNumero(campanha.impressoes)}</td>
            <td>${formatarNumero(campanha.cliques)}</td>
            <td>${formatarMoeda(campanha.cpc)}</td>
            <td>${formatarMoeda(campanha.valorUsado)}</td>
            <td>${formatarNumero(campanha.compras)}</td>
        </tr>
    `).join('');
}

function montarResumoMetaAds(dados) {
    const painel = obterElemento('relResumoMetaAds');
    if (!painel) return;

    const investimentoManual = estadoAplicacao.relatorio.investimentos.investimentoMeta || 0;
    const diferencaInvestimento = Math.abs(investimentoManual - dados.valorUsado);
    const avisos = [...dados.avisos];

    if (investimentoManual > 0 && diferencaInvestimento > 0.02) {
        avisos.push(
            `O investimento manual do Meta Ads (${formatarMoeda(investimentoManual)}) ` +
            `difere do valor usado na planilha (${formatarMoeda(dados.valorUsado)}).`
        );
    }

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-meta-kpis">
            <div><span>Alcance</span><strong>${formatarNumero(dados.alcance)}</strong></div>
            <div><span>Impressões</span><strong>${formatarNumero(dados.impressoes)}</strong></div>
            <div><span>Frequência</span><strong>${formatarNumero(dados.frequencia, 2)}x</strong></div>
            <div><span>Cliques</span><strong>${formatarNumero(dados.cliques)}</strong></div>
            <div><span>CTR</span><strong>${formatarNumero(dados.ctr, 2)}%</strong></div>
            <div><span>CPC</span><strong>${formatarMoeda(dados.cpc)}</strong></div>
            <div><span>Investimento</span><strong>${formatarMoeda(dados.valorUsado)}</strong></div>
            <div><span>Compras</span><strong>${formatarNumero(dados.compras)}</strong></div>
        </div>

        <div class="relatorio-meta-destaques">
            <p><strong>Campanhas processadas:</strong> ${dados.quantidadeCampanhas}.</p>
            ${dados.melhorConversao
                ? `<p><strong>Maior volume de compras:</strong> ${escaparHtml(dados.melhorConversao.nome)} (${formatarNumero(dados.melhorConversao.compras)}).</p>`
                : '<p><strong>Maior volume de compras:</strong> nenhuma compra atribuída às campanhas.</p>'}
            ${dados.maiorAlcance
                ? `<p><strong>Maior alcance:</strong> ${escaparHtml(dados.maiorAlcance.nome)} (${formatarNumero(dados.maiorAlcance.alcance)}).</p>`
                : ''}
            ${avisos.length
                ? `<div class="relatorio-meta-avisos">${avisos.map(aviso => `<p>⚠️ ${escaparHtml(aviso)}</p>`).join('')}</div>`
                : '<p class="relatorio-meta-ok">Os totais consolidados conferem com as campanhas e com o investimento informado.</p>'}
        </div>

        <div class="relatorio-meta-grafico"><canvas id="relGraficoMetaAds"></canvas></div>

        <div class="relatorio-meta-tabela-container">
            <table class="relatorio-meta-tabela">
                <thead>
                    <tr>
                        <th>Campanha</th>
                        <th>Alcance</th>
                        <th>Impressões</th>
                        <th>Cliques</th>
                        <th>CPC</th>
                        <th>Investimento</th>
                        <th>Compras</th>
                    </tr>
                </thead>
                <tbody>${montarTabelaCampanhasMeta(dados.campanhas)}</tbody>
            </table>
        </div>
    `;

    gerarGraficoMetaAds(dados);
}

function coletarInformacoesTextuais() {
    return {
        focoAnalise: obterElemento('relFocoAnalise')?.value?.trim() || '',
        implementacoes: obterElemento('relImplementacoes')?.value?.trim() || '',
        correcoes: obterElemento('relCorrecoes')?.value?.trim() || '',
        decisoes: obterElemento('relDecisoes')?.value?.trim() || '',
        proximosPassos: obterElemento('relProximosPassos')?.value?.trim() || '',
        observacoesConclusao: obterElemento('relObservacoesConclusao')?.value?.trim() || ''
    };
}

function formatarVariacao(valor) {
    if (valor === null || valor === undefined || !Number.isFinite(valor)) {
        return 'Base anterior zerada';
    }

    const sinal = valor > 0 ? '+' : '';
    return `${sinal}${formatarNumero(valor, 1)}%`;
}

function montarPainelConsolidacao(consolidado) {
    const painel = obterElemento('relPainelConsolidacao');
    if (!painel) return;

    const verificacao = consolidado.verificacao;
    const variacaoAnual = consolidado.comparativos.variacaoAnual;
    const possuiComparativoAnual = Boolean(consolidado.comparativos.anoAnterior);
    const plataformas = consolidado.indicadores.plataformas;
    const vendas = consolidado.indicadores.vendas;

    const paginasHtml = consolidado.paginas.map(item => {
        const icones = {
            pronto: '✅',
            atencao: '⚠️',
            pendente: '❌'
        };
        const rotulos = {
            pronto: 'Pronta',
            atencao: 'Atenção',
            pendente: 'Pendente'
        };
        const mensagens = [...item.bloqueios, ...item.avisos];

        return `
            <article class="relatorio-pagina-status pagina-status-${item.status}">
                <div class="relatorio-pagina-status-topo">
                    <span class="relatorio-pagina-numero">${item.numero}</span>
                    <div>
                        <h4>${escaparHtml(item.titulo)}</h4>
                        <p>${escaparHtml(item.detalhe || '')}</p>
                    </div>
                    <span class="relatorio-pagina-situacao">${icones[item.status]} ${rotulos[item.status]}</span>
                </div>
                ${mensagens.length
                    ? `<ul>${mensagens.map(mensagem => `<li>${escaparHtml(mensagem)}</li>`).join('')}</ul>`
                    : ''}
            </article>
        `;
    }).join('');

    const avisosHtml = verificacao.avisos.length
        ? `<div class="relatorio-consolidacao-avisos">
            <h4>Avisos para revisão</h4>
            <ul>${verificacao.avisos.map(aviso => `<li>${escaparHtml(aviso)}</li>`).join('')}</ul>
        </div>`
        : '<div class="relatorio-consolidacao-sem-avisos">✅ Nenhum aviso adicional foi identificado.</div>';

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-consolidacao-cabecalho">
            <div>
                <span class="relatorio-etapa">ETAPA 8</span>
                <h3>Consolidação geral do relatório</h3>
                <p>Todos os processadores alimentam agora uma única estrutura de dados.</p>
            </div>
            <span class="relatorio-consolidacao-selo ${verificacao.prontoParaProximaEtapa ? 'selo-pronto' : 'selo-pendente'}">
                ${verificacao.prontoParaProximaEtapa ? 'Dados consolidados' : 'Revisão necessária'}
            </span>
        </div>

        <div class="relatorio-consolidacao-kpis">
            <div><span>Páginas prontas</span><strong>${verificacao.totalProntas}/${verificacao.totalPaginas}</strong></div>
            <div><span>Com atenção</span><strong>${verificacao.totalAtencao}</strong></div>
            <div><span>Pendentes</span><strong>${verificacao.totalPendentes}</strong></div>
            <div><span>ROAS Google</span><strong>${formatarNumero(plataformas.roasGoogle, 2)}x</strong></div>
            <div><span>ROAS Meta</span><strong>${plataformas.receitaMetaDisponivel ? `${formatarNumero(plataformas.roasMeta, 2)}x` : "Não apurado"}</strong></div>
            <div><span>ROAS sem parceiros</span><strong>${formatarNumero(vendas.roasSemParceiros, 2)}x</strong></div>
        </div>

        <div class="relatorio-consolidacao-comparacoes">
            <div>
                <span>Variação anual do faturamento</span>
                <strong>${possuiComparativoAnual ? formatarVariacao(variacaoAnual?.fatGeral) : 'Não informado'}</strong>
            </div>
            <div>
                <span>Variação anual sem parceiros</span>
                <strong>${possuiComparativoAnual ? formatarVariacao(variacaoAnual?.fatSemParceiros) : 'Não informado'}</strong>
            </div>
            <div>
                <span>Variação anual de pedidos</span>
                <strong>${possuiComparativoAnual ? formatarVariacao(variacaoAnual?.qtdGeral) : 'Não informado'}</strong>
            </div>
            <div>
                <span>Variação anual do ticket médio</span>
                <strong>${possuiComparativoAnual ? formatarVariacao(variacaoAnual?.tmGeral) : 'Não informado'}</strong>
            </div>
        </div>

        <div class="relatorio-paginas-status-grid">${paginasHtml}</div>
        ${avisosHtml}

        <div class="relatorio-consolidacao-rodape">
            <strong>${verificacao.prontoParaProximaEtapa
                ? 'A base numérica está pronta para as análises do Gemini e para a construção da prévia.'
                : 'Corrija as páginas pendentes e execute a validação novamente.'}</strong>
            <small>Consolidação gerada em ${new Date(consolidado.consolidadoEm).toLocaleString('pt-BR')}.</small>
        </div>
    `;
}

function mostrarResumoValidacao(resultados, erros) {
    const painel = obterElemento('relResumoValidacao');
    if (!painel) return;

    const arquivosValidos = resultados.filter(item => item.sucesso && !item.ignorado).length;
    const arquivosEnviados = ARQUIVOS_RELATORIO.filter(obterArquivo).length;
    const vendasAtual = estadoAplicacao.relatorio.resultados.vendasAtual;

    painel.hidden = false;
    painel.innerHTML = `
        <div class="relatorio-validacao-card">
            <span>Arquivos validados</span>
            <strong>${arquivosValidos}/${arquivosEnviados}</strong>
        </div>
        <div class="relatorio-validacao-card">
            <span>Período</span>
            <strong>${escaparHtml(obterPeriodoFormatado() || 'Não informado')}</strong>
        </div>
        <div class="relatorio-validacao-card">
            <span>Faturamento atual</span>
            <strong>${vendasAtual ? formatarMoeda(vendasAtual.fatGeral) : 'Indisponível'}</strong>
        </div>
        <div class="relatorio-validacao-card ${erros.length ? 'validacao-com-erro' : 'validacao-pronta'}">
            <span>Situação</span>
            <strong>${erros.length ? `${erros.length} pendência(s)` : 'Entradas preparadas'}</strong>
        </div>
    `;
}

// Alertas de digitação que a comparação com o mês anterior consegue detectar.
function adicionarAvisosDeContinuidade(consolidado) {
    const historico = estadoAplicacao.relatorio.resultados.historico || [];
    const anterior = historico.filter(item => item.tipo === 'recente').slice(-1)[0];
    const investimentos = estadoAplicacao.relatorio.investimentos || {};
    const avisos = consolidado.verificacao.avisos;

    if (anterior) {
        const igual = (a, b) => Number(a) > 0 && Math.abs(Number(a) - Number(b)) < 0.005;
        if (igual(investimentos.investimentoGoogle, anterior.investimentoGoogle)) {
            avisos.push(`O investimento do Google Ads (${formatarMoeda(investimentos.investimentoGoogle)}) é idêntico ao de ${anterior.nome}. Confirme se o valor foi atualizado.`);
        }
        if (igual(investimentos.investimentoMeta, anterior.investimentoMeta)) {
            avisos.push(`O investimento do Meta Ads (${formatarMoeda(investimentos.investimentoMeta)}) é idêntico ao de ${anterior.nome}. Confirme se o valor foi atualizado.`);
        }
    }

    const vendas = estadoAplicacao.relatorio.resultados.vendasAtual;
    if (vendas && anterior && anterior.fatGeral > 0) {
        const partAtual = vendas.fatParceiros / vendas.fatGeral;
        const partAnterior = anterior.fatParceiros / anterior.fatGeral;
        if (Math.abs(partAtual - partAnterior) > 0.15) {
            avisos.push(
                `A participação dos parceiros mudou de ${(partAnterior * 100).toFixed(1)}% para ${(partAtual * 100).toFixed(1)}% em um mês. ` +
                'Variações tão grandes costumam indicar planilha exportada de forma diferente ou parceiros ainda não cadastrados.'
            );
        }
    }

    consolidado.verificacao.avisos = [...new Set(avisos)];
}

function atribuirArquivoAoCampo(inputId, arquivo) {
    const input = obterElemento(inputId);
    if (!input) return false;
    const transferencia = new DataTransfer();
    transferencia.items.add(arquivo);
    input.files = transferencia.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

// Recebe vários arquivos de uma vez e coloca cada um no campo correto.
async function distribuirArquivos(listaArquivos) {
    const arquivos = [...(listaArquivos || [])];
    const resultado = obterElemento('relZonaResultado');
    if (!arquivos.length || !resultado) return;

    resultado.hidden = false;
    resultado.innerHTML = '<li><b>Lendo…</b><span>Identificando os arquivos.</span></li>';

    const identificados = [];
    for (const arquivo of arquivos) {
        if (!ehArquivoExcel(arquivo)) {
            identificados.push({ arquivo, erro: 'Formato não suportado.' });
            continue;
        }
        try {
            const leitura = await lerPlanilhaDetalhada(arquivo);
            identificados.push({ arquivo, leitura, ...identificarPlanilha(leitura.linhas) });
        } catch (erro) {
            identificados.push({ arquivo, erro: erro.message });
        }
    }

    // Sem mês definido: usa o mês mais frequente entre os arquivos do mês atual.
    const campoPeriodo = obterElemento('relPeriodoReferencia');
    if (campoPeriodo && !campoPeriodo.value) {
        const contagem = {};
        identificados
            .filter(item => item.periodo && item.tipo && item.tipo !== 'tray-vendas')
            .forEach(item => { contagem[item.periodo] = (contagem[item.periodo] || 0) + 1; });
        const maisFrequente = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0]
            || identificados.find(item => item.tipo === 'tray-vendas')?.periodo
            || '';
        if (maisFrequente) {
            campoPeriodo.value = maisFrequente;
            campoPeriodo.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    const periodoAtual = campoPeriodo?.value || '';
    const camposPorTipo = {
        'ga-resumo': 'relArquivoGaResumo',
        'ga-produtos': 'relArquivoProdutos',
        'tray-visitas': 'relArquivoVisitas',
        'meta-ads': 'relArquivoMetaAds'
    };
    const camposVendas = {
        [periodoAtual]: 'relArquivoVendasAtual',
        [obterElemento('relHistNome1')?.value || '-']: 'relHistArquivo1',
        [obterElemento('relHistNome2')?.value || '-']: 'relHistArquivo2',
        [obterElemento('relHistNomeAno')?.value || '-']: 'relHistArquivoAno'
    };
    const rotulosCampo = {
        relArquivoVendasAtual: 'Vendas do mês atual',
        relHistArquivo1: 'Histórico — dois meses atrás',
        relHistArquivo2: 'Histórico — mês anterior',
        relHistArquivoAno: 'Histórico — ano anterior'
    };

    const linhas = identificados.map(item => {
        const nome = escaparHtml(item.arquivo.name);
        if (item.erro) return `<li class="zona-erro"><b>Erro</b><span>${nome}: ${escaparHtml(item.erro)}</span></li>`;
        if (!item.tipo) return `<li class="zona-erro"><b>Não identificado</b><span>${nome}</span></li>`;

        const destino = item.tipo === 'tray-vendas' ? camposVendas[item.periodo] : camposPorTipo[item.tipo];
        const detalhes = [item.periodo, item.leitura?.formato, item.leitura?.codificacao].filter(Boolean).join(' · ');

        if (!destino) {
            return `<li class="zona-aviso"><b>${escaparHtml(item.rotulo)}</b><span>${nome} (${escaparHtml(detalhes)}) — mês fora do relatório atual; não foi usado.</span></li>`;
        }
        if (item.tipo !== 'tray-vendas' && periodoAtual && item.periodo && item.periodo !== periodoAtual) {
            atribuirArquivoAoCampo(destino, item.arquivo);
            return `<li class="zona-aviso"><b>${escaparHtml(item.rotulo)}</b><span>${nome} — atenção: os dados são de ${escaparHtml(item.periodo)}, mas o relatório é de ${escaparHtml(periodoAtual)}.</span></li>`;
        }

        atribuirArquivoAoCampo(destino, item.arquivo);
        const rotuloDestino = rotulosCampo[destino] || item.rotulo;
        return `<li class="zona-ok"><b>✓ ${escaparHtml(rotuloDestino)}</b><span>${nome} (${escaparHtml(detalhes)})</span></li>`;
    });

    resultado.innerHTML = linhas.join('');
    atualizarHistoricoPelaMemoria();
}

function inicializarZonaArquivos() {
    const zona = obterElemento('relZonaArquivos');
    const entrada = obterElemento('relEntradaMultipla');
    if (!zona || !entrada) return;

    zona.addEventListener('click', evento => {
        if (evento.target.closest('#relZonaResultado')) return;
        entrada.click();
    });
    zona.addEventListener('keydown', evento => {
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            entrada.click();
        }
    });
    entrada.addEventListener('change', () => {
        distribuirArquivos(entrada.files);
        entrada.value = '';
    });
    ['dragenter', 'dragover'].forEach(tipo => zona.addEventListener(tipo, evento => {
        evento.preventDefault();
        zona.classList.add('arrastando');
    }));
    ['dragleave', 'drop'].forEach(tipo => zona.addEventListener(tipo, evento => {
        evento.preventDefault();
        zona.classList.remove('arrastando');
    }));
    zona.addEventListener('drop', evento => distribuirArquivos(evento.dataTransfer?.files));
}

async function validarEPrepararRelatorio() {
    const botao = obterElemento('btnValidarRelatorio');
    const lista = obterElemento('relListaProcessamento');
    const resumo = obterElemento('relResumoValidacao');
    await carregarMemorias();
    atualizarHistoricoPelaMemoria();
    const errosCampos = validarCamposObrigatorios();
    const arquivosAusentes = ARQUIVOS_RELATORIO.filter(configuracao => !configuracao.opcional && !campoHistoricoCoberto(configuracao));

    if (errosCampos.length || arquivosAusentes.length) {
        const mensagens = [
            ...errosCampos,
            ...arquivosAusentes.map(item => `Selecione: ${item.titulo}.`)
        ];

        atualizarStatusGeral(
            `Existem ${mensagens.length} entrada(s) obrigatória(s) pendente(s).`,
            'erro'
        );
        alert(`Revise as entradas antes de continuar:\n\n${mensagens.join('\n')}`);
        return;
    }

    if (lista) lista.innerHTML = '';
    if (resumo) resumo.hidden = true;
    const painelConsolidacao = obterElemento('relPainelConsolidacao');
    const painelHomologacao = obterElemento('relPainelHomologacao');
    if (painelConsolidacao) painelConsolidacao.hidden = true;
    if (painelHomologacao) painelHomologacao.hidden = true;

    [
        'relResumoVendasAtual',
        'relResumoGa',
        'relResumoProdutos',
        'relResumoVisitas',
        'relResumoMetaAds'
    ].forEach(id => {
        const painel = obterElemento(id);
        if (painel) painel.hidden = true;
    });

    botao.disabled = true;
    const textoOriginal = botao.textContent;
    botao.textContent = 'Validando dados...';
    atualizarBarraProgresso(0, ARQUIVOS_RELATORIO.length);
    atualizarStatusGeral('Iniciando a validação dos arquivos...', 'processando');

    estadoAplicacao.relatorio.status = 'processando';
    estadoAplicacao.relatorio.periodo = obterElemento('relPeriodoReferencia').value;
    estadoAplicacao.relatorio.periodoFormatado = obterPeriodoFormatado();
    estadoAplicacao.relatorio.informacoesDoPeriodo = coletarInformacoesTextuais();
    estadoAplicacao.relatorio.arquivos = {};
    estadoAplicacao.relatorio.consolidado = null;
    estadoAplicacao.relatorio.homologacao = null;
    estadoAplicacao.relatorio.analisesIA = {};
    invalidarPainelAnalisesIA();
    estadoAplicacao.relatorio.resultados = {
        vendasAtual: null,
        gaResumo: null,
        visitas: null,
        metaAds: null,
        produtos: null,
        historico: [],
        validacoesBasicas: {}
    };
    estadoAplicacao.relatorio.investimentos = obterValoresAtuais();
    atualizarTotaisManuais();

    const resultados = [];
    const erros = [];

    for (let indice = 0; indice < ARQUIVOS_RELATORIO.length; indice++) {
        const configuracao = ARQUIVOS_RELATORIO[indice];
        const arquivo = obterArquivo(configuracao);

        const memoriaHistorico = !arquivo ? memoriaDoCampoHistorico(configuracao) : null;
        if (memoriaHistorico) {
            const periodo = obterDadosPeriodoHistorico(configuracao);
            const investimentoGoogle = campoFoiPreenchido(configuracao.googleInputId)
                ? periodo.investimentoGoogle
                : Number(memoriaHistorico.investimentos?.google || 0);
            const investimentoMeta = campoFoiPreenchido(configuracao.metaInputId)
                ? periodo.investimentoMeta
                : Number(memoriaHistorico.investimentos?.meta || 0);
            const vendas = vendasDaMemoria(
                { ...memoriaHistorico, investimentos: { ...memoriaHistorico.investimentos, total: investimentoGoogle + investimentoMeta } },
                estadoAplicacao.parceiros
            );
            estadoAplicacao.relatorio.resultados.historico.push({
                ...periodo,
                investimentoGoogle,
                investimentoMeta,
                investimentoTotal: investimentoGoogle + investimentoMeta,
                ...vendas,
                origemDados: 'memoria',
                periodoDetectado: memoriaHistorico.periodo,
                avisos: vendas.recalculadoComBancoAtual ? [] : ['Histórico salvo sem pedidos detalhados; valores de parceiros não foram recalculados com o banco atual.']
            });
            resultados.push({ chave: configuracao.chave, sucesso: true, dados: vendas });
            atualizarStatusArquivo(configuracao, 'valido', 'Histórico');
            adicionarEtapaProcessamento(
                configuracao.titulo,
                'sucesso',
                `Histórico salvo de ${periodo.nome}: ${formatarMoeda(vendas.fatGeral)} (parceiros ${formatarMoeda(vendas.fatParceiros)})`
            );
            atualizarBarraProgresso(indice + 1, ARQUIVOS_RELATORIO.length);
            continue;
        }

        if (!arquivo && configuracao.opcional) {
            resultados.push({
                chave: configuracao.chave,
                sucesso: true,
                ignorado: true,
                detalhe: 'Comparativo anual opcional não informado.'
            });
            atualizarStatusArquivo(configuracao, 'opcional', 'Não informado');
            adicionarEtapaProcessamento(
                configuracao.titulo,
                'aviso',
                'Opcional — o relatório seguirá sem comparação anual.'
            );
            atualizarBarraProgresso(indice + 1, ARQUIVOS_RELATORIO.length);
            continue;
        }

        adicionarEtapaProcessamento(configuracao.titulo, 'processando', arquivo.name);
        atualizarStatusArquivo(configuracao, 'processando', 'Validando');
        atualizarStatusGeral(
            `Validando ${configuracao.titulo} (${indice + 1} de ${ARQUIVOS_RELATORIO.length})...`,
            'processando'
        );

        try {
            if (!ehArquivoExcel(arquivo)) {
                throw new Error('Utilize um arquivo XLSX, XLS ou CSV.');
            }

            estadoAplicacao.relatorio.arquivos[configuracao.chave] = arquivo;
            let dados;

            // Confere pelo conteúdo se o arquivo foi colocado no campo certo.
            const leitura = await lerPlanilhaDetalhada(arquivo);
            const identificado = identificarPlanilha(leitura.linhas);
            const esperado = TIPO_CONTEUDO_POR_CAMPO[configuracao.tipo];
            if (esperado && identificado.tipo && identificado.tipo !== esperado) {
                throw new Error(`Este arquivo parece ser "${identificado.rotulo}"${identificado.periodo ? ` de ${identificado.periodo}` : ''}, e não o esperado para este campo.`);
            }

            if (configuracao.tipo === 'ga-resumo') {
                dados = await processarArquivoResumoGa(
                    arquivo,
                    estadoAplicacao.relatorio.periodo
                );
                estadoAplicacao.relatorio.resultados.gaResumo = dados;
                estadoAplicacao.relatorio.investimentos = obterValoresAtuais();
                atualizarTotaisManuais();
                montarResumoGa(dados);
            } else if (configuracao.tipo === 'tray-atual') {
                dados = await processarArquivoVendasTray(
                    arquivo,
                    estadoAplicacao.parceiros,
                    estadoAplicacao.relatorio.investimentos.investimentoTotal,
                    estadoAplicacao.relatorio.periodo
                );
                estadoAplicacao.relatorio.resultados.vendasAtual = dados;
                montarResumoVendasAtual(dados);
            } else if (configuracao.tipo === 'visitas-tray') {
                dados = await processarArquivoVisitasTray(
                    arquivo,
                    estadoAplicacao.relatorio.periodo
                );
                estadoAplicacao.relatorio.resultados.visitas = dados;
                montarResumoVisitas(dados);
            } else if (configuracao.tipo === 'produtos-ga') {
                dados = await processarArquivoProdutosGa(
                    arquivo,
                    estadoAplicacao.relatorio.periodo
                );
                estadoAplicacao.relatorio.resultados.produtos = dados;
                montarResumoProdutos(dados);
            } else if (configuracao.tipo === 'meta-ads') {
                dados = await processarArquivoMetaAds(
                    arquivo,
                    estadoAplicacao.relatorio.periodo
                );
                estadoAplicacao.relatorio.resultados.metaAds = dados;
                montarResumoMetaAds(dados);
            } else if (configuracao.tipo === 'tray-historico') {
                const periodo = obterDadosPeriodoHistorico(configuracao);
                dados = await processarArquivoVendasTray(
                    arquivo,
                    estadoAplicacao.parceiros,
                    periodo.investimentoTotal,
                    periodo.periodo
                );
                estadoAplicacao.relatorio.resultados.historico.push({
                    ...periodo,
                    ...dados
                });
            } else {
                dados = await validarArquivoBasico(arquivo);
                estadoAplicacao.relatorio.resultados.validacoesBasicas[configuracao.chave] = dados;
            }

            resultados.push({ chave: configuracao.chave, sucesso: true, dados });
            atualizarStatusArquivo(configuracao, 'valido', 'Validado');
            adicionarEtapaProcessamento(
                configuracao.titulo,
                'sucesso',
                configuracao.tipo === 'ga-resumo'
                    ? `${formatarNumero(dados.todos.compras)} compras e ${formatarMoeda(dados.todos.receita)} no resumo do GA4`
                    : configuracao.tipo === 'basico'
                        ? `${dados.quantidadeLinhas} linhas encontradas`
                        : configuracao.tipo === 'visitas-tray'
                        ? `${dados.quantidadeDias} dias e ${formatarNumero(dados.totalVisitas)} visitas processadas`
                        : configuracao.tipo === 'produtos-ga'
                            ? `${dados.quantidadeProdutosSelecionados} produtos selecionados entre ${dados.quantidadeProdutosComCompra} com vendas`
                            : configuracao.tipo === 'meta-ads'
                                ? `${dados.quantidadeCampanhas} campanhas, ${formatarNumero(dados.alcance)} pessoas alcançadas e ${formatarNumero(dados.compras)} compras`
                                : 'Planilha Tray processada com sucesso'
            );
        } catch (erro) {
            console.error(`Erro em ${configuracao.titulo}:`, erro);
            erros.push(`${configuracao.titulo}: ${erro.message}`);
            resultados.push({ chave: configuracao.chave, sucesso: false, erro: erro.message });
            atualizarStatusArquivo(configuracao, 'erro', 'Erro');
            adicionarEtapaProcessamento(configuracao.titulo, 'erro', erro.message);
        }

        atualizarBarraProgresso(indice + 1, ARQUIVOS_RELATORIO.length);
    }

    estadoAplicacao.relatorio.quantidadeParceirosCadastrados = estadoAplicacao.parceiros.length;

    estadoAplicacao.relatorio.validacao = {
        concluidaEm: new Date().toISOString(),
        resultados,
        erros
    };
    estadoAplicacao.relatorio.status = erros.length ? 'com-pendencias' : 'consolidado';
    estadoAplicacao.relatorio.consolidado = consolidarDadosRelatorio(estadoAplicacao.relatorio);
    estadoAplicacao.relatorio.consolidado.memoria = construirContextoMemoria(estadoAplicacao.relatorio);
    adicionarAvisosDeContinuidade(estadoAplicacao.relatorio.consolidado);
    estadoAplicacao.relatorio.previa = null;

    // Guarda o mês na memória assim que as vendas são validadas.
    if (estadoAplicacao.relatorio.resultados.vendasAtual) {
        salvarMemoriaDoRelatorio(estadoAplicacao.relatorio)
            .then(() => adicionarEtapaProcessamento('Histórico mensal', 'sucesso', `${estadoAplicacao.relatorio.periodoFormatado} salvo no histórico do programa.`))
            .catch(erro => adicionarEtapaProcessamento('Histórico mensal', 'aviso', `Não foi possível salvar no histórico: ${erro.message}`));
    }
    window.dispatchEvent(new CustomEvent('relatorio:consolidado'));

    mostrarResumoValidacao(resultados, erros);
    montarPainelConsolidacao(estadoAplicacao.relatorio.consolidado);
    prepararPainelAnalisesIA(estadoAplicacao.relatorio.consolidado);
    atualizarStatusGeral(
        erros.length
            ? `Validação concluída com ${erros.length} pendência(s).`
            : 'Todos os arquivos obrigatórios foram validados. O comparativo anual foi processado apenas quando informado.',
        erros.length ? 'aviso' : 'sucesso'
    );

    const situacao = obterElemento('relResumoSituacao');
    if (situacao) {
        situacao.textContent = erros.length
            ? 'Validação concluída com pendências'
            : 'Dados preparados com sucesso';
    }

    botao.disabled = false;
    botao.textContent = textoOriginal;

    if (erros.length) {
        alert(`A validação foi concluída com pendências:\n\n${erros.join('\n')}`);
    }
}

export function restaurarMontagemRelatorioDoProjeto({ campos = {}, arquivosOriginais = {} } = {}) {
    Object.entries(campos || {}).forEach(([id, valor]) => {
        const campo = obterElemento(id);
        if (campo && 'value' in campo) {
            campo.value = valor ?? '';
        }
    });

    ARQUIVOS_RELATORIO.forEach(configuracao => {
        const input = obterElemento(configuracao.inputId);
        if (input) input.value = '';

        const metadados = arquivosOriginais?.[configuracao.chave];
        const nome = obterElemento(configuracao.nomeId);
        if (nome) {
            nome.textContent = metadados?.name || (
                configuracao.tipo === 'tray-historico'
                    ? 'Selecionar planilha'
                    : 'Nenhum arquivo selecionado'
            );
        }

        atualizarStatusArquivo(
            configuracao,
            metadados ? 'valido' : configuracao.opcional ? 'opcional' : 'aguardando',
            metadados ? 'Projeto carregado' : configuracao.opcional ? 'Opcional' : 'Aguardando'
        );
    });

    if (estadoAplicacao.relatorio.resultados?.gaResumo) {
        estadoAplicacao.relatorio.investimentos = obterValoresAtuais();
    }
    atualizarTotaisManuais();
    atualizarPeriodoReutilizado();
    carregarMemorias().then(atualizarHistoricoPelaMemoria);

    const totalArquivosSalvos = Object.keys(arquivosOriginais || {}).length;
    const contador = obterElemento('relContadorEntradas');
    const situacao = obterElemento('relResumoSituacao');
    if (contador) {
        contador.textContent = `${totalArquivosSalvos} referência(s) carregada(s) · comparativo anual opcional`;
    }
    if (situacao) {
        situacao.textContent = estadoAplicacao.relatorio.consolidado
            ? 'Projeto carregado com dados consolidados'
            : 'Selecione novamente os arquivos para validar';
    }

    const resultados = estadoAplicacao.relatorio.resultados || {};
    if (resultados.vendasAtual) montarResumoVendasAtual(resultados.vendasAtual);
    if (resultados.gaResumo) montarResumoGa(resultados.gaResumo);
    if (resultados.produtos) montarResumoProdutos(resultados.produtos);
    if (resultados.visitas) montarResumoVisitas(resultados.visitas);
    if (resultados.metaAds) montarResumoMetaAds(resultados.metaAds);

    const validacao = estadoAplicacao.relatorio.validacao;
    if (validacao) {
        mostrarResumoValidacao(validacao.resultados || [], validacao.erros || []);
    } else {
        const resumo = obterElemento('relResumoValidacao');
        if (resumo) resumo.hidden = true;
    }

    if (estadoAplicacao.relatorio.consolidado) {
        montarPainelConsolidacao(estadoAplicacao.relatorio.consolidado);
        restaurarPainelAnalisesIA(
            estadoAplicacao.relatorio.consolidado,
            estadoAplicacao.relatorio.analisesIA || {}
        );
        atualizarStatusGeral(
            'Projeto carregado com resultados processados. Os arquivos XLSX precisam ser selecionados novamente apenas para uma nova validação.',
            'sucesso'
        );
    } else {
        const painelConsolidacao = obterElemento('relPainelConsolidacao');
        const painelAnalises = obterElemento('relPainelAnalisesIA');
        if (painelConsolidacao) painelConsolidacao.hidden = true;
        if (painelAnalises) painelAnalises.hidden = true;
        atualizarStatusGeral(
            'Projeto carregado sem consolidação. Selecione novamente os arquivos XLSX e execute a validação.',
            'aviso'
        );
    }
}

export function inicializarMontagemRelatorio() {
    ARQUIVOS_RELATORIO.forEach(configuracao => {
        obterElemento(configuracao.inputId)
            ?.addEventListener('change', () => atualizarNomeArquivo(configuracao));
    });

    CAMPOS_MONETARIOS_ATUAIS.forEach(id => {
        obterElemento(id)?.addEventListener('input', () => {
            atualizarTotaisManuais();
            invalidarConsolidacao();
        });
    });

    CAMPOS_QUE_INVALIDAM_CONSOLIDACAO.forEach(id => {
        obterElemento(id)?.addEventListener('input', invalidarConsolidacao);
    });

    obterElemento('relPeriodoReferencia')
        ?.addEventListener('change', () => {
            atualizarPeriodoReutilizado();
            atualizarPeriodosHistoricosSugeridos();
            invalidarConsolidacao();
        });

    obterElemento('btnValidarRelatorio')
        ?.addEventListener('click', validarEPrepararRelatorio);

    ['relHistNome1', 'relHistNome2', 'relHistNomeAno'].forEach(id => {
        obterElemento(id)?.addEventListener('change', atualizarHistoricoPelaMemoria);
    });

    inicializarZonaArquivos();
    carregarMemorias().then(atualizarHistoricoPelaMemoria);

    atualizarContadorArquivos();
    atualizarTotaisManuais();
    atualizarPeriodoReutilizado();
    atualizarPeriodosHistoricosSugeridos();
}
