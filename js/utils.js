// Skill Vault — utils.js
// Helpers de sanitização usados pela wiki (sidebar + artigo)

// ============================================
// SANITIZA STRING PARA HTML ATTRIBUTE
// ============================================

function sanitizeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================
// ESCAPA TEXTO PARA INSERÇÃO SEGURA EM innerHTML
// ============================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
