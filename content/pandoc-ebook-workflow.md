# Pandoc eBook Workflow

Fluxo de trabalho para escrever um ebook inteiro em Markdown e compilar para EPUB (ou PDF) usando Pandoc, sem depender de editores de texto pesados ou ferramentas fechadas.

## Por que Markdown + Pandoc

Escrever em Markdown mantém o foco no texto, sem distração de formatação visual. O Pandoc entra no final do processo, convertendo esse texto simples em um EPUB com capítulos, sumário e metadados corretos.

Vantagens práticas:

- O conteúdo fica versionado em texto puro (funciona bem com Git).
- É possível gerar EPUB, PDF e até DOCX a partir do mesmo arquivo fonte.
- Edição rápida em qualquer editor, incluindo VSCode com extensões de preview.

## Estrutura de pastas recomendada

```
meu-ebook/
├── capitulos/
│   ├── 01-introducao.md
│   ├── 02-capitulo-um.md
│   └── 03-capitulo-dois.md
├── metadata.yaml
├── capa.png
└── build.sh
```

Cada capítulo em um arquivo separado facilita reorganizar a ordem do livro e revisar partes isoladas sem abrir um documento gigante.

## Metadados do EPUB

O `metadata.yaml` concentra as informações que vão para o arquivo final:

```yaml
title: "Título do Ebook"
author: "Nome do Autor"
language: pt-BR
cover-image: capa.png
```

## Comando de compilação

O Pandoc junta os capítulos na ordem em que são passados como argumento:

```bash
pandoc metadata.yaml capitulos/*.md \
  -o dist/ebook.epub \
  --epub-cover-image=capa.png \
  --toc \
  --toc-depth=2
```

A flag `--toc` gera o sumário automaticamente a partir dos títulos (`#`, `##`) de cada capítulo. Vale manter uma hierarquia consistente de headings em todos os arquivos para o sumário sair organizado.

## Script de build

Automatizar a compilação evita digitar o comando inteiro toda vez que um capítulo é revisado:

```bash
#!/bin/bash
mkdir -p dist
pandoc metadata.yaml capitulos/*.md \
  -o dist/ebook.epub \
  --epub-cover-image=capa.png \
  --toc --toc-depth=2

echo "Ebook gerado em dist/ebook.epub"
```

## Gerando PDF a partir do mesmo conteúdo

Trocando apenas a extensão de saída, o Pandoc usa um mecanismo diferente de renderização (normalmente LaTeX por trás):

```bash
pandoc metadata.yaml capitulos/*.md -o dist/ebook.pdf
```

Para PDFs com mais controle visual, vale customizar um template LaTeX próprio em vez de depender do padrão do Pandoc.

## Checagem antes de publicar

- Validar o EPUB em mais de um leitor (o comportamento de renderização varia entre apps).
- Conferir se as imagens referenciadas nos capítulos estão com caminho relativo correto.
- Revisar o sumário gerado — heading fora de hierarquia (pular de `#` direto para `###`) quebra a estrutura do índice.
