// ============================================================
// Skill Vault — Cloudflare Worker v2 (Pages, Advanced Mode)
// ============================================================
// Objetivo didático: autenticação simples por TOKEN.
//
// Fluxo, em 5 passos:
//   1. O cliente digita um código de acesso de 8 caracteres (A-Z, 0-9).
//   2. O Worker valida o FORMATO do código (nunca confie na entrada!).
//   3. O Worker procura "token:<CÓDIGO>" no KV. Se não existir → negado.
//   4. Se existir, confere a data de expiração.
//   5. Se tudo ok, entrega o manifesto; artigos e downloads passam
//      por PROXY (o arquivo real nunca é acessível direto).
//
// Formato do registro no KV (chave = "token:ABCD1234"):
//   {
//     "username": "Fulano",
//     "email": "fulano@email.com",
//     "date_created": "2026-01-01",
//     "expiration_date": "2027-01-01"          ← vale ATÉ o fim desse dia (UTC-3)
//     // ou "2027-01-01T23:59:59-03:00"        ← datetime completo, com fuso
//   }
//
// ------------------------------------------------------------
// NOVIDADES DA v2 (cada uma é uma aula):
//   • ALLOWLIST em vez de denylist: só é público o que está listado.
//     Todo o resto (inclusive /content/, /downloads/, /src/data/,
//     /_worker.js, /README.md...) responde 404.
//   • Normalização de path ANTES de qualquer checagem: decodifica
//     "%63ontent", colapsa "//content", rejeita "..", "\" e "%%".
//   • Token só por header "Authorization: Bearer" (não vai mais na URL).
//   • Datas de expiração sem ambiguidade de fuso.
//   • 401 para token ruim, 404 para rota inexistente, 405 para método errado.
//
// ⚠ PASSO OBRIGATÓRIO DE PRODUÇÃO (fora do código): crie uma regra de
//   Rate Limiting da Cloudflare para POST /api/auth (ex.: 10 req/min por IP).
//   Sem isso, um atacante pode tentar milhões de códigos.
// ============================================================

// ---------- Constantes ----------

// 8 caracteres, só maiúsculas e dígitos. O frontend já faz toUpperCase().
// 36^8 ≈ 2,8 trilhões de combinações (só dígitos seriam 10^8 = 100 milhões).
const TOKEN_REGEX = /^[A-Z0-9]{8}$/;

// NAMESPACE: tokens e logs vivem no mesmo KV, mas com prefixos diferentes.
// Sem isso, um atacante poderia "logar" usando a chave de um log como se
// fosse um token (ex.: "log:2026-11-17"). Prefixo + regex = duas travas.
const TOKEN_PREFIX = "token:";
const LOG_PREFIX = "log:";
const LOG_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

// Fuso usado quando expiration_date vem só como "AAAA-MM-DD".
// Brasil (Brasília) = -03:00. Mude se seus clientes estiverem em outro fuso.
const EXPIRATION_TZ = "-03:00";

// Token na query string (?token=...) vaza em histórico, logs e Referer.
// Deixe false. Só vire true temporariamente se ainda tiver um frontend
// antigo em produção.
const ALLOW_TOKEN_IN_QUERY = false;

// ALLOWLIST — arquivos estáticos que o navegador PODE pedir direto.
// Se não está aqui, não existe (404). Para publicar algo novo, adicione aqui.
const PUBLIC_EXACT = new Set(["/", "/index.html"]);
const PUBLIC_PREFIXES = [
  "/src/styles/",
  "/src/scripts/",
  "/src/assets/",
  "/src/pages/",
];

const DOWNLOAD_MIME = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  zip: "application/zip",
};

// ---------- Roteador principal ----------

export default {
  // ctx.waitUntil() deixa uma tarefa (ex.: gravar log) terminar
  // DEPOIS de a resposta já ter sido enviada ao usuário.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) Normaliza o caminho UMA vez e usa o resultado em tudo.
    //    Checar o path "cru" é a origem de quase todo bypass.
    const normalized = normalizePath(url.pathname);
    if (!normalized) {
      return new Response("Requisição inválida", { status: 400 });
    }
    const { clean, check } = normalized;

    // 2) API
    if (check.startsWith("/api/")) {
      return handleApi(request, env, ctx, url, check);
    }

    // 3) Estáticos: só GET/HEAD e só o que estiver na allowlist
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Método não permitido", { status: 405 });
    }
    if (!isPublicPath(check)) {
      return new Response("Não encontrado", { status: 404 });
    }

    return fetchStatic(env, request, clean);
  },
};

// ============================================
// NORMALIZAÇÃO E ALLOWLIST
// ============================================

// Devolve { clean, check } ou null se o caminho for suspeito.
//   clean = caminho decodificado, sem barras duplicadas (mantém maiúsculas;
//           é o que enviamos ao servidor de assets)
//   check = clean em minúsculas (é o que usamos para COMPARAR)
function normalizePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname); // "%63ontent" → "content"
  } catch {
    return null; // sequência % malformada
  }

  // "%" depois de decodificar = dupla codificação (%2563). Rejeitamos.
  // Barra invertida e byte nulo também não têm lugar numa URL legítima.
  if (
    decoded.includes("%") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    return null;
  }

  const clean = decoded.replace(/\/{2,}/g, "/"); // "//content" → "/content"

  // Segmentos "." e ".." (inclusive os que vieram de "..%2f") → rejeita.
  if (clean.split("/").some((seg) => seg === ".." || seg === ".")) {
    return null;
  }

  return { clean, check: clean.toLowerCase() };
}

function isPublicPath(check) {
  return (
    PUBLIC_EXACT.has(check) ||
    PUBLIC_PREFIXES.some((prefix) => check.startsWith(prefix))
  );
}

// Serve um estático público, preservando método e cabeçalhos
// (para o cache condicional If-None-Match continuar funcionando).
function fetchStatic(env, request, cleanPath) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = cleanPath;
  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}

// Busca INTERNA (artigos, downloads, manifestos). Não passa pela allowlist
// de propósito: quem decide o que sai é o manifesto + a validação do token.
function fetchAsset(env, request, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  assetUrl.search = "";
  return env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
}

// ============================================
// ROTAS DA API
// ============================================

function handleApi(request, env, ctx, url, check) {
  if (check === "/api/auth" && request.method === "POST") {
    return handleAuth(request, env, ctx);
  }
  if (check === "/api/validate" && request.method === "POST") {
    return handleValidate(request, env);
  }
  if (check === "/api/article" && request.method === "GET") {
    return handleArticle(request, env, ctx, url);
  }
  if (check === "/api/download" && request.method === "GET") {
    return handleDownload(request, env, ctx, url);
  }
  return jsonResponse({ error: "Rota não encontrada" }, 404);
}

// POST /api/auth — valida o token e devolve os manifestos
async function handleAuth(request, env, ctx) {
  try {
    const body = await readJson(request);
    const token = normalizeToken(body?.token);

    if (!token) {
      return jsonResponse({ error: "Token não fornecido" }, 400);
    }

    const result = await getValidUser(env, token);

    if (!result.valid) {
      // Não gravamos o token digitado no log (poderia ser a senha de alguém).
      logAccess(env, ctx, "unknown", "login_failed", request);
      return jsonResponse({ error: result.error }, 401);
    }

    logAccess(env, ctx, result.user.username, "login_success", request);

    const [content, downloads] = await Promise.all([
      loadManifest(env, request, "/src/data/content.json"),
      loadManifest(env, request, "/src/data/downloads.json"),
    ]);

    return jsonResponse({
      success: true,
      user: result.user.username,
      content,
      downloads,
    });
  } catch (error) {
    console.error("Erro no auth:", error);
    return jsonResponse({ error: "Erro no servidor" }, 500);
  }
}

// POST /api/validate — só confirma se o token ainda é válido
async function handleValidate(request, env) {
  try {
    const body = await readJson(request);
    const token = normalizeToken(body?.token);
    if (!token) return jsonResponse({ valid: false }, 401);

    const result = await getValidUser(env, token);
    return jsonResponse({ valid: result.valid }, result.valid ? 200 : 401);
  } catch {
    return jsonResponse({ valid: false }, 401);
  }
}

// GET /api/article?id=...  — proxy do Markdown (nunca exposto direto)
async function handleArticle(request, env, ctx, url) {
  const token = getTokenFromRequest(request, url);
  const articleId = url.searchParams.get("id");

  if (!token || !isValidId(articleId)) {
    return new Response("Parâmetros ausentes ou inválidos", { status: 400 });
  }

  const result = await getValidUser(env, token);
  if (!result.valid) {
    return new Response("Acesso negado — " + result.error, { status: 401 });
  }

  // ALLOWLIST (de novo!): o "id" do cliente só é usado para PROCURAR no
  // manifesto. O caminho do arquivo vem do manifesto, nunca do cliente.
  // Assim ninguém consegue pedir "../../algo-secreto".
  const manifest = await loadManifest(env, request, "/src/data/content.json");
  const item = findItemById(manifest, articleId);

  if (!item) {
    return new Response("Artigo não encontrado", { status: 404 });
  }

  logAccess(env, ctx, result.user.username, "view:" + item.arquivo, request);

  const assetResponse = await fetchAsset(
    env,
    request,
    "/content/" + item.arquivo,
  );
  if (!assetResponse.ok) {
    return new Response("Conteúdo não disponível no momento", { status: 502 });
  }

  return new Response(assetResponse.body, {
    status: 200,
    headers: secureHeaders({ "Content-Type": "text/markdown; charset=utf-8" }),
  });
}

// GET /api/download?id=...  — proxy de zip/pdf/epub
async function handleDownload(request, env, ctx, url) {
  const token = getTokenFromRequest(request, url);
  const fileId = url.searchParams.get("id");

  if (!token || !isValidId(fileId)) {
    return new Response("Parâmetros ausentes ou inválidos", { status: 400 });
  }

  const result = await getValidUser(env, token);
  if (!result.valid) {
    return new Response("Acesso negado — " + result.error, { status: 401 });
  }

  const manifest = await loadManifest(env, request, "/src/data/downloads.json");
  const item = findDownloadById(manifest, fileId);

  if (!item) {
    return new Response("Arquivo não encontrado", { status: 404 });
  }

  logAccess(
    env,
    ctx,
    result.user.username,
    "download:" + item.arquivo,
    request,
  );

  const assetResponse = await fetchAsset(
    env,
    request,
    "/downloads/" + item.arquivo,
  );
  if (!assetResponse.ok) {
    return new Response("Arquivo não disponível no momento", { status: 502 });
  }

  return new Response(assetResponse.body, {
    status: 200,
    headers: secureHeaders({
      "Content-Type": DOWNLOAD_MIME[item.tipo] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${item.arquivo}"`,
    }),
  });
}

// ============================================
// AUTENTICAÇÃO
// ============================================

async function getValidUser(env, token) {
  try {
    // TRAVA 1 — formato. Se não parece um token, nem consulta o KV.
    if (!TOKEN_REGEX.test(token)) {
      return { valid: false, error: "Token inválido" };
    }

    // TRAVA 2 — namespace. Só enxerga chaves "token:...".
    const raw = await env.VAULT_KV.get(TOKEN_PREFIX + token);
    if (!raw) return { valid: false, error: "Token inválido" };

    const user = JSON.parse(raw);

    // TRAVA 3 — formato do registro. Um valor qualquer do KV
    // (um array de logs, por exemplo) não pode virar "usuário".
    if (!user || typeof user.username !== "string") {
      return { valid: false, error: "Token inválido" };
    }

    // Expiração. FAIL-CLOSED: data inválida = acesso negado.
    // (Falhar "aberto" em autenticação é um erro clássico.)
    if (user.expiration_date) {
      const expiration = parseExpiration(user.expiration_date);

      if (!expiration) {
        console.error("expiration_date inválida no registro do token");
        return { valid: false, error: "Token inválido" };
      }
      if (Date.now() > expiration.getTime()) {
        // Trade-off: dizer "expirado" ajuda o cliente legítimo, mas
        // confirma que o token existiu. Discutam isso em aula!
        return { valid: false, error: "Token expirado" };
      }
    }

    return { valid: true, user };
  } catch (error) {
    console.error("Erro ao validar token:", error);
    return { valid: false, error: "Erro ao validar token" };
  }
}

// Interpreta expiration_date sem ambiguidade de fuso:
//   "2027-01-01"                → vale até 2027-01-01 23:59:59.999 (EXPIRATION_TZ)
//   "2027-01-01T23:59:59-03:00" → exatamente o instante informado
// Antes, "2027-01-01" virava meia-noite UTC e o token morria às 21h do
// dia anterior no Brasil. Devolve null se a data for inválida.
function parseExpiration(value) {
  if (typeof value !== "string") return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(
    dateOnly ? `${value}T23:59:59.999${EXPIRATION_TZ}` : value,
  );

  return isNaN(date.getTime()) ? null : date;
}

// Lê o token do header "Authorization: Bearer XXXX".
// O header não aparece em histórico, nem em logs de URL, nem no Referer.
function getTokenFromRequest(request, url) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const fromQuery = ALLOW_TOKEN_IN_QUERY ? url.searchParams.get("token") : "";
  return normalizeToken(bearer || fromQuery);
}

function normalizeToken(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

// ============================================
// MANIFESTOS E BUSCA
// ============================================

async function loadManifest(env, request, pathname) {
  try {
    const res = await fetchAsset(env, request, pathname);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Erro ao carregar " + pathname + ":", e);
    return [];
  }
}

// Wiki: árvore [{ categoria, itens: [{ id, titulo, arquivo, desc }] }]
function findItemById(manifest, id) {
  for (const categoria of manifest) {
    const found = (categoria.itens || []).find(
      (i) => i.id === id && isSafeFilename(i.arquivo),
    );
    if (found) return found;
  }
  return null;
}

// Downloads: lista flat [{ id, titulo, arquivo, desc, tipo }]
function findDownloadById(manifest, id) {
  return manifest.find((i) => i.id === id && isSafeFilename(i.arquivo)) || null;
}

// Defesa em profundidade: mesmo vindo do manifesto (confiável),
// só aceitamos nomes simples — sem "/", sem "..".
function isSafeFilename(name) {
  return (
    typeof name === "string" &&
    /^[\w][\w.\-]*$/.test(name) &&
    !name.includes("..")
  );
}

function isValidId(id) {
  return typeof id === "string" && /^[\w\-]{1,100}$/.test(id);
}

// ============================================
// LOGS
// ============================================

// Uma chave por evento: "log:2026-11-17:<timestamp>:<uuid>".
// Reescrever UMA chave por dia (lê → adiciona → grava) perdia registros em
// acessos simultâneos e esbarrava no limite de ~1 escrita/segundo por chave.
// Para listar: env.VAULT_KV.list({ prefix: "log:2026-11-17" }).
//
// ATENÇÃO (LGPD): IP é dado pessoal. Informe isso na página de
// privacidade e mantenha o TTL curto.
function logAccess(env, ctx, user, action, request) {
  // waitUntil: grava depois de responder, sem deixar o usuário esperando.
  ctx.waitUntil(writeLog(env, user, action, request));
}

async function writeLog(env, user, action, request) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = new Date().toISOString();
    const key = `${LOG_PREFIX}${now.slice(0, 10)}:${now}:${crypto.randomUUID()}`;

    await env.VAULT_KV.put(
      key,
      JSON.stringify({ timestamp: now, user, action, ip }),
      { expirationTtl: LOG_TTL_SECONDS },
    );
  } catch (error) {
    console.error("Erro ao registrar log:", error);
  }
}

// ============================================
// RESPOSTAS E UTILITÁRIOS
// ============================================

// Sem CORS de propósito: frontend e API estão na MESMA origem, então o
// navegador não precisa de cabeçalhos CORS. "Access-Control-Allow-Origin: *"
// só abriria a API para qualquer site. Só adicione CORS se um dia o
// frontend ficar em outro domínio (e então liste esse domínio, não "*").
function secureHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: secureHeaders({ "Content-Type": "application/json" }),
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
