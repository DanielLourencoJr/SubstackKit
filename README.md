# SubstackKit

Downloader/exportador unificado de dados públicos do Substack (posts, notas e
replies) usando a API interna não-oficial que o web app usa. Gera **um formato de
export padrão** (JSON) e converte para **Markdown padrão** (posts + notas mensais).

> ⚠️ Usa endpoints internos do Substack e pode quebrar a qualquer momento.
> Apenas leitura de conteúdo público. Respeite os termos do Substack.

Unifica o que antes vivia espalhado entre `SubstackScraper` (notas), `Essayer`
(posts) e `SubstackAPI` (documentação da API).

## Estrutura

```
SubstackKit/
├── bin/substack.js           # CLI unificada (subcomandos)
├── commands/                 # export | convert | fetch-new | lookup
├── lib/                      # núcleo reutilizável (exportável via import)
│   ├── args.js client.js profile.js posts.js notes.js enrich.js schema.js export.js
│   └── convert/              # html_to_md.js post_md.js pm_to_md.js note_md.js
├── docs/                     # conhecimento da API (AUTH, ENDPOINTS, API_REFERENCE, ...)
│   ├── EXPORT_SCHEMA.md      # o formato padrão de export
│   └── REPLIES_API.md        # endpoint de replies de notas
├── out/                      # exports JSON (git-ignorado)
├── textos/<autor>/           # Markdown convertido por autor (padrão Essayer)
├── md/                       # Markdown convertido (padrão Scraper)
├── .env.example              # SUBSTACK_SID=<seu cookie>
└── tests/                    # testes offline dos conversores
```

## Requisitos

- Node.js 18+
- `SUBSTACK_SID` — cookie de sessão `substack.sid` (a biblioteca exige mesmo para
  leitura pública). Cole no `.env` (git-ignorado) ou use `--env <arquivo>`.

## Uso

### Baixar tudo (posts + notas + replies) e converter

```bash
node bin/substack.js export <handle> --autor "Nome"
```

1. Resolve o perfil e a fonte (publicação ou perfil).
2. Baixa **todos** os posts (paginação automática) e enriquece com corpo completo
   (`GET /posts/by-id/{id}`).
3. Baixa notas + replies recursivos (threaded).
4. Salva o export padrão em `out/substack-export-<handle>-<timestamp>.json`.
5. Converte os posts para `.md` em `textos/<autor>/` (padrão Essayer, com
   frontmatter YAML) e as notas em `notes-YYYY-MM.md`.

### Converter um export existente

```bash
node bin/substack.js convert out/substack-export-<handle>-<timestamp>.json --md-dir md
```

### Baixar só posts novos (incremental)

```bash
node bin/substack.js fetch-new <handle> --autor "Nome"
```

Lê o RSS `/feed` da publicação, compara com os slugs já presentes em
`textos/<autor>/` e baixa os novos via `window._preloads` da página do post.

### Localizar slugs específicos

```bash
node bin/substack.js lookup <handle> <slug1> <slug2> ...
```

## Flags — `export`

| Flag               | Default                    | Descrição                                   |
| ------------------ | -------------------------- | ------------------------------------------- |
| `<handle>`         | (obrigatório)              | Handle do perfil/publicação                 |
| `--autor` / `-a`   | o próprio handle           | Nome da pasta de destino dos `.md`          |
| `--posts` / `--no-posts` | `true`               | Inclui posts no export                       |
| `--notes` / `--no-notes` | `true`               | Inclui notas no export                       |
| `--no-replies`     | off (busca replies)        | Pula a busca recursiva de replies           |
| `--no-full-bodies` | off (busca corpo completo) | Pula o enriquecimento via `/posts/by-id`    |
| `--limit`          | `0` (todos)                | Máx. de posts/notas a baixar                |
| `--source`         | `auto`                     | `auto`\|`publication`\|`profile`            |
| `--dedupe`         | off                        | Descarta posts não-PT duplicados de PT      |
| `--out`            | `out`                      | Pasta do export JSON                        |
| `--env`            | `.env` (raiz)              | Arquivo `.env` com `SUBSTACK_SID`           |
| `--skip-convert`   | off                        | Baixa/exporta mas não converte para `.md`   |
| `--md-dir`         | `textos/<autor>`           | Pasta de destino dos `.md`                  |

## Flags — `convert`

| Flag                | Default | Descrição                                  |
| ------------------- | ------- | ------------------------------------------ |
| `<export.json>`     | (mais recente em `out/`) | Caminho do export JSON        |
| `--md-dir`          | `md`    | Pasta de destino dos `.md`                 |
| `--include-meta`    | `basic` | `basic`\|`full` (metadados das notas)      |
| `--include-restacks`| `true`  | Renderiza conteúdo restacado nas notas     |
| `--include-posts`   | `false` | Também converte posts do export            |
| `--no-notes`        | off     | Pula a conversão das notas                 |

## Padrões de export

| Artefato | Formato |
| -------- | ------- |
| JSON     | `substack-export@1` — veja `docs/EXPORT_SCHEMA.md` |
| Posts `.md` | um arquivo por post, `slug.md`, com frontmatter YAML (`title`, `slug`, `url`, `date`, `likes`, `comments`, `tags`, `language`) |
| Notas `.md` | `notes-YYYY-MM.md`, agrupadas por mês, com cabeçalho e separador `---` entre notas |

Os conversores reproduzem **byte a byte** o Markdown dos fluxos anteriores
(verificado por golden test contra `Essayer/post_to_md.js` e
`SubstackScraper/notes_to_md.js`).

## Como consumir como biblioteca

O núcleo é importável:

```js
import { resolveProfile, fetchPosts, fetchNotes, buildExport, convertExport } from "substack-kit";
```

Veja `lib/index.js` para a API completa.

## Documentação da API

Todo o conhecimento reverse-engineered da API interna do Substack vive em `docs/`:

- `AUTH.md` — cookie `substack.sid`, scopes, base URLs
- `ENDPOINTS.md` — tabela rápida de ~130 endpoints
- `API_REFERENCE.md` — referência detalhada com exemplos JSON
- `CONTENT_FORMATS.md` — Tiptap (drafts) vs ProseMirror (notas)
- `LIMITS.md` — rate limits (~60 req/min) e tamanhos
- `REPLIES_API.md` — replies de notas
- `EXPORT_SCHEMA.md` — o formato de export padrão

## Idempotência

`export` sempre sobrescreve `out/` com um novo timestamp. `fetch-new` é incremental
por design: só baixa slugs ainda não convertidos na pasta de destino.

## Exemplos

```bash
# Exportar + converter tudo
node bin/substack.js export danielloureno1 --autor "Daniel"

# Só os 3 posts mais recentes, sem converter
node bin/substack.js export <handle> --limit 3 --skip-convert

# Converter um export já salvo
node bin/substack.js convert out/substack-export-<handle>-20260825-120000.json --md-dir md

# Baixar só novos e converter para a pasta do autor
node bin/substack.js fetch-new <handle> --autor "Nome"
```
