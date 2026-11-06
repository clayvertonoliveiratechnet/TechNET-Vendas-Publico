(function () {
  'use strict';

  const TOOL_PREFIX = 'technet.vendas.';
  const MAX_VISIBLE_TEXT = 8000;
  const MAX_LOG_ITEMS = 80;
  const startedAt = Date.now();
  const consoleEvents = [];
  const networkEvents = [];

  function pushLimited(list, item) {
    list.push(item);
    if (list.length > MAX_LOG_ITEMS) list.splice(0, list.length - MAX_LOG_ITEMS);
  }

  function safeString(value, max = 1200) {
    let text = '';
    try {
      if (value instanceof Error) {
        text = value.stack || value.message || value.name || 'Error';
      } else if (typeof value === 'string') {
        text = value;
      } else {
        text = JSON.stringify(value);
      }
    } catch {
      try { text = String(value); } catch { text = '[unavailable]'; }
    }

    return String(text || '')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(token|apikey|api_key|password|passwd|secret|authorization)(["'=:\s]+)[^\s,"'&}]+/gi, '$1$2[REDACTED]')
      .slice(0, max);
  }

  function safeUrl(input) {
    try {
      const url = new URL(String(input), window.location.href);
      const safeParams = [];
      url.searchParams.forEach((value, key) => {
        if (/token|key|auth|password|secret|code|session|jwt/i.test(key)) {
          safeParams.push([key, '[REDACTED]']);
        } else if (safeParams.length < 8) {
          safeParams.push([key, safeString(value, 120)]);
        }
      });
      const query = safeParams.length
        ? '?' + safeParams.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
        : '';
      return url.origin + url.pathname + query;
    } catch {
      return safeString(input, 500);
    }
  }

  function captureConsole(level, args) {
    pushLimited(consoleEvents, {
      time: new Date().toISOString(),
      level,
      page: currentPage(),
      message: args.map((arg) => safeString(arg, 700)).join(' ').slice(0, 1500)
    });
  }

  function installErrorCapture() {
    if (window.__tvWebMcpDiagnosticsInstalled) return;
    window.__tvWebMcpDiagnosticsInstalled = true;

    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);

    console.error = (...args) => {
      captureConsole('error', args);
      originalError(...args);
    };

    console.warn = (...args) => {
      captureConsole('warn', args);
      originalWarn(...args);
    };

    window.addEventListener('error', (event) => {
      pushLimited(consoleEvents, {
        time: new Date().toISOString(),
        level: 'window-error',
        page: currentPage(),
        message: safeString(event.error || event.message || 'Erro JavaScript', 1500),
        source: safeUrl(event.filename || ''),
        line: event.lineno || null,
        column: event.colno || null
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      pushLimited(consoleEvents, {
        time: new Date().toISOString(),
        level: 'unhandled-rejection',
        page: currentPage(),
        message: safeString(event.reason || 'Promise rejeitada sem tratamento', 1500)
      });
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async function webMcpObservedFetch(input, init) {
      const method = String(init?.method || (input && input.method) || 'GET').toUpperCase();
      const url = safeUrl(typeof input === 'string' || input instanceof URL ? input : input?.url);
      const started = performance.now();

      try {
        const response = await originalFetch(input, init);
        const durationMs = Math.round(performance.now() - started);
        if (!response.ok) {
          pushLimited(networkEvents, {
            time: new Date().toISOString(),
            method,
            url,
            status: response.status,
            status_text: safeString(response.statusText, 120),
            duration_ms: durationMs,
            type: 'http'
          });
        }
        return response;
      } catch (error) {
        pushLimited(networkEvents, {
          time: new Date().toISOString(),
          method,
          url,
          status: null,
          status_text: '',
          duration_ms: Math.round(performance.now() - started),
          type: 'fetch-error',
          error: safeString(error, 800)
        });
        throw error;
      }
    };

    if (window.XMLHttpRequest?.prototype) {
      const proto = window.XMLHttpRequest.prototype;
      const originalOpen = proto.open;
      const originalSend = proto.send;

      proto.open = function observedOpen(method, url, ...rest) {
        this.__tvWebMcpMeta = {
          method: String(method || 'GET').toUpperCase(),
          url: safeUrl(url)
        };
        return originalOpen.call(this, method, url, ...rest);
      };

      proto.send = function observedSend(...args) {
        const started = performance.now();
        const xhr = this;
        const done = () => {
          if (xhr.status === 0 || xhr.status >= 400) {
            pushLimited(networkEvents, {
              time: new Date().toISOString(),
              method: xhr.__tvWebMcpMeta?.method || 'GET',
              url: xhr.__tvWebMcpMeta?.url || '',
              status: xhr.status || null,
              status_text: safeString(xhr.statusText, 120),
              duration_ms: Math.round(performance.now() - started),
              type: 'xhr'
            });
          }
        };
        xhr.addEventListener('loadend', done, { once: true });
        return originalSend.apply(this, args);
      };
    }
  }

  function getModelContext() {
    return document.modelContext || (window.navigator && window.navigator.modelContext) || null;
  }

  function visibleApp() {
    const app = document.getElementById('app');
    return !!app && !app.classList.contains('hidden');
  }

  function currentPage() {
    return document.querySelector('.nav-btn.active')?.dataset?.page
      || localStorage.getItem('tv_last_page')
      || (visibleApp() ? 'dashboard' : 'login');
  }

  function currentPeriod() {
    const select = document.getElementById('periodFilter');
    if (!select) return null;
    const option = select.options[select.selectedIndex];
    return {
      value: select.value,
      label: option?.textContent?.trim() || select.value
    };
  }

  function listSections() {
    return Array.from(document.querySelectorAll('.nav-btn[data-page]')).map((button) => ({
      page: button.dataset.page,
      label: (button.textContent || '').replace(/\s+/g, ' ').trim(),
      active: button.classList.contains('active'),
      disabled: !!button.disabled
    }));
  }

  function normalizeVisibleText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);

    clone.querySelectorAll(
      'script,style,input[type="password"],[aria-hidden="true"],.hidden'
    ).forEach((el) => el.remove());

    clone.querySelectorAll('input,textarea,select').forEach((el) => {
      const label = el.getAttribute('aria-label')
        || el.closest('label')?.querySelector('span,b,small')?.textContent
        || el.name
        || el.id
        || el.tagName.toLowerCase();
      const replacement = document.createElement('span');
      replacement.textContent = '[' + safeString(label, 120) + ']';
      el.replaceWith(replacement);
    });

    return (clone.innerText || clone.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_VISIBLE_TEXT);
  }

  function visibleControls() {
    return Array.from(document.querySelectorAll('button,select,input,textarea,a[href]'))
      .filter((el) => {
        if (el.closest('.hidden')) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .slice(0, 120)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.getAttribute('name') || null,
        type: el.getAttribute('type') || null,
        label: safeString(
          el.getAttribute('aria-label')
          || el.closest('label')?.textContent
          || el.textContent
          || el.getAttribute('placeholder')
          || '',
          180
        ).replace(/\s+/g, ' ').trim(),
        disabled: !!el.disabled
      }));
  }

  function currentState() {
    const content = document.getElementById('content');
    const active = document.activeElement;
    return {
      captured_at: new Date().toISOString(),
      uptime_ms: Date.now() - startedAt,
      online: navigator.onLine,
      visibility: document.visibilityState,
      authenticated_app_visible: visibleApp(),
      page: currentPage(),
      title: document.getElementById('pageTitle')?.textContent?.trim() || document.title,
      subtitle: document.getElementById('pageSubtitle')?.textContent?.trim() || '',
      period: currentPeriod(),
      content_busy: content?.getAttribute('aria-busy') === 'true',
      content_child_count: content?.childElementCount || 0,
      sidebar_open: document.querySelector('.sidebar')?.classList.contains('open') || false,
      active_element: active ? {
        tag: active.tagName?.toLowerCase() || null,
        id: active.id || null,
        role: active.getAttribute?.('role') || null
      } : null,
      sections: listSections(),
      recent_console_issue_count: consoleEvents.filter((e) => e.level !== 'info').length,
      recent_network_failure_count: networkEvents.length
    };
  }

  function dispatchChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSectionButton(page) {
    const safe = String(page || '').trim();
    return Array.from(document.querySelectorAll('.nav-btn[data-page]'))
      .find((button) => button.dataset.page === safe) || null;
  }

  function waitForPage(page, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const active = document.querySelector('.nav-btn.active')?.dataset?.page;
        const busy = document.getElementById('content')?.getAttribute('aria-busy') === 'true';
        if (active === page && !busy) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(active === page);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  async function register(tool) {
    const modelContext = getModelContext();
    if (!modelContext || typeof modelContext.registerTool !== 'function') return false;
    try {
      await modelContext.registerTool(tool);
      return true;
    } catch (error) {
      if (String(error?.name || '').includes('NotSupported')) return false;
      console.warn('[WebMCP] Falha ao registrar', tool.name, error);
      return false;
    }
  }

  function healthCheck() {
    const state = currentState();
    const checks = [
      {
        id: 'browser-online',
        ok: navigator.onLine,
        detail: navigator.onLine ? 'Navegador online.' : 'Navegador reporta modo offline.'
      },
      {
        id: 'main-content',
        ok: !!document.getElementById('content') || !visibleApp(),
        detail: document.getElementById('content') ? 'Área principal encontrada.' : 'Área principal não encontrada.'
      },
      {
        id: 'navigation',
        ok: !visibleApp() || listSections().length > 0,
        detail: visibleApp()
          ? listSections().length + ' módulo(s) disponível(is) no menu.'
          : 'Aplicação autenticada ainda não está visível.'
      },
      {
        id: 'loading-state',
        ok: !state.content_busy,
        detail: state.content_busy ? 'Conteúdo ainda marcado como carregando.' : 'Conteúdo não está preso em aria-busy.'
      },
      {
        id: 'runtime-errors',
        ok: consoleEvents.filter((e) => ['error', 'window-error', 'unhandled-rejection'].includes(e.level)).length === 0,
        detail: consoleEvents.filter((e) => ['error', 'window-error', 'unhandled-rejection'].includes(e.level)).length + ' erro(s) de runtime capturado(s).'
      },
      {
        id: 'network-failures',
        ok: networkEvents.length === 0,
        detail: networkEvents.length + ' falha(s) de rede capturada(s).'
      },
      {
        id: 'webmcp-api',
        ok: !!getModelContext() && typeof getModelContext()?.registerTool === 'function',
        detail: getModelContext() ? 'API WebMCP detectada.' : 'API WebMCP não detectada neste navegador.'
      }
    ];

    return {
      ok: checks.every((check) => check.ok),
      page: state.page,
      checks,
      latest_console_issues: consoleEvents.slice(-10),
      latest_network_failures: networkEvents.slice(-10)
    };
  }

  installErrorCapture();

  async function init() {
    const modelContext = getModelContext();
    if (!modelContext || typeof modelContext.registerTool !== 'function') {
      console.info('[WebMCP] API indisponível neste navegador.');
      return;
    }

    const tools = [
      {
        name: TOOL_PREFIX + 'get_current_view',
        title: 'Consultar tela atual',
        description: 'Retorna a tela atual do TechNET Vendas, período selecionado e um resumo seguro do conteúdo visível. Valores digitados em formulários não são retornados.',
        inputSchema: {
          type: 'object',
          properties: {
            include_visible_text: {
              type: 'boolean',
              description: 'Quando true, inclui o texto visível da área principal da tela.'
            }
          },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: true
        },
        execute: async ({ include_visible_text = true } = {}) => ({
          ...currentState(),
          visible_text: include_visible_text
            ? normalizeVisibleText(document.getElementById('content'))
            : undefined
        })
      },
      {
        name: TOOL_PREFIX + 'list_sections',
        title: 'Listar módulos disponíveis',
        description: 'Lista os módulos de navegação atualmente disponíveis para o usuário autenticado, respeitando as permissões exibidas pelo sistema.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: false
        },
        execute: async () => ({
          authenticated_app_visible: visibleApp(),
          sections: listSections()
        })
      },
      {
        name: TOOL_PREFIX + 'open_section',
        title: 'Abrir módulo',
        description: 'Abre um módulo do TechNET Vendas que já esteja disponível no menu do usuário atual.',
        inputSchema: {
          type: 'object',
          properties: {
            page: {
              type: 'string',
              description: 'Identificador exato do módulo retornado por list_sections.'
            }
          },
          required: ['page'],
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          consequentialHint: false,
          untrustedContentHint: false
        },
        execute: async ({ page }) => {
          if (!visibleApp()) throw new Error('É necessário entrar no TechNET Vendas antes de navegar.');
          const button = findSectionButton(page);
          if (!button) throw new Error('Módulo indisponível para o usuário atual.');
          button.click();
          await waitForPage(button.dataset.page);
          return {
            ok: true,
            page: currentPage(),
            title: document.getElementById('pageTitle')?.textContent?.trim() || ''
          };
        }
      },
      {
        name: TOOL_PREFIX + 'set_period',
        title: 'Alterar período',
        description: 'Altera o filtro de período da tela para uma das opções disponíveis no seletor do TechNET Vendas.',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'string',
              enum: ['7', '30', '90', '365'],
              description: 'Período em dias: 7, 30, 90 ou 365.'
            }
          },
          required: ['days'],
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          consequentialHint: false,
          untrustedContentHint: false
        },
        execute: async ({ days }) => {
          if (!visibleApp()) throw new Error('É necessário entrar no TechNET Vendas antes de alterar o período.');
          const select = document.getElementById('periodFilter');
          if (!select) throw new Error('Filtro de período não encontrado.');
          const exists = Array.from(select.options).some((option) => option.value === String(days));
          if (!exists) throw new Error('Período não disponível.');
          select.value = String(days);
          dispatchChange(select);
          await waitForPage(currentPage());
          return { ok: true, period: currentPeriod(), page: currentPage() };
        }
      },
      {
        name: TOOL_PREFIX + 'refresh_current_view',
        title: 'Atualizar tela atual',
        description: 'Atualiza os dados do módulo atualmente aberto usando o mesmo comando de atualização da interface.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          consequentialHint: false,
          untrustedContentHint: false
        },
        execute: async () => {
          if (!visibleApp()) throw new Error('É necessário entrar no TechNET Vendas antes de atualizar.');
          const button = document.getElementById('refreshBtn');
          if (!button) throw new Error('Comando de atualização não encontrado.');
          const page = currentPage();
          button.click();
          await waitForPage(page);
          return {
            ok: true,
            page: currentPage(),
            title: document.getElementById('pageTitle')?.textContent?.trim() || ''
          };
        }
      },
      {
        name: TOOL_PREFIX + 'get_console_errors',
        title: 'Consultar erros do navegador',
        description: 'Retorna erros, warnings e rejeições de Promise capturados desde que a página foi carregada. Segredos conhecidos são mascarados.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 80,
              description: 'Quantidade máxima de eventos recentes.'
            },
            errors_only: {
              type: 'boolean',
              description: 'Quando true, omite warnings e retorna apenas erros.'
            }
          },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: true
        },
        execute: async ({ limit = 30, errors_only = false } = {}) => {
          const filtered = errors_only
            ? consoleEvents.filter((event) => event.level !== 'warn')
            : consoleEvents;
          return {
            page: currentPage(),
            count: filtered.length,
            events: filtered.slice(-Math.max(1, Math.min(80, Number(limit) || 30)))
          };
        }
      },
      {
        name: TOOL_PREFIX + 'get_network_failures',
        title: 'Consultar falhas de rede',
        description: 'Retorna requisições Fetch/XHR que falharam ou responderam HTTP 4xx/5xx. Não captura headers, cookies nem corpos das requisições.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 80,
              description: 'Quantidade máxima de falhas recentes.'
            }
          },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: true
        },
        execute: async ({ limit = 30 } = {}) => ({
          page: currentPage(),
          count: networkEvents.length,
          failures: networkEvents.slice(-Math.max(1, Math.min(80, Number(limit) || 30)))
        })
      },
      {
        name: TOOL_PREFIX + 'get_current_state',
        title: 'Inspecionar estado da interface',
        description: 'Retorna estado técnico seguro da interface atual, módulos disponíveis e controles visíveis sem retornar os valores digitados nos campos.',
        inputSchema: {
          type: 'object',
          properties: {
            include_controls: {
              type: 'boolean',
              description: 'Quando true, inclui metadados dos controles visíveis, sem valores.'
            }
          },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: true
        },
        execute: async ({ include_controls = true } = {}) => ({
          ...currentState(),
          controls: include_controls ? visibleControls() : undefined
        })
      },
      {
        name: TOOL_PREFIX + 'run_health_check',
        title: 'Executar diagnóstico do sistema',
        description: 'Executa um diagnóstico local do TechNET Vendas verificando conectividade, navegação, estado de carregamento, erros de runtime, falhas de rede e disponibilidade do WebMCP.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          consequentialHint: false,
          untrustedContentHint: true
        },
        execute: async () => healthCheck()
      },
      {
        name: TOOL_PREFIX + 'clear_diagnostics',
        title: 'Limpar diagnóstico capturado',
        description: 'Limpa somente os erros e falhas de rede armazenados temporariamente pelo WebMCP nesta aba para permitir uma nova reprodução limpa.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          consequentialHint: false,
          untrustedContentHint: false
        },
        execute: async () => {
          consoleEvents.splice(0, consoleEvents.length);
          networkEvents.splice(0, networkEvents.length);
          return { ok: true, cleared_at: new Date().toISOString() };
        }
      }
    ];

    let registered = 0;
    for (const tool of tools) {
      if (await register(tool)) registered += 1;
    }
    console.info(`[WebMCP] ${registered}/${tools.length} ferramentas registradas.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
