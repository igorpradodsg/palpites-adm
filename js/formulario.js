// Construtor de formulários do ADM. Todo formulário inclui o campo "motivo",
// obrigatório, que vai para o registro público junto com a ação.
import { h } from './util.js';

const vazio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
let contador = 0;

function selectCom(opcoes, { vazioRotulo, valor } = {}) {
  const sel = h('select', { class: 'campo' });
  const povoar = (lista, atual) => {
    sel.replaceChildren(
      ...(vazioRotulo !== undefined ? [h('option', { value: '' }, vazioRotulo)] : []),
      ...lista.map((o) => h('option', { value: String(o.valor), selected: atual !== undefined && String(atual) === String(o.valor) }, o.rotulo)));
  };
  povoar(opcoes, valor);
  return { sel, povoar };
}

// Cinco seletores de concorrentes; impede repetição.
function top5() {
  const caixa = h('div', { class: 'top5' });
  let selects = [];
  const atualizar = () => {
    const usados = new Set(selects.map((s) => s.value).filter(Boolean));
    for (const s of selects) for (const o of s.options) o.disabled = o.value !== '' && usados.has(o.value) && o.value !== s.value;
  };
  const definir = (rotulos) => {
    selects = [0, 1, 2, 3, 4].map((n) => {
      const s = h('select', { class: 'campo', 'aria-label': `${n + 1}º lugar` },
        h('option', { value: '' }, `${n + 1}º lugar…`),
        rotulos.map((r) => h('option', { value: r }, r)));
      s.addEventListener('change', atualizar);
      return s;
    });
    caixa.replaceChildren(...selects);
  };
  definir([]);
  return { el: caixa, definir, ler: () => selects.map((s) => s.value) };
}

function criarCampo(c) {
  const id = `f${++contador}`;
  let el, ler, definirOpcoes = null;
  switch (c.tipo) {
    case 'numero': { el = h('input', { class: 'campo', type: 'number', id, min: c.min, max: c.max, step: 1, value: c.valor }); ler = () => (el.value === '' ? null : Number(el.value)); break; }
    case 'dt': { el = h('input', { class: 'campo', type: 'datetime-local', id }); ler = () => (el.value ? (el.value.length === 16 ? `${el.value}:00` : el.value) : null); break; }
    case 'area': { el = h('textarea', { class: 'campo', id, rows: 6, placeholder: c.placeholder }); ler = () => el.value.split('\n').map((l) => l.trim()).filter(Boolean); break; }
    case 'select': {
      const { sel, povoar } = selectCom(c.opcoes || [], { vazioRotulo: c.vazioRotulo ?? (c.obrigatorio ? 'Selecione…' : undefined), valor: c.valor });
      sel.id = id; el = sel; definirOpcoes = povoar;
      ler = () => (sel.value === '' ? null : (c.numerico ? Number(sel.value) : sel.value));
      break;
    }
    case 'top5': { const t = top5(); el = t.el; ler = t.ler; definirOpcoes = (lista) => t.definir(lista); break; }
    default: { el = h('input', { class: 'campo', type: c.tipo === 'email' ? 'email' : 'text', id, value: c.valor, placeholder: c.placeholder, autocomplete: 'off', maxlength: c.max }); ler = () => (el.value.trim() === '' ? null : el.value.trim()); }
  }
  const rotulo = h('label', { for: c.tipo === 'top5' ? null : id }, c.rotulo, c.obrigatorio ? ' *' : null);
  const bloco = h('div', { class: 'linha-campo' }, rotulo, el, c.ajuda ? h('small', { class: 'mudo' }, c.ajuda) : null);
  return { bloco, ler, el, definirOpcoes };
}

// cfg: { campos, botao, confirmar?, motivoExemplo?, enviar(valores) -> texto|undefined, perigoso? }
export function formulario(ctx, cfg) {
  const campos = (cfg.campos || []).map((c) => ({ c, ...criarCampo(c) }));
  const motivo = criarCampo({ nome: 'motivo', rotulo: 'Motivo (aparece no registro público)', tipo: 'texto', obrigatorio: true, placeholder: cfg.motivoExemplo || 'Ex.: solicitado pelo participante', max: 200 });
  const porNome = Object.fromEntries(campos.map((x) => [x.c.nome, x]));

  // campos que dependem de outro (ex.: concorrentes dependem da sessão escolhida)
  for (const x of campos.filter((k) => k.c.dependeDe)) {
    const origem = porNome[x.c.dependeDe];
    const aplicar = () => x.definirOpcoes(x.c.opcoesPor(origem.ler()) || []);
    origem.el.addEventListener('change', aplicar);
    aplicar();
  }

  const msg = h('div', { class: 'msg-form', role: 'alert' });
  const botao = h('button', { type: 'submit', class: `botao ${cfg.perigoso ? 'botao-acao' : 'botao-primario'}` }, cfg.botao);
  const form = h('form', { class: 'form-adm', novalidate: true },
    cfg.ajuda ? h('p', { class: 'mudo' }, cfg.ajuda) : null,
    campos.map((x) => x.bloco), motivo.bloco, h('div', { class: 'acoes' }, botao), msg);

  const erro = (t) => msg.replaceChildren(h('div', { class: 'alerta alerta-erro' }, t));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.replaceChildren();
    const valores = {};
    for (const x of campos) {
      const v = x.ler();
      if (x.c.obrigatorio && (vazio(v) || (x.c.tipo === 'top5' && v.some((s) => !s)))) return erro(`Preencha: ${x.c.rotulo}.`);
      valores[x.c.nome] = v;
    }
    if (cfg.validar) { const problema = cfg.validar(valores); if (problema) return erro(problema); }
    const m = motivo.ler();
    if (!m || m.length < 5) return erro('Informe o motivo (mínimo de 5 caracteres).');
    valores.motivo = m;
    if (cfg.confirmar && !window.confirm(typeof cfg.confirmar === 'function' ? cfg.confirmar(valores) : cfg.confirmar)) return;
    botao.disabled = true;
    try {
      const texto = await cfg.enviar(valores);
      ctx.toast(typeof texto === 'string' && texto ? texto : 'Ação registrada.', 'ok');
      await ctx.recarregar();
    } catch (err) { erro(err.message); botao.disabled = false; }
  });
  return form;
}

// Seção recolhível que lembra se estava aberta após recarregar os dados.
export function secao(ctx, titulo, ...conteudo) {
  const d = h('details', { class: 'secao', open: ctx.abertos.has(titulo) }, h('summary', {}, titulo), h('div', { class: 'secao-corpo' }, conteudo));
  d.addEventListener('toggle', () => { if (d.open) ctx.abertos.add(titulo); else ctx.abertos.delete(titulo); });
  return d;
}
