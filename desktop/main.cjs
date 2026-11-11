'use strict';

const {
    app,
    BrowserWindow,
    Menu,
    Notification,
    dialog,
    ipcMain,
    session,
    shell
} = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const APP_NAME = 'Automação de Vendas EcofoodPack';
const APP_VERSION = '3.0.0';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const NOME_PASTA_DADOS = 'EcofoodPack Automação de Vendas';

let servidorHttp = null;
let janelaPrincipal = null;
let janelaSplash = null;
let raizDados = null;
let pastas = null;
let encerrando = false;

// Versão instalada: os dados ficam em Documentos\EcofoodPack Automação de Vendas,
// uma pasta fixa, fácil de encontrar e de incluir no backup do computador.
// A variável ECOFOODPACK_DADOS permite escolher outra pasta, se necessário.
function obterRaizDados() {
    if (process.env.ECOFOODPACK_DADOS) return path.resolve(process.env.ECOFOODPACK_DADOS);
    if (!app.isPackaged) return path.join(PROJECT_ROOT, 'dados-desenvolvimento');
    return path.join(app.getPath('documents'), NOME_PASTA_DADOS);
}

function montarPastas(raiz) {
    return {
        raiz,
        config: path.join(raiz, 'config'),
        dados: path.join(raiz, 'dados'),
        memoria: path.join(raiz, 'dados', 'memoria'),
        projetos: path.join(raiz, 'projetos'),
        relatorios: path.join(raiz, 'relatorios'),
        planilhas: path.join(raiz, 'planilhas'),
        backups: path.join(raiz, 'backups'),
        logs: path.join(raiz, 'logs'),
        temporarios: path.join(app.getPath('temp'), 'ecofoodpack-automacao')
    };
}

function garantirEstrutura() {
    for (const pasta of Object.values(pastas)) {
        fs.mkdirSync(pasta, { recursive: true });
    }

    const bancoDestino = path.join(pastas.dados, 'banco-distribuidores.json');
    if (!fs.existsSync(bancoDestino)) {
        const candidatos = [
            path.join(PROJECT_ROOT, 'dados', 'banco-distribuidores.json'),
            path.join(PROJECT_ROOT, 'default-data', 'banco-distribuidores.json'),
            path.join(process.resourcesPath || '', 'default-data', 'banco-distribuidores.json')
        ];
        const bancoOrigem = candidatos.find(caminho => caminho && fs.existsSync(caminho));
        fs.writeFileSync(
            bancoDestino,
            bancoOrigem ? fs.readFileSync(bancoOrigem) : Buffer.from('[]', 'utf8')
        );
    }

    // Base histórica inicial (meses já auditados), copiada apenas se ainda não existir.
    const memoriaPadrao = [
        path.join(process.resourcesPath || '', 'default-data', 'memoria'),
        path.join(PROJECT_ROOT, 'default-data', 'memoria')
    ].find(caminho => fs.existsSync(caminho));
    if (memoriaPadrao) {
        for (const nome of fs.readdirSync(memoriaPadrao)) {
            const destino = path.join(pastas.memoria, nome);
            if (!fs.existsSync(destino)) fs.copyFileSync(path.join(memoriaPadrao, nome), destino);
        }
    }
}

function pastaEstaVazia(pasta) {
    try {
        return !fs.readdirSync(pasta).some(nome => !nome.startsWith('.'));
    } catch {
        return true;
    }
}

async function copiarPasta(origem, destino, { sobrescrever = false } = {}) {
    if (!fs.existsSync(origem)) return 0;
    let total = 0;
    await fsp.mkdir(destino, { recursive: true });
    for (const item of await fsp.readdir(origem, { withFileTypes: true })) {
        const de = path.join(origem, item.name);
        const para = path.join(destino, item.name);
        if (item.isDirectory()) {
            total += await copiarPasta(de, para, { sobrescrever });
        } else if (sobrescrever || !fs.existsSync(para)) {
            await fsp.copyFile(de, para);
            total += 1;
        }
    }
    return total;
}

// Importa os dados da antiga versão portátil (pasta do pendrive).
async function importarDadosPortateis(janela) {
    const escolha = await dialog.showOpenDialog(janela, {
        title: 'Selecione a pasta da versão do pendrive',
        message: 'Escolha a pasta que contém as subpastas "dados", "projetos" e "relatorios".',
        properties: ['openDirectory']
    });
    if (escolha.canceled || !escolha.filePaths[0]) return null;

    const origem = escolha.filePaths[0];
    const bancoOrigem = path.join(origem, 'dados', 'banco-distribuidores.json');
    if (!fs.existsSync(bancoOrigem)) {
        throw new Error('A pasta escolhida não contém "dados\\banco-distribuidores.json". Selecione a pasta principal do pendrive.');
    }

    await criarBackupBanco().catch(() => {});
    const resultado = {
        banco: 0,
        projetos: await copiarPasta(path.join(origem, 'projetos'), pastas.projetos),
        relatorios: await copiarPasta(path.join(origem, 'relatorios'), pastas.relatorios),
        planilhas: await copiarPasta(path.join(origem, 'planilhas'), pastas.planilhas),
        backups: await copiarPasta(path.join(origem, 'backups'), pastas.backups),
        memoria: await copiarPasta(path.join(origem, 'dados', 'memoria'), pastas.memoria)
    };

    // O banco de parceiros do pendrive substitui o atual (o atual vai para backups).
    await fsp.copyFile(bancoOrigem, path.join(pastas.dados, 'banco-distribuidores.json'));
    resultado.banco = 1;

    const geminiOrigem = path.join(origem, 'config', 'gemini.json');
    const geminiDestino = path.join(pastas.config, 'gemini.json');
    if (fs.existsSync(geminiOrigem)) {
        try {
            const dados = JSON.parse(fs.readFileSync(geminiOrigem, 'utf8'));
            if (dados?.apiKey) await fsp.copyFile(geminiOrigem, geminiDestino);
        } catch {
            // Configuração inválida é ignorada.
        }
    }

    registrarLog('INFO', 'Dados importados da versão portátil.', `${origem} ${JSON.stringify(resultado)}`);
    return { origem, ...resultado };
}

async function executarImportacaoComAviso(janela) {
    try {
        const resultado = await importarDadosPortateis(janela);
        if (!resultado) return;
        await dialog.showMessageBox(janela, {
            type: 'info',
            title: APP_NAME,
            message: 'Dados importados com sucesso.',
            detail: `Banco de parceiros, ${resultado.projetos} arquivo(s) de projeto, ${resultado.relatorios} relatório(s) e ${resultado.planilhas} planilha(s) foram copiados.\n\nA interface será recarregada.`
        });
        // Reinicia o backend para ler a nova configuração do Gemini.
        app.relaunch();
        app.exit(0);
    } catch (erro) {
        dialog.showErrorBox(APP_NAME, erro.message);
    }
}

function configurarPastasElectron() {
    app.setPath('logs', pastas.logs);
}

function caminhoLog() {
    const data = new Date().toISOString().slice(0, 10);
    return path.join(pastas.logs, `automacao-${data}.log`);
}

function registrarLog(nivel, mensagem, detalhe = '') {
    try {
        const linha = `[${new Date().toISOString()}] [${nivel}] ${mensagem}${detalhe ? ` | ${detalhe}` : ''}${os.EOL}`;
        fs.appendFileSync(caminhoLog(), linha, 'utf8');
    } catch {
        // O log nunca deve impedir a inicialização.
    }
}

function notificar(titulo, corpo) {
    if (Notification.isSupported()) {
        new Notification({ title: titulo, body: corpo, icon: obterIcone('png') }).show();
    }
}

function obterIcone(extensao = 'png') {
    const candidatos = [
        path.join(PROJECT_ROOT, 'build', `icon.${extensao}`),
        path.join(process.resourcesPath || '', `icon.${extensao}`),
        path.join(process.resourcesPath || '', 'build', `icon.${extensao}`)
    ];
    return candidatos.find(fs.existsSync) || undefined;
}

function nomeUnico(pasta, nomeArquivo) {
    const nomeSeguro = path.basename(String(nomeArquivo || 'arquivo'))
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .trim() || 'arquivo';
    const extensao = path.extname(nomeSeguro);
    const base = path.basename(nomeSeguro, extensao);
    let candidato = path.join(pasta, nomeSeguro);
    let indice = 2;
    while (fs.existsSync(candidato)) {
        candidato = path.join(pasta, `${base} (${indice})${extensao}`);
        indice += 1;
    }
    return candidato;
}

async function criarBackupBanco() {
    const origem = path.join(pastas.dados, 'banco-distribuidores.json');
    if (!fs.existsSync(origem)) return;

    const conteudo = await fsp.readFile(origem);
    const data = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = path.join(pastas.backups, `banco-parceiros-${data}.json`);
    await fsp.writeFile(destino, conteudo);

    const arquivos = (await fsp.readdir(pastas.backups))
        .filter(nome => /^banco-parceiros-.*\.json$/i.test(nome))
        .sort()
        .reverse();
    await Promise.all(arquivos.slice(30).map(nome =>
        fsp.rm(path.join(pastas.backups, nome), { force: true })
    ));
}

async function gerarPdfElectron({ html, nomeArquivo }) {
    const nomeSeguro = path.basename(nomeArquivo || 'Relatorio-EcofoodPack.pdf');
    const pastaTrabalho = await fsp.mkdtemp(path.join(pastas.temporarios, 'pdf-'));
    const htmlTemporario = path.join(pastaTrabalho, 'relatorio.html');
    const janelaPdf = new BrowserWindow({
        show: false,
        backgroundColor: '#ffffff',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            javascript: true
        }
    });

    try {
        await fsp.writeFile(htmlTemporario, html, 'utf8');
        await janelaPdf.loadFile(htmlTemporario);
        await janelaPdf.webContents.executeJavaScript(`
            (async () => {
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return true;
            })()
        `, true);
        await new Promise(resolve => setTimeout(resolve, 350));

        const buffer = await janelaPdf.webContents.printToPDF({
            landscape: true,
            printBackground: true,
            preferCSSPageSize: true,
            pageSize: 'A4',
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        if (!buffer || buffer.length < 1000) {
            throw new Error('O Electron gerou um PDF vazio ou incompleto.');
        }

        registrarLog('INFO', 'PDF gerado pelo mecanismo interno.', nomeSeguro);
        return buffer;
    } finally {
        if (!janelaPdf.isDestroyed()) janelaPdf.destroy();
        await fsp.rm(pastaTrabalho, { recursive: true, force: true }).catch(() => {});
    }
}

function criarSplash() {
    janelaSplash = new BrowserWindow({
        width: 520,
        height: 300,
        frame: false,
        transparent: false,
        resizable: false,
        alwaysOnTop: true,
        show: false,
        backgroundColor: '#101611',
        icon: obterIcone('png'),
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;background:#101611;color:#fff;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;height:100vh}
        main{text-align:center;padding:30px}.logo{width:86px;height:86px;object-fit:contain;margin-bottom:15px}h1{font-size:24px;margin:0 0 8px}p{color:#b8c4b5;margin:0 0 22px}.bar{height:5px;width:300px;background:#273126;border-radius:20px;overflow:hidden}.bar:after{content:"";display:block;height:100%;width:42%;background:linear-gradient(90deg,#7bbb4d,#f56227);border-radius:inherit;animation:a 1.25s ease-in-out infinite}@keyframes a{from{transform:translateX(-110%)}to{transform:translateX(350%)}}</style></head>
        <body><main><img class="logo" src="file:///${String(obterIcone('png') || '').replace(/\\/g,'/')}"/><h1>Automação de Vendas</h1><p>Carregando seus dados...</p><div class="bar"></div></main></body></html>`;
    janelaSplash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    janelaSplash.once('ready-to-show', () => janelaSplash.show());
}

async function iniciarBackend() {
    process.env.AUTOMACAO_DATA_DIR = pastas.dados;
    process.env.AUTOMACAO_CONFIG_DIR = pastas.config;
    process.env.AUTOMACAO_DESKTOP = '1';
    process.env.AUTOMACAO_MEMORIA_DIR = pastas.memoria;
    process.env.AUTOMACAO_PROJETOS_DIR = pastas.projetos;
    process.env.PORT = '0';

    const { iniciarServidor } = require(path.join(PROJECT_ROOT, 'server.js'));
    const resultado = await iniciarServidor({ port: 0, gerarPdf: gerarPdfElectron });
    servidorHttp = resultado.servidor;
    return resultado.port;
}

function configurarDownloads() {
    session.defaultSession.on('will-download', (_evento, item) => {
        const nome = path.basename(item.getFilename() || 'arquivo');
        const ext = path.extname(nome).toLowerCase();
        let pastaDestino = pastas.planilhas;
        if (ext === '.pdf') pastaDestino = pastas.relatorios;
        else if (ext === '.json') pastaDestino = pastas.projetos;
        const destino = nomeUnico(pastaDestino, nome);
        item.setSavePath(destino);
        item.once('done', (_event, estado) => {
            if (estado === 'completed') {
                notificar('Arquivo salvo', `${path.basename(destino)} foi salvo na pasta de dados.`);
                registrarLog('INFO', 'Download concluído.', destino);
            } else {
                registrarLog('ERRO', `Download ${estado}.`, destino);
            }
        });
    });
}

function criarJanela(porta) {
    janelaPrincipal = new BrowserWindow({
        title: APP_NAME,
        width: 1480,
        height: 920,
        minWidth: 1100,
        minHeight: 720,
        show: false,
        backgroundColor: '#0d120e',
        icon: obterIcone('png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !app.isPackaged
        }
    });

    janelaPrincipal.once('ready-to-show', () => {
        if (janelaSplash && !janelaSplash.isDestroyed()) janelaSplash.close();
        janelaPrincipal.maximize();
        janelaPrincipal.show();
    });

    janelaPrincipal.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    janelaPrincipal.webContents.on('render-process-gone', (_evento, detalhes) => {
        registrarLog('ERRO', 'O processo visual foi encerrado.', JSON.stringify(detalhes));
    });

    janelaPrincipal.loadURL(`http://127.0.0.1:${porta}`);
}

async function abrirConfiguracaoGemini() {
    if (!janelaPrincipal) return;
    janelaPrincipal.webContents.send('desktop:abrir-configuracao-gemini');
}

function configurarMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
            label: 'Arquivo',
            submenu: [
                { label: 'Abrir pasta de projetos', click: () => shell.openPath(pastas.projetos) },
                { label: 'Abrir pasta de relatórios', click: () => shell.openPath(pastas.relatorios) },
                { label: 'Abrir pasta de planilhas', click: () => shell.openPath(pastas.planilhas) },
                { label: 'Abrir pasta principal de dados', click: () => shell.openPath(pastas.raiz) },
                { type: 'separator' },
                { role: 'quit', label: 'Sair' }
            ]
        },
        {
            label: 'Ferramentas',
            submenu: [
                { label: 'Configurar Gemini', click: abrirConfiguracaoGemini },
                { type: 'separator' },
                { label: 'Importar dados da versão do pendrive...', click: () => executarImportacaoComAviso(janelaPrincipal) },
                { type: 'separator' },
                { label: 'Criar backup do Banco de Parceiros', click: async () => { await criarBackupBanco(); notificar(APP_NAME, 'Backup criado com sucesso.'); } }
            ]
        },
        {
            label: 'Visualização',
            submenu: [
                { role: 'reload', label: 'Recarregar interface' },
                { role: 'resetZoom', label: 'Tamanho normal' },
                { role: 'zoomIn', label: 'Aumentar' },
                { role: 'zoomOut', label: 'Diminuir' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Tela cheia' }
            ]
        },
        {
            label: 'Ajuda',
            submenu: [
                {
                    label: 'Sobre',
                    click: () => dialog.showMessageBox(janelaPrincipal, {
                        type: 'info',
                        title: `Sobre — ${APP_NAME}`,
                        message: APP_NAME,
                        detail: `Versão ${APP_VERSION}\n\nSeus dados ficam em:\n${pastas.raiz}`
                    })
                }
            ]
        }
    ]));
}

function configurarIpc() {
    ipcMain.handle('desktop:status', () => ({
        ambiente: 'electron',
        versao: APP_VERSION,
        empacotado: app.isPackaged,
        portatil: false,
        pastas
    }));
    ipcMain.handle('desktop:abrir-pasta', (_evento, nome) => {
        const pasta = pastas[nome];
        if (!pasta) throw new Error('Pasta desconhecida.');
        return shell.openPath(pasta);
    });
    ipcMain.handle('desktop:importar-portatil', () => executarImportacaoComAviso(janelaPrincipal));
    ipcMain.handle('desktop:backup-banco', () => criarBackupBanco());
}

const bloqueioInstancia = app.requestSingleInstanceLock();
if (!bloqueioInstancia) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (janelaPrincipal) {
            if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
            janelaPrincipal.show();
            janelaPrincipal.focus();
        }
    });

    raizDados = obterRaizDados();
    pastas = montarPastas(raizDados);
    const primeiraExecucao = pastaEstaVazia(pastas.projetos) && !fs.existsSync(path.join(raizDados, 'dados', 'banco-distribuidores.json'));
    garantirEstrutura();
    configurarPastasElectron();
    configurarIpc();

    app.whenReady().then(async () => {
        app.setName(APP_NAME);
        registrarLog('INFO', `Inicializando ${APP_NAME} ${APP_VERSION}.`, raizDados);
        criarSplash();
        await criarBackupBanco().catch(erro => registrarLog('AVISO', 'Backup inicial não realizado.', erro.message));
        const porta = await iniciarBackend();
        configurarDownloads();
        configurarMenu();
        criarJanela(porta);

        if (primeiraExecucao && app.isPackaged) {
            janelaPrincipal.once('ready-to-show', async () => {
                const resposta = await dialog.showMessageBox(janelaPrincipal, {
                    type: 'question',
                    title: APP_NAME,
                    buttons: ['Importar do pendrive', 'Começar do zero'],
                    defaultId: 0,
                    cancelId: 1,
                    message: 'Bem-vindo à versão instalada.',
                    detail: `Seus dados serão guardados em:\n${pastas.raiz}\n\nDeseja importar o banco de parceiros, projetos e relatórios da versão do pendrive agora? (Também é possível fazer isso depois em Ferramentas > Importar dados da versão do pendrive.)`
                });
                if (resposta.response === 0) executarImportacaoComAviso(janelaPrincipal);
            });
        }
    }).catch(erro => {
        registrarLog('ERRO', 'Falha fatal na inicialização.', erro.stack || erro.message);
        if (janelaSplash && !janelaSplash.isDestroyed()) janelaSplash.close();
        dialog.showErrorBox(APP_NAME, `Não foi possível iniciar o aplicativo.\n\n${erro.message}`);
        app.quit();
    });
}

process.on('uncaughtException', erro => registrarLog('ERRO', 'Exceção não tratada.', erro.stack || erro.message));
process.on('unhandledRejection', erro => registrarLog('ERRO', 'Promise rejeitada.', String(erro?.stack || erro)));

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && servidorHttp) {
        const endereco = servidorHttp.address();
        criarJanela(endereco.port);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    encerrando = true;
    if (servidorHttp) servidorHttp.close();
});

app.on('will-quit', () => {
    if (!encerrando) registrarLog('INFO', 'Aplicativo encerrado.');
});
