# Playwright E2E — TECHNET Vendas

O Playwright funciona como a camada automática de quality assurance do TECHNET Vendas. Toda a dependência E2E fica isolada em `e2e/`, sem ser adicionada ao frontend estático nem ao deploy do Firebase.

## Arquitetura atual

O TECHNET Vendas é uma SPA estática hospedada no Firebase Hosting. As telas internas não são URLs independentes: o arquivo `app-v48.js` controla a navegação por IDs internos e pela função `navigate()`.

Destinos internos reais encontrados no código:

- `dashboard`
- `map`
- `new-sale`
- `my-sales`
- `team`
- `backoffice`
- `imperium-products`
- `territories`
- `command`
- `goals`
- `health`
- `admin`

Por isso a suíte não inventa URLs como `/dashboard` ou `/vendas`. A proteção anônima é testada persistindo cada destino real em `tv_last_page` e confirmando que, sem sessão, a aplicação mantém o usuário no login e não renderiza a área autenticada.

## Instalação

Na raiz do repositório:

```bash
npm ci
npm --prefix e2e ci
npm run test:e2e:install
```

O primeiro `npm ci` valida o projeto raiz. O segundo instala somente as dependências de Playwright dentro de `e2e/`.

## Executar os testes

Execução padrão, headless:

```bash
npm run test:e2e
```

Com navegador visível:

```bash
npm run test:e2e:headed
```

Interface interativa do Playwright:

```bash
npm run test:e2e:ui
```

Abrir o último relatório HTML:

```bash
npm run test:e2e:report
```

## URL local e outra URL

Sem configuração adicional, o Playwright inicia o servidor estático `e2e/server.mjs` em:

```text
http://127.0.0.1:4173
```

Para testar uma URL já publicada, defina `PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_BASE_URL=https://technet-vendas-2026.web.app npm run test:e2e
```

PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://technet-vendas-2026.web.app"
npm run test:e2e
```

Quando `PLAYWRIGHT_BASE_URL` existe, o servidor local não é iniciado.

## Cobertura inicial

A suíte pública obrigatória valida:

- abertura e identidade visual da tela de login;
- campos reais de Base comercial, Usuário e Senha;
- associação semântica entre labels e controles;
- botão Entrar;
- mostrar/ocultar senha e atualização do `aria-label`;
- erro determinístico de credencial inválida, sem usar credenciais reais;
- proteção dos 12 destinos internos encontrados no código;
- ausência de `pageerror`;
- ausência de HTTP 500, 502, 503 e 504 na origem do TECHNET e no backend Supabase do sistema;
- aplicação sem tela em branco;
- ausência de overflow horizontal;
- controles essenciais acessíveis na viewport;
- execução em Desktop Chrome e em perfil mobile Pixel 7.

Falhas 5xx de origens externas que não fazem parte do TECHNET não derrubam o teste. O backend Supabase do TECHNET é tratado como origem crítica.

## Screenshots, vídeos e traces

A configuração usa:

- screenshot: somente em falha;
- vídeo: retido em falha;
- trace: gerado no primeiro retry;
- relatório HTML: `e2e/playwright-report/`;
- resultados e anexos: `e2e/test-results/`.

No CI há dois retries. Os artefatos de diagnóstico são enviados mesmo quando a execução falha.

## GitHub Actions

O workflow `.github/workflows/playwright.yml` roda em:

- pull request para `main`;
- push em `main`;
- execução manual por `workflow_dispatch`.

Sequência do quality gate:

1. checkout;
2. Node.js 22;
3. Python 3.12;
4. `npm ci` na raiz;
5. `npm --prefix e2e ci`;
6. testes existentes com `npm test`;
7. build gate do frontend estático com `npm run build`;
8. instalação do Chromium;
9. Playwright E2E;
10. upload de relatório, screenshots, vídeos e traces.

O workflow de deploy existente (`firebase-deploy.yml`) não é alterado.

Como o projeto é estático e não possui bundler/transpilação, `npm run build` executa o conjunto de syntax checks que determina se os arquivos servidos diretamente pelo Firebase estão prontos para publicação.

## Autenticação E2E futura

Nenhuma credencial real é versionada.

A suíte `authenticated.spec.ts` é ativada automaticamente quando estes GitHub Actions Secrets existirem:

- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`

Apesar do nome do secret manter o padrão solicitado, `PLAYWRIGHT_TEST_EMAIL` é preenchido no campo real `Usuário` do Imperium.

Opcionalmente, configure a variável de repositório:

- `PLAYWRIGHT_TEST_BASE`: `natal`, `fortaleza`, `mossoro` ou `recife`.

Sem os dois secrets, somente a suíte autenticada é marcada como skipped; login público, auth guard, health e responsividade continuam sendo quality gate obrigatório.

Quando os secrets estiverem disponíveis, o teste autenticado entra no sistema, descobre os itens de navegação liberados para aquele perfil e visita cada página permitida, verificando tela quebrada, erro de renderização, overflow, `pageerror` e HTTP 5xx crítico.

## Segurança de deploy

O `firebase.json` ignora `e2e/**` e `docs/**`. Isso impede que código de teste, relatórios ou documentação interna de QA sejam publicados junto com o site.
