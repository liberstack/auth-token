// Skill Vault — app.js (v2)
// Orquestrador: login, sidebar da wiki, artigos em Markdown, downloads e logout.
//
// Onde fica o token? Só em memória (variável authToken). Recarregou a página,
// saiu da sessão. É o mais seguro e o mais simples; guardar em sessionStorage
// seria mais cômodo, mas qualquer XSS conseguiria ler o token. (Exercício
// para a turma: implementar isso usando /api/validate e discutir o risco.)

let authToken = null;
let contentTree = []; // [{ categoria, itens: [{ id, titulo, desc, arquivo }] }]
let downloadsList = []; // [{ id, titulo, desc, arquivo, tipo }]
let activeItemId = null;
let articleController = null; // AbortController do artigo em carregamento

const MSG_SESSION_EXPIRED = "Sessão expirada. Entre novamente.";

// O token vai no HEADER, não na URL: URL aparece em histórico do navegador,
// logs de servidor e no cabeçalho Referer. Header não.
function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

// ============================================
// AUTENTICAÇÃO
// ============================================

// Chamada pelo onclick do botão (index.html) — por isso é global.
async function verificar() {
  const input = document.getElementById("senha");
  const erro = document.getElementById("erro");
  const btn = document.querySelector("#login button");
  const token = input.value.trim().toUpperCase();

  if (!token) {
    showError(erro, "Por favor, digite seu código de acesso.");
    return;
  }

  // Validação no cliente = só UX (poupa uma requisição). Quem manda é o servidor.
  if (!isValidTokenFormat(token)) {
    showError(erro, "O código deve ter 8 caracteres (letras e números).");
    return;
  }

  hideError(erro);
  input.disabled = true;
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    // .catch: se vier algo que não é JSON (ex.: página de bloqueio), não quebra.
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      authToken = token;
      contentTree = data.content || [];
      downloadsList = data.downloads || [];

      input.value = ""; // não deixa o código "esquecido" no campo
      resetLoginForm({ focus: false });
      showApp();
      renderSidebar();
      renderDownloads();
      return;
    }

    if (response.status === 429) {
      showError(erro, "Muitas tentativas. Aguarde um pouco e tente de novo.");
    } else {
      showError(erro, data.error || "Código de acesso inválido ou expirado.");
    }
    resetLoginForm();
  } catch (err) {
    console.error("Erro na autenticação:", err);
    showError(erro, "Erro ao conectar com o servidor. Tente novamente.");
    resetLoginForm();
  }
}

// Logout é 100% do lado do cliente: o token é "stateless" (não existe
// sessão no servidor para encerrar). Ele continua válido até expirar;
// "sair" só faz este navegador esquecê-lo.
function logout(message = "") {
  if (articleController) articleController.abort();
  articleController = null;

  authToken = null;
  contentTree = [];
  downloadsList = [];
  activeItemId = null;

  document.getElementById("wiki-sidebar").innerHTML = "";
  document.getElementById("downloads-list").innerHTML = "";

  const articleEl = document.getElementById("article-content");
  articleEl.innerHTML = "";
  articleEl.style.display = "none";
  document.getElementById("wiki-placeholder").style.display = "";

  document.getElementById("curso").style.display = "none";
  document.getElementById("login").style.display = "";

  resetLoginForm();

  const erro = document.getElementById("erro");
  if (message) showError(erro, message);
  else hideError(erro);
}

// Qualquer 401/403 no meio do uso = token expirou (ou foi revogado).
function handleSessionExpired() {
  logout(MSG_SESSION_EXPIRED);
}

function showApp() {
  document.getElementById("login").style.display = "none";
  document.getElementById("curso").style.display = "block";
  ensureLogoutButton();
}

// O botão é criado por JS para você não precisar mexer no index.html.
// Estilize a classe .logout-btn no style.css (exemplo no final da resposta).
function ensureLogoutButton() {
  const topbar = document.querySelector(".wiki-topbar");
  if (!topbar || document.getElementById("btn-logout")) return;

  const btn = document.createElement("button");
  btn.id = "btn-logout";
  btn.type = "button";
  btn.className = "logout-btn";
  btn.textContent = "Sair";
  btn.addEventListener("click", () => logout());
  topbar.appendChild(btn);
}

// ============================================
// SIDEBAR — ÁRVORE DE CATEGORIAS/ITENS
// ============================================

function renderSidebar() {
  const sidebar = document.getElementById("wiki-sidebar");

  if (!contentTree.length) {
    sidebar.innerHTML =
      '<p class="empty-state">Nenhum conteúdo disponível no momento.</p>';
    return;
  }

  // Sem onclick aqui: o id vai em data-id e UM listener (no init) cuida de
  // todos os cliques. Mais seguro (nada de JS dentro de string HTML) e
  // mais eficiente (um listener em vez de um por botão).
  sidebar.innerHTML = contentTree
    .map((categoria) => {
      const itens = (categoria.itens || [])
        .map(
          (item) => `
        <li>
          <button type="button" class="wiki-item" data-id="${escapeHtml(item.id)}">
            <span class="wiki-item-icon">📄</span>
            <span class="wiki-item-label">${escapeHtml(item.titulo)}</span>
          </button>
        </li>
      `,
        )
        .join("");

      return `
        <div class="wiki-categoria">
          <div class="wiki-categoria-titulo">
            <span class="wiki-folder-icon">📁</span>${escapeHtml(categoria.categoria)}
          </div>
          <ul class="wiki-lista">${itens}</ul>
        </div>
      `;
    })
    .join("");
}

// ============================================
// ABRIR ARTIGO — BUSCA MARKDOWN E RENDERIZA
// ============================================

async function abrirArtigo(itemId) {
  if (!authToken) return;

  // Race condition: se o usuário clica em outro artigo antes do anterior
  // terminar, cancelamos o primeiro. Sem isso, a resposta mais lenta
  // poderia sobrescrever a mais nova.
  if (articleController) articleController.abort();
  articleController = new AbortController();
  const { signal } = articleController;

  const placeholder = document.getElementById("wiki-placeholder");
  const articleEl = document.getElementById("article-content");

  placeholder.style.display = "none";
  articleEl.style.display = "block";
  articleEl.innerHTML = '<p class="loading">Carregando conteúdo…</p>';

  marcarItemAtivo(itemId);

  try {
    const response = await fetch(
      `/api/article?id=${encodeURIComponent(itemId)}`,
      { headers: authHeaders(), signal },
    );

    if (response.status === 401 || response.status === 403) {
      handleSessionExpired();
      return;
    }

    if (!response.ok) {
      const msg =
        response.status === 404
          ? "Conteúdo não encontrado."
          : "Não foi possível carregar este conteúdo.";
      articleEl.innerHTML = `<p class="empty-state">${msg}</p>`;
      return;
    }

    const markdown = await response.text();
    articleEl.innerHTML = renderMarkdown(markdown);
    document
      .getElementById("wiki-article")
      .scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    if (err.name === "AbortError") return; // cancelado de propósito, não é erro
    console.error("Erro ao carregar artigo:", err);
    articleEl.innerHTML =
      '<p class="empty-state">Erro ao carregar o conteúdo. Tente novamente.</p>';
  }
}

function marcarItemAtivo(itemId) {
  activeItemId = itemId;
  document.querySelectorAll("#wiki-sidebar .wiki-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === itemId);
  });
}

// ============================================
// DOWNLOADS — LISTA ABAIXO DA WIKI (zip/pdf/epub)
// ============================================

const DOWNLOAD_ICONS = {
  zip: "💾",
  pdf: "📘",
  epub: "📚",
};

// Antes era <a href="/api/download?token=..."> (token na URL). Agora é um
// botão: o clique faz fetch com o token no header, recebe o arquivo como
// blob e dispara o download pelo navegador.
function renderDownloads() {
  const section = document.getElementById("downloads-section");
  const list = document.getElementById("downloads-list");

  if (!downloadsList.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  list.innerHTML = downloadsList
    .map((item) => {
      const icon = DOWNLOAD_ICONS[item.tipo] || "⬇️";
      return `
        <li>
          <button
            type="button"
            class="wiki-item download-item"
            data-id="${escapeHtml(item.id)}"
            title="${escapeHtml(item.desc || "")}"
          >
            <span class="wiki-item-icon">${icon}</span>
            <span class="wiki-item-label">${escapeHtml(item.titulo)}</span>
          </button>
        </li>
      `;
    })
    .join("");
}

async function baixarArquivo(fileId, btn) {
  if (!authToken || btn.disabled) return;

  const item = downloadsList.find((i) => i.id === fileId);
  if (!item) return;

  const label = btn.querySelector(".wiki-item-label");
  const originalText = label.textContent;
  let failed = false;

  btn.disabled = true;
  label.textContent = "Baixando…";

  try {
    const response = await fetch(
      `/api/download?id=${encodeURIComponent(fileId)}`,
      { headers: authHeaders() },
    );

    if (response.status === 401 || response.status === 403) {
      handleSessionExpired();
      return;
    }
    if (!response.ok) throw new Error("HTTP " + response.status);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = item.arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.error("Erro no download:", err);
    failed = true;
  } finally {
    btn.disabled = false;
    label.textContent = failed ? "Falha no download" : originalText;
    if (failed) setTimeout(() => (label.textContent = originalText), 3000);
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("senha");
  if (input) {
    // "keypress" está depreciado; "keydown" é o recomendado.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") verificar();
    });
    input.focus();
  }

  // EVENT DELEGATION: um listener no container pega o clique de qualquer
  // filho (inclusive os criados depois, via innerHTML). closest() sobe
  // do elemento clicado até achar o botão com data-id.
  document.getElementById("wiki-sidebar").addEventListener("click", (e) => {
    const btn = e.target.closest(".wiki-item[data-id]");
    if (btn) abrirArtigo(btn.dataset.id);
  });

  document.getElementById("downloads-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".download-item[data-id]");
    if (btn) baixarArquivo(btn.dataset.id, btn);
  });
});

// ============================================
// HELPERS INTERNOS
// ============================================

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}

function hideError(el) {
  el.style.display = "none";
}

function resetLoginForm({ focus = true } = {}) {
  const input = document.getElementById("senha");
  const btn = document.querySelector("#login button");
  input.disabled = false;
  btn.disabled = false;
  btn.textContent = "Acessar →";
  if (focus) input.focus();
}
