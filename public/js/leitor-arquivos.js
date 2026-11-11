/*
 * Leitor universal de planilhas da Automação de Vendas.
 *
 * Aceita XLSX, XLS, CSV, TSV e TXT vindos de qualquer plataforma (Tray, Google
 * Analytics, Meta Ads) e devolve sempre a mesma estrutura: uma lista de linhas,
 * cada linha uma lista de células.
 *
 * Por que existe:
 * - A Tray exporta CSV em ISO-8859-1/Windows-1252. Ler esse arquivo como UTF-8
 *   transforma "Ã", "É", "Ç" em "�" e os parceiros com acento deixam de ser
 *   reconhecidos no Banco de Parceiros. Aqui a codificação é detectada.
 * - Cada plataforma usa um separador diferente (Tray usa ";", GA usa ","), e
 *   algumas exportações chegam em UTF-16. O separador também é detectado.
 * - O tipo de arquivo é identificado pelo conteúdo, não pelo nome, para permitir
 *   arrastar todos os arquivos do mês de uma só vez.
 */

const ASSINATURA_ZIP = [0x50, 0x4b];               // XLSX, XLSM, ODS
const ASSINATURA_OLE = [0xd0, 0xcf, 0x11, 0xe0];   // XLS antigo

function comecaCom(bytes, assinatura) {
    return assinatura.every((byte, indice) => bytes[indice] === byte);
}

export function decodificarTexto(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { texto: new TextDecoder('utf-16le').decode(bytes.subarray(2)), codificacao: 'UTF-16 LE' };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { texto: new TextDecoder('utf-16be').decode(bytes.subarray(2)), codificacao: 'UTF-16 BE' };
    }
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { texto: new TextDecoder('utf-8').decode(bytes.subarray(3)), codificacao: 'UTF-8 (BOM)' };
    }

    try {
        // fatal: true faz o decodificador falhar se houver qualquer byte inválido,
        // o que acontece com acentos gravados em Latin-1 pela Tray.
        return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), codificacao: 'UTF-8' };
    } catch {
        return { texto: new TextDecoder('windows-1252').decode(bytes), codificacao: 'Windows-1252 / ISO-8859-1' };
    }
}

export function detectarSeparador(texto) {
    const amostra = texto
        .split(/\r?\n/)
        .filter(linha => linha.trim() && !linha.trim().startsWith('#'))
        .slice(0, 15);

    const candidatos = [';', ',', '\t', '|'];
    let melhor = ',';
    let melhorPontuacao = -1;

    candidatos.forEach(separador => {
        const contagens = amostra.map(linha => contarForaDeAspas(linha, separador));
        const comSeparador = contagens.filter(valor => valor > 0);
        if (!comSeparador.length) return;

        // Prefere o separador que aparece de forma consistente nas linhas.
        const moda = comSeparador.sort((a, b) =>
            comSeparador.filter(v => v === b).length - comSeparador.filter(v => v === a).length
        )[0];
        const consistentes = contagens.filter(valor => valor === moda).length;
        const pontuacao = consistentes * 1000 + moda;

        if (pontuacao > melhorPontuacao) {
            melhorPontuacao = pontuacao;
            melhor = separador;
        }
    });

    return melhor;
}

function contarForaDeAspas(linha, separador) {
    let total = 0;
    let entreAspas = false;
    for (const caractere of linha) {
        if (caractere === '"') entreAspas = !entreAspas;
        else if (caractere === separador && !entreAspas) total++;
    }
    return total;
}

export function analisarCsv(texto, separador) {
    const linhas = [];
    let linha = [];
    let celula = '';
    let entreAspas = false;

    for (let indice = 0; indice < texto.length; indice++) {
        const caractere = texto[indice];

        if (entreAspas) {
            if (caractere === '"') {
                if (texto[indice + 1] === '"') {
                    celula += '"';
                    indice++;
                } else {
                    entreAspas = false;
                }
            } else {
                celula += caractere;
            }
            continue;
        }

        if (caractere === '"' && celula === '') {
            entreAspas = true;
        } else if (caractere === separador) {
            linha.push(celula);
            celula = '';
        } else if (caractere === '\n' || caractere === '\r') {
            if (caractere === '\r' && texto[indice + 1] === '\n') indice++;
            linha.push(celula);
            linhas.push(linha);
            linha = [];
            celula = '';
        } else {
            celula += caractere;
        }
    }

    if (celula !== '' || linha.length) {
        linha.push(celula);
        linhas.push(linha);
    }

    // Linhas de comentário do Google Analytics ("# Tráfego pago") ficam com uma
    // única célula, como os processadores já esperam.
    return linhas.map(itens => {
        const primeira = String(itens[0] ?? '');
        if (primeira.trim().startsWith('#')) {
            return [itens.join(separador)];
        }
        return itens.map(valor => valor.trim());
    });
}

async function obterBytes(arquivo) {
    if (arquivo instanceof Uint8Array) return arquivo;
    if (arquivo instanceof ArrayBuffer) return new Uint8Array(arquivo);
    if (typeof arquivo?.arrayBuffer === 'function') {
        return new Uint8Array(await arquivo.arrayBuffer());
    }

    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = evento => resolve(new Uint8Array(evento.target.result));
        leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        leitor.readAsArrayBuffer(arquivo);
    });
}

function lerPlanilhaBinaria(bytes) {
    const biblioteca = globalThis.XLSX;
    if (!biblioteca) {
        throw new Error('A biblioteca de leitura de Excel não foi carregada. Verifique a conexão e reabra o programa.');
    }

    const workbook = biblioteca.read(bytes, { type: 'array', raw: true });
    const abas = workbook.SheetNames || [];
    if (!abas.length) throw new Error('O arquivo não possui nenhuma aba.');

    // Usa a primeira aba que tenha conteúdo (algumas exportações têm abas vazias de capa).
    for (const nome of abas) {
        const linhas = biblioteca.utils.sheet_to_json(workbook.Sheets[nome], { header: 1, defval: '' });
        if (linhas.some(linha => Array.isArray(linha) && linha.some(celula => String(celula ?? '').trim()))) {
            return { linhas, aba: nome };
        }
    }

    return { linhas: [], aba: abas[0] };
}

/**
 * Lê qualquer planilha suportada e devolve { linhas, formato, codificacao, separador }.
 */
export async function lerPlanilhaDetalhada(arquivo) {
    const bytes = await obterBytes(arquivo);
    if (!bytes.length) throw new Error('O arquivo está vazio.');

    if (comecaCom(bytes, ASSINATURA_ZIP) || comecaCom(bytes, ASSINATURA_OLE)) {
        const { linhas, aba } = lerPlanilhaBinaria(bytes);
        return {
            linhas,
            formato: comecaCom(bytes, ASSINATURA_OLE) ? 'XLS' : 'XLSX',
            aba,
            codificacao: '',
            separador: ''
        };
    }

    const { texto, codificacao } = decodificarTexto(bytes);
    const separador = detectarSeparador(texto);
    return {
        linhas: analisarCsv(texto, separador),
        formato: 'CSV',
        codificacao,
        separador
    };
}

export async function lerPlanilha(arquivo) {
    return (await lerPlanilhaDetalhada(arquivo)).linhas;
}

export const EXTENSOES_ACEITAS = /\.(xlsx|xlsm|xls|csv|tsv|txt)$/i;

/* ---------------------------------------------------------------------------
 * Identificação automática do tipo de arquivo
 * ------------------------------------------------------------------------- */

function normalizar(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/^#+\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function periodoDeData(valor) {
    if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
        const data = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
        return data.toISOString().slice(0, 7);
    }
    const texto = String(valor ?? '').trim();
    let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
    m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    m = texto.match(/(20\d{2})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    return '';
}

function maisFrequente(lista) {
    const contagem = new Map();
    lista.filter(Boolean).forEach(item => contagem.set(item, (contagem.get(item) || 0) + 1));
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/**
 * Descobre de qual plataforma é a planilha e de qual mês são os dados.
 * Retorna { tipo, rotulo, periodo } ou { tipo: null }.
 */
export function identificarPlanilha(linhas) {
    const primeiras = (linhas || []).slice(0, 40);
    const textoCabecalho = primeiras.map(linha => (Array.isArray(linha) ? linha : [linha]).map(normalizar).join('|')).join('\n');
    const indiceCabecalho = celulas => primeiras.findIndex(linha =>
        Array.isArray(linha) && celulas.every(celula => linha.map(normalizar).includes(celula))
    );

    // Tray — vendas
    let indice = indiceCabecalho(['pedido', 'nome do cliente', 'total']);
    if (indice !== -1) {
        const cabecalho = linhas[indice].map(normalizar);
        const colunaData = cabecalho.indexOf('data');
        const periodos = colunaData === -1 ? [] : linhas.slice(indice + 1).map(linha => periodoDeData(linha?.[colunaData]));
        return { tipo: 'tray-vendas', rotulo: 'Vendas Tray', periodo: maisFrequente(periodos) };
    }

    // Tray — visitas e conversão
    indice = indiceCabecalho(['data', 'visitas']);
    if (indice !== -1 && /pageviews|pedidos iniciados/.test(textoCabecalho)) {
        const colunaData = linhas[indice].map(normalizar).indexOf('data');
        const periodos = linhas.slice(indice + 1).map(linha => periodoDeData(linha?.[colunaData]));
        return { tipo: 'tray-visitas', rotulo: 'Visitas Tray', periodo: maisFrequente(periodos) };
    }

    // Meta Ads
    indice = indiceCabecalho(['nome da campanha', 'alcance', 'impressoes']);
    if (indice !== -1) {
        const cabecalho = linhas[indice].map(normalizar);
        const colunaInicio = cabecalho.findIndex(c => c.startsWith('inicio dos relatorios'));
        const periodos = colunaInicio === -1 ? [] : linhas.slice(indice + 1).map(linha => periodoDeData(linha?.[colunaInicio]));
        return { tipo: 'meta-ads', rotulo: 'Meta Ads', periodo: maisFrequente(periodos) };
    }

    // Google Analytics: os arquivos começam com comentários "# ..."
    const periodoGa = maisFrequente(
        primeiras
            .map(linha => String(Array.isArray(linha) ? linha[0] : linha))
            .filter(texto => /data de inicio/i.test(normalizar(texto)))
            .map(periodoDeData)
    );

    if (/nome do item/.test(textoCabecalho) && /itens comprados/.test(textoCabecalho)) {
        return { tipo: 'ga-produtos', rotulo: 'Produtos GA4', periodo: periodoGa };
    }

    if (/adicionar aos carrinhos|adicoes ao carrinho/.test(textoCabecalho) && /arppu/.test(textoCabecalho)) {
        return { tipo: 'ga-resumo', rotulo: 'Resumo GA4', periodo: periodoGa };
    }

    return { tipo: null, rotulo: 'Não identificado', periodo: '' };
}
