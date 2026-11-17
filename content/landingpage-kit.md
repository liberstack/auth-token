# JavaScript Frontend Boilerplate Kit

Um ponto de partida enxuto para projetos, sites institucionais, landing pages e SPAs — sem framework, sem build tool, sem dependências. Só HTML, CSS e JS puro, prontos pra deploy em qualquer host estático (GitHub Pages, Cloudflare Pages, Vercel, Netlify).

## Por que vanilla?

Pra sites institucionais, portfólios e landing pages, um framework costuma ser peso morto: bundler, node_modules, tempo de build, e uma camada de abstração que ninguém precisa pra renderizar uma página. Vanilla JS entrega:

- **Zero build step** — abre o `index.html` e já funciona
- **Deploy instantâneo** — sobe a pasta inteira em qualquer CDN estática
- **Carregamento rápido** — sem bundle de framework pra baixar antes do primeiro paint
- **Manutenção simples** — daqui a 2 anos o código ainda roda, sem quebrar por causa de dependência desatualizada

## Estrutura base

```
projeto/
├── index.html
├── style.css
├── app.js
├── assets/
│   ├── img/
│   └── fonts/ (ou Google Fonts via CDN)
└── README.md
```

Sem `package.json`, sem `node_modules` — a menos que o projeto precise de alguma lib pontual via CDN.

## HTML — esqueleto semântico

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nome do Projeto</title>
  <meta name="description" content="Descrição curta pra SEO">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header></header>
  <main></main>
  <footer></footer>

  <script src="app.js" defer></script>
</body>
</html>
```

Use `defer` no script pra garantir que o DOM já está pronto sem precisar de `DOMContentLoaded` em todo lugar.

## CSS — variáveis + mobile-first

Padrão que funciona bem pra landing pages e sites institucionais:

```css
:root {
  --bg: #0f172a;
  --text: #e5e7eb;
  --accent: #38bdf8;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
}
```

Comece mobile-first e suba com `min-width` nas media queries — evita sobrescrever regras desnecessariamente:

```css
@media (min-width: 768px)  { /* tablet */ }
@media (min-width: 1200px) { /* desktop grande */ }
```

## JS — interações sem framework

Pra SPA leve (poucas rotas, sem necessidade de roteamento completo), um padrão simples de classes com ciclo de vida resolve bem:

```js
class Page {
  constructor(root) {
    this.root = root;
  }
  render() {
    // monta o HTML da página
  }
  mount() {
    // liga eventos, roda depois do render
  }
  unmount() {
    // limpa listeners antes de trocar de página
  }
}
```

Isso evita memory leak de listener acumulado quando o usuário navega entre seções sem dar reload — cada página desmonta antes da próxima montar.

Para navegação sem reload, `history.pushState` + `popstate` substitui um router completo:

```js
function navigate(path) {
  history.pushState({}, "", path);
  renderRoute(path);
}

window.addEventListener("popstate", () => renderRoute(location.pathname));
```

## Formulários de contato sem backend

Pra landing page que só precisa de um formulário de contato, dois caminhos sem servidor próprio:

- **mailto:** simples, mas abre o cliente de e-mail do usuário (fricção)
- **Serviço de formulário estático** (Formspree, Web3Forms, etc.) — POST direto do JS, sem manter backend

```js
async function enviarForm(dados) {
  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return res.ok;
}
```

## Checklist antes de publicar

- [ ] `meta description` e `meta viewport` preenchidos
- [ ] Imagens com `alt` e otimizadas (WebP quando possível)
- [ ] Testado em pelo menos 3 larguras: mobile (375px), tablet (768px), desktop (1440px)
- [ ] Sem `console.log` esquecido em produção
- [ ] Favicon configurado
- [ ] README com instruções de deploy

## Deploy rápido

GitHub Pages é o caminho mais direto pra esse tipo de projeto: sobe o repo, ativa Pages nas configurações apontando pra branch `main` (ou `gh-pages`), e o site já fica no ar em `usuario.github.io/repo`. Pra domínio próprio, basta configurar um `CNAME` na raiz do repositório.

Cloudflare Pages, Vercel e Netlify seguem o mesmo princípio — conectam direto no repositório e fazem deploy automático a cada push, sem passo de build quando o projeto é 100% vanilla.
