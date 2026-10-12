// Ponto de entrada da interface do ADM: sessão, segundo fator e rotas.
import { h } from './util.js';
import * as api from './api.js';
import { carregando, alerta, telaLogin, telaCodigo, telaCadastroTotp, telaNegado, telaPainel, telaEvento, telaPessoas } from './telas.js';

const raiz = document.getElementById('app');
// fase: 'login' | 'codigo' | 'cadastro-totp' | 'negado' | 'pronto'
const estado = { fase: 'login' };
let geracao = 0;
let ocioso = null;
const LIMITE_OCIOSO_MS = 20 * 60 * 1000;   // sai sozinho após 20 min sem uso

const ctx = {
  estado,
  abertos: new Set(),
  navegar(hash) { if (location.hash === hash) rotear(); else location.hash = hash; },
  recarregar: () => rotear(),
  toast(texto, tipo = 'ok') {
    const el = h('div', { class: `toast toast-${tipo}`, role: 'status' }, texto);
    document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), 6000);
  },
  async avaliarAcesso() {
    const { data } = await api.cliente().auth.getSession();
    if (!data.session) estado.fase = 'login';
    else {
      const n = await api.nivelDeAcesso();
      if (n.currentLevel === 'aal2') estado.fase = (await api.souAdm()) ? 'pronto' : 'negado';
      else estado.fase = n.nextLevel === 'aal2' ? 'codigo' : 'cadastro-totp';
    }
    iniciarOcioso();
    await rotear();
  },
  async sair() { await api.sair(); await ctx.avaliarAcesso(); },
};

function iniciarOcioso() {
  clearTimeout(ocioso);
  if (estado.fase === 'login') return;
  ocioso = setTimeout(() => { ctx.toast('Sessão encerrada por inatividade.', 'info'); ctx.sair(); }, LIMITE_OCIOSO_MS);
}
['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, () => estado.fase !== 'login' && iniciarOcioso(), { passive: true }));

const ROTAS = {
  '': (p) => telaPainel(ctx, p),
  evento: (p) => telaEvento(ctx, p),
  pessoas: (p) => telaPessoas(ctx, p),
};

function cabecalho(rota) {
  const logado = estado.fase !== 'login';
  const link = (hash, texto, chave) => h('a', { href: hash, class: `nav-link${rota === chave ? ' ativo' : ''}`, 'aria-current': rota === chave ? 'page' : null }, texto);
  return h('header', { class: 'topo' },
    h('a', { href: '#/', class: 'marca', 'aria-label': 'Painel do ADM' }, h('img', { src: 'img/logo-pequeno.png', alt: 'Box, Box!', width: 130, height: 72 })),
    estado.fase === 'pronto'
      ? h('nav', { class: 'nav', 'aria-label': 'Principal' }, link('#/', 'Painel', ''), link('#/pessoas', 'Participantes e equipes', 'pessoas'))
      : h('span', {}),
    h('div', { class: 'conta' }, h('span', { class: 'selo-adm' }, 'ADM'),
      logado ? h('button', { class: 'botao botao-discreto', type: 'button', onclick: () => ctx.sair() }, 'Sair') : null));
}

async function rotear() {
  const minha = ++geracao;
  const [rota = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  const principal = h('main', { id: 'conteudo' }, carregando());
  raiz.replaceChildren(cabecalho(rota in ROTAS ? rota : ''), principal);
  try {
    let tela;
    if (estado.fase === 'login') tela = () => telaLogin(ctx);
    else if (estado.fase === 'codigo') tela = () => telaCodigo(ctx);
    else if (estado.fase === 'cadastro-totp') tela = () => telaCadastroTotp(ctx);
    else if (estado.fase === 'negado') tela = () => telaNegado(ctx);
    else tela = () => (ROTAS[rota] || ROTAS[''])({ id });
    const conteudo = await tela();
    if (minha !== geracao) return;
    principal.replaceChildren(conteudo);
    window.scrollTo(0, 0);
  } catch (e) {
    if (minha !== geracao) return;
    principal.replaceChildren(h('section', { class: 'pagina' }, alerta(`Não foi possível carregar: ${e.message}`),
      h('button', { class: 'botao', type: 'button', onclick: rotear }, 'Tentar novamente')));
  }
}

async function iniciar() {
  if (!api.configurado) {
    raiz.replaceChildren(h('main', { class: 'pagina' }, h('h1', {}, 'Configuração pendente'),
      alerta('Edite o arquivo js/config.js e informe a Project URL e a Publishable key do Supabase.', 'info')));
    return;
  }
  const sb = api.iniciar();
  await api.sincronizarRelogio();
  setInterval(() => api.sincronizarRelogio(), 5 * 60 * 1000);
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') setTimeout(() => ctx.avaliarAcesso(), 0);
  });
  window.addEventListener('hashchange', rotear);
  await ctx.avaliarAcesso();
}

iniciar();
