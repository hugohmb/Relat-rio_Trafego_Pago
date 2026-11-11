export function abrirAba(evento, nomeAba) {
    const conteudos = document.getElementsByClassName('tab-content');
    for (const conteudo of conteudos) {
        conteudo.classList.remove('active');
    }

    const botoes = document.getElementsByClassName('tab-btn');
    for (const botao of botoes) {
        botao.classList.remove('active');
    }

    document.getElementById(nomeAba)?.classList.add('active');
    evento?.currentTarget?.classList.add('active');

    document.dispatchEvent(new CustomEvent('automacao:aba-aberta', {
        detail: { nomeAba }
    }));
}

export function inicializarAbas() {
    // Mantém compatibilidade com os onclick já existentes no HTML.
    window.abrirAba = abrirAba;
}
