import { estadoAplicacao } from '../estado.js';
import { normalizarNome } from '../utilitarios.js';

const estadoLimpador = {
    arquivo: null,
    bufferOriginal: null,
    workbook: null,
    analise: null
};

const elementos = {};

function obterElementos() {
    const ids = [
        'limpadorArquivoInput', 'limpadorDropZone', 'limpadorDropTitulo',
        'limpadorDropSubtitulo', 'limpadorArquivoMeta', 'limpadorArquivoNome',
        'limpadorArquivoTamanho', 'limpadorTrocarArquivo', 'limpadorAbaSelect',
        'limpadorCabecalhoLinha', 'limpadorColunaSelect', 'limpadorFonteBanco',
        'limpadorFontePersonalizada', 'limpadorBancoResumo',
        'limpadorListaPersonalizadaBloco', 'limpadorListaPersonalizada',
        'limpadorBtnAnalisar', 'limpadorBtnGerar', 'limpadorStatus',
        'limpadorResumoVazio', 'limpadorResumoConteudo', 'limpadorMetricaTotal',
        'limpadorMetricaRemover', 'limpadorMetricaManter', 'limpadorMetricaNomes',
        'limpadorEncontradosTotal', 'limpadorNaoEncontradosTotal',
        'limpadorEncontradosLista', 'limpadorNaoEncontradosLista', 'limpadorNomeSaida'
    ];

    ids.forEach(id => {
        elementos[id] = document.getElementById(id);
    });
}

function formatarNumero(valor) {
    return new Intl.NumberFormat('pt-BR').format(Number(valor) || 0);
}

function formatarBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';

    const unidades = ['B', 'KB', 'MB', 'GB'];
    const indice = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        unidades.length - 1
    );
    const tamanho = bytes / (1024 ** indice);

    return `${tamanho.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidades[indice]}`;
}

function mostrarStatus(mensagem, tipo = 'info') {
    const status = elementos.limpadorStatus;
    if (!status) return;

    status.textContent = mensagem;
    status.className = `limpador-status limpador-status-${tipo}`;
    status.hidden = false;
}

function limparStatus() {
    const status = elementos.limpadorStatus;
    if (!status) return;

    status.textContent = '';
    status.className = 'limpador-status';
    status.hidden = true;
}

function origemBancoAtiva() {
    return Boolean(elementos.limpadorFonteBanco?.checked);
}

function atualizarResumoBanco() {
    const total = estadoAplicacao.parceiros.length;
    const texto = total === 1
        ? '1 parceiro cadastrado será usado na comparação.'
        : `${formatarNumero(total)} parceiros cadastrados serão usados na comparação.`;

    if (elementos.limpadorBancoResumo) {
        elementos.limpadorBancoResumo.textContent = texto;
    }
}

function invalidarAnalise({ manterStatus = false } = {}) {
    estadoLimpador.analise = null;

    if (elementos.limpadorBtnGerar) elementos.limpadorBtnGerar.disabled = true;
    if (elementos.limpadorResumoVazio) elementos.limpadorResumoVazio.hidden = false;
    if (elementos.limpadorResumoConteudo) elementos.limpadorResumoConteudo.hidden = true;
    if (!manterStatus) limparStatus();
}

function obterNomesPersonalizados() {
    const textoOriginal = String(elementos.limpadorListaPersonalizada?.value || '');

    if (!textoOriginal.trim()) {
        throw new Error('Cole pelo menos um nome na lista personalizada.');
    }

    let itens;

    try {
        const json = JSON.parse(textoOriginal);
        if (!Array.isArray(json)) throw new Error('O JSON precisa ser uma lista.');
        itens = json;
    } catch {
        itens = textoOriginal.split(/\r?\n/);
    }

    if (itens.some(item => typeof item !== 'string')) {
        throw new Error('Todos os itens da lista precisam ser nomes em formato de texto.');
    }

    const nomesUnicos = new Map();

    itens.forEach(item => {
        const original = String(item).trim();
        const normalizado = normalizarNome(original);

        if (normalizado && !nomesUnicos.has(normalizado)) {
            nomesUnicos.set(normalizado, original);
        }
    });

    if (nomesUnicos.size === 0) {
        throw new Error('A lista personalizada não contém nomes válidos.');
    }

    return nomesUnicos;
}

function obterMapaNomes() {
    if (!origemBancoAtiva()) return obterNomesPersonalizados();

    const nomes = new Map();

    estadoAplicacao.parceiros.forEach(nome => {
        const normalizado = normalizarNome(nome);
        if (normalizado && !nomes.has(normalizado)) {
            nomes.set(normalizado, String(nome).trim());
        }
    });

    if (nomes.size === 0) {
        throw new Error('O Banco de Parceiros está vazio. Cadastre nomes ou use uma lista personalizada.');
    }

    return nomes;
}

function quantidadeNomesDisponiveis() {
    if (origemBancoAtiva()) return estadoAplicacao.parceiros.length;

    try {
        return obterNomesPersonalizados().size;
    } catch {
        return 0;
    }
}

function atualizarBotaoAnalisar() {
    const pronto = Boolean(
        estadoLimpador.workbook &&
        elementos.limpadorAbaSelect?.value !== '' &&
        elementos.limpadorColunaSelect?.value !== '' &&
        quantidadeNomesDisponiveis() > 0
    );

    if (elementos.limpadorBtnAnalisar) elementos.limpadorBtnAnalisar.disabled = !pronto;
}

function alternarFonteNomes() {
    const personalizada = !origemBancoAtiva();

    if (elementos.limpadorListaPersonalizadaBloco) {
        elementos.limpadorListaPersonalizadaBloco.hidden = !personalizada;
    }

    invalidarAnalise();
    atualizarBotaoAnalisar();
}

function rotuloColuna(indice) {
    return XLSX.utils.encode_col(indice);
}

function obterValorCabecalho(planilha, linha, coluna) {
    const celula = planilha[XLSX.utils.encode_cell({ r: linha, c: coluna })];
    if (!celula || celula.v === undefined || celula.v === null) return '';
    return String(celula.v);
}

function preencherAbas() {
    const select = elementos.limpadorAbaSelect;
    if (!select || !estadoLimpador.workbook) return;

    select.innerHTML = '';

    estadoLimpador.workbook.SheetNames.forEach(nomeAba => {
        const option = document.createElement('option');
        option.value = nomeAba;
        option.textContent = nomeAba;
        select.appendChild(option);
    });

    select.disabled = false;
    elementos.limpadorCabecalhoLinha.disabled = false;
    preencherColunas();
}

function preencherColunas() {
    if (!estadoLimpador.workbook || !elementos.limpadorAbaSelect?.value) return;

    const nomeAba = elementos.limpadorAbaSelect.value;
    const planilha = estadoLimpador.workbook.Sheets[nomeAba];
    const linhaCabecalho = Math.max(1, Number.parseInt(elementos.limpadorCabecalhoLinha.value, 10) || 1);
    const indiceCabecalho = linhaCabecalho - 1;
    const select = elementos.limpadorColunaSelect;

    select.innerHTML = '';

    if (!planilha?.['!ref']) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'A aba está vazia';
        select.appendChild(option);
        select.disabled = true;
        invalidarAnalise();
        atualizarBotaoAnalisar();
        return;
    }

    const intervalo = XLSX.utils.decode_range(planilha['!ref']);
    let colunaPreferida = '';

    for (let coluna = intervalo.s.c; coluna <= intervalo.e.c; coluna += 1) {
        const cabecalho = obterValorCabecalho(planilha, indiceCabecalho, coluna);
        const option = document.createElement('option');
        option.value = String(coluna);
        option.textContent = `${rotuloColuna(coluna)} — ${cabecalho || '(sem título)'}`;
        select.appendChild(option);

        if (normalizarNome(cabecalho) === 'NOME DO CLIENTE') {
            colunaPreferida = String(coluna);
        }
    }

    select.disabled = false;
    if (colunaPreferida !== '') select.value = colunaPreferida;

    invalidarAnalise();
    atualizarBotaoAnalisar();
}

function decodificarCsv(buffer) {
    const bytes = new Uint8Array(buffer);
    let texto = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');

    if (texto.includes('\uFFFD')) {
        texto = new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '');
    }

    return texto;
}

function lerWorkbook(buffer, nomeArquivo) {
    const ehCsv = /\.csv$/i.test(nomeArquivo || '');

    if (ehCsv) {
        return XLSX.read(decodificarCsv(buffer), {
            type: 'string', raw: true, cellDates: true, cellStyles: true, cellFormula: true
        });
    }

    return XLSX.read(buffer.slice(0), {
        type: 'array', raw: true, cellDates: true, cellStyles: true, cellFormula: true
    });
}

async function carregarArquivo(arquivo) {
    limparStatus();
    invalidarAnalise({ manterStatus: true });

    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('A biblioteca de planilhas não foi carregada. Verifique a conexão com a internet.');
        }

        if (!/\.(xlsx|xls|xlsb|csv)$/i.test(arquivo.name)) {
            throw new Error('Selecione um arquivo CSV, XLSX, XLS ou XLSB.');
        }

        const buffer = await arquivo.arrayBuffer();
        const workbook = lerWorkbook(buffer, arquivo.name);

        if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
            throw new Error('A planilha não contém nenhuma aba.');
        }

        estadoLimpador.arquivo = arquivo;
        estadoLimpador.bufferOriginal = buffer;
        estadoLimpador.workbook = workbook;

        elementos.limpadorArquivoNome.textContent = arquivo.name;
        elementos.limpadorArquivoTamanho.textContent = formatarBytes(arquivo.size);
        elementos.limpadorArquivoMeta.hidden = false;
        elementos.limpadorDropZone.classList.add('limpador-drop-carregado');
        elementos.limpadorDropTitulo.textContent = 'Planilha carregada';
        elementos.limpadorDropSubtitulo.textContent = 'Escolha a aba e a coluna do cliente abaixo.';

        const nomeBase = arquivo.name.replace(/\.[^.]+$/, '');
        elementos.limpadorNomeSaida.value = `${nomeBase}_clientes_removidos.xlsx`;

        preencherAbas();
        atualizarBotaoAnalisar();
        mostrarStatus('Planilha carregada com sucesso.', 'sucesso');
    } catch (erro) {
        estadoLimpador.arquivo = null;
        estadoLimpador.bufferOriginal = null;
        estadoLimpador.workbook = null;
        elementos.limpadorArquivoInput.value = '';
        elementos.limpadorArquivoMeta.hidden = true;
        elementos.limpadorDropZone.classList.remove('limpador-drop-carregado');
        elementos.limpadorDropTitulo.textContent = 'Clique ou arraste a planilha aqui';
        elementos.limpadorDropSubtitulo.textContent = 'A cópia original permanecerá intacta.';
        elementos.limpadorAbaSelect.disabled = true;
        elementos.limpadorCabecalhoLinha.disabled = true;
        elementos.limpadorColunaSelect.disabled = true;
        atualizarBotaoAnalisar();
        mostrarStatus(erro.message || 'Não foi possível abrir a planilha.', 'erro');
    }
}

function renderizarLista(elemento, itens, mostrarQuantidade) {
    elemento.innerHTML = '';

    if (itens.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nenhum item.';
        elemento.appendChild(li);
        return;
    }

    itens.forEach(item => {
        const li = document.createElement('li');
        li.textContent = mostrarQuantidade
            ? `${item.nome} — ${formatarNumero(item.quantidade)} linha(s)`
            : item;
        elemento.appendChild(li);
    });
}

function renderizarAnalise() {
    const analise = estadoLimpador.analise;
    if (!analise) return;

    elementos.limpadorResumoVazio.hidden = true;
    elementos.limpadorResumoConteudo.hidden = false;
    elementos.limpadorMetricaTotal.textContent = formatarNumero(analise.totalLinhas);
    elementos.limpadorMetricaRemover.textContent = formatarNumero(analise.linhasRemover.length);
    elementos.limpadorMetricaManter.textContent = formatarNumero(analise.linhasRestantes);
    elementos.limpadorMetricaNomes.textContent = formatarNumero(analise.nomesEncontrados.length);
    elementos.limpadorEncontradosTotal.textContent = formatarNumero(analise.nomesEncontrados.length);
    elementos.limpadorNaoEncontradosTotal.textContent = formatarNumero(analise.nomesNaoEncontrados.length);

    renderizarLista(elementos.limpadorEncontradosLista, analise.nomesEncontrados, true);
    renderizarLista(elementos.limpadorNaoEncontradosLista, analise.nomesNaoEncontrados, false);
}

function analisarPlanilha() {
    limparStatus();

    try {
        if (!estadoLimpador.workbook) throw new Error('Selecione uma planilha primeiro.');

        const mapaNomes = obterMapaNomes();
        const nomeAba = elementos.limpadorAbaSelect.value;
        const planilha = estadoLimpador.workbook.Sheets[nomeAba];

        if (!planilha?.['!ref']) throw new Error('A aba selecionada está vazia.');

        const coluna = Number.parseInt(elementos.limpadorColunaSelect.value, 10);
        const linhaCabecalho = Math.max(1, Number.parseInt(elementos.limpadorCabecalhoLinha.value, 10) || 1);
        const indiceCabecalho = linhaCabecalho - 1;
        const intervalo = XLSX.utils.decode_range(planilha['!ref']);

        if (indiceCabecalho < intervalo.s.r || indiceCabecalho > intervalo.e.r) {
            throw new Error('A linha do cabeçalho está fora da área usada da planilha.');
        }

        const inicioDados = indiceCabecalho + 1;
        const linhasRemover = [];
        const quantidadesEncontradas = new Map();

        for (let linha = inicioDados; linha <= intervalo.e.r; linha += 1) {
            const celula = planilha[XLSX.utils.encode_cell({ r: linha, c: coluna })];
            if (!celula || celula.v === undefined || celula.v === null) continue;

            const nomeNormalizado = normalizarNome(celula.v);

            if (nomeNormalizado && mapaNomes.has(nomeNormalizado)) {
                linhasRemover.push(linha);
                quantidadesEncontradas.set(
                    nomeNormalizado,
                    (quantidadesEncontradas.get(nomeNormalizado) || 0) + 1
                );
            }
        }

        const nomesEncontrados = [];
        const nomesNaoEncontrados = [];

        mapaNomes.forEach((nomeOriginal, nomeNormalizado) => {
            const quantidade = quantidadesEncontradas.get(nomeNormalizado) || 0;

            if (quantidade > 0) nomesEncontrados.push({ nome: nomeOriginal, quantidade });
            else nomesNaoEncontrados.push(nomeOriginal);
        });

        nomesEncontrados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        nomesNaoEncontrados.sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const totalLinhas = Math.max(0, intervalo.e.r - inicioDados + 1);

        estadoLimpador.analise = {
            nomeAba,
            coluna,
            indiceCabecalho,
            linhasRemover,
            totalLinhas,
            linhasRestantes: Math.max(0, totalLinhas - linhasRemover.length),
            nomesEncontrados,
            nomesNaoEncontrados,
            origem: origemBancoAtiva() ? 'Banco de Parceiros' : 'Lista personalizada'
        };

        renderizarAnalise();
        elementos.limpadorBtnGerar.disabled = false;

        if (linhasRemover.length === 0) {
            mostrarStatus('Análise concluída: nenhuma correspondência exata foi encontrada.', 'info');
        } else {
            mostrarStatus(
                `Análise concluída: ${formatarNumero(linhasRemover.length)} linha(s) serão excluídas usando ${estadoLimpador.analise.origem}.`,
                'sucesso'
            );
        }
    } catch (erro) {
        invalidarAnalise({ manterStatus: true });
        mostrarStatus(erro.message || 'Não foi possível analisar a planilha.', 'erro');
    }
}

function copiarPropriedadesEspeciais(origem, destino) {
    ['!cols', '!margins', '!protect', '!outline', '!pageSetup', '!printHeader',
        '!printFooter', '!sheetViews'].forEach(propriedade => {
        if (origem[propriedade] !== undefined) destino[propriedade] = origem[propriedade];
    });
}

function criarPlanilhaFiltrada(planilhaOrigem, linhasRemover) {
    if (!planilhaOrigem?.['!ref']) return planilhaOrigem;

    const intervalo = XLSX.utils.decode_range(planilhaOrigem['!ref']);
    const remover = new Set(linhasRemover);
    const mapaLinhas = new Map();
    let proximaLinha = intervalo.s.r;

    for (let linhaAntiga = intervalo.s.r; linhaAntiga <= intervalo.e.r; linhaAntiga += 1) {
        if (!remover.has(linhaAntiga)) {
            mapaLinhas.set(linhaAntiga, proximaLinha);
            proximaLinha += 1;
        }
    }

    const planilhaDestino = {};
    copiarPropriedadesEspeciais(planilhaOrigem, planilhaDestino);

    Object.keys(planilhaOrigem).forEach(chave => {
        if (chave.startsWith('!')) return;

        const enderecoAntigo = XLSX.utils.decode_cell(chave);
        if (remover.has(enderecoAntigo.r) || !mapaLinhas.has(enderecoAntigo.r)) return;

        const enderecoNovo = XLSX.utils.encode_cell({
            r: mapaLinhas.get(enderecoAntigo.r),
            c: enderecoAntigo.c
        });

        planilhaDestino[enderecoNovo] = { ...planilhaOrigem[chave] };
    });

    if (Array.isArray(planilhaOrigem['!rows'])) {
        planilhaDestino['!rows'] = [];
        planilhaOrigem['!rows'].forEach((configuracao, linhaAntiga) => {
            if (configuracao && mapaLinhas.has(linhaAntiga)) {
                planilhaDestino['!rows'][mapaLinhas.get(linhaAntiga)] = { ...configuracao };
            }
        });
    }

    if (Array.isArray(planilhaOrigem['!merges'])) {
        planilhaDestino['!merges'] = planilhaOrigem['!merges']
            .filter(mesclagem => {
                for (let linha = mesclagem.s.r; linha <= mesclagem.e.r; linha += 1) {
                    if (remover.has(linha)) return false;
                }
                return mapaLinhas.has(mesclagem.s.r) && mapaLinhas.has(mesclagem.e.r);
            })
            .map(mesclagem => ({
                s: { r: mapaLinhas.get(mesclagem.s.r), c: mesclagem.s.c },
                e: { r: mapaLinhas.get(mesclagem.e.r), c: mesclagem.e.c }
            }));
    }

    const ultimaLinha = Math.max(intervalo.s.r, proximaLinha - 1);
    planilhaDestino['!ref'] = XLSX.utils.encode_range({
        s: { r: intervalo.s.r, c: intervalo.s.c },
        e: { r: ultimaLinha, c: intervalo.e.c }
    });

    if (planilhaOrigem['!autofilter']?.ref) {
        const filtro = XLSX.utils.decode_range(planilhaOrigem['!autofilter'].ref);
        planilhaDestino['!autofilter'] = {
            ...planilhaOrigem['!autofilter'],
            ref: XLSX.utils.encode_range({
                s: { r: mapaLinhas.get(filtro.s.r) ?? filtro.s.r, c: filtro.s.c },
                e: { r: ultimaLinha, c: filtro.e.c }
            })
        };
    }

    return planilhaDestino;
}

function sanitizarNomeArquivo(nome) {
    let nomeLimpo = String(nome || '').replace(/[\\/:*?"<>|]/g, '_').trim();

    if (!nomeLimpo) nomeLimpo = 'planilha_clientes_removidos.xlsx';
    if (!nomeLimpo.toLowerCase().endsWith('.xlsx')) nomeLimpo += '.xlsx';

    return nomeLimpo;
}

function gerarPlanilhaLimpa() {
    limparStatus();

    try {
        if (!estadoLimpador.analise || !estadoLimpador.bufferOriginal || !estadoLimpador.arquivo) {
            throw new Error('Faça a análise antes de gerar o arquivo.');
        }

        const workbook = lerWorkbook(estadoLimpador.bufferOriginal, estadoLimpador.arquivo.name);
        const planilhaOriginal = workbook.Sheets[estadoLimpador.analise.nomeAba];

        workbook.Sheets[estadoLimpador.analise.nomeAba] = criarPlanilhaFiltrada(
            planilhaOriginal,
            estadoLimpador.analise.linhasRemover
        );

        const nomeSaida = sanitizarNomeArquivo(elementos.limpadorNomeSaida.value);
        elementos.limpadorNomeSaida.value = nomeSaida;

        XLSX.writeFile(workbook, nomeSaida, {
            bookType: 'xlsx', cellStyles: true, compression: true
        });

        mostrarStatus(
            `Arquivo gerado com ${formatarNumero(estadoLimpador.analise.linhasRemover.length)} linha(s) removidas.`,
            'sucesso'
        );
    } catch (erro) {
        mostrarStatus(erro.message || 'Não foi possível gerar o arquivo.', 'erro');
    }
}

function configurarArrastarESoltar() {
    const dropZone = elementos.limpadorDropZone;
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(nomeEvento => {
        dropZone.addEventListener(nomeEvento, evento => {
            evento.preventDefault();
            dropZone.classList.add('limpador-drop-arrastando');
        });
    });

    ['dragleave', 'drop'].forEach(nomeEvento => {
        dropZone.addEventListener(nomeEvento, evento => {
            evento.preventDefault();
            dropZone.classList.remove('limpador-drop-arrastando');
        });
    });

    dropZone.addEventListener('drop', evento => {
        const arquivo = evento.dataTransfer?.files?.[0];
        if (arquivo) carregarArquivo(arquivo);
    });
}

function configurarEventos() {
    elementos.limpadorArquivoInput?.addEventListener('change', evento => {
        const arquivo = evento.target.files?.[0];
        if (arquivo) carregarArquivo(arquivo);
    });

    elementos.limpadorTrocarArquivo?.addEventListener('click', () => {
        elementos.limpadorArquivoInput?.click();
    });

    elementos.limpadorAbaSelect?.addEventListener('change', preencherColunas);
    elementos.limpadorCabecalhoLinha?.addEventListener('change', preencherColunas);

    elementos.limpadorColunaSelect?.addEventListener('change', () => {
        invalidarAnalise();
        atualizarBotaoAnalisar();
    });

    elementos.limpadorFonteBanco?.addEventListener('change', alternarFonteNomes);
    elementos.limpadorFontePersonalizada?.addEventListener('change', alternarFonteNomes);

    elementos.limpadorListaPersonalizada?.addEventListener('input', () => {
        invalidarAnalise();
        atualizarBotaoAnalisar();
    });

    elementos.limpadorBtnAnalisar?.addEventListener('click', analisarPlanilha);
    elementos.limpadorBtnGerar?.addEventListener('click', gerarPlanilhaLimpa);

    document.addEventListener('parceiros:atualizados', () => {
        atualizarResumoBanco();
        if (origemBancoAtiva()) {
            invalidarAnalise();
            atualizarBotaoAnalisar();
        }
    });

    document.addEventListener('automacao:aba-aberta', evento => {
        if (evento.detail?.nomeAba === 'abaLimparPlanilha') {
            atualizarResumoBanco();
            atualizarBotaoAnalisar();
        }
    });

    configurarArrastarESoltar();
}

export function inicializarLimparPlanilha() {
    obterElementos();
    if (!elementos.limpadorArquivoInput) return;

    atualizarResumoBanco();
    configurarEventos();
    alternarFonteNomes();
}
