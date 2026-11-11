import { lerPlanilha } from './leitor-arquivos.js';

export function converterParaNumero(valor) {
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : 0;
    }

    if (valor === null || valor === undefined || String(valor).trim() === '') {
        return 0;
    }

    let texto = String(valor).trim().replace(/\s/g, '').replace(/^R\$/i, '');
    const negativo = /^\(.*\)$/.test(texto) || /^-/.test(texto);
    texto = texto.replace(/[^\d.,]/g, '');

    const ultimaVirgula = texto.lastIndexOf(',');
    const ultimoPonto = texto.lastIndexOf('.');

    if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
        // Os dois separadores aparecem: o último é o decimal.
        // "1.234,56" (padrão brasileiro) ou "1,234.56" (padrão americano).
        texto = ultimaVirgula > ultimoPonto
            ? texto.replace(/\./g, '').replace(',', '.')
            : texto.replace(/,/g, '');
    } else if (ultimaVirgula !== -1) {
        // Só vírgula: "565,80" é decimal; "1,234,567" seria milhar.
        texto = (texto.match(/,/g) || []).length > 1
            ? texto.replace(/,/g, '')
            : texto.replace(',', '.');
    } else if ((texto.match(/\./g) || []).length > 1) {
        // Vários pontos sem vírgula: "1.234.567" é separador de milhar.
        texto = texto.replace(/\./g, '');
    }
    // Um único ponto sem vírgula ("944682.24", padrão do GA4) é decimal.

    const numero = Number.parseFloat(texto);
    if (!Number.isFinite(numero)) return 0;
    return negativo ? -Math.abs(numero) : numero;
}

export function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

export function escaparHtml(valor) {
    const elemento = document.createElement('div');
    elemento.textContent = String(valor ?? '');
    return elemento.innerHTML;
}

export function normalizarCabecalho(valor) {
    return String(valor || '').trim();
}

// Comparação exata com o Banco de Parceiros (mantém as variações cadastradas,
// que refletem como o cliente se cadastrou na loja).
export function normalizarNome(valor) {
    return String(valor || '').trim().toUpperCase();
}

// Mantido com o mesmo nome para todos os processadores. A leitura agora detecta
// formato (XLSX/XLS/CSV), codificação (UTF-8, Latin-1, UTF-16) e separador.
export function lerPlanilhaAsync(arquivo) {
    return lerPlanilha(arquivo);
}
