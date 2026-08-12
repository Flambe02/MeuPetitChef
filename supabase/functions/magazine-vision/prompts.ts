/**
 * The three prompts `magazine-vision` sends to the model, kept apart from the
 * handler that calls them.
 *
 * §35 of the brief asks for exactly this: prompts in their own versionable
 * files, never inline in a component (or, here, inline in the request-handling
 * code). Each one is reused verbatim by every call of its kind, so a wording
 * fix is one line, not a hunt through `index.ts`.
 *
 * A rule that repeats across all three, stated once here rather than three
 * times: **recipe content is never translated.** `MagazineRecipe.title`,
 * `.ingredients[].ingredient`, `.steps[].instruction` and friends stay in the
 * language the magazine printed them in — the Brazilian adaptation is a
 * separate, explicit pass (`adapt-recipe`), exactly as it is for a Cookomix or
 * Cookidoo import. Only the *admin-facing* fields — a classifier's `reasons` —
 * are pt-BR, because they are shown to a reviewer, never saved to a recipe.
 */

export const CLASSIFY_PAGE_PROMPT = `Você está olhando uma página de uma revista de culinária.

Diga que tipo de página é esta, escolhendo exatamente uma opção:

  cover           — a capa da revista
  advertisement   — publicidade, sem conteúdo editorial
  editorial       — carta da redação, texto de opinião, sem receita
  index           — sumário geral da revista
  recipe_index    — índice específico de receitas, com nomes de pratos e página
  article         — reportagem, dica, texto informativo — sem uma receita completa
  recipe          — traz pelo menos uma receita (ingredientes + modo de preparo)
  unknown         — nenhuma das anteriores descreve bem esta página

Uma página pode trazer MAIS DE UMA receita — ainda assim é "recipe". Uma
receita que começa aqui e claramente continua na próxima página (frase cortada,
"continua na página X", foto sem texto correspondente) também é "recipe".

NÃO INVENTE. Se a página for ambígua ou o texto estiver ilegível, devolva
"unknown" com confiança baixa, e não "recipe" ou "advertisement" só por
adivinhação.

Em "confidence" (de 0 a 1), diga o quanto você tem certeza — não uma
formalidade: uma página lida com clareza total merece perto de 1, uma página
borrada, cortada ou ambígua merece um valor bem mais baixo.

Em "reasons", escreva de 1 a 3 frases curtas EM PORTUGUÊS DO BRASIL explicando
sua decisão — isso é lido por um administrador revisando o processo, nunca vira
parte de uma receita. "Traz lista de ingredientes e modo de preparo com
porções." é uma boa razão; repetir a categoria escolhida não é.

Em "recipeTitles", se a página parecer trazer uma ou mais receitas, liste os
títulos exatamente como estão impressos — sem traduzir, sem corrigir grafia.
Lista vazia quando a página não é uma receita.`;

export const READ_INDEX_PROMPT = `Você está olhando uma ou mais páginas de sumário de uma revista de culinária —
o "índice de receitas" ou "sumário".

Extraia toda entrada que aponte para uma receita: o nome do prato e o número de
página impresso ao lado dele (não a posição da página no arquivo — o número que
está IMPRESSO na página, como "53").

NÃO liste:
  - editorial, expediente, assinatura, publicidade, seções de anúncio
  - cabeçalhos de seção sem nome de prato ("Entradas", "Sobremesas")
  - qualquer entrada sem um número de página junto

Os títulos são copiados EXATAMENTE como impressos — sem traduzir, sem corrigir
maiúsculas, sem completar uma palavra cortada. Se uma entrada não tiver um
número de página legível ao lado, ainda assim inclua-a com "folio": null, em vez
de inventar um número.

Se a página que você está olhando não for de fato um sumário de receitas,
devolva uma lista vazia — não force entradas que não existem.`;

/**
 * The one that matters most, and the one with the most to get wrong. Mirrors
 * §35's own wording closely — "do not invent", "preserve quantities exactly",
 * "if unreadable or absent, return null" — because that is the whole contract.
 */
export const EXTRACT_RECIPES_PROMPT = `Você está lendo uma ou mais páginas de uma revista de culinária, na ordem em
que aparecem no arquivo. Quando mais de uma página é enviada junta, é porque
uma receita pode atravessar as duas — trate-as como uma sequência contínua, não
como páginas independentes.

Identifique CADA receita completa ou parcial presente nessas páginas. Uma
página pode trazer mais de uma receita lado a lado — devolva uma entrada por
receita, na ordem em que aparecem. Ignore publicidade, navegação, cabeçalhos da
revista, números de página e texto editorial que não faça parte da receita.

REGRA ABSOLUTA — nunca invente:
  - Um ingrediente, uma quantidade, uma unidade, um tempo ou um passo que não
    está escrito não existe. Use null, não um valor plausível.
  - Não complete uma frase cortada, não deduza um passo a partir dos
    ingredientes, não estime uma quantidade a partir de "a gosto".
  - Uma receita incompleta e honesta vale mais que uma receita completa e
    inventada — quem vai cozinhar confia no que você devolveu.

NÃO TRADUZA NADA. Título, ingredientes, modo de preparo, dicas e notas ficam
EXATAMENTE no idioma impresso na página — francês continua francês, português
de Portugal continua português de Portugal. A adaptação para o português do
Brasil é uma etapa separada e explícita do aplicativo, e não é esta.

QUANTIDADES E UNIDADES: copie exatamente como impressas, sem converter (gramas
continuam gramas, não vire mililitros; "1 c. à soupe" continua "1 c. à soupe",
não vire "15 ml"). O campo "quantity" é só o número; a unidade vai em "unit".
Quando o texto só diz "a gosto", "sale q.b." ou equivalente: "quantity": null,
"unit": null, e a expressão inteira dentro de "preparation" ou do nome do
ingrediente.

CONTINUAÇÃO: marque "continuationBefore": true quando a receita claramente já
começou antes desta página (a lista de ingredientes está incompleta logo no
início, o título não está aqui, o texto começa no meio de uma frase). Marque
"continuationAfter": true quando ela claramente continua depois (frase cortada
no fim, uma frase do tipo "continua na página seguinte", falta o final óbvio do
preparo). Não marque nenhuma das duas por precaução — apenas quando houver um
sinal real no texto.

CONFIANÇA: em "confidence", diga sua certeza honesta para cada parte (0 a 1) —
"overall" no conjunto, "title" no título, "ingredients" na lista de
ingredientes, "steps" no modo de preparo. Letra pequena, mancha, glare ou um
trecho ambíguo pedem um valor mais baixo. Isso não é uma formalidade: esse
número decide se um humano vai revisar a receita antes dela ser aproveitada.

Se as páginas não trouxerem nenhuma receita, devolva uma lista vazia em
"recipes" — não force uma entrada que não existe.`;
