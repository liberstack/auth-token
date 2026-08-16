// Skill Vault — app.js
// Orquestrador: autenticação, sidebar da wiki, render de artigos em Markdown
// e lista de downloads (zip/pdf/epub)

let authUser = null;
let contentTree = []; // [{ categoria, itens: [{ id, titulo, desc, arquivo }] }]
let downloadsList = []; // [{ id, titulo, desc, arquivo, tipo }]
let activeItemId = null;

// ============================================
// AUTENTICAÇÃO
// ============================================

async function verificar() {
  const input = document.getElementById("senha");
  const username = input.value.trim().toUpperCase();
  const erro = document.getElementById("erro");
  const btn = document.querySelector('button[onclick="verificar()"]');

  if (!username) {
    showError(erro, "Por favor, digite seu código de acesso.");
    return;
  }

  input.disabled = true;
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      authUser = username;
      contentTree = data.content || [];
      downloadsList = data.downloads || [];

      document.getElementById("login").style.display = "none";
      document.getElementById("curso").style.display = "block";
      erro.style.display = "none";

      renderSidebar();
      renderDownloads();
    } else {
      showError(erro, data.error || "Código de acesso inválido ou expirado.");
      resetBtn(input, btn);
    }
  } catch (err) {
    console.error("Erro na autenticação:", err);
    showError(erro, "Erro ao conectar com o servidor. Tente novamente.");
    resetBtn(input, btn);
  }
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

  const html = contentTree
    .map((categoria) => {
      const itens = (categoria.itens || [])
        .map(
          (item) => `
        <li>
          <button
            class="wiki-item"
            data-id="${sanitizeAttr(item.id)}"
            onclick="abrirArtigo('${sanitizeAttr(item.id)}')"
          >
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

  sidebar.innerHTML = html;
}

// ============================================
// ABRIR ARTIGO — BUSCA MARKDOWN E RENDERIZA
// ============================================

async function abrirArtigo(itemId) {
  if (!authUser) return;

  const placeholder = document.getElementById("wiki-placeholder");
  const articleEl = document.getElementById("article-content");

  placeholder.style.display = "none";
  articleEl.style.display = "block";
  articleEl.innerHTML = '<p class="loading">Carregando conteúdo…</p>';

  marcarItemAtivo(itemId);

  const url = `/api/article?id=${encodeURIComponent(itemId)}&token=${encodeURIComponent(authUser)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      articleEl.innerHTML =
        '<p class="empty-state">Não foi possível carregar este conteúdo.</p>';
      return;
    }

    const markdown = await response.text();
    articleEl.innerHTML = marked.parse(markdown);
    document
      .getElementById("wiki-article")
      .scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error("Erro ao carregar artigo:", err);
    articleEl.innerHTML =
      '<p class="empty-state">Erro ao carregar o conteúdo. Tente novamente.</p>';
  }
}

function marcarItemAtivo(itemId) {
  activeItemId = itemId;
  document.querySelectorAll(".wiki-item").forEach((btn) => {
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
      const url = `/api/download?id=${encodeURIComponent(item.id)}&token=${encodeURIComponent(authUser)}`;
      return `
        <li>
          <a
            class="wiki-item download-item"
            href="${sanitizeAttr(url)}"
            download
            title="${escapeHtml(item.desc || "")}"
          >
            <span class="wiki-item-icon">${icon}</span>
            <span class="wiki-item-label">${escapeHtml(item.titulo)}</span>
          </a>
        </li>
      `;
    })
    .join("");
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("senha");
  if (input) {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") verificar();
    });
    input.focus();
  }
});

// ============================================
// HELPERS INTERNOS
// ============================================

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}

function resetBtn(input, btn) {
  input.disabled = false;
  btn.disabled = false;
  btn.textContent = "Acessar →";
  input.focus();
}
