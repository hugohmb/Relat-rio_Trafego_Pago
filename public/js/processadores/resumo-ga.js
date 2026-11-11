import { converterParaNumero, lerPlanilhaAsync } from '../utilitarios.js';

const CATEGORIAS = {
    todos: {
        chave: 'todos',
        titulo: 'Todos os usuários',
        aliases: ['todos os usuarios']
    },
    direto: {
        chave: 'direto',
        titulo: 'Tráfego direto',
        aliases: ['trafego direto']
    },
    organico: {
        chave: 'organico',
        titulo: 'Tráfego orgânico',
        aliases: ['trafego organico']
    },
    pago: {
        chave: 'pago',
        titulo: 'Tráfego pago',
        aliases: ['trafego pago']
    }
};

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^#+\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function separarCsvSimples(texto) {
    const valores = [];
    let atual = '';
    let entreAspas = false;

    for (let indice = 0; indice < texto.length; indice++) {
        const caractere = texto[indice];
        const proximo = texto[indice + 1];

        if (caractere === '"' && entreAspas && proximo === '"') {
            atual += '"';
            indice++;
            continue;
        }

        if (caractere === '"') {
            entreAspas = !entreAspas;
            continue;
        }

        if (caractere === ',' && !entreAspas) {
            valores.push(atual.trim());
            atual = '';
            continue;
        }

        atual += caractere;
    }

    valores.push(atual.trim());
    return valores;
}

function normalizarLinha(linha) {
    if (!Array.isArray(linha)) {
        return [linha];
    }

    if (linha.length === 1 && typeof linha[0] === 'string' && linha[0].includes(',')) {
        return separarCsvSimples(linha[0]);
    }

    return linha;
}

function linhaEstaVazia(linha) {
    return normalizarLinha(linha).every(celula => String(celula ?? '').trim() === '');
}

function textoDaLinha(linha) {
    return normalizarLinha(linha)
        .map(celula => String(celula ?? ''))
        .join(' ')
        .trim();
}

function detectarCategoria(texto) {
    const normalizado = normalizarTexto(texto);

    return Object.values(CATEGORIAS).find(categoria =>
        categoria.aliases.some(alias => normalizado === alias)
    )?.chave || '';
}

function extrairDataComentario(texto, tipo) {
    const normalizado = normalizarTexto(texto);
    const marcador = tipo === 'inicio' ? 'data de inicio' : 'data de termino';

    if (!normalizado.includes(marcador)) {
        return '';
    }

    const correspondencia = String(texto ?? '').match(/(20\d{2})[\/-]?(\d{2})[\/-]?(\d{2})/);
    return correspondencia
        ? `${correspondencia[1]}-${correspondencia[2]}-${correspondencia[3]}`
        : '';
}

function localizarIndice(cabecalhoNormalizado, aliases) {
    return cabecalhoNormalizado.findIndex(item => aliases.includes(item));
}

function localizarColunasResumo(cabecalho) {
    const normalizado = normalizarLinha(cabecalho).map(normalizarTexto);
    const indices = {
        carrinhos: localizarIndice(normalizado, [
            'adicionar aos carrinhos',
            'adicoes ao carrinho',
            'adicionar ao carrinho'
        ]),
        compras: localizarIndice(normalizado, ['compras', 'compras realizadas']),
        receita: localizarIndice(normalizado, [
            'receita de compra',
            'receita das compras',
            'receita'
        ]),
        arppu: localizarIndice(normalizado, [
            'arppu',
            'receita media por usuario pagante',
            'receita media por comprador'
        ])
    };

    const ausentes = Object.entries(indices)
        .filter(([, indice]) => indice === -1)
        .map(([chave]) => chave);

    if (ausentes.length) {
        return null;
    }

    return indices;
}

function validarPeriodo(dataInicial, dataFinal, periodoEsperado) {
    if (!periodoEsperado || !/^\d{4}-\d{2}$/.test(periodoEsperado)) {
        return;
    }

    const divergente = [dataInicial, dataFinal]
        .filter(Boolean)
        .find(data => !data.startsWith(periodoEsperado));

    if (divergente) {
        throw new Error(
            `O resumo do Google Analytics pertence ao período ${divergente.slice(0, 7)}, ` +
            `mas o relatório está configurado para ${periodoEsperado}.`
        );
    }
}

function calcularPercentual(parte, total) {
    return total > 0 ? (parte / total) * 100 : 0;
}

function criarCategoria(chave, dados) {
    const configuracao = CATEGORIAS[chave];
    const carrinhos = Math.max(0, converterParaNumero(dados.carrinhos));
    const compras = Math.max(0, converterParaNumero(dados.compras));
    const receita = Math.max(0, converterParaNumero(dados.receita));
    const arppu = Math.max(0, converterParaNumero(dados.arppu));

    const receitaSuspeita = receita > 50_000_000 && compras < 1_000_000;
    const arppuSuspeito = arppu > 1_000_000;

    if (receitaSuspeita || arppuSuspeito) {
        throw new Error(
            `Os valores do bloco "${configuracao.titulo}" perderam o separador decimal durante a conversão para XLSX. ` +
            'Use o arquivo CSV original exportado pelo Google Analytics, sem abrir e salvar novamente no Excel.'
        );
    }

    return {
        chave,
        titulo: configuracao.titulo,
        carrinhos,
        compras,
        receita,
        arppu,
        arppuEstimado: false
    };
}

function criarOutros(todos, direto, organico, pago) {
    const somarConhecidos = campo =>
        direto[campo] + organico[campo] + pago[campo];

    const carrinhos = Math.max(0, todos.carrinhos - somarConhecidos('carrinhos'));
    const compras = Math.max(0, todos.compras - somarConhecidos('compras'));
    const receita = Math.max(0, todos.receita - somarConhecidos('receita'));

    return {
        chave: 'outros',
        titulo: 'Outros',
        carrinhos,
        compras,
        receita,
        arppu: compras > 0 ? receita / compras : 0,
        arppuEstimado: true
    };
}

function verificarResiduosNegativos(todos, direto, organico, pago) {
    const campos = [
        ['carrinhos', 'adições ao carrinho'],
        ['compras', 'compras'],
        ['receita', 'receita']
    ];

    return campos
        .filter(([campo]) => direto[campo] + organico[campo] + pago[campo] > todos[campo] + 0.01)
        .map(([, rotulo]) =>
            `A soma de tráfego direto, orgânico e pago supera o total em ${rotulo}. O valor de Outros foi limitado a zero.`
        );
}

export function processarLinhasResumoGa(linhas, periodoEsperado = '') {
    if (!Array.isArray(linhas) || linhas.length < 2) {
        throw new Error('O resumo do Google Analytics está vazio ou sem dados utilizáveis.');
    }

    const encontrados = {};
    const periodos = [];
    let categoriaAtual = '';
    let dataInicialAtual = '';
    let dataFinalAtual = '';

    for (let indice = 0; indice < linhas.length; indice++) {
        const linha = normalizarLinha(linhas[indice]);

        if (linhaEstaVazia(linha)) {
            continue;
        }

        const texto = textoDaLinha(linha);
        const primeiraCelula = String(linha[0] ?? '').trim();

        if (primeiraCelula.startsWith('#')) {
            const categoriaDetectada = detectarCategoria(texto);
            if (categoriaDetectada) {
                categoriaAtual = categoriaDetectada;
                dataInicialAtual = '';
                dataFinalAtual = '';
                continue;
            }

            dataInicialAtual ||= extrairDataComentario(texto, 'inicio');
            dataFinalAtual ||= extrairDataComentario(texto, 'termino');
            continue;
        }

        if (!categoriaAtual || encontrados[categoriaAtual]) {
            continue;
        }

        const indices = localizarColunasResumo(linha);
        if (!indices) {
            continue;
        }

        let indiceDados = indice + 1;
        while (indiceDados < linhas.length && linhaEstaVazia(linhas[indiceDados])) {
            indiceDados++;
        }

        const linhaDados = normalizarLinha(linhas[indiceDados] || []);
        const primeiraCelulaDados = String(linhaDados[0] ?? '').trim();

        if (!linhaDados.length || primeiraCelulaDados.startsWith('#')) {
            throw new Error(
                `O bloco "${CATEGORIAS[categoriaAtual].titulo}" não possui uma linha de valores válida.`
            );
        }

        encontrados[categoriaAtual] = criarCategoria(categoriaAtual, {
            carrinhos: linhaDados[indices.carrinhos],
            compras: linhaDados[indices.compras],
            receita: linhaDados[indices.receita],
            arppu: linhaDados[indices.arppu]
        });

        if (dataInicialAtual || dataFinalAtual) {
            periodos.push({
                categoria: categoriaAtual,
                dataInicial: dataInicialAtual,
                dataFinal: dataFinalAtual
            });
        }

        indice = indiceDados;
    }

    const obrigatorias = Object.keys(CATEGORIAS);
    const ausentes = obrigatorias.filter(chave => !encontrados[chave]);

    if (ausentes.length) {
        throw new Error(
            `Blocos obrigatórios não encontrados no resumo do Google Analytics: ` +
            `${ausentes.map(chave => CATEGORIAS[chave].titulo).join(', ')}.`
        );
    }

    const datasIniciais = periodos.map(item => item.dataInicial).filter(Boolean);
    const datasFinais = periodos.map(item => item.dataFinal).filter(Boolean);
    const dataInicial = datasIniciais[0] || '';
    const dataFinal = datasFinais[0] || '';

    periodos.forEach(periodo => validarPeriodo(
        periodo.dataInicial,
        periodo.dataFinal,
        periodoEsperado
    ));

    const todos = encontrados.todos;
    const direto = encontrados.direto;
    const organico = encontrados.organico;
    const pago = encontrados.pago;
    const outros = criarOutros(todos, direto, organico, pago);
    const categorias = [todos, direto, organico, pago, outros];

    const avisos = verificarResiduosNegativos(todos, direto, organico, pago);

    if (!dataInicial || !dataFinal) {
        avisos.push('O período não foi encontrado em todos os blocos do arquivo.');
    }

    avisos.push(
        'A categoria Outros é calculada pela diferença entre Todos os usuários e os tráfegos direto, orgânico e pago. O ARPPU de Outros é uma estimativa por receita dividida pelas compras.'
    );

    return {
        periodoDetectado: dataInicial ? dataInicial.slice(0, 7) : '',
        dataInicial,
        dataFinal,
        categorias,
        todos,
        direto,
        organico,
        pago,
        outros,
        participacaoPago: {
            carrinhos: calcularPercentual(pago.carrinhos, todos.carrinhos),
            compras: calcularPercentual(pago.compras, todos.compras),
            receita: calcularPercentual(pago.receita, todos.receita)
        },
        grafico: {
            labels: categorias.map(categoria => categoria.titulo),
            carrinhos: categorias.map(categoria => categoria.carrinhos),
            compras: categorias.map(categoria => categoria.compras),
            receita: categorias.map(categoria => categoria.receita)
        },
        avisos
    };
}

export async function processarArquivoResumoGa(arquivo, periodoEsperado = '') {
    const linhas = await lerPlanilhaAsync(arquivo);
    return processarLinhasResumoGa(linhas, periodoEsperado);
}
