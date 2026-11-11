import { inicializarTema } from './tema.js';
import { inicializarAbas } from './paginas/abas.js';
import { inicializarDashboard } from './paginas/dashboard.js';
import { inicializarHistorico } from './paginas/historico.js';
import { inicializarHistoricoMemoria } from './paginas/historico-memoria.js';
import { inicializarParceiros } from './paginas/parceiros.js';
import { inicializarLimparPlanilha } from './paginas/limpar-planilha.js';
import { inicializarMontagemRelatorio } from './paginas/montar-relatorio.js';
import { inicializarAnalisesIA } from './relatorio/analises-ia.js';
import { inicializarPreviaRelatorio } from './relatorio/previa-relatorio.js';
import { inicializarHomologacao } from './relatorio/homologacao.js';
import { inicializarProjetoRelatorio } from './relatorio/projeto-relatorio.js';
import { inicializarDesktop } from './desktop.js';

inicializarTema();
inicializarAbas();

document.addEventListener('DOMContentLoaded', async () => {
    await inicializarDesktop();
    await inicializarParceiros();
    inicializarLimparPlanilha();
    inicializarDashboard();
    inicializarHistorico();
    inicializarHistoricoMemoria();
    inicializarMontagemRelatorio();
    inicializarHomologacao();
    inicializarAnalisesIA();
    inicializarPreviaRelatorio();
    inicializarProjetoRelatorio();
});
