# Full Auth System Boilerplate

Sistema de autenticação simples por token, usando Cloudflare Workers como backend e Cloudflare KV como armazenamento. Sem banco de dados relacional, sem bibliotecas de autenticação pesadas — só o necessário para proteger conteúdo por trás de um código de acesso.

## Arquitetura

O fluxo tem três peças:

1. **KV Namespace**: cada chave é um token (o "código de acesso" do usuário) e o valor é um JSON com os dados da conta.
2. **Worker**: expõe endpoints de autenticação e valida o token a cada requisição.
3. **Frontend**: envia o token digitado pelo usuário e guarda em memória (não em `localStorage`, para evitar persistência indevida em máquinas compartilhadas).

## Estrutura do registro no KV

Cada usuário é armazenado como um JSON simples:

```json
{
  "username": "CLIENTE123",
  "email": "cliente@email.com",
  "passcode": "CLIENTE123",
  "date_created": "2026-01-10T00:00:00.000Z",
  "expiration_date": "2027-01-10T00:00:00.000Z"
}
```

O campo `expiration_date` é opcional. Quando ausente, o acesso não expira. Quando presente, o Worker compara com a data atual antes de liberar qualquer conteúdo.

## Validação no Worker

A função central do sistema fica isolada em uma única função auxiliar, reaproveitada por todos os endpoints que precisam checar acesso:

```javascript
async function getValidUser(env, token) {
  const raw = await env.VAULT_KV.get(token);
  if (!raw) return { valid: false, error: "Token inválido" };

  const user = JSON.parse(raw);

  if (user.expiration_date) {
    const now = new Date();
    const expiration = new Date(user.expiration_date);
    if (now > expiration) {
      return { valid: false, error: "Token expirado" };
    }
  }

  return { valid: true, user };
}
```

Centralizar essa checagem evita duplicar a lógica de expiração em cada endpoint — qualquer rota nova que precise de autenticação só chama essa função.

## Endpoints típicos

- `POST /api/auth`: recebe o token, valida, retorna os dados liberados para aquele usuário.
- `POST /api/validate`: checagem rápida de sessão, sem retornar conteúdo (útil para revalidar em segundo plano).
- Endpoints de conteúdo protegido: sempre recebem o token junto da requisição e nunca expõem o recurso bruto diretamente (arquivos ficam numa pasta bloqueada por regra explícita no Worker, e só são servidos através de um endpoint proxy).

## Por que não usar JWT aqui

Para esse tipo de caso — acesso por código único, sem múltiplos usuários com papéis diferentes, sem necessidade de refresh token — um JWT adiciona complexidade sem benefício real. O token opaco validado contra o KV é mais simples de revogar (basta apagar a chave) e mais fácil de dar expiração manual (editar o campo `expiration_date`).

## Gerando novos acessos

Criar um novo cliente é apenas um `PUT` no namespace do KV com a chave sendo o token desejado. Dá pra fazer isso via `wrangler kv:key put`, painel do Cloudflare, ou um script simples em Python usando a API do Cloudflare.

## Pontos de atenção

- Sempre validar o token no backend, nunca confiar em checagem só no frontend.
- Nunca expor a pasta de conteúdo bruto sem passar pelo endpoint de autenticação.
- Registrar tentativas de acesso (log de sucesso e falha) ajuda a identificar tokens vazados ou uso indevido.
