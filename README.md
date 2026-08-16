# Skill Vault

Sistema de autenticação e controle de acesso baseado em token, servindo um acervo de conteúdo técnico (wiki em Markdown) e downloads (zip/pdf/epub) via Cloudflare Workers + KV.

## Stack

- **Cloudflare Workers** — roteamento de API e proxy de assets protegidos
- **Cloudflare KV** — armazenamento de tokens/usuários (`username`, `email`, `passcode`, `date_created`, `expiration_date`)
- **Cloudflare Pages / Assets** — hospedagem do frontend estático
- **JavaScript vanilla** — frontend sem framework
- **Marked.js** — parser de Markdown no client

## Arquitetura

O acesso ao conteúdo nunca é direto. Toda leitura de artigo ou download passa por um endpoint de API que valida o token contra o KV antes de fazer proxy do asset real:

```
Cliente → /api/article?id=X&token=Y → valida token no KV → proxy de /content/X.md
Cliente → /api/download?id=X&token=Y → valida token no KV → proxy de /downloads/X
```

As pastas `/content/` e `/downloads/` são bloqueadas para acesso direto via rota HTTP (`403`), forçando toda a leitura a passar pelo endpoint autenticado.

### Endpoints

| Rota | Método | Descrição |
|---|---|---|
| `/api/auth` | POST | Valida token, retorna manifesto de conteúdo e downloads |
| `/api/validate` | POST | Valida token sem retornar dados |
| `/api/article` | GET | Proxy de artigo Markdown (autenticado) |
| `/api/download` | GET | Proxy de arquivo para download (autenticado) |

### Autenticação

O token é uma string única por cliente, gravada no KV com metadados de expiração. Cada validação verifica:

1. Existência do token no KV
2. Data de expiração (se vencida, acesso negado)

Todo acesso (login, visualização de artigo, download) é logado no KV com timestamp, usuário, ação e IP, agrupado por dia (`log:YYYY-MM-DD`), com TTL de 30 dias.

## Estrutura do projeto

```
/
├── _worker.js          # Worker: roteamento, auth, proxy de conteúdo
├── index.html           # Shell da aplicação (login + área autenticada)
├── style.css             # Estilos (layout, wiki, markdown renderizado)
├── app.js                 # Orquestração: login, sidebar, render de artigos/downloads
├── utils.js               # Helpers de sanitização (HTML/atributos)
├── marked.min.js           # Parser de Markdown (client-side)
├── data/
│   ├── content.json       # Manifesto da wiki (árvore de categorias/itens)
│   └── downloads.json     # Manifesto de downloads (lista flat)
├── content/                # Artigos em Markdown (não versionado neste repo)
└── downloads/               # Arquivos para download (não versionado neste repo)
```

## Rodando localmente

Requer [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
wrangler dev
```

Configurar o binding `VAULT_KV` (KV Namespace) e popular com um registro de teste:

```bash
wrangler kv:key put --binding=VAULT_KV "MEUTOKEN" '{"username":"MEUTOKEN","email":"teste@teste.com","date_created":"2026-01-01","expiration_date":"2027-01-01"}'
```

## Nota sobre este repositório

Este repositório é uma versão pública, para fins de portfólio. As pastas `content/` e `downloads/` (conteúdo pago do produto original) não fazem parte do que é publicado aqui — o sistema de autenticação e proxy, que é o foco técnico do projeto, funciona de forma idêntica com qualquer conteúdo.

## Autor

Guilherme Ribeiro
[LinkedIn](https://linkedin.com/in/gribeirodev) · [GitHub](https://github.com/liberstack)