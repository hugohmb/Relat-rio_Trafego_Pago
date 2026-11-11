import { aplicarTemaNosGraficosInterface } from '../tema.js';
import { estadoAplicacao } from '../estado.js';
import { processarArquivoVendasTray } from '../processadores/vendas-tray.js';
import {
    converterParaNumero,
    escaparHtml,
    formatarMoeda
} from '../utilitarios.js';

const CONFIGURACAO_PERIODOS = [
    {
        id: 'ano-anterior',
        tipo: 'anual',
        nomeInput: 'histNome4',
        arquivoInput: 'histUpload4',
        googleInput: 'histGAds4',
        metaInput: 'histMAds4',
        nomePadrao: 'Mesmo mês do ano anterior',
        cor: '#b39ddb'
    },
    {
        id: 'dois-meses-atras',
        tipo: 'recente',
        nomeInput: 'histNome1',
        arquivoInput: 'histUpload1',
        googleInput: 'histGAds1',
        metaInput: 'histMAds1',
        nomePadrao: 'Dois meses atrás',
        cor: '#c5e1a5'
    },
    {
        id: 'mes-anterior',
        tipo: 'recente',
        nomeInput: 'histNome2',
        arquivoInput: 'histUpload2',
        googleInput: 'histGAds2',
        metaInput: 'histMAds2',
        nomePadrao: 'Mês anterior',
        cor: '#ffcc80'
    },
    {
        id: 'mes-atual',
        tipo: 'atual',
        nomeInput: 'histNome3',
        arquivoInput: 'histUpload3',
        googleInput: 'histGAds3',
        metaInput: 'histMAds3',
        nomePadrao: 'Mês atual',
        cor: '#90caf9'
    }
];

function obterPeriodosDaTela() {
    return CONFIGURACAO_PERIODOS.map(configuracao => {
        const nomeDigitado = document
            .getElementById(configuracao.nomeInput)
            ?.value
            ?.trim();

        return {
            ...configuracao,
            nome: nomeDigitado || configuracao.nomePadrao,
            arquivo: document.getElementById(configuracao.arquivoInput)?.files?.[0],
            investimentoGoogle: converterParaNumero(
                document.getElementById(configuracao.googleInput)?.value
            ),
            investimentoMeta: converterParaNumero(
                document.getElementById(configuracao.metaInput)?.value
            )
        };
    });
}

function montarCardHistorico(dados) {
    const nomeSeguro = escaparHtml(dados.nome);

    return `
        <article class="historico-card-resultado" style="--cor-periodo: ${dados.cor};">
            <h4>${nomeSeguro}</h4>

            <div class="historico-metrica historico-metrica-geral">
                <span>Receita geral</span>
                <strong>${formatarMoeda(dados.fatGeral)}</strong>
                <small>Ticket: ${formatarMoeda(dados.tmGeral)} · ${dados.qtdGeral} pedidos</small>
            </div>

            <div class="historico-metrica historico-metrica-parceiros">
                <span>Receita de parceiros</span>
                <strong>${formatarMoeda(dados.fatParceiros)}</strong>
                <small>Ticket: ${formatarMoeda(dados.tmParceiros)} · ${dados.qtdParceiros} pedidos</small>
            </div>

            <div class="historico-metrica historico-metrica-sem-parceiros">
                <span>Receita sem parceiros</span>
                <strong>${formatarMoeda(dados.fatSemParceiros)}</strong>
                <small>Ticket: ${formatarMoeda(dados.tmSemParceiros)} · ${dados.qtdSemParceiros} pedidos</small>
            </div>

            <div class="historico-indicadores-card">
                <div>
                    <span>Investimento</span>
                    <strong>${formatarMoeda(dados.investimentoTotal)}</strong>
                </div>
                <div>
                    <span>ROAS sem parceiros</span>
                    <strong>${dados.roasSemParceiros.toFixed(2)}x</strong>
                </div>
                <div>
                    <span>ROI estimado</span>
                    <strong>${dados.roiEstimado.toFixed(1)}%</strong>
                </div>
            </div>
        </article>
    `;
}

function destruirGraficosHistorico() {
    estadoAplicacao.historico.graficos.forEach(grafico => grafico.destroy());
    estadoAplicacao.historico.graficos = [];
}

function obterContextoCanvas(id) {
    const canvas = document.getElementById(id);
    return canvas?.getContext('2d') || null;
}

function criarGrafico(idCanvas, configuracao) {
    const contexto = obterContextoCanvas(idCanvas);
    if (!contexto) return null;

    const grafico = new Chart(contexto, configuracao);
    estadoAplicacao.historico.graficos.push(grafico);
    aplicarTemaNosGraficosInterface();
    return grafico;
}

function opcoesGrafico(titulo, iniciarEmZero = true) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: true, text: titulo }
        },
        scales: iniciarEmZero ? { y: { beginAtZero: true } } : undefined
    };
}

function desenharGraficosRecentes(dadosRecentes) {
    const painel = document.getElementById('painelGraficosHistorico');

    if (dadosRecentes.length === 0) {
        painel.hidden = true;
        return;
    }

    painel.hidden = false;
    const labels = dadosRecentes.map(item => item.nome);

    criarGrafico('graficoHistReceita', {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Sem parceiros',
                    data: dadosRecentes.map(item => item.fatSemParceiros),
                    backgroundColor: 'rgba(76, 175, 80, 0.8)'
                },
                {
                    label: 'Parceiros',
                    data: dadosRecentes.map(item => item.fatParceiros),
                    backgroundColor: 'rgba(244, 67, 54, 0.8)'
                },
                {
                    label: 'Geral',
                    data: dadosRecentes.map(item => item.fatGeral),
                    backgroundColor: 'rgba(158, 158, 158, 0.5)'
                }
            ]
        },
        options: opcoesGrafico('Comparativo de receitas')
    });

    criarGrafico('graficoHistVendas', {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Pedidos sem parceiros',
                    data: dadosRecentes.map(item => item.qtdSemParceiros),
                    backgroundColor: 'rgba(76, 175, 80, 0.6)'
                },
                {
                    label: 'Pedidos de parceiros',
                    data: dadosRecentes.map(item => item.qtdParceiros),
                    backgroundColor: 'rgba(244, 67, 54, 0.6)'
                },
                {
                    label: 'Pedidos gerais',
                    data: dadosRecentes.map(item => item.qtdGeral),
                    backgroundColor: 'rgba(158, 158, 158, 0.4)'
                }
            ]
        },
        options: opcoesGrafico('Volume de pedidos')
    });

    criarGrafico('graficoHistTickets', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Ticket sem parceiros',
                    data: dadosRecentes.map(item => item.tmSemParceiros),
                    borderColor: '#4CAF50',
                    backgroundColor: '#4CAF50',
                    tension: 0.2,
                    borderWidth: 3
                },
                {
                    label: 'Ticket de parceiros',
                    data: dadosRecentes.map(item => item.tmParceiros),
                    borderColor: '#F44336',
                    backgroundColor: '#F44336',
                    tension: 0.2,
                    borderWidth: 3
                },
                {
                    label: 'Ticket geral',
                    data: dadosRecentes.map(item => item.tmGeral),
                    borderColor: '#9E9E9E',
                    backgroundColor: '#9E9E9E',
                    tension: 0.2,
                    borderDash: [5, 5],
                    borderWidth: 2
                }
            ]
        },
        options: opcoesGrafico('Evolução do ticket médio')
    });

    criarGrafico('graficoHistRoas', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'ROAS sem parceiros',
                data: dadosRecentes.map(item => item.roasSemParceiros),
                borderColor: '#e65100',
                backgroundColor: '#e65100',
                borderWidth: 4,
                tension: 0.3
            }]
        },
        options: opcoesGrafico('Eficiência de mídia sobre vendas sem parceiros')
    });
}

function calcularVariacaoPercentual(valorAtual, valorAnterior) {
    if (!Number.isFinite(valorAtual) || !Number.isFinite(valorAnterior)) return null;
    if (valorAnterior === 0) return null;
    return ((valorAtual - valorAnterior) / Math.abs(valorAnterior)) * 100;
}

function classeVariacao(valor) {
    if (valor === null || Math.abs(valor) < 0.005) return 'variacao-neutra';
    return valor > 0 ? 'variacao-positiva' : 'variacao-negativa';
}

function formatarVariacao(valor) {
    if (valor === null) return 'Sem base comparável';
    const sinal = valor > 0 ? '+' : '';
    return `${sinal}${valor.toFixed(1)}%`;
}

function montarResumoComparativoAnual(atual, anterior) {
    const metricas = [
        ['Faturamento geral', atual.fatGeral, anterior.fatGeral, formatarMoeda],
        ['Receita de parceiros', atual.fatParceiros, anterior.fatParceiros, formatarMoeda],
        ['Receita sem parceiros', atual.fatSemParceiros, anterior.fatSemParceiros, formatarMoeda],
        ['Quantidade de pedidos', atual.qtdGeral, anterior.qtdGeral, valor => String(valor)],
        ['Ticket médio geral', atual.tmGeral, anterior.tmGeral, formatarMoeda],
        ['Investimento total', atual.investimentoTotal, anterior.investimentoTotal, formatarMoeda],
        ['ROAS sem parceiros', atual.roasSemParceiros, anterior.roasSemParceiros, valor => `${valor.toFixed(2)}x`]
    ];

    return metricas.map(([titulo, valorAtual, valorAnterior, formatador]) => {
        const variacao = calcularVariacaoPercentual(valorAtual, valorAnterior);

        return `
            <article class="historico-variacao-card">
                <span>${titulo}</span>
                <strong>${formatador(valorAtual)}</strong>
                <small>Anterior: ${formatador(valorAnterior)}</small>
                <b class="${classeVariacao(variacao)}">${formatarVariacao(variacao)}</b>
            </article>
        `;
    }).join('');
}

function desenharComparativoAnual(atual, anterior) {
    const painel = document.getElementById('painelComparativoAnual');

    if (!atual || !anterior) {
        painel.hidden = true;
        return;
    }

    painel.hidden = false;

    document.getElementById('textoPeriodoComparativoAnual').textContent =
        `${atual.nome} comparado a ${anterior.nome}.`;

    document.getElementById('resumoComparativoAnual').innerHTML =
        montarResumoComparativoAnual(atual, anterior);

    const labelsPeriodos = [anterior.nome, atual.nome];

    criarGrafico('graficoAnualReceita', {
        type: 'bar',
        data: {
            labels: ['Receita geral', 'Parceiros', 'Sem parceiros'],
            datasets: [
                {
                    label: anterior.nome,
                    data: [
                        anterior.fatGeral,
                        anterior.fatParceiros,
                        anterior.fatSemParceiros
                    ],
                    backgroundColor: 'rgba(126, 87, 194, 0.55)'
                },
                {
                    label: atual.nome,
                    data: [atual.fatGeral, atual.fatParceiros, atual.fatSemParceiros],
                    backgroundColor: 'rgba(33, 150, 243, 0.72)'
                }
            ]
        },
        options: opcoesGrafico('Receitas: comparação anual')
    });

    criarGrafico('graficoAnualPedidos', {
        type: 'bar',
        data: {
            labels: labelsPeriodos,
            datasets: [
                {
                    label: 'Pedidos gerais',
                    data: [anterior.qtdGeral, atual.qtdGeral],
                    backgroundColor: 'rgba(33, 150, 243, 0.72)'
                },
                {
                    label: 'Pedidos sem parceiros',
                    data: [anterior.qtdSemParceiros, atual.qtdSemParceiros],
                    backgroundColor: 'rgba(76, 175, 80, 0.72)'
                },
                {
                    label: 'Pedidos de parceiros',
                    data: [anterior.qtdParceiros, atual.qtdParceiros],
                    backgroundColor: 'rgba(244, 67, 54, 0.65)'
                }
            ]
        },
        options: opcoesGrafico('Pedidos: comparação anual')
    });
}

function atualizarStatus(mensagem, tipo = 'processando') {
    const elemento = document.getElementById('histStatusProcessamento');
    if (!elemento) return;

    elemento.hidden = false;
    elemento.className = `historico-status historico-status-${tipo}`;
    elemento.textContent = mensagem;
}

function ocultarResultados() {
    document.getElementById('secaoResultadosHistorico').hidden = true;
    document.getElementById('painelGraficosHistorico').hidden = true;
    document.getElementById('painelComparativoAnual').hidden = true;
}

async function processarHistorico() {
    const botao = document.getElementById('btnGerarHistorico');
    const painelResultados = document.getElementById('painelResultadosHistorico');
    const secaoResultados = document.getElementById('secaoResultadosHistorico');
    const periodos = obterPeriodosDaTela();
    const periodosComArquivo = periodos.filter(periodo => periodo.arquivo);

    if (periodosComArquivo.length === 0) {
        alert('Selecione pelo menos uma planilha para processar.');
        return;
    }

    destruirGraficosHistorico();
    ocultarResultados();
    painelResultados.innerHTML = '';

    botao.disabled = true;
    const textoOriginal = botao.textContent;
    botao.textContent = 'Processando planilhas...';
    atualizarStatus('Validando e processando os arquivos selecionados...');

    const resultados = [];
    const erros = [];

    for (let indice = 0; indice < periodosComArquivo.length; indice++) {
        const periodo = periodosComArquivo[indice];
        atualizarStatus(
            `Processando ${periodo.nome} (${indice + 1} de ${periodosComArquivo.length})...`
        );

        try {
            const dados = await processarArquivoVendasTray(
                periodo.arquivo,
                estadoAplicacao.parceiros,
                periodo.investimentoGoogle + periodo.investimentoMeta
            );

            resultados.push({
                ...periodo,
                ...dados
            });
        } catch (erro) {
            console.error(`Erro ao processar ${periodo.nome}:`, erro);
            erros.push(`${periodo.nome}: ${erro.message}`);
        }
    }

    estadoAplicacao.historico.periodos = periodos;
    estadoAplicacao.historico.resultados = resultados;

    if (resultados.length === 0) {
        atualizarStatus('Nenhum arquivo pôde ser processado.', 'erro');
        botao.disabled = false;
        botao.textContent = textoOriginal;
        alert(`Nenhum período pôde ser processado.\n\n${erros.join('\n')}`);
        return;
    }

    painelResultados.innerHTML = resultados.map(montarCardHistorico).join('');
    secaoResultados.hidden = false;

    const dadosRecentes = resultados.filter(
        item => item.tipo === 'recente' || item.tipo === 'atual'
    );
    const atual = resultados.find(item => item.tipo === 'atual');
    const anoAnterior = resultados.find(item => item.tipo === 'anual');

    desenharGraficosRecentes(dadosRecentes);
    desenharComparativoAnual(atual, anoAnterior);

    const mensagemConclusao = erros.length > 0
        ? `Processamento concluído com ${erros.length} arquivo(s) apresentando erro.`
        : 'Todos os arquivos selecionados foram processados com sucesso.';

    atualizarStatus(mensagemConclusao, erros.length > 0 ? 'aviso' : 'sucesso');

    botao.disabled = false;
    botao.textContent = textoOriginal;

    if (erros.length > 0) {
        alert(
            `O comparativo foi gerado, mas alguns arquivos tiveram problemas:\n\n${erros.join('\n')}`
        );
    }
}

export function inicializarHistorico() {
    document
        .getElementById('btnGerarHistorico')
        ?.addEventListener('click', processarHistorico);
}
