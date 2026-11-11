import { aplicarTemaNosGraficosInterface } from '../tema.js';
import { gerarAnaliseExecutivaApi } from '../api.js';
import { estadoAplicacao } from '../estado.js';
import { processarArquivoVendasTray } from '../processadores/vendas-tray.js';
import { converterParaNumero, formatarMoeda } from '../utilitarios.js';

function atualizarDashboard(dados) {
    document.getElementById('dashFatGeral').textContent = formatarMoeda(dados.fatGeral);
    document.getElementById('dashFatParceiros').textContent = formatarMoeda(dados.fatParceiros);
    document.getElementById('dashFatDireto').textContent = formatarMoeda(dados.fatSemParceiros);

    document.getElementById('dashQtdGeral').textContent = dados.qtdGeral;
    document.getElementById('dashQtdParceiros').textContent = dados.qtdParceiros;
    document.getElementById('dashQtdTrafego').textContent = dados.qtdSemParceiros;

    document.getElementById('dashTmGeral').textContent = formatarMoeda(dados.tmGeral);
    document.getElementById('dashTmTrafego').textContent = formatarMoeda(dados.tmSemParceiros);

    document.getElementById('dashRoasGeral').textContent = `${dados.roasGeral.toFixed(2)}x`;
    document.getElementById('dashRoasReal').textContent = `${dados.roasSemParceiros.toFixed(2)}x`;
    document.getElementById('dashRoi').textContent = `${dados.roiEstimado.toFixed(1)}%`;
}

async function gerarAnaliseExecutiva(dados) {
    const elementoIA = document.getElementById('dashRelatorioIA');
    if (!elementoIA) return;

    elementoIA.innerHTML =
        '<em>O assistente virtual está analisando os números e escrevendo o relatório... ✍️</em>';

    const payload = {
        fatGeral: formatarMoeda(dados.fatGeral),
        fatParceiros: formatarMoeda(dados.fatParceiros),
        fatDireto: formatarMoeda(dados.fatSemParceiros),
        tmGeral: formatarMoeda(dados.tmGeral),
        tmTrafego: formatarMoeda(dados.tmSemParceiros),
        roasReal: `${dados.roasSemParceiros.toFixed(2)}x`,
        roi: `${dados.roiEstimado.toFixed(1)}%`,
        criterioReceita:
            'Total menos Impostos e Frete; o Desconto não é subtraído novamente.',
        criterioClassificacao:
            'As vendas sem parceiros não devem ser automaticamente tratadas como vendas de tráfego pago.'
    };

    try {
        const dadosIA = await gerarAnaliseExecutivaApi(payload);
        elementoIA.innerHTML = dadosIA?.relatorio
            ? String(dadosIA.relatorio).replace(/\n/g, '<br>')
            : '<em>O relatório não pôde ser gerado.</em>';
    } catch (erro) {
        console.error('Erro na IA:', erro);
        elementoIA.innerHTML =
            `<em>Falha ao gerar a análise: ${erro.message}</em>`;
    }
}

function gerarGraficoDashboard(geral, semParceiros, parceiros) {
    const canvas = document.getElementById('graficoVendas');
    if (!canvas) return;

    if (estadoAplicacao.dashboard.grafico) {
        estadoAplicacao.dashboard.grafico.destroy();
    }

    estadoAplicacao.dashboard.grafico = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: [
                'Faturamento Geral',
                'Vendas sem Parceiros',
                'Vendas de Parceiros'
            ],
            datasets: [{
                label: 'Receita (R$)',
                data: [geral, semParceiros, parceiros],
                backgroundColor: [
                    'rgba(158, 158, 158, 0.7)',
                    'rgba(76, 175, 80, 0.8)',
                    'rgba(211, 47, 47, 0.8)'
                ],
                borderColor: [
                    'rgb(158, 158, 158)',
                    'rgb(76, 175, 80)',
                    'rgb(211, 47, 47)'
                ],
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => formatarMoeda(value) }
                }
            },
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Distribuição de Receita do Mês',
                    font: { size: 16 }
                }
            }
        }
    });

    aplicarTemaNosGraficosInterface();
}

async function processarDashboard() {
    const fileInput = document.getElementById('uploadExcel');
    const arquivo = fileInput?.files?.[0];

    if (!arquivo) {
        alert('Por favor, selecione a planilha da Tray primeiro!');
        return;
    }

    const investGoogle = converterParaNumero(
        document.getElementById('investGoogle')?.value
    );
    const investMeta = converterParaNumero(
        document.getElementById('investMeta')?.value
    );

    try {
        const dados = await processarArquivoVendasTray(
            arquivo,
            estadoAplicacao.parceiros,
            investGoogle + investMeta
        );

        estadoAplicacao.dashboard.arquivo = arquivo;
        estadoAplicacao.dashboard.resultados = dados;

        atualizarDashboard(dados);
        gerarGraficoDashboard(
            dados.fatGeral,
            dados.fatSemParceiros,
            dados.fatParceiros
        );
        await gerarAnaliseExecutiva(dados);
    } catch (erro) {
        console.error('Erro ao processar o Dashboard:', erro);
        alert(`Não foi possível processar a planilha.\n\n${erro.message}`);
    }
}

export function inicializarDashboard() {
    document
        .getElementById('btnCalcular')
        ?.addEventListener('click', processarDashboard);
}
