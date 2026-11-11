import { carregarParceirosApi, salvarParceirosApi } from '../api.js';
import { estadoAplicacao } from '../estado.js';
import { normalizarNome } from '../utilitarios.js';

function renderizarLista() {
    const ul = document.getElementById('listaVendedores');
    const contador = document.getElementById('contadorParceiros');

    if (!ul) return;

    ul.innerHTML = '';
    const totalParceiros = estadoAplicacao.parceiros.length;

    if (contador) {
        contador.textContent = totalParceiros === 1
            ? '1 parceiro cadastrado'
            : `${totalParceiros} parceiros cadastrados`;
    }

    document.dispatchEvent(new CustomEvent('parceiros:atualizados', {
        detail: { total: totalParceiros }
    }));

    estadoAplicacao.parceiros.forEach((nome, index) => {
        const li = document.createElement('li');
        li.appendChild(document.createTextNode(nome));

        const btnRemover = document.createElement('button');
        btnRemover.textContent = 'X';
        btnRemover.className = 'btn-remover';
        btnRemover.addEventListener('click', () => removerRepresentante(index));

        li.appendChild(btnRemover);
        ul.appendChild(li);
    });
}

async function persistirParceiros() {
    try {
        await salvarParceirosApi(estadoAplicacao.parceiros);
    } catch (erro) {
        console.error('Erro ao salvar representantes:', erro);
        alert(
            'Não foi possível salvar o banco de parceiros. Verifique se o servidor está rodando.'
        );
    }
}

async function adicionarRepresentante() {
    const input = document.getElementById('nomeVendedor');
    const nome = normalizarNome(input?.value);

    if (!nome) return;

    if (estadoAplicacao.parceiros.includes(nome)) {
        alert(`O parceiro "${nome}" já está cadastrado na sua lista!`);
        return;
    }

    estadoAplicacao.parceiros.push(nome);
    estadoAplicacao.parceiros.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    input.value = '';
    renderizarLista();
    await persistirParceiros();
}

async function removerRepresentante(index) {
    const nome = estadoAplicacao.parceiros[index];
    const confirmacao = window.confirm(
        `ATENÇÃO!\n\nVocê tem certeza que deseja remover "${nome}" do banco de parceiros?`
    );

    if (!confirmacao) return;

    estadoAplicacao.parceiros.splice(index, 1);
    renderizarLista();

    const busca = document.getElementById('buscaVendedor');
    if (busca) busca.value = '';

    await persistirParceiros();
}

function filtrarLista() {
    const termoBusca = normalizarNome(this.value);
    const listaItens = document.querySelectorAll('#listaVendedores li');

    listaItens.forEach(li => {
        const nomeParceiro = normalizarNome(li.firstChild?.textContent);
        li.style.display = nomeParceiro.includes(termoBusca) ? '' : 'none';
    });
}

export async function inicializarParceiros() {
    document
        .getElementById('btnAdicionarVendedor')
        ?.addEventListener('click', adicionarRepresentante);

    document
        .getElementById('nomeVendedor')
        ?.addEventListener('keydown', evento => {
            if (evento.key === 'Enter') adicionarRepresentante();
        });

    document
        .getElementById('buscaVendedor')
        ?.addEventListener('input', filtrarLista);

    try {
        const dados = await carregarParceirosApi();
        estadoAplicacao.parceiros = Array.isArray(dados)
            ? dados.map(normalizarNome).filter(Boolean)
            : [];
    } catch (erro) {
        console.error('Erro ao carregar representantes:', erro);
        estadoAplicacao.parceiros = [];
    }

    renderizarLista();
}
