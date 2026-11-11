import { estadoAplicacao } from '../estado.js';
import { restaurarMontagemRelatorioDoProjeto } from '../paginas/montar-relatorio.js';

const IDENTIFICADOR_PROJETO = 'ecofoodpack-automacao-relatorio';
const VERSAO_ESQUEMA = 1;
const ETAPA_APLICACAO = 14;

const CAMPOS_PROJETO = [
    'relPeriodoReferencia',
    'relFocoAnalise',
    'relImplementacoes',
    'relCorrecoes',
    'relDecisoes',
    'relProximosPassos',
    'relInvestGoogle',
    'relInvestMeta',
    'relReceitaMetaManual',
    'relOrigemReceitaMeta',
    'relHistNome1',
    'relHistGoogle1',
    'relHistMeta1',
    'relHistNome2',
    'relHistGoogle2',
    'relHistMeta2',
    'relHistNomeAno',
    'relHistGoogleAno',
    'relHistMetaAno',
    'relObservacoesConclusao'
];

const ARQUIVOS_PROJETO = [
    ['gaResumo', 'relArquivoGaResumo'],
    ['produtos', 'relArquivoProdutos'],
    ['vendasAtual', 'relArquivoVendasAtual'],
    ['visitas', 'relArquivoVisitas'],
    ['hist1', 'relHistArquivo1'],
    ['hist2', 'relHistArquivo2'],
    ['histAno', 'relHistArquivoAno'],
    ['metaAds', 'relArquivoMetaAds']
];

function obterElemento(id) {
    return document.getElementById(id);
}

function valorCampo(id) {
    return obterElemento(id)?.value ?? '';
}

function capturarCampos() {
    return Object.fromEntries(CAMPOS_PROJETO.map(id => [id, valorCampo(id)]));
}

function metadadosArquivo(arquivo) {
    if (!arquivo) return null;
    return {
        name: String(arquivo.name || ''),
        size: Number(arquivo.size || 0),
        type: String(arquivo.type || ''),
        lastModified: Number(arquivo.lastModified || 0)
    };
}

function capturarArquivosSelecionados() {
    return Object.fromEntries(
        ARQUIVOS_PROJETO
            .map(([chave, inputId]) => {
                const arquivo = obterElemento(inputId)?.files?.[0] || null;
                return [chave, metadadosArquivo(arquivo)];
            })
            .filter(([, dados]) => Boolean(dados))
    );
}

function copiarSerializavel(valor) {
    if (valor === undefined) return null;
    return JSON.parse(JSON.stringify(valor, (chave, item) => {
        if (typeof item === 'function') return undefined;
        if (typeof File !== 'undefined' && item instanceof File) {
            return metadadosArquivo(item);
        }
        if (typeof Blob !== 'undefined' && item instanceof Blob) {
            return {
                name: item.name || '',
                size: item.size || 0,
                type: item.type || ''
            };
        }
        return item;
    }));
}

function nomeArquivoProjeto(periodo) {
    const periodoSeguro = /^\d{4}-\d{2}$/.test(String(periodo || ''))
        ? periodo
        : 'sem-periodo';
    return `relatorio-${periodoSeguro}.json`;
}

function criarProjeto() {
    const relatorio = estadoAplicacao.relatorio;
    const arquivosSelecionados = capturarArquivosSelecionados();
    const arquivosConhecidos = {
        ...(relatorio.projeto?.arquivosOriginais || {}),
        ...arquivosSelecionados
    };

    return {
        identificador: IDENTIFICADOR_PROJETO,
        versaoEsquema: VERSAO_ESQUEMA,
        etapaAplicacao: ETAPA_APLICACAO,
        salvoEm: new Date().toISOString(),
        nomeSugerido: nomeArquivoProjeto(valorCampo('relPeriodoReferencia') || relatorio.periodo),
        observacaoArquivos: 'Os arquivos XLSX não são incorporados ao JSON. Quando há dados consolidados, os resultados processados são preservados; para revalidar, selecione novamente os arquivos originais.',
        campos: capturarCampos(),
        arquivosOriginais: arquivosConhecidos,
        relatorio: copiarSerializavel({
            status: relatorio.status,
            periodo: relatorio.periodo,
            periodoFormatado: relatorio.periodoFormatado,
            quantidadeParceirosCadastrados: relatorio.quantidadeParceirosCadastrados,
            investimentos: relatorio.investimentos,
            informacoesDoPeriodo: relatorio.informacoesDoPeriodo,
            resultados: relatorio.resultados,
            validacao: relatorio.validacao,
            consolidado: relatorio.consolidado,
            analisesIA: relatorio.analisesIA,
            homologacao: relatorio.homologacao,
            previa: relatorio.previa
        })
    };
}

function baixarJson(projeto) {
    const conteudo = JSON.stringify(projeto, null, 2);
    const blob = new Blob([conteudo], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = projeto.nomeSugerido || 'relatorio-mensal.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function atualizarStatusProjeto(texto, tipo = 'neutro') {
    const status = obterElemento('relStatusProjeto');
    if (!status) return;
    status.className = `relatorio-projeto-status projeto-status-${tipo}`;
    status.textContent = texto;
}

function salvarProjeto() {
    try {
        const projeto = criarProjeto();
        baixarJson(projeto);

        estadoAplicacao.relatorio.projeto = {
            nome: projeto.nomeSugerido,
            salvoEm: projeto.salvoEm,
            carregadoDe: estadoAplicacao.relatorio.projeto?.carregadoDe || null,
            arquivosOriginais: projeto.arquivosOriginais
        };

        atualizarStatusProjeto(
            `Projeto salvo em ${new Date(projeto.salvoEm).toLocaleString('pt-BR')}.`,
            'sucesso'
        );
    } catch (erro) {
        console.error('Erro ao salvar o projeto:', erro);
        atualizarStatusProjeto('Não foi possível salvar o projeto.', 'erro');
        alert(`Não foi possível salvar o projeto.\n\n${erro.message}`);
    }
}

function validarProjeto(projeto) {
    if (!projeto || typeof projeto !== 'object') {
        throw new Error('O arquivo não contém um projeto válido.');
    }
    if (projeto.identificador !== IDENTIFICADOR_PROJETO) {
        throw new Error('Este JSON não pertence à Automação de Vendas EcofoodPack.');
    }
    if (Number(projeto.versaoEsquema) > VERSAO_ESQUEMA) {
        throw new Error('O projeto foi criado em uma versão mais nova da automação.');
    }
    if (!projeto.campos || typeof projeto.campos !== 'object') {
        throw new Error('Os campos do relatório não foram encontrados no projeto.');
    }
    if (!projeto.relatorio || typeof projeto.relatorio !== 'object') {
        throw new Error('Os dados processados do relatório não foram encontrados.');
    }
}

function normalizarAnalisesCarregadas(analises = {}) {
    return Object.fromEntries(Object.entries(analises || {}).map(([chave, registro]) => {
        const copia = { ...(registro || {}) };
        if (copia.status === 'processando') {
            copia.status = String(copia.texto || '').trim() ? 'editado' : 'pendente';
            copia.erro = null;
        }
        return [chave, copia];
    }));
}

function restaurarEstado(projeto, nomeArquivo) {
    const dados = copiarSerializavel(projeto.relatorio || {});
    const relatorio = estadoAplicacao.relatorio;

    relatorio.status = dados.status === 'processando'
        ? (dados.consolidado ? 'consolidado' : 'nao-iniciado')
        : (dados.status || (dados.consolidado ? 'consolidado' : 'nao-iniciado'));
    relatorio.periodo = dados.periodo || projeto.campos?.relPeriodoReferencia || null;
    relatorio.periodoFormatado = dados.periodoFormatado || '';
    relatorio.quantidadeParceirosCadastrados = Number(dados.quantidadeParceirosCadastrados || estadoAplicacao.parceiros.length || 0);
    relatorio.arquivos = {};
    relatorio.investimentos = dados.investimentos || {};
    relatorio.informacoesDoPeriodo = dados.informacoesDoPeriodo || {};
    relatorio.resultados = dados.resultados || {
        vendasAtual: null,
        gaResumo: null,
        visitas: null,
        metaAds: null,
        produtos: null,
        historico: [],
        validacoesBasicas: {}
    };
    relatorio.validacao = dados.validacao || null;
    relatorio.consolidado = dados.consolidado || null;
    relatorio.analisesIA = normalizarAnalisesCarregadas(dados.analisesIA || {});
    relatorio.homologacao = dados.homologacao || null;
    relatorio.previa = dados.previa || null;
    relatorio.projeto = {
        nome: nomeArquivo,
        salvoEm: projeto.salvoEm || null,
        carregadoDe: nomeArquivo,
        arquivosOriginais: projeto.arquivosOriginais || {}
    };
}

async function carregarProjetoArquivo(arquivo) {
    if (!arquivo) return;

    try {
        atualizarStatusProjeto('Lendo o projeto selecionado...', 'processando');
        const texto = await arquivo.text();
        const projeto = JSON.parse(texto);
        validarProjeto(projeto);

        restaurarEstado(projeto, arquivo.name);
        restaurarMontagemRelatorioDoProjeto({
            campos: projeto.campos,
            arquivosOriginais: projeto.arquivosOriginais || {}
        });

        window.dispatchEvent(new CustomEvent('relatorio:projeto-carregado', {
            detail: {
                nomeArquivo: arquivo.name,
                possuiConsolidado: Boolean(estadoAplicacao.relatorio.consolidado),
                salvoEm: projeto.salvoEm || null
            }
        }));

        const possuiConsolidado = Boolean(estadoAplicacao.relatorio.consolidado);
        atualizarStatusProjeto(
            possuiConsolidado
                ? `Projeto “${arquivo.name}” carregado com os dados processados.`
                : `Projeto “${arquivo.name}” carregado. Selecione novamente os XLSX para validar.`,
            'sucesso'
        );
    } catch (erro) {
        console.error('Erro ao carregar o projeto:', erro);
        atualizarStatusProjeto('Falha ao carregar o projeto.', 'erro');
        alert(`Não foi possível carregar o projeto.\n\n${erro.message}`);
    } finally {
        const input = obterElemento('inputCarregarProjeto');
        if (input) input.value = '';
    }
}

function criarNovoRelatorio() {
    const existeTrabalho = Boolean(
        estadoAplicacao.relatorio.consolidado
        || valorCampo('relPeriodoReferencia')
        || CAMPOS_PROJETO.some(id => valorCampo(id).trim())
        || ARQUIVOS_PROJETO.some(([, inputId]) => obterElemento(inputId)?.files?.length)
    );

    if (
        existeTrabalho
        && !window.confirm('Criar um novo relatório apagará da tela os arquivos, campos, análises e a prévia atuais. O Banco de Parceiros será preservado. Deseja continuar?')
    ) {
        return;
    }

    window.location.reload();
}

function marcarAlteracoesNaoSalvas() {
    atualizarStatusProjeto('Há alterações que ainda não foram salvas no arquivo do projeto.', 'neutro');
}

function tratarAlteracaoNaMontagem(evento) {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLElement)) return;
    if (!alvo.closest('#abaMontarRelatorio')) return;
    if (alvo.id === 'inputCarregarProjeto') return;
    marcarAlteracoesNaoSalvas();
}

function tratarClique(evento) {
    if (evento.target.closest('#btnSalvarProjeto')) {
        salvarProjeto();
        return;
    }

    if (evento.target.closest('#btnCarregarProjeto')) {
        obterElemento('inputCarregarProjeto')?.click();
        return;
    }

    if (evento.target.closest('#btnNovoRelatorio')) {
        criarNovoRelatorio();
    }
}

export function inicializarProjetoRelatorio() {
    document.addEventListener('click', tratarClique);
    document.addEventListener('input', tratarAlteracaoNaMontagem);
    document.addEventListener('change', tratarAlteracaoNaMontagem);

    obterElemento('inputCarregarProjeto')?.addEventListener('change', evento => {
        carregarProjetoArquivo(evento.target.files?.[0] || null);
    });

    window.addEventListener('relatorio:consolidado', marcarAlteracoesNaoSalvas);
    window.addEventListener('relatorio:analise-alterada', marcarAlteracoesNaoSalvas);
    window.addEventListener('relatorio:homologacao-aprovada', marcarAlteracoesNaoSalvas);

    atualizarStatusProjeto(
        'Você pode salvar o projeto a qualquer momento. Os XLSX não são incorporados ao arquivo JSON.',
        'neutro'
    );
}
