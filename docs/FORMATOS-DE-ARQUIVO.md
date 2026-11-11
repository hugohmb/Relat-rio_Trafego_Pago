# Formatos de arquivo

Cada plataforma exporta de um jeito diferente. O leitor universal (`public/js/leitor-arquivos.js`) resolve as diferenças e a identificação automática reconhece cada arquivo **pelo conteúdo**, sem depender do nome.

| Arquivo | Plataforma | Formato típico | Como é reconhecido | Mês detectado por |
|---|---|---|---|---|
| Vendas | Tray | CSV, **ISO-8859-1**, separador `;` (ou XLSX) | colunas `Pedido`, `Nome do Cliente`, `Total` | data mais frequente na coluna `Data` |
| Visitas e conversão | Tray | XLSX, células como `170 de 4370 (3,89%)` | colunas `Data`, `Visitas` + `Pageviews`/`Pedidos iniciados` | coluna `Data` |
| Resumo dos relatórios | Google Analytics 4 | CSV UTF-8, separador `,`, blocos iniciados por `#` | `Adicionar aos carrinhos` + `ARPPU` | comentário `# Data de início: AAAAMMDD` |
| Compras de e-commerce | Google Analytics 4 | CSV UTF-8 com blocos por segmento | `Nome do item` + `Itens comprados` | comentário `# Data de início` |
| Campanhas | Meta Ads | XLSX com linha de resumo | `Nome da campanha`, `Alcance`, `Impressões` | coluna `Início dos relatórios` |

## Etapas da leitura

1. **Assinatura binária**: `PK` (ZIP) significa XLSX/XLSM; `D0 CF 11 E0` (OLE) significa XLS. Os dois tipos são lidos pelo SheetJS, na primeira aba que tem conteúdo.
2. **Codificação** (para texto):
   - BOM UTF-16 LE/BE → UTF-16;
   - BOM UTF-8 → UTF-8;
   - `TextDecoder('utf-8', { fatal: true })`: se **qualquer** byte for inválido, usa `windows-1252`.
3. **Separador**: entre `;`, `,`, tab e `|`, vence o que aparece com contagem **consistente** em mais linhas (ignorando as linhas de comentário `#` e o que está entre aspas).
4. **Parser CSV próprio**: trata aspas, aspas duplicadas, `\r\n` e mantém as linhas `#` do GA4 inteiras.

## Conferências feitas na importação

- arquivo colocado no campo errado (ex.: produtos GA4 no lugar do resumo);
- mês do arquivo diferente do mês do relatório;
- nomes de clientes com `�` (sinal de codificação errada na origem);
- números de pedido repetidos;
- XLSX do GA4 que perdeu o separador decimal ao ser aberto e salvo no Excel (o programa recomenda usar o CSV original).

## Gerando arquivos de teste

`npm run dados-exemplo` cria, em `exemplos/planilhas/AAAA-MM/`, os cinco arquivos de cada mês nos formatos acima, inclusive o CSV da Tray em ISO-8859-1 com nomes acentuados, para demonstrar a detecção de codificação.
