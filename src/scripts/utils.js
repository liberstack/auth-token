// Skill Vault — utils.js (v2)
// Helpers de segurança compartilhados pelo frontend.

// ============================================
// ESCAPE DE HTML
// ============================================
// Troca os 5 caracteres que "quebram" HTML por entidades.
// Serve para TEXTO e para atributos entre aspas:
//
//   el.innerHTML = `<span>${escapeHtml(titulo)}</span>`;
//   el.innerHTML = `<a title="${escapeHtml(desc)}">...</a>`;
//
// ⚠ NÃO serve para contexto de JavaScript (onclick="...", href="javascript:...").
// O navegador decodifica as entidades ANTES de executar o JS, então
// &#39; volta a ser ' e a injeção funciona. Por isso o app.js usa
// data-attributes + addEventListener em vez de onclick gerado por string.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================
// FORMATO DO TOKEN (mesma regra do Worker)
// ============================================
// Validar no cliente é só UX: evita uma requisição à toa.
// A validação que vale é a do servidor — o cliente pode ser burlado.

const TOKEN_REGEX = /^[A-Z0-9]{8}$/;

function isValidTokenFormat(token) {
  return TOKEN_REGEX.test(token);
}

// ============================================
// MARKDOWN → HTML SEGURO
// ============================================
// O marked NÃO sanitiza o HTML que gera. Se um .md contiver
// <img src=x onerror="..."> o código roda. Hoje o conteúdo é seu
// (confiável), mas se um dia vier de terceiros, é XSS.
//
// Para ativar a proteção, baixe o DOMPurify para src/scripts/purify.min.js
// e adicione no index.html, antes do app.js:
//   <script src="/src/scripts/purify.min.js"></script>
// Sem ele, caímos no HTML cru do marked (ok só para conteúdo confiável).

function renderMarkdown(markdown) {
  const html = marked.parse(markdown);
  return window.DOMPurify ? DOMPurify.sanitize(html) : html;
}
