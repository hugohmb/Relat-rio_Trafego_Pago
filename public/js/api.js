async function requisicaoJson(url, opcoes = {}) {
    const resposta = await fetch(url, opcoes);

    let dados = null;
    try {
        dados = await resposta.json();
    } catch {
        dados = null;
    }

    if (!resposta.ok) {
        const mensagem = dados?.error || `Erro HTTP ${resposta.status}`;
        throw new Error(mensagem);
    }

    return dados;
}

export function carregarParceirosApi() {
    return requisicaoJson('/api/representantes');
}

export function salvarParceirosApi(listaParceiros) {
    return requisicaoJson('/api/representantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listaParceiros)
    });
}

export function gerarAnaliseExecutivaApi(dados) {
    return requisicaoJson('/api/gerar-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
}

export function gerarAnaliseSecaoApi(dados) {
    return requisicaoJson('/api/gerar-analise-secao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
}

export function gerarAnalisesRelatorioApi(dados) {
    return requisicaoJson('/api/gerar-analises-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
}


export async function gerarPdfRelatorioApi(dados) {
    const resposta = await fetch('/api/gerar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });

    if (!resposta.ok) {
        let mensagem = `Erro HTTP ${resposta.status}`;
        try {
            const erro = await resposta.json();
            mensagem = erro?.error || mensagem;
        } catch {
            const texto = await resposta.text().catch(() => '');
            if (texto) mensagem = texto;
        }
        throw new Error(mensagem);
    }

    return resposta.blob();
}

export function carregarConfiguracaoGeminiApi() {
    return requisicaoJson('/api/configuracao-gemini');
}

export function salvarConfiguracaoGeminiApi(configuracao) {
    return requisicaoJson('/api/configuracao-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuracao)
    });
}

export function removerConfiguracaoGeminiApi() {
    return requisicaoJson('/api/configuracao-gemini', { method: 'DELETE' });
}

export function carregarStatusDesktopApi() {
    return requisicaoJson('/api/desktop-status');
}
