# TypeScript Formulary Boilerplate

Formulário de contato tipado em TypeScript, sem framework, pensado para ser colado em qualquer landing page estática e funcionar com um endpoint simples de envio (Cloudflare Worker, função serverless ou webhook de WhatsApp).

## Por que tipar um formulário simples

Um formulário de contato parece trivial, mas acumula bugs bobos com o tempo: campo que muda de nome, validação que esquece um caso, payload que não bate com o que o backend espera. Tipar os dados do formulário elimina essa categoria inteira de erro em tempo de compilação, antes mesmo de rodar no navegador.

## Estrutura do tipo

```typescript
interface ContactFormData {
  nome: string;
  email: string;
  telefone?: string;
  mensagem: string;
}

type FormErrors = Partial<Record<keyof ContactFormData, string>>;
```

O `Partial<Record<...>>` garante que os erros só existem para campos que realmente pertencem ao formulário — se um campo for renomeado na interface, o TypeScript aponta todo lugar que precisa ser ajustado.

## Validação

```typescript
function validarFormulario(data: ContactFormData): FormErrors {
  const erros: FormErrors = {};

  if (!data.nome.trim()) {
    erros.nome = "Nome é obrigatório";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    erros.email = "E-mail inválido";
  }

  if (!data.mensagem.trim() || data.mensagem.length < 10) {
    erros.mensagem = "Mensagem muito curta";
  }

  return erros;
}
```

Função pura, sem efeito colateral, fácil de testar isoladamente sem precisar simular o DOM.

## Captura dos dados do DOM

```typescript
function coletarDados(form: HTMLFormElement): ContactFormData {
  const formData = new FormData(form);

  return {
    nome: String(formData.get("nome") ?? ""),
    email: String(formData.get("email") ?? ""),
    telefone: formData.get("telefone")
      ? String(formData.get("telefone"))
      : undefined,
    mensagem: String(formData.get("mensagem") ?? ""),
  };
}
```

Usar `FormData` em vez de pegar cada `input` manualmente evita repetir `document.getElementById` para cada campo e simplifica adicionar novos campos no futuro.

## Envio

```typescript
async function enviarFormulario(data: ContactFormData): Promise<boolean> {
  try {
    const response = await fetch("/api/contato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    return response.ok;
  } catch {
    return false;
  }
}
```

## Orquestração no submit

```typescript
const form = document.querySelector<HTMLFormElement>("#form-contato");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const dados = coletarDados(form);
  const erros = validarFormulario(dados);

  if (Object.keys(erros).length > 0) {
    exibirErros(erros);
    return;
  }

  const sucesso = await enviarFormulario(dados);
  exibirResultado(sucesso);
});
```

## Compilando sem build step

Para projetos que seguem a filosofia sem bundler, o TypeScript pode ser compilado direto para um `.js` estático:

```bash
tsc formulario.ts --target ES2020 --module none --outFile formulario.js
```

O resultado é um arquivo JavaScript puro, sem `import`/`export`, pronto para ser incluído com uma tag `<script>` comum — o TypeScript vira apenas uma ferramenta de desenvolvimento, sem entrar na esteira de produção.

## Pontos de atenção

- Sempre validar de novo no backend — validação no frontend é experiência de uso, não segurança.
- Tratar o caso de rede indisponível (o `catch` do `fetch` cobre isso, mas vale dar feedback visual claro pro usuário).
- Se o formulário crescer, considerar extrair a validação de cada campo em funções pequenas e nomeadas, em vez de um bloco só.
