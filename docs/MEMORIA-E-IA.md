# Memória mensal e análises com IA

## Memória mensal

Assim que um relatório é validado, o mês é gravado em `dados/memoria/AAAA-MM.json` (endpoint `PUT /api/memoria/:periodo`). Quando os textos são gerados ou editados, eles entram no mesmo arquivo, com 1,5 s de espera para não gravar a cada tecla.

```jsonc
{
  "versao": 1,
  "periodo": "2026-08",
  "investimentos": { "google": 2700, "meta": 1300, "total": 4000 },
  "vendas": {
    "fatGeral": 410807.54, "fatParceiros": 288020.55, "qtdGeral": 690,
    "porCanal": { "LOJA VIRTUAL": { "faturamento": "…", "pedidos": "…" } },
    "vendasUtmGoogleAds": { "faturamento": 77070.02, "pedidos": 201 }
  },
  // Pedidos compactos: [nome do cliente, valor líquido, data, canal, utm]
  "pedidos": [["EMPÓRIO SÃO JOÃO LTDA", 1240.5, "2026-08-03", "B2B_PORTAL", ""]],
  "ga": { "todos": {}, "pago": {} },
  "visitas": { "total": 4721, "conversao": 14.2 },
  "meta": { "valorUsado": "…", "compras": "…", "ctr": "…" },
  "informacoes": { "decisoes": "…", "proximosPassos": "…" },
  "analises": { "conclusao": "…", "tendencias": "…" }
}
```

O que isso permite:

- **Histórico sem retrabalho.** Os cards de "dois meses atrás", "mês anterior" e "ano anterior" são preenchidos pela memória, inclusive os investimentos. Só é preciso enviar planilha de um mês que ainda não passou pelo programa.
- **Passado sempre atualizado.** Os pedidos compactos são reclassificados com o Banco de Parceiros atual sempre que a série é montada.
- **Continuidade da análise.** A IA recebe o que foi decidido e recomendado nos três meses anteriores e pode comentar se os números indicam que a direção funcionou.

## Contexto enviado ao Gemini

| Seção | Contexto principal |
|---|---|
| Implementações | textos digitados sobre o mês (vindos das reuniões) |
| Google Analytics | segmentos do GA4 e participação por origem |
| Investimentos | Google, Meta, receita atribuída e vendas com UTM Google Ads |
| Vendas | faturamento, pedidos, parceiros, ticket médio e canal de venda |
| ROAS | ROAS geral, ROAS sem parceiros e ROI estimado, com as ressalvas |
| Visitas | totais, conversão, dias de destaque |
| Histórico | 3 meses recentes, ano anterior e posição frente à média |
| Meta Ads | métricas e campanhas |
| **Tendências** | série de até 12 meses, tendências calculadas, recomendações anteriores |
| Conclusão | resumo de tudo, mais decisões e próximos passos |

O servidor envia **todas as seções pendentes em uma chamada**, com:

- **instrução de sistema** que define o papel de analista da empresa e os princípios (usar só os números recebidos, separar fato de hipótese, não confundir "sem parceiros" com tráfego pago);
- **regras gerais** e **orientação por seção**, com limite de palavras;
- **JSON Schema** com uma chave por seção (`responseMimeType: application/json`);
- **temperatura 0,2** e até 16 mil tokens de saída;
- **repetição automática** com espera progressiva (2 s, 6 s, 15 s) quando o serviço responde 429, 500 ou 503, exceto quando a cota diária acabou.

### Seção "Tendências e direcionamento"

A orientação pede três parágrafos:

1. o **padrão** que vem se repetindo, citando meses e valores;
2. para onde os números **apontam se o padrão continuar**, sempre como possibilidade ("se o ritmo se mantiver", "há sinais de");
3. de **duas a quatro direções práticas** para o próximo mês, ligadas aos números.

Com menos de três meses no histórico, a IA é instruída a dizer que a leitura ainda é preliminar.

### O que nunca vai para a IA

A lista de pedidos, os nomes de clientes e o Banco de Parceiros. Só seguem para o Gemini os indicadores agregados, os nomes de produtos e campanhas e os textos de contexto digitados pelo usuário.
