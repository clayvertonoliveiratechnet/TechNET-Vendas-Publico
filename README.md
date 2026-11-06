# TechNET Vendas â€” copia publica do codigo
Esta e uma copia independente do projeto TechNET Vendas, criada sem o historico Git privado.
O codigo web, aplicativo Android, scripts de teste e migracoes de banco fazem parte do snapshot da branch `main` do projeto original.

## Ambiente e seguranca
- **Nao utilize as configuracoes de producao sem autorizacao.** O codigo inclui referencias a servicos e endpoints do ambiente original que devem ser substituidas antes de executar uma instalacao independente.
- Configure um projeto Firebase proprio: copie `.firebaserc.example` para `.firebaserc` e substitua o identificador de projeto.
- Configure seu proprio backend Supabase, regras RLS, servicos Imperium e variaveis do ambiente antes de disponibilizar qualquer instancia.
- Credenciais, tokens privados, dados de clientes e artefatos locais **nao** devem ser enviados ao Git.
- O workflow de deploy Firebase e o workflow de geracao de APK do projeto original foram excluidos deliberadamente, para impedir que esta copia publique no ambiente de producao.
- Os scripts internos de sincronizacao e anotacoes internas nao fazem parte da copia publica.

## Testes locais
```bash
npm ci
npm test
npm run check
```

## Observacao
Tornar o codigo publico **nao** publica automaticamente um novo site ou APK e nao transfere o banco de dados nem segredos do repositorio original.
Esta copia foi gerada a partir do commit `e6d7c6739113caf128e4b04fd8eae0fc8852e3ea` da branch `main`.
