import { estadoAplicacao } from '../estado.js';
import { formatarMoeda, escaparHtml } from '../utilitarios.js';
import { gerarPdfRelatorioApi } from '../api.js';

const TOTAL_PAGINAS = 13;
const TITULOS_PAGINAS = [
    'Capa e identificação',
    'Implementações Técnicas e Estruturais',
    'Resumo de Relatórios de Tráfego',
    'Produtos Mais Vendidos — Parte 1',
    'Produtos Mais Vendidos — Parte 2',
    'Resumo de Investimentos',
    'Desempenho de Vendas e Faturamento',
    'Retorno Sobre Investimento (ROAS)',
    'Comportamento de Visitas na Loja',
    'Evolução Trimestral e Comparação Anual',
    'Desempenho Meta Ads',
    'Conclusão e Próximos Passos',
    'Tendências e Direcionamento'
];

let paginaAtual = 1;
let graficosAtivos = [];
let previaGerada = false;
let previaDesatualizada = false;

function obterElemento(id) {
    return document.getElementById(id);
}

function numeroSeguro(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function formatarNumero(valor, casas = 0) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    }).format(numeroSeguro(valor));
}

function formatarPercentual(valor, casas = 1) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? `${formatarNumero(numero, casas)}%` : '—';
}

function formatarRoas(valor) {
    return `${formatarNumero(valor, 2)}x`;
}

function textoAnalise(chave, fallback = 'Análise ainda não preenchida.') {
    const texto = estadoAplicacao.relatorio.analisesIA?.[chave]?.texto?.trim();
    return texto || fallback;
}

function textoEmHtml(texto) {
    const seguro = escaparHtml(texto || '');
    return seguro
        .split(/\n{2,}/)
        .map(paragrafo => `<p>${paragrafo.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function obterStatusPagina(numero) {
    return estadoAplicacao.relatorio.consolidado?.paginas?.find(item => item.numero === numero)
        || { status: 'pendente', bloqueios: [], avisos: [] };
}

function formatarNumeroCompacto(valor) {
    const numero = numeroSeguro(valor);
    const absoluto = Math.abs(numero);

    if (absoluto >= 1_000_000) {
        return `${formatarNumero(numero / 1_000_000, absoluto >= 10_000_000 ? 0 : 2)} mi`;
    }

    if (absoluto >= 1_000) {
        return `${formatarNumero(numero / 1_000, absoluto >= 100_000 ? 0 : 1)} mil`;
    }

    return formatarNumero(numero);
}

function formatarMoedaCompacta(valor) {
    const numero = numeroSeguro(valor);
    const absoluto = Math.abs(numero);

    if (absoluto >= 1_000_000) {
        return `R$ ${formatarNumero(numero / 1_000_000, absoluto >= 10_000_000 ? 0 : 2)} mi`;
    }

    if (absoluto >= 1_000) {
        return `R$ ${formatarNumero(numero / 1_000, absoluto >= 100_000 ? 0 : 1)} mil`;
    }

    return formatarMoeda(numero);
}

function investimentoPeriodo(periodo) {
    return numeroSeguro(periodo?.investimentoTotal)
        || (numeroSeguro(periodo?.investimentoGoogle) + numeroSeguro(periodo?.investimentoMeta));
}

function tabelaValoresHistorico(periodos = [], titulo = '') {
    if (!Array.isArray(periodos) || !periodos.length) {
        return '';
    }

    return `
        <div class="historico-tabela-wrap">
            ${titulo ? `<p class="historico-tabela-titulo">${escaparHtml(titulo)}</p>` : ''}
            <table class="historico-tabela-valores">
                <thead>
                    <tr>
                        <th>Período</th>
                        <th>Investimento</th>
                        <th>Faturamento total</th>
                        <th>Sem parceiros</th>
                    </tr>
                </thead>
                <tbody>
                    ${periodos.map(periodo => `
                        <tr>
                            <td>${escaparHtml(periodo?.nome || '—')}</td>
                            <td>${formatarMoeda(investimentoPeriodo(periodo))}</td>
                            <td>${formatarMoeda(periodo?.fatGeral)}</td>
                            <td>${formatarMoeda(periodo?.fatSemParceiros)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function resumirTexto(texto, limite = 900) {
    const valor = String(texto || '').trim();
    if (valor.length <= limite) return valor;
    return `${valor.slice(0, limite).replace(/\s+\S*$/, '')}…`;
}

function primeiroParagrafo(texto, limite = 520) {
    const valor = String(texto || '').trim();
    const primeiro = valor.split(/\n\s*\n/)[0] || valor;
    return resumirTexto(primeiro, limite);
}

function listaTextoHtml(texto, fallback = 'Nenhuma informação registrada para esta seção.') {
    const valor = String(texto || '').trim();
    if (!valor) return `<p class="relatorio-card-vazio">${escaparHtml(fallback)}</p>`;

    const itens = valor
        .split(/\n+/)
        .map(item => item.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(Boolean);

    if (itens.length <= 1) {
        return `<p>${escaparHtml(resumirTexto(valor, 780))}</p>`;
    }

    return `<ul>${itens.map(item => `<li>${escaparHtml(resumirTexto(item, 280))}</li>`).join('')}</ul>`;
}

function rodapePagina() {
    return '';
}

function cabecalhoPagina(numero, titulo) {
    return `
        <header class="pagina-relatorio-cabecalho pagina-relatorio-cabecalho-${numero}">
            <h2>${escaparHtml(titulo)}</h2>
        </header>
    `;
}

function paginaBase(numero, conteudo, classe = '') {
    return `
        <section class="pagina-relatorio pagina-modelo-referencia ${classe}" data-pagina-relatorio="${numero}" ${numero === 1 ? '' : 'hidden'}>
            ${conteudo}
        </section>
    `;
}

function montarPagina1(consolidado) {
    const informacoes = consolidado.informacoesDoPeriodo || {};
    const foco = informacoes.focoAnalise || 'Comportamento de usuários, desempenho de mídia e evolução de vendas.';

    return paginaBase(1, `
        <div class="pagina-capa-referencia">
            <h1>Relatório de Desempenho:<br><span>Tráfego e Vendas</span></h1>
            <div class="pagina-capa-linha"></div>
            <p class="pagina-capa-periodo-texto">Período: ${escaparHtml(consolidado.periodoFormatado || consolidado.periodo)}</p>
            <p class="pagina-capa-foco"><strong>Foco da Análise:</strong> ${escaparHtml(foco)}</p>
            <p class="pagina-capa-assinatura">Relatório Interno de Marketing e Performance</p>
        </div>
    `, 'pagina-relatorio-capa-referencia');
}

function montarPagina2(consolidado) {
    const info = consolidado.informacoesDoPeriodo || {};
    const introducao = primeiroParagrafo(textoAnalise('implementacoes'), 850);

    return paginaBase(2, `
        ${cabecalhoPagina(2, TITULOS_PAGINAS[1])}
        <div class="pagina-corpo pagina-implementacoes-referencia">
            <div class="pagina-introducao-referencia">${textoEmHtml(introducao)}</div>
            <div class="pagina-implementacoes-cards">
                <article class="pagina-implementacao-card card-azul">
                    <div class="pagina-card-icone">◎</div>
                    <h3>1. IMPLEMENTAÇÕES</h3>
                    <div>${listaTextoHtml(info.implementacoes)}</div>
                </article>
                <article class="pagina-implementacao-card card-verde">
                    <div class="pagina-card-icone">▰</div>
                    <h3>2. CORREÇÕES E ESTRUTURA</h3>
                    <div>${listaTextoHtml(info.correcoes)}</div>
                </article>
                <article class="pagina-implementacao-card card-laranja">
                    <div class="pagina-card-icone">↗</div>
                    <h3>3. DIRECIONAMENTO ESTRATÉGICO</h3>
                    <div>${listaTextoHtml(info.decisoes)}</div>
                </article>
            </div>
        </div>
    `);
}

function montarPagina3(consolidado) {
    const ga = consolidado.fontes.gaResumo;
    const categorias = ga?.categorias || [];
    const introducao = primeiroParagrafo(textoAnalise('google-analytics'), 680);
    const linha = (rotulo, propriedade, formatador) => `
        <tr>
            <th>${escaparHtml(rotulo)}</th>
            ${categorias.map(item => `<td class="${String(item.titulo || '').toLowerCase().includes('pago') ? 'coluna-pago' : ''}">${formatador(item[propriedade])}</td>`).join('')}
        </tr>`;

    return paginaBase(3, `
        ${cabecalhoPagina(3, TITULOS_PAGINAS[2])}
        <div class="pagina-ga-marca"><span class="ga-barras"><i></i><i></i><i></i></span><strong>Google<br>Analytics</strong></div>
        <div class="pagina-periodo-nota">*Período de avaliação: ${escaparHtml(consolidado.periodoFormatado || '')}.</div>
        <div class="pagina-corpo pagina-ga-referencia">
            <div class="pagina-introducao-referencia">${textoEmHtml(introducao)}</div>
            <p class="pagina-ga-investimento">Valores baseados no investimento total de tráfego pago de <strong>${formatarMoeda(consolidado.investimentos?.investimentoTotal)}</strong></p>
            <table class="pagina-tabela-ga-referencia">
                <thead>
                    <tr>
                        <th>Métrica de Conversão</th>
                        ${categorias.map(item => `<th class="${String(item.titulo || '').toLowerCase().includes('pago') ? 'coluna-pago' : ''}">${escaparHtml(item.titulo)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${linha('Adicionar ao carrinho', 'carrinhos', valor => formatarNumero(valor))}
                    ${linha('Compras (Volume)', 'compras', valor => formatarNumero(valor))}
                    ${linha('Receita de Compra', 'receita', valor => formatarMoedaCompacta(valor))}
                    ${linha('Ticket Médio (ARPPU)', 'arppu', valor => formatarMoedaCompacta(valor))}
                </tbody>
            </table>
        </div>
    `);
}

function tabelaProdutos(produtos) {
    if (!produtos?.length) {
        return '<p class="pagina-placeholder">Ranking indisponível.</p>';
    }

    return `
        <table class="pagina-tabela-produtos-referencia">
            <thead><tr><th>Nome do Item do Catálogo</th><th>Itens Comprados</th><th>Receita do Item</th></tr></thead>
            <tbody>
                ${produtos.map(produto => `
                    <tr>
                        <td>${escaparHtml(produto.nome)}</td>
                        <td>${formatarNumero(produto.itensComprados)}</td>
                        <td>${formatarMoeda(produto.receita)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function montarPaginaProdutos(consolidado, numero, produtos) {
    const parte = numero === 4 ? 'Parte 1' : 'Parte 2';
    const subtitulo = numero === 4
        ? 'Ranking decrescente de performance física por volume de itens comprados mapeados via Google Analytics (GA4), excluindo itens sem saída.'
        : 'Continuação do ranking dos 20 itens com maior volume de compras no período.';

    return paginaBase(numero, `
        ${cabecalhoPagina(numero, `Produtos Mais Vendidos — ${parte}`)}
        <div class="pagina-corpo pagina-produtos-referencia">
            <p class="pagina-subtitulo-referencia">${escaparHtml(subtitulo)}</p>
            ${tabelaProdutos(produtos)}
        </div>
    `);
}

function montarPagina6(consolidado) {
    const inv = consolidado.investimentos || {};
    const ga = consolidado.fontes?.gaResumo || {};
    const receitaGoogleExibidaDisponivel = Boolean(inv.receitaGoogleExibidaDisponivel || ga?.pago);
    const receitaGoogleExibida = inv.receitaGoogleExibidaDisponivel
        ? numeroSeguro(inv.receitaGoogleExibida)
        : numeroSeguro(ga?.pago?.receita);
    const analise = resumirTexto(textoAnalise('investimentos'), 780);
    const origemMeta = String(inv.origemReceitaMeta || '').trim();

    return paginaBase(6, `
        ${cabecalhoPagina(6, TITULOS_PAGINAS[5])}
        <div class="pagina-corpo pagina-investimentos-referencia">
            <p class="pagina-subtitulo-referencia">O investimento em mídia paga do período foi distribuído entre Google Ads e Meta Ads conforme os objetivos definidos para cada plataforma.</p>
            <table class="pagina-tabela-investimentos">
                <thead><tr><th>Plataforma de Mídia</th><th>Valor Investido</th><th>Retorno sobre Investimento (Receita)</th></tr></thead>
                <tbody>
                    <tr>
                        <td><span class="plataforma-icone google">G</span>Google Ads</td>
                        <td>${formatarMoeda(inv.investimentoGoogle)}</td>
                        <td>${receitaGoogleExibidaDisponivel ? formatarMoeda(receitaGoogleExibida) : 'Não calculado'}<small class="pagina-investimento-origem">GA4 — categoria “Tráfego pago”</small></td>
                    </tr>
                    <tr>
                        <td><span class="plataforma-icone meta">f</span>Meta Ads</td>
                        <td>${formatarMoeda(inv.investimentoMeta)}</td>
                        <td>${inv.receitaMetaDisponivel ? formatarMoeda(inv.receitaMeta) : 'Não apurado'}${inv.receitaMetaDisponivel && origemMeta ? `<small class="pagina-investimento-origem">${escaparHtml(origemMeta)}</small>` : ''}</td>
                    </tr>
                    <tr class="linha-total">
                        <td>TOTAL / RETORNO DISPONÍVEL</td>
                        <td>${formatarMoeda(inv.investimentoTotal)}</td>
                        <td>${inv.receitaGoogleDisponivel ? formatarMoeda(inv.receitaAtribuidaTotal) : 'Não calculado'}<small class="pagina-investimento-origem">Tráfego pago − Outros</small></td>
                    </tr>
                </tbody>
            </table>
            <div class="pagina-investimentos-observacoes">
                ${receitaGoogleExibidaDisponivel ? `<p>*O valor de ${formatarMoeda(receitaGoogleExibida)} está impactado pelas vendas realizadas por distribuidores e representantes que efetuaram compras por meio de links promocionais.</p>` : ''}
                <p>O TOTAL / RETORNO DISPONÍVEL é calculado pela diferença entre a receita de Tráfego pago e a categoria Outros do Google Analytics; portanto, não representa a soma simples das linhas Google Ads e Meta Ads.</p>
            </div>
            <div class="pagina-nota-investimentos">${textoEmHtml(analise)}</div>
        </div>
    `);
}

function cartaoVisao({ classe = '', titulo, descricao, faturamento, pedidos, ticket, rotuloFaturamento = 'Faturamento total', rotuloTicket = 'Ticket médio' }) {
    return `
        <article class="pagina-visao-card ${classe}">
            <h3>${escaparHtml(titulo)}</h3>
            <p>${escaparHtml(descricao)}</p>
            <div class="visao-metrica"><span>${escaparHtml(rotuloFaturamento)}</span><strong>${formatarMoeda(faturamento)}</strong></div>
            <div class="visao-metrica"><span>Volume de vendas</span><strong>${formatarNumero(pedidos)} pedidos</strong></div>
            <div class="visao-ticket"><span>${escaparHtml(rotuloTicket)}</span><strong>${formatarMoeda(ticket)}</strong></div>
        </article>`;
}

function montarPagina7(consolidado) {
    const vendas = consolidado.fontes.vendasAtual || {};
    const introducao = primeiroParagrafo(textoAnalise('vendas'), 620);

    return paginaBase(7, `
        ${cabecalhoPagina(7, TITULOS_PAGINAS[6])}
        <div class="pagina-corpo pagina-vendas-referencia">
            <div class="pagina-introducao-referencia">${textoEmHtml(introducao)}</div>
            <div class="pagina-visoes-grid">
                ${cartaoVisao({
                    titulo: 'Visão Institucional',
                    descricao: 'Faturamento total, incluindo loja online, distribuidores e representantes.',
                    faturamento: vendas.fatGeral,
                    pedidos: vendas.qtdGeral,
                    ticket: vendas.tmGeral,
                    rotuloTicket: 'Ticket médio geral'
                })}
                ${cartaoVisao({
                    titulo: 'Visão Parceiros',
                    descricao: 'Faturamento proveniente exclusivamente das vendas identificadas no Banco de Parceiros.',
                    faturamento: vendas.fatParceiros,
                    pedidos: vendas.qtdParceiros,
                    ticket: vendas.tmParceiros,
                    rotuloFaturamento: 'Faturamento parceiros',
                    rotuloTicket: 'Ticket médio parceiros'
                })}
                ${cartaoVisao({
                    classe: 'visao-destaque',
                    titulo: 'Visão Loja (sem parceiros)',
                    descricao: 'Desempenho das vendas não classificadas como parceiros, sem atribuição automática ao tráfego pago.',
                    faturamento: vendas.fatSemParceiros,
                    pedidos: vendas.qtdSemParceiros,
                    ticket: vendas.tmSemParceiros,
                    rotuloFaturamento: 'Faturamento sem parceiros',
                    rotuloTicket: 'Ticket médio sem parceiros'
                })}
            </div>
        </div>
    `);
}

function montarPagina8(consolidado) {
    const vendas = consolidado.fontes.vendasAtual || {};
    const plataformas = consolidado.indicadores?.plataformas || {};
    const analise = resumirTexto(textoAnalise('roas'), 850);

    return paginaBase(8, `
        ${cabecalhoPagina(8, TITULOS_PAGINAS[7])}
        <div class="pagina-corpo pagina-roas-referencia">
            <p class="pagina-subtitulo-referencia">O ROAS indica o multiplicador de retorno para cada R$ 1,00 investido nas plataformas (investimento total: ${formatarMoeda(consolidado.investimentos?.investimentoTotal)}).</p>
            <div class="pagina-roas-principais">
                <div><strong>${formatarRoas(vendas.roasGeral)}</strong><span>ROAS Geral (Institucional)</span><small>Considerando o faturamento geral</small></div>
                <div><strong>${formatarRoas(vendas.roasSemParceiros)}</strong><span>ROAS Global da Loja</span><small>Receita sem parceiros ÷ investimento total</small></div>
            </div>
            <div class="pagina-roas-destaque-operacional">
                <h3>Destaque Operacional: Google Ads</h3>
                <p>ROAS calculado do Google Ads: <strong>${plataformas.receitaGoogleDisponivel ? formatarRoas(plataformas.roasGoogle) : 'não disponível'}</strong>. ${plataformas.receitaMetaDisponivel ? `ROAS do Meta Ads: <strong>${formatarRoas(plataformas.roasMeta)}</strong>.` : 'O ROAS do Meta Ads permanece não apurado enquanto não houver uma receita manual informada.'}</p>
                <div>${textoEmHtml(analise)}</div>
            </div>
        </div>
    `);
}

function montarPagina9(consolidado) {
    const visitas = consolidado.fontes.visitas || {};
    const analise = resumirTexto(textoAnalise('visitas'), 1000);

    return paginaBase(9, `
        ${cabecalhoPagina(9, TITULOS_PAGINAS[8])}
        <div class="pagina-corpo pagina-visitas-referencia">
            <div class="pagina-visitas-resumo"><span>♟</span><strong>Total de Visitas na loja no mês de ${escaparHtml(consolidado.periodoFormatado || '')}: ${formatarNumero(visitas.totalVisitas)} acessos</strong></div>
            <div class="pagina-grafico pagina-grafico-visitas-referencia"><canvas id="previaGraficoVisitas"></canvas></div>
            <div class="pagina-visitas-analise">${textoEmHtml(analise)}</div>
        </div>
    `);
}

function montarPagina10(consolidado) {
    const comparativos = consolidado.comparativos || {};
    const mensal = comparativos.variacaoMensal || {};
    const anual = comparativos.variacaoAnual || {};
    const possuiAnual = Boolean(comparativos.anoAnterior);
    const recentes = comparativos.sequenciaRecente || [];
    const periodosTabela = possuiAnual
        ? [comparativos.anoAnterior, ...recentes].filter(Boolean)
        : recentes;
    const analise = resumirTexto(textoAnalise('historico'), 1050);

    return paginaBase(10, `
        ${cabecalhoPagina(10, TITULOS_PAGINAS[9])}
        <div class="pagina-corpo pagina-historico-referencia ${possuiAnual ? '' : 'sem-comparacao-anual'}">
            <div class="pagina-graficos-historico-referencia">
                <div class="historico-painel">
                    <h3>↗ INVESTIMENTO, FATURAMENTO TOTAL E SEM PARCEIROS</h3>
                    <canvas id="previaGraficoHistoricoRecente"></canvas>
                </div>
                ${possuiAnual
                    ? '<div class="historico-painel"><h3>◫ COMPARAÇÃO COM O MESMO MÊS DO ANO ANTERIOR</h3><canvas id="previaGraficoHistoricoAnual"></canvas></div>'
                    : '<div class="historico-painel historico-painel-indisponivel"><h3>◫ COMPARAÇÃO ANUAL</h3><p>O mesmo mês do ano anterior não foi informado. Esta comparação opcional foi omitida.</p></div>'}
            </div>

            <div class="pagina-historico-tabela-geral">
                ${tabelaValoresHistorico(periodosTabela, 'Valores exatos dos períodos apresentados')}
            </div>

            <div class="pagina-historico-resumo-variacoes">
                <span>Variação mensal do faturamento: <strong>${formatarPercentual(mensal.fatGeral)}</strong></span>
                ${possuiAnual
                    ? `<span>Variação anual do faturamento: <strong>${formatarPercentual(anual.fatGeral)}</strong></span>
                       <span>Variação anual dos pedidos: <strong>${formatarPercentual(anual.qtdGeral)}</strong></span>`
                    : '<span>Comparação anual: <strong>não informada</strong></span>'}
            </div>

            <div class="pagina-leitura-periodo"><h3>♟ Leitura de Período e Direcionamento</h3>${textoEmHtml(analise)}</div>
        </div>
    `);
}

function montarPagina11(consolidado) {
    const meta = consolidado.fontes.metaAds || {};
    const analise = primeiroParagrafo(textoAnalise('meta-ads'), 580);
    const campanha = meta.melhorConversao || meta.maiorAlcance || meta.campanhas?.[0];

    return paginaBase(11, `
        <header class="pagina-meta-titulo"><span></span><h2>Desempenho Meta Ads</h2><b>∞</b></header>
        <div class="pagina-corpo pagina-meta-referencia">
            <div class="pagina-introducao-referencia">${textoEmHtml(analise)}</div>
            <div class="pagina-meta-cards">
                <article><h3>⌗ CAPILARIDADE</h3><strong>${formatarNumeroCompacto(meta.impressoes)}</strong><span>Impressões Totais</span><strong class="secundario">${formatarNumeroCompacto(meta.alcance)}</strong><span>Alcance Único de Contas</span></article>
                <article><h3>☝ ENGAJAMENTO</h3><strong>${formatarNumero(meta.cliques)}</strong><span>Cliques (Todos)</span><strong class="secundario">${formatarMoeda(meta.cpc)}</strong><span>Custo por Clique (CPC)</span></article>
                <article class="meta-card-destaque"><h3>▣ CONVERSÃO (PIXEL)</h3><strong>${formatarNumero(meta.compras)}</strong><span>Compras / Eventos rastreados</span><div class="meta-campanha-destaque"><b>Destaque de Performance:</b><br>${escaparHtml(campanha?.nome || 'Campanha não identificada')}</div></article>
            </div>
        </div>
    `);
}

function montarPagina12(consolidado) {
    const info = consolidado.informacoesDoPeriodo || {};
    const conclusao = resumirTexto(textoAnalise('conclusao'), 2600);
    const roadmap = [info.proximosPassos, info.observacoesConclusao].filter(Boolean).join('\n');

    return paginaBase(12, `
        ${cabecalhoPagina(12, TITULOS_PAGINAS[11])}
        <div class="pagina-corpo pagina-conclusao-referencia">
            <section class="pagina-conclusao-texto">
                <h3>Síntese Analítica do Mês</h3>
                ${textoEmHtml(conclusao)}
            </section>
            <aside class="pagina-roadmap">
                <h3>♧ Roadmap de Estratégias</h3>
                ${listaTextoHtml(roadmap, 'Nenhum próximo passo ou observação estratégica foi registrado.')}
            </aside>
        </div>
    `);
}

function blocoComparacaoMedia(tendencias) {
    const escolhidos = ['faturamentoGeral', 'faturamentoParceiros', 'faturamentoSemParceiros', 'pedidos', 'ticketMedio', 'vendasUtmGoogleAds', 'visitas', 'roasSemParceiros'];
    const linhas = escolhidos
        .map(campo => tendencias.find(item => item.campo === campo))
        .filter(item => item && item.variacaoContraMediaPercentual !== null)
        .map(item => {
            const variacao = item.variacaoContraMediaPercentual;
            const sinal = variacao > 0 ? '+' : '';
            return `<tr><td>${escaparHtml(item.indicador)}</td><td class="${variacao >= 0 ? 'positivo' : 'negativo'}">${sinal}${formatarNumero(variacao, 1)}%</td><td>${escaparHtml(item.sequenciaRecente)}</td></tr>`;
        }).join('');
    if (!linhas) return '';
    return `
        <h3 class="pagina-tendencias-subtitulo">Mês atual × média dos meses anteriores</h3>
        <table class="pagina-tendencias-media">
            <thead><tr><th>Indicador</th><th>Variação</th><th>Sequência recente</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>`;
}

function montarPagina13(consolidado) {
    const memoria = consolidado.memoria || {};
    const serie = (memoria.serie || []).slice(-6);
    const texto = resumirTexto(textoAnalise('tendencias', 'A leitura de tendências será gerada quando houver pelo menos dois meses no histórico do programa.'), 2400);
    const moedaCurta = valor => `R$ ${formatarNumeroCompacto(valor)}`;
    const linhas = serie.map(item => `
        <tr class="${item.periodo === consolidado.periodo ? 'linha-atual' : ''}">
            <td>${escaparHtml(item.nome)}</td>
            <td>${moedaCurta(item.faturamentoGeral)}</td>
            <td>${formatarPercentual(item.participacaoParceiros)}</td>
            <td>${moedaCurta(item.faturamentoSemParceiros)}</td>
            <td>${item.vendasUtmGoogleAds === null || item.vendasUtmGoogleAds === undefined ? '—' : moedaCurta(item.vendasUtmGoogleAds)}</td>
            <td>${moedaCurta(item.investimentoTotal)}</td>
            <td>${formatarRoas(item.roasSemParceiros)}</td>
        </tr>
    `).join('');

    return paginaBase(13, `
        ${cabecalhoPagina(13, TITULOS_PAGINAS[12])}
        <div class="pagina-corpo pagina-tendencias-referencia">
            <section class="pagina-tendencias-texto">
                <h3>Para onde os números apontam</h3>
                ${textoEmHtml(texto)}
                <p class="pagina-tendencias-aviso">Leitura projetiva baseada na série histórica registrada pelo programa. As tendências indicam possibilidades, não previsões garantidas.</p>
            </section>
            <aside class="pagina-tendencias-tabela">
                <h3>Últimos ${serie.length || 0} meses</h3>
                ${serie.length ? `
                    <table>
                        <thead><tr><th>Mês</th><th>Faturamento</th><th>% parceiros</th><th>Sem parceiros</th><th>UTM Google</th><th>Investimento</th><th>ROAS s/ parc.</th></tr></thead>
                        <tbody>${linhas}</tbody>
                    </table>` : '<p>O histórico ainda não possui meses suficientes.</p>'}
                ${blocoComparacaoMedia(memoria.tendencias || [])}
            </aside>
        </div>
    `);
}

function montarTodasPaginas(consolidado) {
    const produtos = consolidado.fontes.produtos || {};
    return [
        montarPagina1(consolidado),
        montarPagina2(consolidado),
        montarPagina3(consolidado),
        montarPaginaProdutos(consolidado, 4, produtos.pagina1 || []),
        montarPaginaProdutos(consolidado, 5, produtos.pagina2 || []),
        montarPagina6(consolidado),
        montarPagina7(consolidado),
        montarPagina8(consolidado),
        montarPagina9(consolidado),
        montarPagina10(consolidado),
        montarPagina11(consolidado),
        montarPagina12(consolidado),
        montarPagina13(consolidado)
    ].join('');
}

function destruirGraficos() {
    graficosAtivos.forEach(grafico => grafico?.destroy());
    graficosAtivos = [];
}

function criarGrafico(id, configuracao) {
    const canvas = obterElemento(id);
    if (!canvas || typeof Chart === 'undefined') return;
    graficosAtivos.push(new Chart(canvas.getContext('2d'), configuracao));
}

function opcoesGrafico({ indexAxis = 'x', moeda = false, percentual = false } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis,
        plugins: {
            legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } },
            tooltip: {
                callbacks: {
                    label: contexto => {
                        const valor = indexAxis === 'y' ? contexto.parsed.x : contexto.parsed.y;
                        if (moeda) return `${contexto.dataset.label}: ${formatarMoeda(valor)}`;
                        if (percentual) return `${contexto.dataset.label}: ${formatarNumero(valor, 2)}%`;
                        return `${contexto.dataset.label}: ${formatarNumero(valor)}`;
                    }
                }
            }
        },
        scales: {
            x: { ticks: { font: { size: 8 }, maxRotation: 35, minRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,.06)' } }
        }
    };
}

function desenharGraficosPagina(numero) {
    destruirGraficos();
    const consolidado = estadoAplicacao.relatorio.consolidado;
    if (!consolidado) return;

    const fontes = consolidado.fontes || {};

    if (numero === 9 && fontes.visitas) {
        criarGrafico('previaGraficoVisitas', {
            type: 'line',
            data: {
                labels: fontes.visitas.grafico.labels,
                datasets: [{
                    label: 'Visitas diárias',
                    data: fontes.visitas.grafico.visitas,
                    borderColor: '#22aaa1',
                    backgroundColor: 'rgba(34,170,161,.18)',
                    fill: true,
                    tension: .34,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 3
                }]
            },
            options: {
                ...opcoesGrafico(),
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 9 }, maxRotation: 48, minRotation: 48 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: 'rgba(0,0,0,.10)' } }
                }
            }
        });
    }

    if (numero === 10) {
        const recentes = consolidado.comparativos?.sequenciaRecente || [];
        const atual = consolidado.comparativos?.atual;
        const ano = consolidado.comparativos?.anoAnterior;

        criarGrafico('previaGraficoHistoricoRecente', {
            type: 'bar',
            data: {
                labels: recentes.map(item => item.nome),
                datasets: [
                    { label: 'Investimento', data: recentes.map(item => investimentoPeriodo(item)), backgroundColor: '#f2b94b', borderRadius: 3 },
                    { label: 'Faturamento total', data: recentes.map(item => item.fatGeral), backgroundColor: '#1db97a', borderRadius: 3 },
                    { label: 'Sem parceiros', data: recentes.map(item => item.fatSemParceiros), backgroundColor: '#c5da37', borderRadius: 3 }
                ]
            },
            options: {
                ...opcoesGrafico({ moeda: true }),
                animation: false,
                plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } } },
                scales: {
                    x: { stacked: false, ticks: { font: { size: 9 } }, grid: { display: false } },
                    y: { display: false, beginAtZero: true }
                }
            }
        });

        if (ano) {
            criarGrafico('previaGraficoHistoricoAnual', {
                type: 'bar',
                data: {
                    labels: [ano.nome || 'Ano anterior', atual?.nome || 'Atual'],
                    datasets: [
                        { label: 'Investimento', data: [investimentoPeriodo(ano), investimentoPeriodo(atual)], backgroundColor: '#d9ad51', borderRadius: 3 },
                        { label: 'Faturamento total', data: [ano.fatGeral || 0, atual?.fatGeral || 0], backgroundColor: '#4f7cc0', borderRadius: 3 },
                        { label: 'Sem parceiros', data: [ano.fatSemParceiros || 0, atual?.fatSemParceiros || 0], backgroundColor: '#84a7dd', borderRadius: 3 }
                    ]
                },
                options: {
                    ...opcoesGrafico({ moeda: true }),
                    animation: false,
                    plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } } },
                    scales: {
                        x: { ticks: { font: { size: 9 } }, grid: { display: false } },
                        y: { display: false, beginAtZero: true }
                    }
                }
            });
        }
    }
}

function montarNavegacao() {
    const navegacao = obterElemento('previaNavegacao');
    if (!navegacao) return;

    navegacao.innerHTML = TITULOS_PAGINAS.map((titulo, indice) => {
        const numero = indice + 1;
        const status = obterStatusPagina(numero).status;
        return `
            <button type="button" class="previa-nav-item ${numero === paginaAtual ? 'active' : ''}" data-ir-pagina="${numero}">
                <span>${numero}</span>
                <div><strong>${escaparHtml(titulo)}</strong><small class="previa-status-${status}">${status}</small></div>
            </button>
        `;
    }).join('');
}

let ajusteEscalaPendente = null;

function ajustarEscalaPrevia() {
    const viewport = document.querySelector('.previa-relatorio-viewport');
    const paginas = obterElemento('previaPaginas');

    if (!viewport || !paginas || paginas.hidden || !previaGerada) return;

    const larguraDisponivel = Math.max(320, viewport.clientWidth - 40);
    const larguraA4Horizontal = 1122.52;
    const escala = Math.min(1, Math.max(0.45, larguraDisponivel / larguraA4Horizontal));

    paginas.style.setProperty('--escala-previa', escala.toFixed(4));
}

function agendarAjusteEscalaPrevia() {
    if (ajusteEscalaPendente) cancelAnimationFrame(ajusteEscalaPendente);
    ajusteEscalaPendente = requestAnimationFrame(() => {
        ajusteEscalaPendente = null;
        ajustarEscalaPrevia();
    });
}

function exibirPagina(numero) {
    paginaAtual = Math.min(TOTAL_PAGINAS, Math.max(1, Number(numero) || 1));

    document.querySelectorAll('[data-pagina-relatorio]').forEach(pagina => {
        pagina.hidden = Number(pagina.dataset.paginaRelatorio) !== paginaAtual;
    });

    montarNavegacao();
    const contador = obterElemento('previaContadorPagina');
    if (contador) contador.textContent = `Página ${paginaAtual} de ${TOTAL_PAGINAS}`;

    const anterior = obterElemento('btnPaginaAnterior');
    const proxima = obterElemento('btnProximaPagina');
    if (anterior) anterior.disabled = paginaAtual === 1 || !previaGerada;
    if (proxima) proxima.disabled = paginaAtual === TOTAL_PAGINAS || !previaGerada;

    requestAnimationFrame(() => {
        desenharGraficosPagina(paginaAtual);
        ajustarEscalaPrevia();
    });
}

function quantidadeAnalisesComTexto() {
    return Object.values(estadoAplicacao.relatorio.analisesIA || {})
        .filter(item => item?.texto?.trim()).length;
}

function atualizarAviso() {
    const aviso = obterElemento('previaAviso');
    if (!aviso) return;

    if (!estadoAplicacao.relatorio.consolidado) {
        aviso.className = 'previa-relatorio-aviso';
        aviso.textContent = 'Valide os dados na aba Montar Relatório para liberar a prévia.';
        return;
    }

    const homologacao = estadoAplicacao.relatorio.homologacao;
    if (homologacao && !homologacao.prontoParaVisual) {
        aviso.className = 'previa-relatorio-aviso previa-aviso-atencao';
        aviso.textContent = 'A homologação encontrou erros. Corrija os itens indicados na aba Montar Relatório antes de gerar a prévia.';
        return;
    }

    const prontas = quantidadeAnalisesComTexto();
    if (previaDesatualizada) {
        aviso.className = 'previa-relatorio-aviso previa-aviso-atencao';
        aviso.textContent = 'Os dados ou textos foram alterados. Clique em “Gerar/atualizar prévia” para refletir as mudanças.';
    } else if (prontas < 9) {
        aviso.className = 'previa-relatorio-aviso previa-aviso-atencao';
        aviso.textContent = `Prévia gerada com ${prontas} de 9 análises preenchidas. As páginas sem texto usam um aviso provisório.`;
    } else {
        aviso.className = 'previa-relatorio-aviso previa-aviso-sucesso';
        aviso.textContent = 'Prévia atualizada com todos os dados consolidados e análises preenchidas.';
    }
}

function atualizarBotaoPdf() {
    const botao = obterElemento('btnPdfPrevia');
    if (!botao) return;

    const homologacaoPronta = estadoAplicacao.relatorio.homologacao?.prontoParaVisual === true;
    const liberado = previaGerada && !previaDesatualizada && homologacaoPronta;

    botao.disabled = !liberado;
    botao.className = liberado ? 'btn-pdf-ativo' : 'btn-relatorio-bloqueado';
    botao.textContent = liberado ? 'Gerar PDF final' : 'Gere uma prévia atualizada para liberar o PDF';
}

function atualizarBotaoMontagem() {
    const botao = obterElemento('btnGerarRelatorio');
    const consolidado = estadoAplicacao.relatorio.consolidado;
    if (!botao) return;

    if (!consolidado) {
        botao.disabled = true;
        botao.className = 'btn-relatorio-bloqueado';
        botao.textContent = 'Validar os dados para liberar a prévia';
        return;
    }

    const homologacao = estadoAplicacao.relatorio.homologacao;
    if (!homologacao?.prontoParaVisual) {
        botao.disabled = true;
        botao.className = 'btn-relatorio-bloqueado';
        botao.textContent = 'Corrija os erros da homologação para liberar a prévia';
        return;
    }

    const prontas = quantidadeAnalisesComTexto();
    botao.disabled = false;
    botao.className = 'btn-principal btn-gerar-previa';
    botao.textContent = previaGerada
        ? `Atualizar prévia do relatório — ${prontas}/9 análises`
        : `Gerar prévia do relatório — ${prontas}/9 análises`;
}

export function marcarPreviaDesatualizada({ limpar = false } = {}) {
    previaDesatualizada = true;

    if (limpar) {
        previaGerada = false;
        destruirGraficos();
        const paginas = obterElemento('previaPaginas');
        const vazio = obterElemento('previaEstadoVazio');
        if (paginas) {
            paginas.hidden = true;
            paginas.innerHTML = '';
        }
        if (vazio) vazio.hidden = false;
    }

    atualizarAviso();
    atualizarBotaoMontagem();
    atualizarBotaoPdf();
}

async function aguardarFontesRelatorio(tempoLimite = 5000) {
    if (!document.fonts?.ready) return;

    const carregamento = Promise.allSettled([
        document.fonts.load('400 16px "neulis-neue"'),
        document.fonts.load('700 34px "neulis-neue"'),
        document.fonts.ready
    ]);

    const limite = new Promise(resolve => setTimeout(resolve, tempoLimite));
    await Promise.race([carregamento, limite]);
}

export async function gerarOuAtualizarPrevia({ abrirAba = true } = {}) {
    const consolidado = estadoAplicacao.relatorio.consolidado;
    if (!consolidado) {
        atualizarAviso();
        alert('Valide e consolide os dados antes de gerar a prévia.');
        return false;
    }

    if (!estadoAplicacao.relatorio.homologacao?.prontoParaVisual) {
        alert('A homologação encontrou erros. Corrija os itens indicados antes de gerar a prévia.');
        atualizarBotaoMontagem();
        return false;
    }

    consolidado.analisesIA = { ...(estadoAplicacao.relatorio.analisesIA || {}) };

    await aguardarFontesRelatorio();

    const paginas = obterElemento('previaPaginas');
    const vazio = obterElemento('previaEstadoVazio');
    if (!paginas) return false;

    destruirGraficos();
    paginas.innerHTML = montarTodasPaginas(consolidado);
    paginas.hidden = false;
    if (vazio) vazio.hidden = true;

    previaGerada = true;
    previaDesatualizada = false;
    paginaAtual = 1;
    estadoAplicacao.relatorio.previa = {
        geradaEm: new Date().toISOString(),
        periodo: consolidado.periodo,
        totalPaginas: TOTAL_PAGINAS,
        analisesComTexto: quantidadeAnalisesComTexto()
    };

    if (abrirAba) {
        obterElemento('btnAbaPreviaRelatorio')?.click();
    }

    await esperarRenderizacao(100);
    exibirPagina(1);
    agendarAjusteEscalaPrevia();
    atualizarAviso();
    atualizarBotaoMontagem();
    atualizarBotaoPdf();
    return true;
}

function atualizarProgressoPdf(percentual, mensagem, titulo = 'Gerando PDF final') {
    const painel = obterElemento('pdfProgresso');
    const barra = obterElemento('pdfProgressoBarra');
    const percentualElemento = obterElemento('pdfProgressoPercentual');
    const mensagemElemento = obterElemento('pdfProgressoMensagem');
    const tituloElemento = obterElemento('pdfProgressoTitulo');

    if (painel) painel.hidden = false;
    if (barra) barra.style.width = `${Math.min(100, Math.max(0, percentual))}%`;
    if (percentualElemento) percentualElemento.textContent = `${Math.round(percentual)}%`;
    if (mensagemElemento) mensagemElemento.textContent = mensagem;
    if (tituloElemento) tituloElemento.textContent = titulo;
}

function esperarRenderizacao(tempo = 160) {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, tempo)));
    });
}

function nomeArquivoPdf() {
    const periodo = String(estadoAplicacao.relatorio.consolidado?.periodo || 'relatorio');
    const correspondencia = /^(\d{4})-(\d{2})$/.exec(periodo);

    if (!correspondencia) return 'Relatorio-Trafego-e-Vendas.pdf';

    const ano = correspondencia[1];
    const mesNumero = Number(correspondencia[2]);
    const meses = [
        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const mes = meses[mesNumero - 1] || 'Periodo';
    return `Relatorio-Trafego-${mes}-${ano}.pdf`;
}

function substituirGraficosPorImagens(paginaOriginal, paginaClonada) {
    const canvasesOriginais = [...paginaOriginal.querySelectorAll('canvas')];
    const canvasesClonados = [...paginaClonada.querySelectorAll('canvas')];

    canvasesClonados.forEach((canvasClonado, indice) => {
        const canvasOriginal = canvasesOriginais[indice];
        if (!canvasOriginal) return;

        const retangulo = canvasOriginal.getBoundingClientRect();
        const imagem = document.createElement('img');
        imagem.src = canvasOriginal.toDataURL('image/png', 1);
        imagem.alt = canvasOriginal.getAttribute('aria-label') || 'Gráfico do relatório';
        imagem.className = `${canvasClonado.className || ''} pdf-grafico-imagem`.trim();
        imagem.style.width = `${Math.max(1, retangulo.width)}px`;
        imagem.style.height = `${Math.max(1, retangulo.height)}px`;
        imagem.style.maxWidth = '100%';
        imagem.style.objectFit = 'contain';
        canvasClonado.replaceWith(imagem);
    });
}

async function prepararPaginasPdf() {
    const paginaAnterior = paginaAtual;
    const paginasHtml = [];

    for (let numero = 1; numero <= TOTAL_PAGINAS; numero++) {
        atualizarProgressoPdf(
            5 + (numero / TOTAL_PAGINAS) * 45,
            `Preparando a página ${numero} de ${TOTAL_PAGINAS}...`
        );

        exibirPagina(numero);
        await esperarRenderizacao();

        const original = document.querySelector(`[data-pagina-relatorio="${numero}"]`);
        if (!original) throw new Error(`A página ${numero} não foi encontrada na prévia.`);

        const clone = original.cloneNode(true);
        clone.hidden = false;
        clone.removeAttribute('hidden');
        clone.classList.add('pagina-pdf-exportacao');
        substituirGraficosPorImagens(original, clone);
        paginasHtml.push(clone.outerHTML);
    }

    exibirPagina(paginaAnterior);
    return paginasHtml.join('\n');
}

async function montarDocumentoPdf() {
    await aguardarFontesRelatorio();
    const paginas = await prepararPaginasPdf();
    atualizarProgressoPdf(55, 'Carregando os estilos visuais do relatório...');
    const respostaCss = await fetch('/style.css', { cache: 'no-store' });
    if (!respostaCss.ok) throw new Error('Não foi possível carregar os estilos do relatório.');

    const css = await respostaCss.text();
    const estilosPdf = `
        @page { size: A4 landscape; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { width: 297mm; }
        .pagina-relatorio {
            display: block !important;
            width: 297mm !important;
            height: 210mm !important;
            min-width: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            break-after: page !important;
            page-break-after: always !important;
        }
        .pagina-relatorio:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
        }
        .pdf-grafico-imagem { display: block !important; object-fit: contain; }
    `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Tráfego e Vendas</title>
    <link rel="stylesheet" href="https://use.typekit.net/nrr2vsf.css">
    <style>${css}\n${estilosPdf}</style>
</head>
<body>${paginas}</body>
</html>`;
}

function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function gerarPdfFinal() {
    if (!previaGerada || previaDesatualizada) {
        alert('Gere ou atualize a prévia antes de exportar o PDF.');
        atualizarBotaoPdf();
        return;
    }

    if (!estadoAplicacao.relatorio.homologacao?.prontoParaVisual) {
        alert('A homologação precisa estar aprovada antes da geração do PDF.');
        return;
    }

    const botao = obterElemento('btnPdfPrevia');
    const paginaAntesDaExportacao = paginaAtual;

    try {
        if (botao) {
            botao.disabled = true;
            botao.textContent = 'Gerando PDF...';
        }

        atualizarProgressoPdf(2, 'Iniciando a preparação das 13 páginas...');
        const html = await montarDocumentoPdf();
        const nomeArquivo = nomeArquivoPdf();

        atualizarProgressoPdf(65, 'Enviando as páginas para o navegador de impressão...');
        const blob = await gerarPdfRelatorioApi({ html, nomeArquivo });

        atualizarProgressoPdf(95, 'PDF gerado. Preparando o download...');
        baixarBlob(blob, nomeArquivo);
        atualizarProgressoPdf(100, 'Download concluído com sucesso.', 'PDF final concluído');
    } catch (erro) {
        console.error('Erro ao gerar PDF:', erro);
        atualizarProgressoPdf(100, erro.message, 'Falha ao gerar o PDF');
        alert(`Não foi possível gerar o PDF.\n\n${erro.message}`);
    } finally {
        exibirPagina(paginaAntesDaExportacao);
        atualizarBotaoPdf();
    }
}

function tratarClique(evento) {
    if (evento.target.closest('#btnPdfPrevia')) {
        gerarPdfFinal();
        return;
    }

    const pagina = evento.target.closest('[data-ir-pagina]');
    if (pagina) {
        exibirPagina(Number(pagina.dataset.irPagina));
        return;
    }

    if (evento.target.closest('#btnAtualizarPrevia') || evento.target.closest('#btnGerarRelatorio')) {
        gerarOuAtualizarPrevia();
        return;
    }

    if (evento.target.closest('#btnPaginaAnterior')) {
        exibirPagina(paginaAtual - 1);
        return;
    }

    if (evento.target.closest('#btnProximaPagina')) {
        exibirPagina(paginaAtual + 1);
    }
}

export function inicializarPreviaRelatorio() {
    document.addEventListener('click', tratarClique);
    window.addEventListener('resize', agendarAjusteEscalaPrevia);

    const viewport = document.querySelector('.previa-relatorio-viewport');
    if (viewport && typeof ResizeObserver !== 'undefined') {
        const observador = new ResizeObserver(agendarAjusteEscalaPrevia);
        observador.observe(viewport);
    }

    window.addEventListener('relatorio:consolidado', () => {
        marcarPreviaDesatualizada({ limpar: true });
    });

    window.addEventListener('relatorio:invalidado', () => {
        marcarPreviaDesatualizada({ limpar: true });
    });

    window.addEventListener('relatorio:homologado', () => {
        atualizarAviso();
        atualizarBotaoMontagem();
        atualizarBotaoPdf();
    });
    window.addEventListener('relatorio:homologacao-aprovada', () => {
        atualizarBotaoMontagem();
        atualizarBotaoPdf();
    });

    window.addEventListener('relatorio:projeto-carregado', () => {
        estadoAplicacao.relatorio.previa = null;
        marcarPreviaDesatualizada({ limpar: true });
        atualizarAviso();
        atualizarBotaoMontagem();
        atualizarBotaoPdf();
    });

    window.addEventListener('relatorio:analise-alterada', () => {
        if (previaGerada) marcarPreviaDesatualizada();
        atualizarBotaoMontagem();
        atualizarBotaoPdf();
    });

    montarNavegacao();
    atualizarAviso();
    atualizarBotaoMontagem();
    atualizarBotaoPdf();
    exibirPagina(1);
}
