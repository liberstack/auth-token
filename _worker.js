// Cloudflare Worker - Skill Vault
// Token por cliente armazenado no KV
// KV value: JSON com username, email, passcode, date_created, expiration_date
//
// Acervo é uma WIKI em Markdown (pasta /content/) + uma lista de
// DOWNLOADS (pasta /downloads/) para zip/pdf/epub. O sistema de
// token/KV permanece idêntico para os dois.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ============================================
    // ENDPOINT: /api/auth
    // ============================================
    if (url.pathname === "/api/auth" && request.method === "POST") {
      try {
        const { username } = await request.json();

        if (!username) {
          return jsonResponse({ error: "Token não fornecido" }, 400);
        }

        const result = await getValidUser(env, username);

        if (!result.valid) {
          await logAccess(env, "unknown", "login_failed", request);
          return jsonResponse({ error: result.error }, 401);
        }

        await logAccess(env, result.user.username, "login_success", request);

        const content = await loadManifest(env, request);
        const downloads = await loadDownloadsManifest(env, request);

        return jsonResponse({
          success: true,
          user: username,
          content,
          downloads,
        });
      } catch (error) {
        console.error("Erro no auth:", error);
        return jsonResponse({ error: "Erro no servidor" }, 500);
      }
    }

    // ============================================
    // ENDPOINT: /api/validate
    // ============================================
    if (url.pathname === "/api/validate" && request.method === "POST") {
      try {
        const { username } = await request.json();
        if (!username) return jsonResponse({ valid: false }, 401);
        const result = await getValidUser(env, username);
        return result.valid
          ? jsonResponse({ valid: true })
          : jsonResponse({ valid: false }, 401);
      } catch (error) {
        return jsonResponse({ valid: false }, 401);
      }
    }

    // ============================================
    // ENDPOINT: /api/article (proxy — markdown nunca exposto direto)
    // ============================================
    if (url.pathname === "/api/article" && request.method === "GET") {
      const token = url.searchParams.get("token");
      const articleId = url.searchParams.get("id");

      if (!token || !articleId) {
        return new Response("Parâmetros ausentes", { status: 400 });
      }

      const result = await getValidUser(env, token);
      if (!result.valid) {
        return new Response("Acesso negado — " + result.error, { status: 403 });
      }

      const manifest = await loadManifest(env, request);
      const item = findItemById(manifest, articleId);

      if (!item) {
        return new Response("Artigo não encontrado", { status: 404 });
      }

      await logAccess(
        env,
        result.user.username,
        "view:" + item.arquivo,
        request,
      );

      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/content/" + item.arquivo;
      assetUrl.search = "";

      const assetResponse = await env.ASSETS.fetch(
        new Request(assetUrl.toString(), { method: "GET" }),
      );

      if (!assetResponse.ok) {
        return new Response("Conteúdo não disponível no momento", {
          status: 502,
        });
      }

      const headers = new Headers();
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "no-store");

      return new Response(assetResponse.body, { status: 200, headers });
    }

    // ============================================
    // ENDPOINT: /api/download (proxy — zip/pdf/epub nunca expostos direto)
    // ============================================
    if (url.pathname === "/api/download" && request.method === "GET") {
      const token = url.searchParams.get("token");
      const fileId = url.searchParams.get("id");

      if (!token || !fileId) {
        return new Response("Parâmetros ausentes", { status: 400 });
      }

      const result = await getValidUser(env, token);
      if (!result.valid) {
        return new Response("Acesso negado — " + result.error, { status: 403 });
      }

      const manifest = await loadDownloadsManifest(env, request);
      const item = findDownloadById(manifest, fileId);

      if (!item) {
        return new Response("Arquivo não encontrado", { status: 404 });
      }

      await logAccess(
        env,
        result.user.username,
        "download:" + item.arquivo,
        request,
      );

      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/downloads/" + item.arquivo;
      assetUrl.search = "";

      const assetResponse = await env.ASSETS.fetch(
        new Request(assetUrl.toString(), { method: "GET" }),
      );

      if (!assetResponse.ok) {
        return new Response("Arquivo não disponível no momento", {
          status: 502,
        });
      }

      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      headers.set(
        "Content-Disposition",
        `attachment; filename="${item.arquivo}"`,
      );
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "no-store");

      return new Response(assetResponse.body, { status: 200, headers });
    }

    // Bloqueia acesso direto à pasta /content/ (markdown cru)
    if (url.pathname.startsWith("/content/")) {
      return new Response("Acesso negado", { status: 403 });
    }

    // Bloqueia acesso direto à pasta /downloads/ (zip/pdf/epub crus)
    if (url.pathname.startsWith("/downloads/")) {
      return new Response("Acesso negado", { status: 403 });
    }

    return env.ASSETS.fetch(request);
  },
};

// ============================================
// AUXILIARES
// ============================================

async function loadManifest(env, request) {
  try {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = "/data/content.json";
    assetUrl.search = "";
    const res = await env.ASSETS.fetch(
      new Request(assetUrl.toString(), { method: "GET" }),
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Erro ao carregar content.json:", e);
    return [];
  }
}

async function loadDownloadsManifest(env, request) {
  try {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = "/data/downloads.json";
    assetUrl.search = "";
    const res = await env.ASSETS.fetch(
      new Request(assetUrl.toString(), { method: "GET" }),
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Erro ao carregar downloads.json:", e);
    return [];
  }
}

// Manifesto da wiki é uma árvore: [{ categoria, itens: [{ id, titulo, arquivo, desc }] }]
function findItemById(manifest, id) {
  for (const categoria of manifest) {
    const itens = categoria.itens || [];
    const found = itens.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

// Manifesto de downloads é uma lista flat: [{ id, titulo, arquivo, desc, tipo }]
function findDownloadById(manifest, id) {
  return manifest.find((i) => i.id === id) || null;
}

async function getValidUser(env, token) {
  try {
    const raw = await env.VAULT_KV.get(token);
    if (!raw) return { valid: false, error: "Token inválido" };

    const user = JSON.parse(raw);

    if (user.expiration_date) {
      const now = new Date();
      const expiration = new Date(user.expiration_date);

      if (isNaN(expiration.getTime())) {
        console.error("expiration_date inválida para token:", token);
      } else if (now > expiration) {
        return { valid: false, error: "Token expirado" };
      }
    }

    return { valid: true, user };
  } catch (error) {
    return { valid: false, error: "Erro ao validar token" };
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

async function logAccess(env, user, action, request) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const logKey = "log:" + new Date().toISOString().split("T")[0];
    const existingLogs = await env.VAULT_KV.get(logKey);
    const logs = existingLogs ? JSON.parse(existingLogs) : [];
    logs.push({ timestamp: new Date().toISOString(), user, action, ip });
    await env.VAULT_KV.put(logKey, JSON.stringify(logs), {
      expirationTtl: 2592000,
    });
  } catch (error) {
    console.error("Erro ao registrar log:", error);
  }
}
