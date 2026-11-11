const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const APP_VERSION = '3.0.0';
const PORT_PADRAO = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.AUTOMACAO_DATA_DIR
    ? path.resolve(process.env.AUTOMACAO_DATA_DIR)
    : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'banco-distribuidores.json');
const TEMP_DATA_FILE = path.join(DATA_DIR, 'banco-distribuidores.tmp.json');
const CONFIG_DIR = process.env.AUTOMACAO_CONFIG_DIR
    ? path.resolve(process.env.AUTOMACAO_CONFIG_DIR)
    : path.join(__dirname, 'config');
const GEMINI_CONFIG_FILE = path.join(CONFIG_DIR, 'gemini.json');
const MEMORIA_DIR = process.env.AUTOMACAO_MEMORIA_DIR
    ? path.resolve(process.env.AUTOMACAO_MEMORIA_DIR)
    : path.join(DATA_DIR, 'memoria');
let GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
let GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
let ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
let geradorPdfDesktop = null;

function mascararChaveGemini(chave) {
    const valor = String(chave || '').trim();
    if (!valor) return '';
    if (valor.length <= 10) return `${valor.slice(0, 3)}••••`;
    return `${valor.slice(0, 4)}••••••••${valor.slice(-4)}`;
}

function aplicarConfiguracaoGemini({ apiKey, model } = {}) {
    GEMINI_API_KEY = String(apiKey || '').trim();
    GEMINI_MODEL = String(model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
    ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
}

async function carregarConfiguracaoGemini() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
        const conteudo = await fs.readFile(GEMINI_CONFIG_FILE, 'utf8');
        const dados = JSON.parse(conteudo);
        aplicarConfiguracaoGemini({
            apiKey: dados?.apiKey || GEMINI_API_KEY,
            model: dados?.model || GEMINI_MODEL
        });
    } catch (erro) {
        if (erro?.code !== 'ENOENT') {
            console.warn('Não foi possível ler config/gemini.json:', erro.message);
        }
    }
}

async function salvarConfiguracaoGemini({ apiKey, model }) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const configuracao = {
        apiKey: String(apiKey || '').trim(),
        model: String(model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash',
        atualizadoEm: new Date().toISOString()
    };
    const temporario = `${GEMINI_CONFIG_FILE}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(configuracao, null, 2), 'utf8');
    await fs.rename(temporario, GEMINI_CONFIG_FILE);
    aplicarConfiguracaoGemini(configuracao);
}


app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Evita que o navegador reaproveite arquivos antigos da interface após uma atualização.
app.use((req, res, next) => {
    if (
        req.method === 'GET' &&
        (req.path === '/' || /\.(?:html|js|css)$/i.test(req.path))
    ) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

app.get('/api/version', (_req, res) => {
    res.json({ version: APP_VERSION });
});

app.get('/api/desktop-status', (_req, res) => {
    res.json({
        version: APP_VERSION,
        desktop: Boolean(process.env.AUTOMACAO_DESKTOP),
        portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
        geminiConfigurado: Boolean(GEMINI_API_KEY),
        modeloGemini: GEMINI_MODEL
    });
});

app.get('/api/configuracao-gemini', (_req, res) => {
    res.json({
        configurado: Boolean(GEMINI_API_KEY),
        chaveMascarada: mascararChaveGemini(GEMINI_API_KEY),
        modelo: GEMINI_MODEL
    });
});

app.post('/api/configuracao-gemini', async (req, res) => {
    try {
        const apiKey = String(req.body?.apiKey || '').trim();
        const model = String(req.body?.model || GEMINI_MODEL || 'gemini-2.5-flash').trim();
        if (!apiKey) {
            return res.status(400).json({ error: 'Informe a chave da API do Gemini.' });
        }
        if (apiKey.length < 20) {
            return res.status(400).json({ error: 'A chave informada parece incompleta.' });
        }
        await salvarConfiguracaoGemini({ apiKey, model });
        res.json({
            configurado: true,
            chaveMascarada: mascararChaveGemini(GEMINI_API_KEY),
            modelo: GEMINI_MODEL
        });
    } catch (erro) {
        console.error('Erro ao salvar configuração do Gemini:', erro);
        res.status(500).json({ error: 'Não foi possível salvar a configuração do Gemini.' });
    }
});

app.delete('/api/configuracao-gemini', async (_req, res) => {
    try {
        await fs.rm(GEMINI_CONFIG_FILE, { force: true });
        aplicarConfiguracaoGemini({ apiKey: '', model: 'gemini-2.5-flash' });
        res.json({ configurado: false, chaveMascarada: '', modelo: GEMINI_MODEL });
    } catch (erro) {
        console.error('Erro ao remover configuração do Gemini:', erro);
        res.status(500).json({ error: 'Não foi possível remover a configuração do Gemini.' });
    }
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    cacheControl: false,
    maxAge: 0
}));

async function garantirBancoDeParceiros() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, '[]', 'utf8');
    }
}

async function lerParceiros() {
    await garantirBancoDeParceiros();
    const conteudo = await fs.readFile(DATA_FILE, 'utf8');

    if (!conteudo.trim()) return [];

    const dados = JSON.parse(conteudo);
    if (!Array.isArray(dados)) {
        throw new Error('O banco de parceiros não contém uma lista válida.');
    }

    return dados;
}

async function salvarParceiros(lista) {
    const conteudo = JSON.stringify(lista, null, 2);
    await fs.writeFile(TEMP_DATA_FILE, conteudo, 'utf8');
    await fs.rename(TEMP_DATA_FILE, DATA_FILE);
}

app.get('/api/representantes', async (_req, res) => {
    try {
        const parceiros = await lerParceiros();
        res.json(parceiros);
    } catch (erro) {
        console.error('Erro ao ler o banco de parceiros:', erro);
        res.status(500).json({ error: 'Não foi possível ler o banco de parceiros.' });
    }
});

app.post('/api/representantes', async (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ error: 'A lista de parceiros é inválida.' });
        }

        const listaNormalizada = req.body
            .map(nome => String(nome).trim().toUpperCase())
            .filter(Boolean);

        await salvarParceiros([...new Set(listaNormalizada)]);
        res.json({ message: 'Lista atualizada com sucesso!' });
    } catch (erro) {
        console.error('Erro ao salvar o banco de parceiros:', erro);
        res.status(500).json({ error: 'Não foi possível salvar o banco de parceiros.' });
    }
});

/* ---------------------------------------------------------------------------
 * Memória mensal: um arquivo por mês em dados/memoria/AAAA-MM.json.
 * Guarda os indicadores consolidados, os pedidos compactos (para recalcular com
 * o banco de parceiros atualizado) e os textos finais das análises.
 * ------------------------------------------------------------------------- */

function caminhoMemoria(periodo) {
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) {
        throw new Error('Período inválido para a memória mensal.');
    }
    return path.join(MEMORIA_DIR, `${periodo}.json`);
}

async function lerMemorias() {
    await fs.mkdir(MEMORIA_DIR, { recursive: true });
    const nomes = (await fs.readdir(MEMORIA_DIR))
        .filter(nome => /^\d{4}-\d{2}\.json$/.test(nome))
        .sort();
    const memorias = [];
    for (const nome of nomes) {
        try {
            memorias.push(JSON.parse(await fs.readFile(path.join(MEMORIA_DIR, nome), 'utf8')));
        } catch (erro) {
            console.warn(`Memória ${nome} ignorada:`, erro.message);
        }
    }
    return memorias;
}

app.get('/api/memoria', async (_req, res) => {
    try {
        res.json(await lerMemorias());
    } catch (erro) {
        console.error('Erro ao ler a memória mensal:', erro);
        res.status(500).json({ error: 'Não foi possível ler o histórico mensal.' });
    }
});

app.put('/api/memoria/:periodo', async (req, res) => {
    try {
        const destino = caminhoMemoria(req.params.periodo);
        const dados = req.body;
        if (!dados || typeof dados !== 'object' || dados.periodo !== req.params.periodo) {
            return res.status(400).json({ error: 'Os dados da memória mensal são inválidos.' });
        }
        await fs.mkdir(MEMORIA_DIR, { recursive: true });

        // Preserva campos de meses anteriores que a nova versão não trouxe
        // (por exemplo, textos já aprovados quando só os números mudaram).
        let anterior = {};
        try {
            anterior = JSON.parse(await fs.readFile(destino, 'utf8'));
        } catch {
            anterior = {};
        }
        const combinado = {
            ...anterior,
            ...dados,
            analises: { ...(anterior.analises || {}), ...(dados.analises || {}) },
            atualizadoEm: new Date().toISOString()
        };

        const temporario = `${destino}.tmp`;
        await fs.writeFile(temporario, JSON.stringify(combinado, null, 1), 'utf8');
        await fs.rename(temporario, destino);
        res.json({ ok: true, periodo: dados.periodo });
    } catch (erro) {
        console.error('Erro ao salvar a memória mensal:', erro);
        res.status(500).json({ error: erro.message || 'Não foi possível salvar o histórico mensal.' });
    }
});

const CONFIGURACOES_ANALISE = {
    implementacoes: {
        titulo: 'Implementações do período',
        limite: 120,
        orientacao: `Organize as informações em um texto profissional para a página de implementações. Apresente primeiro o que foi realizado, depois o impacto ou objetivo das ações e, por fim, os próximos passos informados. Não atribua resultados que não estejam nos dados.`
    },
    'google-analytics': {
        titulo: 'Resumo do Google Analytics',
        limite: 90,
        orientacao: `Analise o funil de adições ao carrinho, compras, receita e ARPPU, comparando as origens apresentadas. Destaque a participação do tráfego pago e as diferenças relevantes entre direto, orgânico, pago e outros. Não trate correlação como causa.`
    },
    investimentos: {
        titulo: 'Investimentos e plataformas',
        limite: 100,
        orientacao: `Compare os investimentos de Google Ads e Meta Ads. Para o Google, use o retorno e o ROAS calculados automaticamente pelo GA4 (receita do tráfego pago menos Outros). Não apresente retorno ou ROAS do Meta Ads quando a receita não estiver disponível. Considere as decisões estratégicas fornecidas, distinguindo objetivos de conversão, branding e alcance quando isso estiver explicitamente informado.`
    },
    vendas: {
        titulo: 'Desempenho das vendas',
        limite: 95,
        orientacao: `Analise faturamento, volume de pedidos, ticket médio e participação dos parceiros. Destaque dependência ou força da rede de parceiros quando os números sustentarem essa leitura. Não classifique automaticamente vendas sem parceiros como tráfego pago.`
    },
    roas: {
        titulo: 'ROAS e eficiência de mídia',
        limite: 100,
        orientacao: `Explique os indicadores de retorno já calculados, distinguindo ROAS geral, ROAS sem parceiros e o ROAS calculado do Google Ads. Não invente ROAS do Meta Ads quando a receita não estiver disponível. Não recalcule valores e não afirme que toda venda sem parceiro foi gerada por mídia paga.`
    },
    visitas: {
        titulo: 'Comportamento de visitas',
        limite: 115,
        orientacao: `Descreva o comportamento diário das visitas, destacando estabilidade, picos, quedas, médias e conversão apenas quando os dados sustentarem. Cite datas e valores dos extremos já fornecidos e evite especular causas.`
    },
    historico: {
        titulo: 'Histórico e comparação anual',
        limite: 140,
        orientacao: `Compare a evolução dos três meses recentes. Quando o contexto trouxer memoriaMensal, use-a para situar o mês atual em relação à média dos meses anteriores (acima, abaixo ou dentro do padrão). Quando o contexto trouxer o mesmo mês do ano anterior, use também as variações anuais já calculadas e diferencie tendência recente de comparação anual. Quando essa base anual estiver ausente ou nula, não invente a comparação e informe apenas a leitura recente.`
    },
    'meta-ads': {
        titulo: 'Desempenho do Meta Ads',
        limite: 110,
        orientacao: `Analise alcance, impressões, frequência, cliques, CTR, CPC, investimento e compras. Destaque campanhas líderes somente pelos dados fornecidos. Considere objetivos de branding ou conversão apenas quando constarem no contexto estratégico.`
    },
    tendencias: {
        titulo: 'Tendências e direcionamento',
        limite: 260,
        orientacao: `Use a série histórica mensal (campo memoriaMensal) e as tendências já calculadas (médias, variações contra a média dos meses anteriores, inclinação da tendência e meses consecutivos de alta ou queda). Em até três parágrafos: (1) descreva o padrão que vem se repetindo nos últimos meses, citando meses e valores; (2) diga para onde os números apontam se o padrão continuar, sempre como possibilidade e nunca como previsão garantida (use expressões como "se o ritmo se mantiver", "há sinais de"); (3) proponha de duas a quatro direções práticas e verificáveis para o próximo mês, ligadas aos números (por exemplo, onde concentrar investimento, o que acompanhar, que hipótese testar). Leve em conta o que foi recomendado nos meses anteriores (campo recomendacoesAnteriores) e diga se os números sugerem que aquilo funcionou, sem afirmar causalidade. Se houver menos de três meses na série, diga que a leitura de tendência ainda é preliminar.`
    },
    conclusao: {
        titulo: 'Conclusão e próximos passos',
        limite: 280,
        orientacao: `Produza uma conclusão executiva em até três parágrafos, sintetizando vendas, mídia, Google Analytics, visitas, Meta Ads e evolução recente. Inclua comparação anual somente quando essa base estiver presente no contexto. Incorpore as decisões, ressalvas e próximos passos fornecidos. Quando houver memoriaMensal, mencione em uma frase se o mês confirma ou rompe o padrão dos meses anteriores. Priorize recomendações objetivas e não invente ações.`
    }
};

function serializarContexto(contexto) {
    // JSON compacto: menos tokens e mais espaço para o histórico mensal.
    const texto = JSON.stringify(contexto ?? {});
    if (texto.length > 120000) {
        throw new Error('O contexto enviado para a análise é maior que o limite permitido.');
    }
    return texto;
}

const INSTRUCAO_SISTEMA = `Você é o analista de performance comercial e mídia da ECOFOODPACK, empresa de embalagens sustentáveis para alimentos que vende pela loja virtual (Tray) e por uma rede de parceiros (distribuidores e representantes).
Você acompanha a empresa mês a mês: quando receber o histórico mensal, trate-o como sua memória das análises anteriores e mantenha coerência com o que foi dito antes, apontando o que mudou.
Princípios: use somente os números recebidos; não recalcule; diferencie fato (o que os números mostram) de hipótese (o que pode explicar ou o que pode acontecer); nunca trate vendas sem parceiros como vendas de tráfego pago; escreva em português do Brasil, tom executivo, direto e acessível.`;

function esperar(milisegundos) {
    return new Promise(resolve => setTimeout(resolve, milisegundos));
}

function erroTemporarioGemini(erro) {
    const texto = `${erro?.message || ''} ${JSON.stringify(erro || {})}`;
    const status = Number(erro?.status || erro?.code || 0);
    const limiteDiario = /PerDay|requests per day|daily/i.test(texto);
    return !limiteDiario && (status === 429 || status === 500 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(texto));
}

// Repete automaticamente quando o Gemini está sobrecarregado ou limita a taxa,
// para que o usuário não precise clicar de novo.
async function chamarGeminiComRepeticao(parametros, tentativas = 4) {
    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
            return await ai.models.generateContent({
                model: GEMINI_MODEL,
                ...parametros,
                config: {
                    systemInstruction: INSTRUCAO_SISTEMA,
                    ...(parametros.config || {})
                }
            });
        } catch (erro) {
            ultimoErro = erro;
            if (!erroTemporarioGemini(erro) || tentativa === tentativas) throw erro;
            const espera = [2000, 6000, 15000][tentativa - 1] || 15000;
            console.warn(`Gemini indisponível (tentativa ${tentativa}). Nova tentativa em ${espera / 1000}s.`);
            await esperar(espera);
        }
    }
    throw ultimoErro;
}

async function gerarTextoGemini(prompt) {
    const response = await chamarGeminiComRepeticao({
        contents: prompt,
        config: { temperature: 0.3 }
    });

    const texto = String(response?.text || '').trim();
    if (!texto) {
        throw new Error('O Gemini retornou uma resposta vazia.');
    }

    return texto;
}

function obterTextoRespostaGemini(response) {
    const textoDireto = String(response?.text || '').trim();
    if (textoDireto) return textoDireto;

    const partes = response?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(partes)) return '';

    return partes
        .map(parte => String(parte?.text || ''))
        .join('')
        .trim();
}

function removerCercasJson(texto) {
    return String(texto || '')
        .replace(/^\uFEFF/, '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function extrairObjetoJsonBalanceado(texto) {
    const origem = String(texto || '');
    const inicio = origem.indexOf('{');
    if (inicio < 0) return '';

    let profundidade = 0;
    let emString = false;
    let escapado = false;

    for (let indice = inicio; indice < origem.length; indice += 1) {
        const caractere = origem[indice];

        if (emString) {
            if (escapado) {
                escapado = false;
            } else if (caractere === '\\') {
                escapado = true;
            } else if (caractere === '"') {
                emString = false;
            }
            continue;
        }

        if (caractere === '"') {
            emString = true;
        } else if (caractere === '{') {
            profundidade += 1;
        } else if (caractere === '}') {
            profundidade -= 1;
            if (profundidade === 0) {
                return origem.slice(inicio, indice + 1);
            }
        }
    }

    return origem.slice(inicio);
}

function escaparControlesDentroDeStrings(texto) {
    let resultado = '';
    let emString = false;
    let escapado = false;

    for (const caractere of String(texto || '')) {
        if (emString) {
            if (escapado) {
                resultado += caractere;
                escapado = false;
                continue;
            }

            if (caractere === '\\') {
                resultado += caractere;
                escapado = true;
                continue;
            }

            if (caractere === '"') {
                resultado += caractere;
                emString = false;
                continue;
            }

            if (caractere === '\n') {
                resultado += '\\n';
                continue;
            }

            if (caractere === '\r') {
                resultado += '\\r';
                continue;
            }

            if (caractere === '\t') {
                resultado += '\\t';
                continue;
            }

            resultado += caractere;
            continue;
        }

        resultado += caractere;
        if (caractere === '"') emString = true;
    }

    return resultado;
}

function tentarInterpretarJson(texto) {
    const semCercas = removerCercasJson(texto);
    const balanceado = extrairObjetoJsonBalanceado(semCercas);
    const candidatos = [...new Set([
        semCercas,
        balanceado,
        escaparControlesDentroDeStrings(semCercas),
        escaparControlesDentroDeStrings(balanceado)
    ].filter(Boolean))];

    for (const candidato of candidatos) {
        const variacoes = [
            candidato,
            candidato.replace(/,\s*([}\]])/g, '$1')
        ];

        for (const variacao of variacoes) {
            try {
                const dados = JSON.parse(variacao);
                if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
                    return dados;
                }
            } catch {
                // Tenta a próxima forma de leitura.
            }
        }
    }

    return null;
}

function lerStringJsonParcial(texto, inicio) {
    let valorBruto = '';
    let escapado = false;

    for (let indice = inicio; indice < texto.length; indice += 1) {
        const caractere = texto[indice];

        if (escapado) {
            valorBruto += `\\${caractere}`;
            escapado = false;
            continue;
        }

        if (caractere === '\\') {
            escapado = true;
            continue;
        }

        if (caractere === '"') {
            try {
                return JSON.parse(`"${escaparControlesDentroDeStrings(valorBruto)}"`);
            } catch {
                return valorBruto
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            }
        }

        valorBruto += caractere;
    }

    return '';
}

function extrairCamposParciaisGemini(texto, idsEsperados) {
    const origem = removerCercasJson(texto);
    const resultado = {};

    for (const id of idsEsperados) {
        const chave = `"${id}"`;
        const indiceChave = origem.indexOf(chave);
        if (indiceChave < 0) continue;

        const indiceDoisPontos = origem.indexOf(':', indiceChave + chave.length);
        if (indiceDoisPontos < 0) continue;

        let indiceValor = indiceDoisPontos + 1;
        while (/\s/.test(origem[indiceValor] || '')) indiceValor += 1;
        if (origem[indiceValor] !== '"') continue;

        const valor = String(lerStringJsonParcial(origem, indiceValor + 1) || '').trim();
        if (valor) resultado[id] = valor;
    }

    return resultado;
}

function extrairJsonGemini(response, idsEsperados = []) {
    const texto = obterTextoRespostaGemini(response);
    if (!texto) {
        const erro = new Error('O Gemini retornou uma resposta vazia.');
        erro.codigo = 'GEMINI_RESPOSTA_VAZIA';
        throw erro;
    }

    const dados = tentarInterpretarJson(texto);
    if (dados) return dados;

    const parcial = extrairCamposParciaisGemini(texto, idsEsperados);
    if (Object.keys(parcial).length) {
        return parcial;
    }

    const finishReason = String(response?.candidates?.[0]?.finishReason || 'não informado');
    const erro = new Error(`O Gemini retornou um JSON inválido. Motivo de término: ${finishReason}.`);
    erro.codigo = 'GEMINI_JSON_INVALIDO';
    erro.finishReason = finishReason;
    throw erro;
}

function montarSolicitacaoAnalises(periodo, secoes) {
    const contextoJson = serializarContexto({
        periodo: String(periodo || 'não informado'),
        secoes
    });

    const propriedades = Object.fromEntries(
        secoes.map(secao => [secao.id, {
            type: 'string',
            description: `Texto final da seção ${secao.titulo}, com aproximadamente até ${secao.limite} palavras.`
        }])
    );

    const ids = secoes.map(secao => secao.id);
    const esquema = {
        type: 'object',
        properties: propriedades,
        required: ids,
        additionalProperties: false,
        propertyOrdering: ids
    };

    const prompt = `Você é um analista sênior da ECOFOODPACK, empresa de embalagens sustentáveis para alimentos.

Produza, em uma única resposta JSON, os textos finais das seções listadas para o período ${String(periodo || 'não informado')}.

REGRAS GERAIS OBRIGATÓRIAS:
- Retorne somente um objeto JSON válido, sem cercas de código e sem qualquer texto antes ou depois do objeto.
- Use somente os dados fornecidos no JSON abaixo.
- Não invente fatos, causas, ações, metas ou resultados.
- Não recalcule indicadores. Use os valores e variações já calculados pela automação.
- Vendas sem parceiros não significam automaticamente vendas de tráfego pago.
- Preserve ressalvas de rastreamento, atribuição e qualidade dos dados.
- Na seção de tendências, projeções são permitidas somente como possibilidades explicitamente condicionadas aos números da série histórica.
- Mantenha coerência entre as seções: o mesmo número deve ser citado da mesma forma em todas elas.
- Escreva em português do Brasil, com tom profissional, direto e acessível.
- Não use Markdown, títulos, tabelas ou listas dentro dos textos.
- Cada chave da resposta deve conter somente o parágrafo ou os parágrafos da respectiva seção.
- Respeite a orientação e o limite aproximado de palavras definidos para cada seção.

SEÇÕES, ORIENTAÇÕES E DADOS OFICIAIS EM JSON:
${contextoJson}`;

    return { ids, esquema, prompt };
}

async function gerarLoteAnalisesGemini(periodo, secoes) {
    const { ids, esquema, prompt } = montarSolicitacaoAnalises(periodo, secoes);
    const response = await chamarGeminiComRepeticao({
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseJsonSchema: esquema,
            temperature: 0.2,
            maxOutputTokens: 16384
        }
    });

    const dados = extrairJsonGemini(response, ids);
    return Object.fromEntries(
        ids
            .map(id => [id, String(dados[id] || '').trim()])
            .filter(([, valor]) => Boolean(valor))
    );
}

async function gerarAnalisesComRecuperacao(periodo, secoesValidas) {
    const resultado = {};
    let pendentes = secoesValidas;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= 2 && pendentes.length; tentativa += 1) {
        try {
            const lote = await gerarLoteAnalisesGemini(periodo, pendentes);
            Object.assign(resultado, lote);
        } catch (erro) {
            ultimoErro = erro;
            const recuperaveis = /JSON inválido|resposta vazia/i.test(erro?.message || '');

            if (!recuperaveis || tentativa === 2) {
                if (!Object.keys(resultado).length) throw erro;
                break;
            }

            console.warn(`Resposta estruturada inválida na tentativa ${tentativa}. Repetindo somente as seções pendentes.`);
        }

        pendentes = secoesValidas.filter(secao => !resultado[secao.id]);
        if (pendentes.length && tentativa < 2) {
            await esperar(900);
        }
    }

    if (!Object.keys(resultado).length && ultimoErro) {
        throw ultimoErro;
    }

    return resultado;
}

function respostaErroGemini(erro) {
    const texto = `${erro?.message || ''} ${JSON.stringify(erro || {})}`;
    const statusOriginal = Number(erro?.status || erro?.code || 0);

    if (statusOriginal === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(texto)) {
        const limiteDiario = /PerDay|requests per day|daily/i.test(texto);
        return {
            status: 429,
            mensagem: limiteDiario
                ? 'O limite diário do Gemini foi atingido. Os textos já existentes foram preservados. Tente novamente após a renovação da cota.'
                : 'O Gemini recebeu solicitações demais em pouco tempo. Aguarde alguns instantes e tente novamente.'
        };
    }

    if (statusOriginal === 503 || /UNAVAILABLE|overloaded/i.test(texto)) {
        return {
            status: 503,
            mensagem: 'O Gemini está temporariamente indisponível. Tente novamente em alguns instantes.'
        };
    }

    if (/maior que o limite/i.test(erro?.message || '')) {
        return { status: 413, mensagem: erro.message };
    }

    if (/JSON inválido|resposta vazia/i.test(erro?.message || '')) {
        return {
            status: 502,
            mensagem: 'O Gemini devolveu uma resposta incompleta mesmo após a tentativa automática de recuperação. Tente novamente; as análises já existentes foram preservadas.'
        };
    }

    return {
        status: 500,
        mensagem: 'O assistente virtual não conseguiu gerar a análise no momento.'
    };
}

app.post('/api/gerar-analises-relatorio', async (req, res) => {
    try {
        if (!ai) {
            return res.status(503).json({
                error: 'A chave do Gemini não está configurada no servidor.'
            });
        }

        const { periodo, secoes } = req.body || {};
        if (!Array.isArray(secoes) || !secoes.length) {
            return res.status(400).json({ error: 'Nenhuma seção foi enviada para análise.' });
        }

        const idsVistos = new Set();
        const secoesValidas = secoes.map(item => {
            const id = String(item?.id || '').trim();
            const configuracao = CONFIGURACOES_ANALISE[id];

            if (!configuracao || idsVistos.has(id)) {
                throw new Error(`Seção inválida ou duplicada: ${id || 'não informada'}.`);
            }

            if (!item?.contexto || typeof item.contexto !== 'object' || Array.isArray(item.contexto)) {
                throw new Error(`O contexto da seção ${id} é inválido.`);
            }

            idsVistos.add(id);
            return {
                id,
                titulo: configuracao.titulo,
                limite: configuracao.limite,
                orientacao: configuracao.orientacao,
                contexto: item.contexto
            };
        });

        const resultado = await gerarAnalisesComRecuperacao(periodo, secoesValidas);

        if (!Object.keys(resultado).length) {
            throw new Error('O Gemini não devolveu nenhuma análise válida.');
        }

        res.json({
            analises: resultado,
            modelo: GEMINI_MODEL,
            geradoEm: new Date().toISOString()
        });
    } catch (erro) {
        console.error('Erro ao gerar análises em conjunto:', erro);

        if (/Seção inválida|contexto da seção/i.test(erro?.message || '')) {
            return res.status(400).json({ error: erro.message });
        }

        const resposta = respostaErroGemini(erro);
        res.status(resposta.status).json({ error: resposta.mensagem });
    }
});

app.post('/api/gerar-analise-secao', async (req, res) => {
    try {
        if (!ai) {
            return res.status(503).json({
                error: 'A chave do Gemini não está configurada no servidor.'
            });
        }

        const { secao, periodo, contexto } = req.body || {};
        const configuracao = CONFIGURACOES_ANALISE[secao];

        if (!configuracao) {
            return res.status(400).json({ error: 'A seção de análise informada é inválida.' });
        }

        if (!contexto || typeof contexto !== 'object' || Array.isArray(contexto)) {
            return res.status(400).json({ error: 'O contexto da análise é inválido.' });
        }

        const contextoJson = serializarContexto(contexto);
        const prompt = `Você é um analista sênior da ECOFOODPACK, empresa de embalagens sustentáveis para alimentos.

Escreva a análise da seção "${configuracao.titulo}" para o período ${String(periodo || 'não informado')}.

REGRAS OBRIGATÓRIAS:
- Use somente os dados fornecidos no JSON abaixo.
- Não invente fatos, causas, ações, metas ou resultados.
- Não recalcule indicadores. Use os valores e variações já calculados pela automação.
- Vendas sem parceiros não significam automaticamente vendas de tráfego pago.
- Preserve ressalvas de rastreamento, atribuição e qualidade dos dados.
- Projeções só são permitidas na seção de tendências, sempre como possibilidades condicionadas aos números.
- Escreva em português do Brasil, com tom profissional, direto e acessível.
- Não use tabelas, títulos em Markdown ou introduções genéricas.
- Limite aproximado: ${configuracao.limite} palavras.

ORIENTAÇÃO DA SEÇÃO:
${configuracao.orientacao}

DADOS OFICIAIS EM JSON:
${contextoJson}`;

        const analise = await gerarTextoGemini(prompt);
        res.json({
            secao,
            analise,
            modelo: GEMINI_MODEL,
            geradoEm: new Date().toISOString()
        });
    } catch (erro) {
        console.error('Erro ao gerar análise por seção:', erro);
        const resposta = respostaErroGemini(erro);
        res.status(resposta.status).json({ error: resposta.mensagem });
    }
});

app.post('/api/gerar-relatorio', async (req, res) => {
    try {
        if (!ai) {
            return res.status(503).json({
                error: 'A chave do Gemini não está configurada no servidor.'
            });
        }

        const dados = req.body;
        const prompt = `Você é um analista financeiro sênior da ECOFOODPACK, empresa de embalagens sustentáveis para alimentos.

Analise os resultados mensais abaixo sem recalcular, alterar ou inventar valores:
- Faturamento geral: ${dados.fatGeral}
- Faturamento de representantes e distribuidores: ${dados.fatParceiros}
- Faturamento sem parceiros: ${dados.fatDireto}
- Ticket médio geral: ${dados.tmGeral}
- Ticket médio sem parceiros: ${dados.tmTrafego}
- ROAS calculado sobre as vendas sem parceiros: ${dados.roasReal}
- ROI estimado sobre as vendas sem parceiros: ${dados.roi}

Regras de interpretação:
- ${dados.criterioReceita || 'O cálculo financeiro foi feito previamente pela automação.'}
- ${dados.criterioClassificacao || 'Vendas sem parceiros não significam necessariamente vendas atribuídas ao tráfego pago.'}

Escreva um resumo executivo de no máximo 3 parágrafos. Seja neutro, direto e profissional. Não chame automaticamente as vendas sem parceiros de vendas do tráfego pago. Destaque pontos fortes, riscos e limitações de interpretação dos dados.`;

        const relatorio = await gerarTextoGemini(prompt);
        res.json({ relatorio });
    } catch (erro) {
        console.error('Erro ao comunicar com o Gemini:', erro);
        res.status(500).json({
            error: 'O assistente virtual não conseguiu gerar a análise no momento.'
        });
    }
});


function normalizarNomePdf(valor) {
    const base = path.basename(String(valor || 'Relatorio-Ecofoodpack.pdf'))
        .replace(/[<>:\"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const nome = base || 'Relatorio-Ecofoodpack.pdf';
    return nome.toLowerCase().endsWith('.pdf') ? nome : `${nome}.pdf`;
}

async function caminhoExiste(caminho) {
    if (!caminho) return false;
    try {
        await fs.access(caminho);
        return true;
    } catch {
        return false;
    }
}

async function localizarNavegadorPdf() {
    const candidatos = [];
    const adicionar = valor => {
        if (valor && !candidatos.includes(valor)) candidatos.push(valor);
    };

    adicionar(process.env.PDF_BROWSER_PATH);
    adicionar(process.env.CHROME_PATH);
    adicionar(process.env.EDGE_PATH);

    if (process.platform === 'win32') {
        const programFiles = process.env.PROGRAMFILES || process.env.ProgramFiles;
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || process.env['ProgramFiles(x86)'];
        const localAppData = process.env.LOCALAPPDATA || process.env.LocalAppData;

        [programFiles, programFilesX86, localAppData].filter(Boolean).forEach(base => {
            adicionar(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
            adicionar(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
            adicionar(path.join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
        });
    } else if (process.platform === 'darwin') {
        adicionar('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        adicionar('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
        adicionar('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    } else {
        adicionar('/usr/bin/google-chrome');
        adicionar('/usr/bin/google-chrome-stable');
        adicionar('/usr/bin/chromium');
        adicionar('/usr/bin/chromium-browser');
        adicionar('/usr/bin/microsoft-edge');
        adicionar('/usr/bin/microsoft-edge-stable');
        adicionar('/usr/bin/brave-browser');
    }

    for (const candidato of candidatos) {
        if (await caminhoExiste(candidato)) return candidato;
    }

    throw new Error(
        'Google Chrome, Microsoft Edge ou Brave não foi encontrado. Instale um desses navegadores ou configure PDF_BROWSER_PATH.'
    );
}

function executarNavegador(caminhoNavegador, argumentos, tempoLimiteMs = 60000) {
    return new Promise((resolve, reject) => {
        const processo = spawn(caminhoNavegador, argumentos, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let saida = '';
        let erroSaida = '';
        let finalizado = false;

        const encerrar = (erro, resultado) => {
            if (finalizado) return;
            finalizado = true;
            clearTimeout(temporizador);
            erro ? reject(erro) : resolve(resultado);
        };

        processo.stdout.on('data', dados => {
            saida += String(dados);
        });

        processo.stderr.on('data', dados => {
            erroSaida += String(dados);
        });

        processo.on('error', erro => encerrar(erro));
        processo.on('close', codigo => {
            if (codigo === 0) {
                encerrar(null, { saida, erroSaida });
                return;
            }

            encerrar(new Error(
                `O navegador encerrou a geração do PDF com código ${codigo}. ${erroSaida || saida}`.trim()
            ));
        });

        const temporizador = setTimeout(() => {
            if (process.platform === 'win32' && processo.pid) {
                spawn('taskkill', ['/pid', String(processo.pid), '/T', '/F'], {
                    windowsHide: true,
                    stdio: 'ignore'
                });
            } else {
                processo.kill('SIGKILL');
            }
            encerrar(new Error('A geração do PDF excedeu o tempo limite de 60 segundos.'));
        }, tempoLimiteMs);
    });
}

async function gerarPdfComNavegador({ html, nomeArquivo }) {
    const navegador = await localizarNavegadorPdf();
    const pastaTemporaria = await fs.mkdtemp(path.join(os.tmpdir(), 'ecofoodpack-pdf-'));
    const caminhoHtml = path.join(pastaTemporaria, 'relatorio.html');
    const caminhoPdf = path.join(pastaTemporaria, nomeArquivo);
    const perfilTemporario = path.join(pastaTemporaria, 'perfil-navegador');

    await fs.mkdir(perfilTemporario, { recursive: true });
    await fs.writeFile(caminhoHtml, html, 'utf8');

    const argumentosBase = [
        '--disable-gpu',
        '--disable-extensions',
        '--disable-javascript',
        '--disable-background-networking',
        '--disable-sync',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pdf-header-footer',
        '--print-to-pdf-no-header',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=2500',
        `--user-data-dir=${perfilTemporario}`,
        `--print-to-pdf=${caminhoPdf}`,
        pathToFileURL(caminhoHtml).href
    ];

    if (process.platform !== 'win32' && process.platform !== 'darwin') {
        argumentosBase.unshift('--disable-dev-shm-usage', '--no-sandbox');
    }

    try {
        await fs.rm(caminhoPdf, { force: true }).catch(() => {});
        await executarNavegador(navegador, ['--headless', ...argumentosBase]);
        const estatisticas = await fs.stat(caminhoPdf);
        if (estatisticas.size <= 1000) {
            throw new Error('O navegador gerou um arquivo PDF vazio ou incompleto.');
        }

        return { caminhoPdf, pastaTemporaria, navegador };
    } catch (erro) {
        await fs.rm(pastaTemporaria, { recursive: true, force: true });
        throw erro;
    }
}

app.post('/api/gerar-pdf', async (req, res) => {
    let pastaTemporaria = null;

    try {
        const html = String(req.body?.html || '');
        const nomeArquivo = normalizarNomePdf(req.body?.nomeArquivo);

        if (!html.trim()) {
            return res.status(400).json({ error: 'O conteúdo do relatório não foi enviado.' });
        }

        if (html.length > 45_000_000) {
            return res.status(413).json({ error: 'O relatório ultrapassou o limite permitido para geração do PDF.' });
        }

        if (typeof geradorPdfDesktop === 'function') {
            const bufferPdf = await geradorPdfDesktop({ html, nomeArquivo });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`);
            res.setHeader('Content-Length', bufferPdf.length);
            res.send(bufferPdf);
            return;
        }

        const resultado = await gerarPdfComNavegador({ html, nomeArquivo });
        pastaTemporaria = resultado.pastaTemporaria;

        res.download(resultado.caminhoPdf, nomeArquivo, async erro => {
            if (erro && !res.headersSent) {
                console.error('Erro ao enviar o PDF:', erro);
                res.status(500).json({ error: 'O PDF foi gerado, mas não pôde ser enviado.' });
            }
            await fs.rm(resultado.pastaTemporaria, { recursive: true, force: true }).catch(() => {});
        });
    } catch (erro) {
        console.error('Erro ao gerar PDF:', erro);
        if (pastaTemporaria) {
            await fs.rm(pastaTemporaria, { recursive: true, force: true }).catch(() => {});
        }
        res.status(500).json({
            error: erro.message || 'Não foi possível gerar o PDF final.'
        });
    }
});

async function iniciarServidor({ port = PORT_PADRAO, gerarPdf = null } = {}) {
    geradorPdfDesktop = typeof gerarPdf === 'function' ? gerarPdf : null;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await carregarConfiguracaoGemini();
    await garantirBancoDeParceiros();

    return new Promise((resolve, reject) => {
        const servidor = app.listen(port, '127.0.0.1', () => {
            const endereco = servidor.address();
            const portaReal = typeof endereco === 'object' && endereco
                ? endereco.port
                : port;

            console.log(`✅ Servidor da Automação v${APP_VERSION} rodando em http://127.0.0.1:${portaReal}`);
            console.log(
                GEMINI_API_KEY
                    ? `🤖 Integração com Gemini: ATIVADA (${GEMINI_MODEL})`
                    : '⚠️ Integração com Gemini: chave não configurada'
            );

            resolve({ servidor, port: portaReal });
        });

        servidor.once('error', erro => {
            reject(erro);
        });
    });
}

if (require.main === module) {
    iniciarServidor().catch(erro => {
        if (erro?.code === 'EADDRINUSE') {
            console.error(`❌ A porta ${PORT_PADRAO} já está sendo usada por outro programa.`);
        } else if (erro?.code === 'EACCES') {
            console.error(`❌ O Windows não permitiu usar a porta ${PORT_PADRAO}.`);
        } else {
            console.error('❌ Não foi possível iniciar o servidor:', erro);
        }
        process.exit(1);
    });
}

module.exports = {
    APP_VERSION,
    app,
    iniciarServidor
};
