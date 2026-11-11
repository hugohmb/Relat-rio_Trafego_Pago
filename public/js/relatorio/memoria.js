/*
 * Memória mensal da automação.
 *
 * Cada relatório validado gera um registro em dados/memoria/AAAA-MM.json com:
 * - os indicadores do mês (vendas, GA4, visitas, Meta Ads, investimentos);
 * - os pedidos em formato compacto, para recalcular o mês com o Banco de
 *   Parceiros atualizado (os meses antigos nunca ficam "congelados");
 * - os textos finais das análises e o que foi decidido/recomendado.
 *
 * Com isso:
 * - o histórico recente e a comparação anual são preenchidos sem reenviar as
 *   planilhas dos meses anteriores;
 * - o Gemini recebe a série dos meses anteriores e o que já foi recomendado,
 *   para ler tendências e sugerir direções.
 */

import { estadoAplicacao } from '../estado.js';
import { recalcularVendasPorPedidos } from '../processadores/vendas-tray.js';

const VERSAO_MEMORIA = 1;
const MESES_NA_SERIE = 12;

function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function arredondar(valor, casas = 2) {
    const fator = 10 ** casas;
    return Math.round(numero(valor) * fator) / fator;
}

export function formatarNomePeriodo(periodo) {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return String(periodo || '');
    const [ano, mes] = periodo.split('-').map(Number);
    const texto = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
        .format(new Date(ano, mes - 1, 1));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function deslocarPeriodo(periodo, meses) {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return '';
    const [ano, mes] = periodo.split('-').map(Number);
    const data = new Date(ano, mes - 1 + meses, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ API --- */

export async function carregarMemorias() {
    try {
        const resposta = await fetch('/api/memoria');
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const lista = await resposta.json();
        estadoAplicacao.memorias = Array.isArray(lista) ? lista : [];
    } catch (erro) {
        console.warn('Não foi possível carregar a memória mensal:', erro);
        estadoAplicacao.memorias = estadoAplicacao.memorias || [];
    }
    return estadoAplicacao.memorias;
}

export function obterMemoria(periodo) {
    return (estadoAplicacao.memorias || []).find(item => item.periodo === periodo) || null;
}

async function enviarMemoria(registro) {
    const resposta = await fetch(`/api/memoria/${registro.periodo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registro)
    });
    if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.error || `HTTP ${resposta.status}`);
    }

    const lista = (estadoAplicacao.memorias || []).filter(item => item.periodo !== registro.periodo);
    const anterior = obterMemoria(registro.periodo) || {};
    lista.push({ ...anterior, ...registro, analises: { ...(anterior.analises || {}), ...(registro.analises || {}) } });
    estadoAplicacao.memorias = lista.sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/* ------------------------------------------------------- Criar registro --- */

function resumoGa(ga) {
    if (!ga) return null;
    const bloco = item => item ? {
        carrinhos: numero(item.carrinhos),
        compras: numero(item.compras),
        receita: arredondar(item.receita),
        arppu: arredondar(item.arppu)
    } : null;
    return {
        todos: bloco(ga.todos),
        direto: bloco(ga.direto),
        organico: bloco(ga.organico),
        pago: bloco(ga.pago),
        outros: bloco(ga.outros),
        participacaoPagoReceita: arredondar(ga.participacaoPago?.receita)
    };
}

export function criarRegistroMemoria(relatorio) {
    const resultados = relatorio.resultados || {};
    const vendas = resultados.vendasAtual;
    if (!relatorio.periodo || !vendas) return null;

    const investimentos = relatorio.investimentos || {};
    const produtos = resultados.produtos;
    const visitas = resultados.visitas;
    const meta = resultados.metaAds;
    const informacoes = relatorio.informacoesDoPeriodo || {};

    return {
        versao: VERSAO_MEMORIA,
        periodo: relatorio.periodo,
        periodoFormatado: relatorio.periodoFormatado || formatarNomePeriodo(relatorio.periodo),
        salvoEm: new Date().toISOString(),
        origem: 'automacao',
        investimentos: {
            google: arredondar(investimentos.investimentoGoogle),
            meta: arredondar(investimentos.investimentoMeta),
            total: arredondar(investimentos.investimentoTotal)
        },
        vendas: {
            fatGeral: arredondar(vendas.fatGeral),
            fatParceiros: arredondar(vendas.fatParceiros),
            fatSemParceiros: arredondar(vendas.fatSemParceiros),
            qtdGeral: numero(vendas.qtdGeral),
            qtdParceiros: numero(vendas.qtdParceiros),
            qtdSemParceiros: numero(vendas.qtdSemParceiros),
            parceirosCadastradosNaApuracao: numero(relatorio.quantidadeParceirosCadastrados),
            porCanal: vendas.porCanal || null,
            porOrigemUtm: vendas.porOrigemUtm || null,
            vendasUtmGoogleAds: vendas.vendasUtmGoogleAds || null
        },
        pedidos: Array.isArray(vendas.pedidos) ? vendas.pedidos : [],
        ga: resumoGa(resultados.gaResumo),
        produtos: produtos ? {
            totalItens: numero(produtos.totalItensComprados),
            receita: arredondar(produtos.receitaTotal),
            top5: (produtos.produtosTop20 || []).slice(0, 5).map(item => ({
                nome: item.nome,
                itens: numero(item.itensComprados),
                receita: arredondar(item.receita)
            }))
        } : null,
        visitas: visitas ? {
            total: numero(visitas.totalVisitas),
            pageviews: numero(visitas.totalPageviews),
            pedidosIniciados: numero(visitas.totalPedidosIniciados),
            conversao: arredondar(visitas.conversaoGeral),
            mediaDia: arredondar(visitas.mediaVisitasDia, 1)
        } : null,
        meta: meta ? {
            alcance: numero(meta.alcance),
            impressoes: numero(meta.impressoes),
            cliques: numero(meta.cliques),
            ctr: arredondar(meta.ctr, 3),
            cpc: arredondar(meta.cpc, 3),
            valorUsado: arredondar(meta.valorUsado),
            compras: numero(meta.compras),
            custoPorCompra: arredondar(meta.custoPorCompra)
        } : null,
        informacoes: {
            focoAnalise: informacoes.focoAnalise || '',
            implementacoes: informacoes.implementacoes || '',
            correcoes: informacoes.correcoes || '',
            decisoes: informacoes.decisoes || '',
            proximosPassos: informacoes.proximosPassos || ''
        }
    };
}

export async function salvarMemoriaDoRelatorio(relatorio = estadoAplicacao.relatorio) {
    const registro = criarRegistroMemoria(relatorio);
    if (!registro) return false;
    await enviarMemoria(registro);
    return true;
}

let temporizadorAnalises = null;

// Guarda os textos finais das análises (com atraso, para não gravar a cada tecla).
export function agendarSalvarAnalisesNaMemoria() {
    clearTimeout(temporizadorAnalises);
    temporizadorAnalises = setTimeout(async () => {
        const relatorio = estadoAplicacao.relatorio;
        if (!relatorio.periodo || !relatorio.resultados?.vendasAtual) return;
        const analises = Object.fromEntries(
            Object.entries(relatorio.analisesIA || {})
                .map(([id, registro]) => [id, String(registro?.texto || '').trim()])
                .filter(([, texto]) => texto)
        );
        if (!Object.keys(analises).length) return;
        try {
            const registro = criarRegistroMemoria(relatorio);
            await enviarMemoria({ ...registro, analises });
        } catch (erro) {
            console.warn('Não foi possível guardar as análises na memória:', erro);
        }
    }, 1500);
}

/* --------------------------------------------------- Série e tendências --- */

// Devolve os dados de vendas de um mês da memória, recalculados com o banco
// de parceiros atual quando os pedidos compactos estiverem disponíveis.
export function vendasDaMemoria(registro, parceiros = estadoAplicacao.parceiros) {
    if (!registro) return null;
    const investimentoTotal = numero(registro.investimentos?.total);
    if (Array.isArray(registro.pedidos) && registro.pedidos.length) {
        return {
            ...recalcularVendasPorPedidos(registro.pedidos, parceiros, investimentoTotal),
            recalculadoComBancoAtual: true
        };
    }
    const v = registro.vendas || {};
    const tm = (a, b) => (numero(b) > 0 ? numero(a) / numero(b) : 0);
    return {
        fatGeral: numero(v.fatGeral),
        fatParceiros: numero(v.fatParceiros),
        fatSemParceiros: numero(v.fatSemParceiros),
        qtdGeral: numero(v.qtdGeral),
        qtdParceiros: numero(v.qtdParceiros),
        qtdSemParceiros: numero(v.qtdSemParceiros),
        tmGeral: tm(v.fatGeral, v.qtdGeral),
        tmParceiros: tm(v.fatParceiros, v.qtdParceiros),
        tmSemParceiros: tm(v.fatSemParceiros, v.qtdSemParceiros),
        investimentoTotal,
        roasGeral: tm(v.fatGeral, investimentoTotal),
        roasSemParceiros: tm(v.fatSemParceiros, investimentoTotal),
        roiEstimado: investimentoTotal > 0 ? ((numero(v.fatSemParceiros) - investimentoTotal) / investimentoTotal) * 100 : 0,
        recalculadoComBancoAtual: false
    };
}

function linhaDaSerie(registro, parceiros) {
    const vendas = vendasDaMemoria(registro, parceiros);
    return {
        periodo: registro.periodo,
        nome: registro.periodoFormatado || formatarNomePeriodo(registro.periodo),
        faturamentoGeral: arredondar(vendas.fatGeral),
        faturamentoParceiros: arredondar(vendas.fatParceiros),
        faturamentoSemParceiros: arredondar(vendas.fatSemParceiros),
        participacaoParceiros: vendas.fatGeral > 0 ? arredondar((vendas.fatParceiros / vendas.fatGeral) * 100, 1) : 0,
        pedidos: vendas.qtdGeral,
        pedidosParceiros: vendas.qtdParceiros,
        ticketMedio: arredondar(vendas.tmGeral),
        investimentoGoogle: numero(registro.investimentos?.google),
        investimentoMeta: numero(registro.investimentos?.meta),
        investimentoTotal: numero(registro.investimentos?.total),
        roasSemParceiros: arredondar(vendas.roasSemParceiros),
        vendasUtmGoogleAds: registro.vendas?.vendasUtmGoogleAds
            ? arredondar(registro.vendas.vendasUtmGoogleAds.faturamento)
            : null,
        receitaGa4: registro.ga?.todos ? arredondar(registro.ga.todos.receita) : null,
        receitaGa4TrafegoPago: registro.ga?.pago ? arredondar(registro.ga.pago.receita) : null,
        comprasGa4: registro.ga?.todos ? registro.ga.todos.compras : null,
        visitas: registro.visitas ? registro.visitas.total : null,
        conversaoVisitas: registro.visitas ? registro.visitas.conversao : null,
        metaInvestimentoArquivo: registro.meta ? registro.meta.valorUsado : null,
        metaCompras: registro.meta ? registro.meta.compras : null,
        metaCtr: registro.meta ? registro.meta.ctr : null,
        produtoLider: registro.produtos?.top5?.[0]?.nome || null,
        recalculadoComBancoAtual: vendas.recalculadoComBancoAtual
    };
}

// Série dos meses anteriores ao período informado (e o próprio mês, se pedido).
export function montarSerieHistorica({ ate, incluirAtual = false, meses = MESES_NA_SERIE, parceiros } = {}) {
    // Janela de calendário: só os últimos N meses antes do período (um mês
    // isolado de anos atrás distorceria médias e tendências).
    const inicio = deslocarPeriodo(ate, -meses);
    const lista = (estadoAplicacao.memorias || [])
        .filter(item => item?.periodo && item.periodo >= inicio && (incluirAtual ? item.periodo <= ate : item.periodo < ate))
        .sort((a, b) => a.periodo.localeCompare(b.periodo))
        .slice(-meses);
    return lista.map(item => linhaDaSerie(item, parceiros || estadoAplicacao.parceiros));
}

function regressaoLinear(valores) {
    const pontos = valores.map((y, x) => [x, y]).filter(([, y]) => Number.isFinite(y));
    if (pontos.length < 3) return null;
    const n = pontos.length;
    const somaX = pontos.reduce((s, [x]) => s + x, 0);
    const somaY = pontos.reduce((s, [, y]) => s + y, 0);
    const somaXY = pontos.reduce((s, [x, y]) => s + x * y, 0);
    const somaXX = pontos.reduce((s, [x]) => s + x * x, 0);
    const divisor = n * somaXX - somaX * somaX;
    if (!divisor) return null;
    const inclinacao = (n * somaXY - somaX * somaY) / divisor;
    const media = somaY / n;
    return media ? (inclinacao / Math.abs(media)) * 100 : null;
}

function sequenciaFinal(valores) {
    let direcao = 0;
    let total = 0;
    for (let i = valores.length - 1; i > 0; i--) {
        const atual = valores[i];
        const anterior = valores[i - 1];
        if (!Number.isFinite(atual) || !Number.isFinite(anterior) || atual === anterior) break;
        const d = atual > anterior ? 1 : -1;
        if (direcao && d !== direcao) break;
        direcao = d;
        total++;
    }
    if (!total) return 'estável';
    const tipo = direcao > 0 ? 'alta' : 'queda';
    return total === 1 ? `1 mês de ${tipo}` : `${total} meses seguidos de ${tipo}`;
}

const METRICAS_TENDENCIA = [
    ['faturamentoGeral', 'Faturamento geral'],
    ['faturamentoParceiros', 'Faturamento de parceiros'],
    ['faturamentoSemParceiros', 'Faturamento sem parceiros'],
    ['participacaoParceiros', 'Participação dos parceiros (%)'],
    ['pedidos', 'Pedidos'],
    ['ticketMedio', 'Ticket médio'],
    ['investimentoTotal', 'Investimento em mídia'],
    ['roasSemParceiros', 'ROAS sem parceiros'],
    ['vendasUtmGoogleAds', 'Vendas Tray com UTM Google Ads'],
    ['receitaGa4', 'Receita GA4'],
    ['visitas', 'Visitas na loja'],
    ['conversaoVisitas', 'Conversão de visitas (%)'],
    ['metaCompras', 'Compras Meta Ads']
];

// Tendências calculadas pela automação (o Gemini não recalcula nada).
export function calcularTendencias(serieCompleta) {
    if (!serieCompleta.length) return [];
    const atual = serieCompleta[serieCompleta.length - 1];
    const anteriores = serieCompleta.slice(0, -1);

    return METRICAS_TENDENCIA.map(([campo, rotulo]) => {
        const paraNumero = item => (item[campo] === null || item[campo] === undefined || item[campo] === '' ? NaN : Number(item[campo]));
        const valores = serieCompleta.map(paraNumero);
        const validosAnteriores = anteriores.map(paraNumero).filter(Number.isFinite);
        const valorAtual = paraNumero(atual);
        if (!Number.isFinite(valorAtual) || !validosAnteriores.length) return null;

        const media = validosAnteriores.reduce((s, v) => s + v, 0) / validosAnteriores.length;
        const ultimos3 = validosAnteriores.slice(-3);
        const media3 = ultimos3.reduce((s, v) => s + v, 0) / ultimos3.length;
        const minimo = Math.min(...validosAnteriores);
        const maximo = Math.max(...validosAnteriores);

        return {
            indicador: rotulo,
            campo,
            valorAtual: arredondar(valorAtual),
            mediaMesesAnteriores: arredondar(media),
            mediaUltimos3Meses: arredondar(media3),
            variacaoContraMediaPercentual: media ? arredondar(((valorAtual - media) / Math.abs(media)) * 100, 1) : null,
            variacaoContraMedia3Percentual: media3 ? arredondar(((valorAtual - media3) / Math.abs(media3)) * 100, 1) : null,
            tendenciaPercentualAoMes: (() => {
                const r = regressaoLinear(valores);
                return r === null ? null : arredondar(r, 1);
            })(),
            sequenciaRecente: sequenciaFinal(valores),
            posicao: valorAtual > maximo
                ? 'maior valor da série'
                : valorAtual < minimo
                    ? 'menor valor da série'
                    : 'dentro da faixa dos meses anteriores',
            mesesNaBase: validosAnteriores.length
        };
    }).filter(Boolean);
}

function resumirTexto(texto, limite = 900) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    return t.length > limite ? `${t.slice(0, limite)}…` : t;
}

// O que foi analisado e recomendado nos meses anteriores (para o Gemini
// avaliar a continuidade e não repetir conselhos sem olhar o resultado).
export function recomendacoesAnteriores(periodoAtual, quantidade = 3) {
    return (estadoAplicacao.memorias || [])
        .filter(item => item.periodo < periodoAtual)
        .sort((a, b) => a.periodo.localeCompare(b.periodo))
        .slice(-quantidade)
        .map(item => ({
            periodo: item.periodoFormatado || item.periodo,
            decisoesRegistradas: resumirTexto(item.informacoes?.decisoes, 500),
            proximosPassosRegistrados: resumirTexto(item.informacoes?.proximosPassos, 500),
            conclusaoPublicada: resumirTexto(item.analises?.conclusao, 900),
            tendenciasPublicadas: resumirTexto(item.analises?.tendencias, 700),
            textosRevisar: Boolean(item.textosComDadosIncorretos)
        }))
        .map(item => item.textosRevisar
            ? { ...item, conclusaoPublicada: '', tendenciasPublicadas: '', observacao: 'Os textos publicados neste mês usaram dados de parceiros incorretos e foram omitidos.' }
            : item);
}

// Pacote completo enviado para o consolidado e para o Gemini.
export function construirContextoMemoria(relatorio) {
    const periodo = relatorio.periodo;
    if (!periodo) return null;

    const anteriores = montarSerieHistorica({ ate: periodo });
    const registroAtual = criarRegistroMemoria(relatorio);
    const linhaAtual = registroAtual ? linhaDaSerie(registroAtual, estadoAplicacao.parceiros) : null;
    const serie = linhaAtual ? [...anteriores, linhaAtual] : anteriores;

    const mesmoMesAnoAnterior = obterMemoria(deslocarPeriodo(periodo, -12));

    return {
        mesesDisponiveis: anteriores.length,
        criterio: 'Meses anteriores recalculados com o Banco de Parceiros atual sempre que os pedidos do mês estão guardados.',
        serie,
        tendencias: calcularTendencias(serie),
        mesmoMesAnoAnterior: mesmoMesAnoAnterior ? linhaDaSerie(mesmoMesAnoAnterior, estadoAplicacao.parceiros) : null,
        recomendacoesAnteriores: recomendacoesAnteriores(periodo)
    };
}
