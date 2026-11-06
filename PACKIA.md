# Controle de Manutenção (PWA)

Aplicativo de ordens de serviço, calendário, estoque e compras da equipe de manutenção.
Roda como site/PWA instalável e sincroniza pelo Supabase.

## Arquivos

- `index.html` — telas (login, início, OS, calendário, perfil, estoque, compras).
- `style.css` — aparência.
- `script.js` — toda a lógica do app (carregado por último).
- `supabase.js` — sincronização com o banco (carregado antes do `script.js`).
- `pwa.js` — cartão de instalação e registro do service worker.
- `sw.js` — cache offline.
- `supabase.sql` — tabelas e políticas a colar no Supabase.

## Regras de trabalho neste projeto

- O `script.js` tem cerca de 4.500 linhas. **Nunca reescrever o arquivo inteiro**:
  usar edições pontuais (substituir um trecho exato) e conferir o trecho depois.
- Depois de qualquer edição, checar a sintaxe antes de entregar.
- Uma função com nome repetido no mesmo arquivo sobrescreve a anterior. Já houve
  esse problema com `estBaixo`/`estAbaixo` (nomes diferentes, regras diferentes).
- Não há Git no computador: não existe desfazer automático. Fazer cópia do
  arquivo antes de mudanças grandes.
- **Nunca editar arquivos via PowerShell** (`Get-Content`/`Set-Content` com
  `-replace` em massa). Isso já esvaziou o `script.js` uma vez. Usar sempre
  `edit_file` (trecho exato) e conferir o resultado com `read_file`.
- O histórico da conversa guarda o texto original dos arquivos lidos; em caso de
  perda, o `script.js` pode ser recuperado dele.

## Erros já corrigidos (não repetir)

- `kpi` existia duas vezes (assinaturas diferentes): a segunda apagava a primeira e
  os números dos relatórios de OS/estoque saíam trocados. A versão do relatório de
  estoque agora se chama `kpiCard` (local, dentro de `abrirRelEstoque`).
- `kvGet` e `abrirDB` podiam nunca responder (IndexedDB com erro/`onblocked`), o que
  deixava a inicialização parada na tela de login. Agora sempre caem no plano B
  (localStorage) ou devolvem vazio.
- Ajuste de contagem de inventário (`t: "ajuste"`) aparecia como entrada no relatório
  de movimentação e com o sinal invertido: `movimentosEstoque` e `movimentosDe`
  tratam o ajuste com o sinal gravado. O motivo vazio agora vira texto
  (`motivoMov`), não "undefined".
- `resumoCompras()` passou a devolver `aguardando` (o perfil usava `r.caminho`, que
  não existia na contagem "A comprar").
- Aviso "Nova OS para você" não depende mais do prazo (antes, uma OS designada para
  daqui a mais de 2 dias não avisava o técnico).

## Observações conhecidas

- A pasta `icons/` não existe ainda; o manifest e o service worker apontam para
  `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` e `favicon-32.png`. Sem esses arquivos, o app instala
  com ícone genérico (o app funciona normalmente).
- No Supabase, as tabelas `estoque` e `compras` ainda não foram criadas: rode
  `supabase.sql` no SQL Editor para que apareçam.
