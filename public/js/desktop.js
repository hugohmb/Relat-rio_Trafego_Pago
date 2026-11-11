import {
    carregarConfiguracaoGeminiApi,
    salvarConfiguracaoGeminiApi,
    removerConfiguracaoGeminiApi
} from './api.js';

function elemento(id) {
    return document.getElementById(id);
}

function definirStatus(texto, tipo = 'neutro') {
    const alvo = elemento('desktopConfigStatus');
    if (!alvo) return;
    alvo.textContent = texto;
    alvo.className = `desktop-config-status desktop-config-status-${tipo}`;
}

function abrirModal() {
    const modal = elemento('desktopConfigModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('desktop-modal-aberto');
    carregarEstadoGemini();
}

function fecharModal() {
    const modal = elemento('desktopConfigModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('desktop-modal-aberto');
}

async function carregarEstadoGemini() {
    try {
        const dados = await carregarConfiguracaoGeminiApi();
        elemento('desktopGeminiModelo').value = dados.modelo || 'gemini-2.5-flash';
        elemento('desktopGeminiChave').value = '';
        elemento('desktopGeminiChave').placeholder = dados.configurado
            ? `Configurada: ${dados.chaveMascarada}`
            : 'Cole a chave da API do Gemini';
        definirStatus(
            dados.configurado
                ? `Gemini configurado e pronto para uso (${dados.modelo}).`
                : 'A chave do Gemini ainda não foi configurada.',
            dados.configurado ? 'sucesso' : 'aviso'
        );
    } catch (erro) {
        definirStatus(erro.message || 'Não foi possível consultar a configuração.', 'erro');
    }
}

async function salvarGemini() {
    const botao = elemento('desktopBtnSalvarGemini');
    const apiKey = elemento('desktopGeminiChave').value.trim();
    const model = elemento('desktopGeminiModelo').value.trim() || 'gemini-2.5-flash';

    try {
        botao.disabled = true;
        definirStatus('Salvando a configuração...', 'processando');
        const dados = await salvarConfiguracaoGeminiApi({ apiKey, model });
        elemento('desktopGeminiChave').value = '';
        elemento('desktopGeminiChave').placeholder = `Configurada: ${dados.chaveMascarada}`;
        definirStatus(`Configuração salva. Modelo ativo: ${dados.modelo}.`, 'sucesso');
    } catch (erro) {
        definirStatus(erro.message || 'Não foi possível salvar a configuração.', 'erro');
    } finally {
        botao.disabled = false;
    }
}

async function removerGemini() {
    if (!confirm('Remover a chave do Gemini deste computador?')) return;
    try {
        await removerConfiguracaoGeminiApi();
        elemento('desktopGeminiChave').value = '';
        elemento('desktopGeminiChave').placeholder = 'Cole a chave da API do Gemini';
        definirStatus('Chave removida. As demais funções continuam disponíveis.', 'aviso');
    } catch (erro) {
        definirStatus(erro.message || 'Não foi possível remover a chave.', 'erro');
    }
}

async function executarAcaoDesktop(acao, mensagemSucesso) {
    try {
        await acao();
        definirStatus(mensagemSucesso, 'sucesso');
    } catch (erro) {
        definirStatus(erro.message || 'A ação não pôde ser concluída.', 'erro');
    }
}

function configurarEventos() {
    elemento('btnDesktopFerramentas')?.addEventListener('click', abrirModal);
    elemento('desktopConfigFechar')?.addEventListener('click', fecharModal);
    elemento('desktopConfigModal')?.addEventListener('click', evento => {
        if (evento.target.id === 'desktopConfigModal') fecharModal();
    });
    elemento('desktopBtnSalvarGemini')?.addEventListener('click', salvarGemini);
    elemento('desktopBtnRemoverGemini')?.addEventListener('click', removerGemini);
    elemento('desktopBtnAbrirProjetos')?.addEventListener('click', () =>
        executarAcaoDesktop(
            () => window.automacaoDesktop.abrirPasta('projetos'),
            'Pasta de projetos aberta.'
        )
    );
    elemento('desktopBtnAbrirRelatorios')?.addEventListener('click', () =>
        executarAcaoDesktop(
            () => window.automacaoDesktop.abrirPasta('relatorios'),
            'Pasta de relatórios aberta.'
        )
    );
    elemento('desktopBtnCriarAtalho')?.addEventListener('click', () =>
        executarAcaoDesktop(
            () => window.automacaoDesktop.importarDadosPortateis(),
            'Importação concluída ou cancelada.'
        )
    );
    elemento('desktopBtnBackupBanco')?.addEventListener('click', () =>
        executarAcaoDesktop(
            () => window.automacaoDesktop.criarBackupBanco(),
            'Backup do Banco de Parceiros criado.'
        )
    );
    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && !elemento('desktopConfigModal')?.hidden) fecharModal();
    });
}

export async function inicializarDesktop() {
    if (!window.automacaoDesktop) return;

    document.documentElement.classList.add('ambiente-electron');
    const botao = elemento('btnDesktopFerramentas');
    if (botao) botao.hidden = false;

    try {
        const status = await window.automacaoDesktop.obterStatus();
        const badge = document.querySelector('.app-version-badge');
        if (badge) badge.textContent = `v${status.versao} · Desktop`;
        const caminho = elemento('desktopRaizPortatil');
        if (caminho) caminho.textContent = status.pastas?.raiz || 'Pasta do aplicativo';
    } catch {
        // A interface continua funcionando mesmo se o status desktop falhar.
    }

    configurarEventos();
    window.automacaoDesktop.aoAbrirConfiguracaoGemini(abrirModal);
}
