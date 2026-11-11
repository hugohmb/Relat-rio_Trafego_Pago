import { estadoAplicacao } from '../estado.js';
import { formatarMoeda, escaparHtml } from '../utilitarios.js';
import { carregarMemorias, vendasDaMemoria } from '../relatorio/memoria.js';

function percentual(valor) {
    return Number.isFinite(valor) ? `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
}

async function renderizar() {
    const tabela = document.getElementById('tabelaMemoriaMensal');
    if (!tabela) return;
    const memorias = await carregarMemorias();
    if (!memorias.length) {
        tabela.innerHTML = '<tbody><tr><td>Nenhum mês salvo ainda. Os meses entram aqui automaticamente quando um relatório é validado.</td></tr></tbody>';
        return;
    }

    const linhas = [...memorias].sort((a, b) => b.periodo.localeCompare(a.periodo)).map(registro => {
        const v = vendasDaMemoria(registro, estadoAplicacao.parceiros);
        const participacao = v.fatGeral > 0 ? (v.fatParceiros / v.fatGeral) * 100 : NaN;
        const utm = registro.vendas?.vendasUtmGoogleAds?.faturamento;
        const investimento = Number(registro.investimentos?.total || 0);
        return `<tr>
            <td>${escaparHtml(registro.periodoFormatado || registro.periodo)}</td>
            <td>${formatarMoeda(v.fatGeral)}</td>
            <td>${formatarMoeda(v.fatParceiros)}</td>
            <td>${percentual(participacao)}</td>
            <td>${formatarMoeda(v.fatSemParceiros)}</td>
            <td>${v.qtdGeral}</td>
            <td>${utm === undefined || utm === null ? '—' : formatarMoeda(utm)}</td>
            <td>${investimento ? formatarMoeda(investimento) : '—'}</td>
            <td>${investimento ? `${v.roasSemParceiros.toFixed(2).replace('.', ',')}x` : '—'}</td>
            <td>${registro.visitas ? registro.visitas.total.toLocaleString('pt-BR') : '—'}</td>
        </tr>`;
    }).join('');

    tabela.innerHTML = `
        <thead><tr><th>Mês</th><th>Faturamento</th><th>Parceiros</th><th>% parceiros</th><th>Sem parceiros</th><th>Pedidos</th><th>UTM Google Ads</th><th>Investimento</th><th>ROAS s/ parceiros</th><th>Visitas</th></tr></thead>
        <tbody>${linhas}</tbody>`;
}

export function inicializarHistoricoMemoria() {
    document.getElementById('btnAtualizarMemoria')?.addEventListener('click', renderizar);
    document.querySelectorAll('.tab-btn').forEach(botao => {
        if (botao.getAttribute('onclick')?.includes('abaHistorico')) botao.addEventListener('click', renderizar);
    });
    window.addEventListener('relatorio:consolidado', () => setTimeout(renderizar, 800));
    renderizar();
}
