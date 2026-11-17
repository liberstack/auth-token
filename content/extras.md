# Extras 

Espaço reservado para conteúdo bônus que não se encaixa nas outras categorias da wiki: recomendações de ferramentas, atalhos de produtividade e referências rápidas.

## Ferramentas do dia a dia

Uma seleção enxuta, sem excesso — cada item aqui já provou valor em projeto real, não é lista de "experimenta um dia":

- **VSCode** com as extensões mínimas: formatter do próprio Prettier, GitLens para histórico de commits, e nada além disso. Extensão demais deixa o editor lento sem ganho proporcional.
- **Wrangler CLI** para desenvolver e publicar Cloudflare Workers direto do terminal, sem depender do painel web.
- **HTTPie** ou `curl` mesmo, para testar endpoints de API sem abrir uma ferramenta gráfica pesada.

## Atalhos de terminal que economizam tempo

```bash
# Ver diferenças de um commit específico
git show <hash>

# Reverter um arquivo para o último commit sem perder os outros
git checkout -- caminho/do/arquivo

# Buscar um trecho de texto em todos os arquivos do projeto
grep -r "termo de busca" . --include="*.js"
```

## Referência rápida — status HTTP mais usados

| Código | Significado                       |
|--------|------------------------------------|
| 200    | Sucesso                            |
| 201    | Criado com sucesso                 |
| 400    | Requisição malformada              |
| 401    | Não autenticado                    |
| 403    | Autenticado, mas sem permissão     |
| 404    | Recurso não encontrado             |
| 500    | Erro interno do servidor           |
| 502    | Servidor upstream falhou           |

## Checklist antes de publicar um projeto

- Testar o site com JavaScript desabilitado, para ver o que ainda funciona.
- Rodar o Lighthouse do Chrome DevTools e conferir performance, acessibilidade e SEO.
- Verificar se todas as imagens têm `alt` descritivo.
- Confirmar que links externos abrem em nova aba quando faz sentido (`target="_blank"` com `rel="noopener"`).
- Testar o formulário de contato de ponta a ponta, incluindo o caso de erro de rede.

Este espaço vai crescer conforme surgirem novos achados que valham a pena registrar.
