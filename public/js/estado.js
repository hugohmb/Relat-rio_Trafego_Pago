export const estadoAplicacao = {
    parceiros: [],
    memorias: [],

    dashboard: {
        arquivo: null,
        resultados: null,
        grafico: null
    },

    historico: {
        periodos: [],
        resultados: [],
        graficos: []
    },

    relatorio: {
        status: 'nao-iniciado',
        periodo: null,
        periodoFormatado: '',
        quantidadeParceirosCadastrados: 0,
        arquivos: {},
        investimentos: {},
        informacoesDoPeriodo: {},
        resultados: {
            vendasAtual: null,
            gaResumo: null,
            visitas: null,
            metaAds: null,
            produtos: null,
            historico: [],
            validacoesBasicas: {}
        },
        validacao: null,
        consolidado: null,
        analisesIA: {},
        homologacao: null,
        previa: null,
        projeto: {
            nome: '',
            salvoEm: null,
            carregadoDe: null,
            arquivosOriginais: {}
        }
    }
};
