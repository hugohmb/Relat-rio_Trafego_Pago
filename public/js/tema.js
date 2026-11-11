const CHAVE_TEMA = 'automacao-vendas-tema';
const TEMAS_VALIDOS = new Set(['ecofood', 'dark']);

function temaAtual() {
    const tema = document.documentElement.dataset.theme;
    return TEMAS_VALIDOS.has(tema) ? tema : 'ecofood';
}

function atualizarBotoesTema(tema) {
    document.querySelectorAll('[data-theme-option]').forEach(botao => {
        const ativo = botao.dataset.themeOption === tema;
        botao.classList.toggle('active', ativo);
        botao.setAttribute('aria-pressed', String(ativo));
    });
}

function coresGraficoInterface() {
    const estilos = getComputedStyle(document.documentElement);
    return {
        texto: estilos.getPropertyValue('--ui-text').trim() || '#253025',
        suave: estilos.getPropertyValue('--ui-muted').trim() || '#687468',
        grade: estilos.getPropertyValue('--ui-chart-grid').trim() || 'rgba(90, 110, 90, .15)'
    };
}

export function aplicarTemaNosGraficosInterface() {
    if (typeof Chart === 'undefined' || !Chart.instances) return;

    const cores = coresGraficoInterface();

    const instancias = Chart.instances;
    const graficos = typeof instancias?.forEach === 'function'
        ? Array.from(instancias.values?.() || instancias)
        : Object.values(instancias || {});

    graficos.forEach(grafico => {
        const canvas = grafico?.canvas;
        if (!canvas || canvas.closest('.pagina-relatorio')) return;

        const opcoes = grafico.options || {};

        if (opcoes.plugins?.title) {
            opcoes.plugins.title.color = cores.texto;
        }

        if (opcoes.plugins?.legend?.labels) {
            opcoes.plugins.legend.labels.color = cores.suave;
        } else if (opcoes.plugins?.legend) {
            opcoes.plugins.legend.labels = { color: cores.suave };
        }

        Object.values(opcoes.scales || {}).forEach(escala => {
            escala.ticks = { ...(escala.ticks || {}), color: cores.suave };
            escala.grid = { ...(escala.grid || {}), color: cores.grade };
            if (escala.title) escala.title.color = cores.suave;
        });

        grafico.update('none');
    });
}

export function definirTema(novoTema, { persistir = true } = {}) {
    const tema = TEMAS_VALIDOS.has(novoTema) ? novoTema : 'ecofood';
    document.documentElement.dataset.theme = tema;

    if (persistir) {
        localStorage.setItem(CHAVE_TEMA, tema);
    }

    atualizarBotoesTema(tema);
    document.dispatchEvent(new CustomEvent('automacao:tema-alterado', {
        detail: { tema }
    }));

    requestAnimationFrame(() => aplicarTemaNosGraficosInterface());
}

export function inicializarTema() {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    definirTema(TEMAS_VALIDOS.has(salvo) ? salvo : temaAtual(), { persistir: false });

    document.querySelectorAll('[data-theme-option]').forEach(botao => {
        botao.addEventListener('click', () => definirTema(botao.dataset.themeOption));
    });

    document.addEventListener('automacao:aba-aberta', () => {
        requestAnimationFrame(() => aplicarTemaNosGraficosInterface());
    });
}
