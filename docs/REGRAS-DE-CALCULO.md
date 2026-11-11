# Regras de cálculo

Todas as fórmulas usadas pelo programa, na ordem em que aparecem no relatório. Os cálculos ficam em `public/js/processadores/` e `public/js/relatorio/`. O Gemini **não recalcula nada**: ele recebe esses valores prontos.

## Vendas (Tray)

| Indicador | Fórmula |
|---|---|
| Valor líquido do pedido | `Total − |Impostos| − |Frete valor|` |
| Pedido considerado | linhas com `Total ≠ 0` (linhas vazias ou de resumo são ignoradas) |
| Pedido de parceiro | `NOME DO CLIENTE` (sem espaços nas pontas, em maiúsculas) **idêntico** a um nome do Banco de Parceiros |
| Faturamento geral | soma dos valores líquidos |
| Faturamento de parceiros | soma dos valores líquidos dos pedidos de parceiros |
| Faturamento sem parceiros | `geral − parceiros` |
| Ticket médio | `faturamento ÷ pedidos` (geral, parceiros e sem parceiros) |
| Participação dos parceiros | `faturamento parceiros ÷ faturamento geral` |

> **Correspondência exata, de propósito.** Variações no nome cadastrado ("DISTRIBUIDORA X" e "DISTRIBUIDORA X LTDA") são mantidas como entradas separadas no banco, porque refletem como cada cliente se cadastrou na loja. O programa não faz correspondência aproximada.

Recortes adicionais, guardados como referência:

- **por canal de venda**: coluna `Canal de venda` (ex.: LOJA VIRTUAL, B2B_PORTAL);
- **por origem UTM**: coluna `UTM Source`, agrupada (`1-Google Ads` e `5-Google Ads` → *Google Ads*);
- **por status**: coluna `Status pedido`.

## Investimento e retorno

| Indicador | Fórmula |
|---|---|
| Investimento total | `Google Ads + Meta Ads` (digitados pelo usuário) |
| ROAS geral | `faturamento geral ÷ investimento total` |
| ROAS sem parceiros | `faturamento sem parceiros ÷ investimento total` |
| ROI estimado | `(faturamento sem parceiros − investimento) ÷ investimento × 100` |
| Receita exibida do Google | receita do segmento *Tráfego pago* no GA4 |
| Receita usada para o retorno do Google | `receita Tráfego pago − receita Outros` (critério definido pela empresa) |
| Vendas com UTM Google Ads | soma dos pedidos da Tray com `UTM Source` contendo "Google Ads" (referência complementar) |

> "Sem parceiros" **não** equivale a "vendas de tráfego pago". O relatório e as regras enviadas à IA deixam isso explícito.

## Google Analytics 4

| Indicador | Fórmula |
|---|---|
| Outros | `Todos os usuários − (Direto + Orgânico + Pago)`, para carrinhos, compras e receita |
| ARPPU de Outros | `receita Outros ÷ compras Outros` |
| Participação de cada origem | `métrica da origem ÷ Todos os usuários` |
| Top 20 produtos | bloco *Tráfego pago* do relatório de compras; nomes normalizados (espaços repetidos), agrupados e ordenados por itens comprados e depois por receita |

## Visitas (Tray)

| Indicador | Fórmula |
|---|---|
| Totais | linha `TOTAL` do arquivo; sem essa linha, soma diária |
| Conversão | `pedidos iniciados ÷ visitas × 100` |
| Média por dia | `visitas ÷ dias com registro` |

## Meta Ads

| Indicador | Fórmula |
|---|---|
| CTR | `cliques ÷ impressões × 100` |
| CPC | `valor usado ÷ cliques` |
| CPM | `valor usado ÷ impressões × 1000` |
| Frequência | `impressões ÷ alcance` |
| Custo por compra | `valor usado ÷ compras` |

O total vem da linha de resumo da exportação (sem nome de campanha). Sem essa linha, as campanhas são somadas.

## Comparativos e tendências

| Indicador | Fórmula |
|---|---|
| Variação | `(atual − anterior) ÷ |anterior| × 100` |
| Média dos meses anteriores | média simples dos meses da janela (até 12 meses de calendário antes do atual) que têm o dado |
| Média dos últimos 3 meses | média dos 3 meses anteriores com dado |
| Tendência % ao mês | inclinação da regressão linear da série ÷ média da série × 100 (exige 3 ou mais pontos) |
| Sequência recente | quantos meses seguidos o indicador subiu ou caiu até o mês atual |
| Posição | maior valor da série, menor valor da série ou dentro da faixa |

Os meses anteriores são **recalculados com o Banco de Parceiros atual** a partir dos pedidos guardados na memória mensal.

## Conversão de números

`converterParaNumero` aceita os formatos que aparecem nas exportações:

| Entrada | Resultado |
|---|---|
| `565,80` | 565.8 |
| `1.234,56` | 1234.56 |
| `1,234.56` | 1234.56 |
| `1.234.567` | 1234567 |
| `944682.240005` (GA4) | 944682.240005 |
| `R$ 1.200,00` | 1200 |
| `(150,00)` ou `-150,00` | −150 |
