# Histórico de versões

## 3.0.0 — novembro de 2026

### Corrigido
- **Parceiros não reconhecidos em CSV da Tray.** O arquivo vem em ISO-8859-1 e era decodificado como UTF-8; nomes com acento não batiam com o banco de parceiros. A codificação agora é detectada.
- Conversão de números com os dois separadores (`1,234.56`) e com milhar sem decimal (`1.234.567`).

### Adicionado
- Leitor universal de planilhas (XLSX, XLS, CSV, TSV, TXT; UTF-8, Windows-1252, UTF-16; `;` `,` tab `|`).
- Área para **arrastar todos os arquivos do mês**, com identificação automática da plataforma e do mês.
- Conferência de arquivo no campo errado e de mês divergente.
- **Memória mensal**: histórico automático, recalculado com o banco de parceiros atual.
- Vendas por canal, por origem UTM (incluindo *vendas com UTM Google Ads*) e por status.
- Seção de IA e página 13 **Tendências e direcionamento**.
- Geração automática das análises após a validação.
- Instrução de sistema e repetição automática nas chamadas ao Gemini.
- Alertas: investimento idêntico ao do mês anterior, salto na participação dos parceiros, nomes corrompidos, pedidos duplicados.
- Aba Histórico com todos os meses salvos.
- Gerador de dados fictícios e modo de demonstração.

### Alterado
- Aplicativo **instalado** (NSIS) em vez de portátil; dados em `Documentos\`; importação da versão portátil.
- Bibliotecas embutidas: funciona offline, exceto o Gemini.

## 2.0.0 — 2026

- Versão portátil para Windows com montagem do relatório em 12 páginas, homologação e análises do Gemini por seção.
