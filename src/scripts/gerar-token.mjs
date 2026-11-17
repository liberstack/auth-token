// Skill Vault — gerador de tokens
//
// Uso:
//   node scripts/gerar-token.mjs "Nome do Aluno" aluno@email.com 365
//                                  (nome)          (e-mail)       (dias de validade)
//
// O que ele faz:
//   1. Sorteia um código de 8 caracteres com crypto.randomInt (aleatório de
//      verdade, sem viés). Math.random() NUNCA deve ser usado para segredos:
//      ele é previsível.
//   2. Monta o registro JSON no formato que o Worker espera.
//   3. Imprime o comando do Wrangler para gravar no KV (com o prefixo "token:").

import { randomInt } from "node:crypto";

// 32 caracteres: A-Z e 2-9, sem I, O, 0 e 1 (evitam confusão ao ditar/ler).
// 32^8 ≈ 1,1 trilhão de combinações. O Worker aceita A-Z e 0-9, então
// qualquer token deste alfabeto passa na validação.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAMANHO = 8;

const [, , nome = "Aluno", email = "aluno@exemplo.com", dias = "365"] =
  process.argv;

const diasNum = Number(dias);
if (!Number.isInteger(diasNum) || diasNum <= 0) {
  console.error("Os dias de validade precisam ser um número inteiro positivo.");
  process.exit(1);
}

const token = Array.from(
  { length: TAMANHO },
  () => ALFABETO[randomInt(ALFABETO.length)],
).join("");

const hoje = new Date();
const expira = new Date(hoje.getTime() + diasNum * 24 * 60 * 60 * 1000);

// "AAAA-MM-DD": o Worker interpreta como "válido até 23:59:59 desse dia
// (horário de Brasília)". Veja EXPIRATION_TZ no _worker.js.
const registro = {
  username: nome,
  email,
  date_created: hoje.toISOString().slice(0, 10),
  expiration_date: expira.toISOString().slice(0, 10),
};

const json = JSON.stringify(registro);

console.log(`\nToken:  ${token}`);
console.log(`Válido até: ${registro.expiration_date}\n`);
console.log("Registro (JSON):");
console.log(JSON.stringify(registro, null, 2));

console.log("\nGravar no KV de produção (bash/zsh):");
console.log(
  `wrangler kv key put --binding=VAULT_KV --remote "token:${token}" '${json}'`,
);

console.log("\nNo Windows (PowerShell/cmd) as aspas do JSON dão problema.");
console.log("Salve o JSON acima em um arquivo (ex.: token.json) e use:");
console.log(
  `wrangler kv key put --binding=VAULT_KV --remote "token:${token}" --path token.json\n`,
);
