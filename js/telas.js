// Telas do ADM. Nenhuma decide permissões: tudo passa pelas funções do banco.
import { h, fmtCurto, fmtBR } from './util.js';
import * as api from './api.js';
import { estadoSessao, ROTULO_ESTADO } from './logica.js';
import { formulario, secao } from './formulario.js';

const collator = new Intl.Collator('pt-BR');
const ARQUIVO_SEGURO = /^[\w.\-]+$/;
export const carregando = () => h('p', { class: 'aviso', role: 'status' }, 'Carregando…');
export const alerta = (msg, tipo = 'erro') => h('div', { class: `alerta alerta-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, msg);
const chip = (estado) => h('span', { class: `chip chip-${estado}` }, ROTULO_ESTADO[estado] || estado);

const TIPOS = [
  { valor: 'classificacao', rotulo: 'Classificação (3 pts)' },
  { valor: 'classificacao_sprint', rotulo: 'Classificação Sprint (2 pts)' },
  { valor: 'corrida_sprint', rotulo: 'Corrida Sprint (2 pts)' },
  { valor: 'corrida', rotulo: 'Corrida / GP (3 pts)' },
];

// ---------- acesso: login, segundo fator, não autorizado ----------
export function telaLogin(ctx) {
  const msg = h('div', { role: 'alert' });
  const email = h('input', { class: 'campo', type: 'email', id: 'email', autocomplete: 'username', required: true });
  const senha = h('input', { class: 'campo', type: 'password', id: 'senha', autocomplete: 'current-password', required: true });
  const botao = h('button', { class: 'botao botao-primario', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'form-simples', novalidate: true },
    h('div', { class: 'linha-campo' }, h('label', { for: 'email' }, 'E-mail da conta de ADM'), email),
    h('div', { class: 'linha-campo' }, h('label', { for: 'senha' }, 'Senha'), senha),
    h('div', { class: 'acoes' }, botao), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email.value || !senha.value) return msg.replaceChildren(alerta('Informe e-mail e senha.'));
    botao.disabled = true;
    try { await api.entrar(email.value, senha.value); await ctx.avaliarAcesso(); }
    catch (err) { msg.replaceChildren(alerta(err.message)); botao.disabled = false; }
  });
  return h('section', { class: 'pagina estreita' }, h('h1', {}, 'Painel do ADM'),
    h('p', { class: 'mudo' }, 'Acesso restrito. Use a conta de ADM (diferente da sua conta de participante). Após a senha, será pedido o código do aplicativo autenticador.'),
    form);
}

export function telaCodigo(ctx) {
  const msg = h('div', { role: 'alert' });
  const codigo = h('input', { class: 'campo codigo', type: 'text', id: 'codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true });
  const botao = h('button', { class: 'botao botao-primario', type: 'submit' }, 'Confirmar');
  const form = h('form', { class: 'form-simples', novalidate: true },
    h('div', { class: 'linha-campo' }, h('label', { for: 'codigo' }, 'Código de 6 dígitos do aplicativo autenticador'), codigo),
    h('div', { class: 'acoes' }, botao, h('button', { class: 'botao botao-discreto', type: 'button', onclick: () => ctx.sair() }, 'Cancelar')), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    botao.disabled = true;
    try { const f = await api.fatorVerificado(); await api.verificarTotp(f.id, codigo.value); await ctx.avaliarAcesso(); }
    catch (err) { msg.replaceChildren(alerta(err.message)); botao.disabled = false; }
  });
  return h('section', { class: 'pagina estreita' }, h('h1', {}, 'Segundo fator'), form);
}

export async function telaCadastroTotp(ctx) {
  const dados = await api.iniciarCadastroTotp();
  const msg = h('div', { role: 'alert' });
  const codigo = h('input', { class: 'campo codigo', type: 'text', id: 'codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true });
  const botao = h('button', { class: 'botao botao-acao', type: 'submit' }, 'Ativar segundo fator');
  const form = h('form', { class: 'form-simples', novalidate: true },
    h('div', { class: 'linha-campo' }, h('label', { for: 'codigo' }, 'Código de 6 dígitos exibido no aplicativo'), codigo),
    h('div', { class: 'acoes' }, botao, h('button', { class: 'botao botao-discreto', type: 'button', onclick: () => ctx.sair() }, 'Cancelar')), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    botao.disabled = true;
    try { await api.verificarTotp(dados.id, codigo.value); await ctx.avaliarAcesso(); }
    catch (err) { msg.replaceChildren(alerta(err.message)); botao.disabled = false; }
  });
  return h('section', { class: 'pagina estreita' }, h('h1', {}, 'Ativar segundo fator'),
    h('p', {}, 'Sem o segundo fator, nenhuma ação de ADM funciona. Instale um aplicativo autenticador (por exemplo, Google Authenticator, Microsoft Authenticator ou Authy), escaneie o código abaixo e informe o código gerado.'),
    h('img', { class: 'qr', src: dados.totp.qr_code, alt: 'Código QR para o aplicativo autenticador', width: 200, height: 200 }),
    h('p', { class: 'mudo' }, 'Se não puder escanear, digite esta chave no aplicativo:'),
    h('p', { class: 'chave' }, dados.totp.secret),
    form);
}

export function telaNegado(ctx) {
  return h('section', { class: 'pagina estreita' }, h('h1', {}, 'Acesso negado'),
    alerta('Esta conta não está autorizada como ADM. Se você é o ADM, confira se está usando a conta correta.'),
    h('div', { class: 'acoes' }, h('button', { class: 'botao', type: 'button', onclick: () => ctx.sair() }, 'Sair')));
}

// ---------- PAINEL ----------
export async function telaPainel(ctx) {
  const [eventos, sessoes] = await Promise.all([api.listarEventos(), api.listarSessoes()]);
  const raiz = h('section', { class: 'pagina' }, h('h1', {}, 'Painel do ADM'));
  const status = (e) => e.encerrado_em ? 'Encerrado' : e.janela_aberta_em ? 'Janela aberta/reaberta' : 'Janela não aberta';
  raiz.append(secao(ctx, 'Novo evento', formulario(ctx, {
    ajuda: 'Cria o evento. Depois, adicione as sessões na página do evento.',
    campos: [
      { nome: 'temporada', rotulo: 'Temporada', tipo: 'numero', obrigatorio: true, valor: new Date().getFullYear() },
      { nome: 'nome', rotulo: 'Nome do evento', tipo: 'texto', obrigatorio: true, placeholder: 'Ex.: GP do Brasil', max: 80 },
      { nome: 'local', rotulo: 'Local', tipo: 'texto', placeholder: 'Ex.: Interlagos', max: 80 },
      { nome: 'serie', rotulo: 'Série', tipo: 'texto', valor: 'F1', obrigatorio: true, max: 30 },
      { nome: 'geral', rotulo: 'Conta para a classificação geral?', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Sim (etapa do campeonato)' }, { valor: 'nao', rotulo: 'Não (evento extra)' }], obrigatorio: true },
    ],
    botao: 'Criar evento', motivoExemplo: 'Ex.: criação da etapa 21',
    enviar: (v) => api.acao('adm_criar_evento', { p_temporada: v.temporada, p_nome: v.nome, p_local: v.local, p_motivo: v.motivo, p_serie: v.serie, p_conta_para_geral: v.geral === 'sim' }).then(() => 'Evento criado.'),
  })));
  raiz.append(h('h2', {}, 'Eventos'));
  if (!eventos.length) { raiz.append(h('p', { class: 'aviso' }, 'Nenhum evento criado ainda.')); return raiz; }
  raiz.append(h('div', { class: 'grade-cartoes' }, eventos.map((e) => h('article', { class: 'cartao' },
    h('h3', {}, `${e.temporada} · ${e.nome}`),
    h('p', { class: 'mudo' }, `${e.local || 'Local não informado'} · ${e.serie}${e.conta_para_geral ? '' : ' · extra'}`),
    h('p', {}, h('span', { class: `chip ${e.encerrado_em ? 'chip-resultado' : e.janela_aberta_em ? 'chip-aberta' : ''}` }, status(e)),
      ` ${sessoes.filter((s) => s.evento_id === e.id).length} sessão(ões)`),
    h('a', { class: 'botao botao-primario', href: `#/evento/${e.id}` }, 'Gerenciar')))));
  return raiz;
}

// ---------- EVENTO ----------
export async function telaEvento(ctx, params) {
  const id = Number(params.id);
  const [dados, todasSessoes, todosEventos, participantes] = await Promise.all([
    api.carregarEvento(id), api.listarSessoes(), api.listarEventos(), api.listarParticipantes()]);
  const { evento, sessoes } = dados;
  const agoraMs = api.agora();
  const resPor = new Map(dados.resultados.map((r) => [r.sessao_id, r]));
  const rotulosPor = (sid) => dados.concorrentes.filter((c) => c.sessao_id === sid).map((c) => c.rotulo).sort(collator.compare);
  const estadoDe = (s) => estadoSessao(evento, sessoes, s, resPor.get(s.id), agoraMs);
  const nomeSessao = (s) => `${s.ordem}. ${s.nome}`;
  const optSessoes = sessoes.map((s) => ({ valor: s.id, rotulo: nomeSessao(s) }));

  const raiz = h('section', { class: 'pagina' },
    h('p', {}, h('a', { href: '#/' }, '← Painel')),
    h('h1', {}, evento.nome),
    h('p', { class: 'mudo' }, `${evento.local || ''} · Temporada ${evento.temporada} · ${evento.serie}${evento.conta_para_geral ? '' : ' · evento extra'}`
      + (evento.encerrado_em ? ` · encerrado em ${fmtBR(evento.encerrado_em)}` : '')),
    h('p', {}, h('a', { href: `${api.SITE_PUBLICO}/#/auditoria/${id}`, target: '_blank', rel: 'noopener' }, 'Ver o registro público deste evento (como os participantes veem) ↗')));

  // --- resumo das sessões
  raiz.append(h('h2', {}, 'Sessões'),
    sessoes.length ? h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, ['Ordem', 'Sessão', 'Fecha em (Brasília)', 'Pontos', 'Concorrentes', 'Palpites', 'Estado'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, sessoes.map((s) => h('tr', {},
        h('td', {}, String(s.ordem)), h('th', { scope: 'row' }, s.nome + (s.categoria ? ` (${s.categoria})` : '')),
        h('td', { class: 'nowrap' }, fmtCurto(s.fecha_em)), h('td', {}, String(s.pontos_por_acerto)),
        h('td', {}, String(rotulosPor(s.id).length)), h('td', {}, String(dados.palpites.filter((p) => p.sessao_id === s.id).length)),
        h('td', {}, chip(estadoDe(s)))))))) : h('p', { class: 'aviso' }, 'Nenhuma sessão ainda. Adicione abaixo.'));
  raiz.append(h('p', { class: 'mudo' }, `Inscritos neste evento: ${dados.inscricoes.length}. `
    + (evento.janela_aberta_em ? `Última abertura da janela: ${fmtBR(evento.janela_aberta_em)}.` : 'A janela ainda não foi aberta.')));

  const encerrado = !!evento.encerrado_em;

  // --- janela
  raiz.append(secao(ctx, '1. Abrir ou reabrir a janela de palpites', formulario(ctx, {
    ajuda: 'Inscreve todos os participantes ativos (com a equipe vigente) e libera palpites nas sessões que ainda não fecharam. Após o fechamento de uma sessão, a janela só volta a valer com nova abertura.',
    campos: [], botao: evento.janela_aberta_em ? 'Reabrir janela' : 'Abrir janela', perigoso: true,
    motivoExemplo: evento.janela_aberta_em ? 'Ex.: reabertura para a corrida' : 'Ex.: abertura da etapa',
    confirmar: 'Abrir/reabrir a janela de palpites deste evento agora?',
    enviar: (v) => api.acao('adm_abrir_janela', { p_evento: id, p_motivo: v.motivo }),
  })));

  // --- sessões
  const proximaOrdem = sessoes.length ? Math.max(...sessoes.map((s) => s.ordem)) + 1 : 1;
  raiz.append(secao(ctx, '2. Criar ou alterar sessões',
    h('h3', {}, 'Adicionar sessão'),
    formulario(ctx, {
      ajuda: 'O horário é o do fechamento, informado como em Brasília (por exemplo, o início da classificação conforme a F1.com).',
      campos: [
        { nome: 'ordem', rotulo: 'Ordem', tipo: 'numero', obrigatorio: true, valor: proximaOrdem, min: 1 },
        { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS, obrigatorio: true },
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Ex.: Classificação', max: 60 },
        { nome: 'categoria', rotulo: 'Categoria (opcional, p. ex. classe de endurance)', tipo: 'texto', max: 40 },
        { nome: 'fecha', rotulo: 'Fechamento (horário de Brasília)', tipo: 'dt', obrigatorio: true },
        { nome: 'pontos', rotulo: 'Pontos por acerto (opcional)', tipo: 'numero', min: 1, max: 100, ajuda: 'Vazio = padrão do tipo (2 nas sprints, 3 nas demais).' },
      ],
      botao: 'Adicionar sessão', motivoExemplo: 'Ex.: horário conforme F1.com',
      enviar: (v) => api.acao('adm_criar_sessao', { p_evento: id, p_ordem: v.ordem, p_tipo: v.tipo, p_nome: v.nome, p_fecha_br: v.fecha, p_motivo: v.motivo, p_categoria: v.categoria, p_pontos: v.pontos }).then(() => 'Sessão criada.'),
    }),
    h('h3', {}, 'Alterar sessão (somente antes do fechamento)'),
    formulario(ctx, {
      campos: [
        { nome: 'sessao', rotulo: 'Sessão', tipo: 'select', opcoes: optSessoes, numerico: true, obrigatorio: true },
        { nome: 'fecha', rotulo: 'Novo horário de fechamento (opcional)', tipo: 'dt' },
        { nome: 'pontos', rotulo: 'Novos pontos por acerto (opcional)', tipo: 'numero', min: 1, max: 100 },
        { nome: 'nome', rotulo: 'Novo nome (opcional)', tipo: 'texto', max: 60 },
      ],
      validar: (v) => (v.fecha || v.pontos || v.nome ? null : 'Informe ao menos uma alteração.'),
      botao: 'Alterar sessão', motivoExemplo: 'Ex.: correção do horário oficial',
      enviar: (v) => api.acao('adm_alterar_sessao', { p_sessao: v.sessao, p_motivo: v.motivo, p_fecha_br: v.fecha, p_pontos: v.pontos, p_nome: v.nome }).then(() => 'Sessão alterada.'),
    })));

  // --- concorrentes
  const optTodas = todasSessoes.map((s) => ({ valor: s.id, rotulo: `${todosEventos.find((e) => e.id === s.evento_id)?.nome || '?'} · ${s.nome}` }));
  raiz.append(secao(ctx, '3. Lista de concorrentes de cada sessão',
    h('p', { class: 'mudo' }, 'Cada sessão tem a sua própria lista. O mais prático é copiar a lista de uma sessão anterior e ajustar as diferenças.'),
    h('h3', {}, 'Copiar lista de outra sessão'),
    formulario(ctx, {
      campos: [
        { nome: 'origem', rotulo: 'Copiar DE', tipo: 'select', opcoes: optTodas.filter((o) => !sessoes.some((s) => s.id === o.valor)), numerico: true, obrigatorio: true, ajuda: 'Sessões deste evento não aparecem aqui.' },
        { nome: 'destino', rotulo: 'Copiar PARA', tipo: 'select', opcoes: optSessoes, numerico: true, obrigatorio: true },
      ],
      botao: 'Copiar lista', motivoExemplo: 'Ex.: lista do GP anterior',
      enviar: (v) => api.acao('adm_copiar_concorrentes', { p_origem: v.origem, p_destino: v.destino, p_motivo: v.motivo }).then((n) => `${n} concorrente(s) copiado(s).`),
    }),
    h('h3', {}, 'Adicionar concorrentes'),
    formulario(ctx, {
      campos: [
        { nome: 'sessao', rotulo: 'Sessão', tipo: 'select', opcoes: optSessoes, numerico: true, obrigatorio: true },
        { nome: 'lista', rotulo: 'Concorrentes (um por linha)', tipo: 'area', obrigatorio: true, placeholder: 'Max Verstappen\nLando Norris\n…\nou, em endurance: Ferrari AF Corse #51' },
      ],
      botao: 'Adicionar à lista', motivoExemplo: 'Ex.: lista inicial da sessão',
      enviar: (v) => api.acao('adm_adicionar_concorrentes', { p_sessao: v.sessao, p_rotulos: v.lista, p_motivo: v.motivo }).then((n) => `${n} concorrente(s) adicionado(s).`),
    }),
    h('h3', {}, 'Remover um concorrente (somente antes do fechamento)'),
    formulario(ctx, {
      campos: [
        { nome: 'sessao', rotulo: 'Sessão', tipo: 'select', opcoes: optSessoes, numerico: true, obrigatorio: true },
        { nome: 'rotulo', rotulo: 'Concorrente', tipo: 'select', opcoes: [], dependeDe: 'sessao', obrigatorio: true,
          opcoesPor: (sid) => rotulosPor(sid).map((r) => ({ valor: r, rotulo: r })) },
      ],
      botao: 'Remover', motivoExemplo: 'Ex.: piloto substituído',
      enviar: (v) => api.acao('adm_remover_concorrente', { p_sessao: v.sessao, p_rotulo: v.rotulo, p_motivo: v.motivo }).then(() => 'Concorrente removido.'),
    })));

  // --- palpite a pedido
  raiz.append(secao(ctx, '4. Palpite a pedido de um participante', formulario(ctx, {
    ajuda: 'Segue as mesmas regras de prazo: após o fechamento da sessão, é impossível. O registro público mostrará "inserido pelo ADM mediante solicitação", com o motivo.',
    campos: [
      { nome: 'participante', rotulo: 'Participante', tipo: 'select', opcoes: participantes.filter((p) => p.ativo).map((p) => ({ valor: p.id, rotulo: p.nome_exibicao })), numerico: true, obrigatorio: true },
      { nome: 'sessao', rotulo: 'Sessão', tipo: 'select', opcoes: optSessoes, numerico: true, obrigatorio: true },
      { nome: 'top5', rotulo: 'Top 5', tipo: 'top5', obrigatorio: true, dependeDe: 'sessao', opcoesPor: (sid) => rotulosPor(sid) },
    ],
    botao: 'Registrar palpite', motivoExemplo: 'Ex.: solicitado por [nome] no WhatsApp às hh:mm',
    enviar: (v) => api.acao('adm_palpitar_por', { p_participante: v.participante, p_sessao: v.sessao, p_rotulos: v.top5, p_motivo: v.motivo }).then(() => 'Palpite registrado.'),
  })));

  // --- resultado
  raiz.append(secao(ctx, '5. Resultado oficial (bandeirada)', formulario(ctx, {
    ajuda: 'Só é possível após o horário de fechamento da sessão. Se a sessão já tem resultado, a ação é uma CORREÇÃO de erro do ADM e ficará classificada no registro conforme o momento (antes ou depois de nova janela ou do encerramento).',
    campos: [
      { nome: 'sessao', rotulo: 'Sessão', tipo: 'select', opcoes: sessoes.map((s) => ({ valor: s.id, rotulo: `${nomeSessao(s)}${resPor.has(s.id) ? ' (já tem resultado: correção)' : ''}` })), numerico: true, obrigatorio: true },
      { nome: 'top5', rotulo: 'Top 5 da bandeirada', tipo: 'top5', obrigatorio: true, dependeDe: 'sessao', opcoesPor: (sid) => rotulosPor(sid) },
    ],
    botao: 'Registrar / corrigir resultado', perigoso: true, motivoExemplo: 'Ex.: resultado oficial da bandeirada',
    confirmar: (v) => `${resPor.has(v.sessao) ? 'CORRIGIR' : 'Registrar'} o resultado como: ${v.top5.join(' > ')}?`,
    enviar: (v) => api.acao(resPor.has(v.sessao) ? 'adm_corrigir_resultado' : 'adm_registrar_resultado', { p_sessao: v.sessao, p_rotulos: v.top5, p_motivo: v.motivo }).then(() => 'Resultado salvo.'),
  })));

  // --- encerramento
  raiz.append(secao(ctx, '6. Encerrar o evento', encerrado
    ? h('p', { class: 'mudo' }, 'Este evento já está encerrado.')
    : formulario(ctx, {
      ajuda: 'Exige resultado em todas as sessões. Os pontos passam a compor as classificações e o placar final é gravado no registro.',
      campos: [], botao: 'Encerrar evento', perigoso: true, motivoExemplo: 'Ex.: evento concluído',
      confirmar: 'Encerrar este evento? Os pontos entrarão nas classificações.',
      enviar: (v) => api.acao('adm_encerrar_evento', { p_evento: id, p_motivo: v.motivo }).then(() => 'Evento encerrado.'),
    })));

  // --- imagens
  raiz.append(secao(ctx, '7. Imagens do evento', formulario(ctx, {
    ajuda: 'Informe o NOME dos arquivos já enviados à pasta "eventos" do repositório do site dos participantes (ex.: gp-brasil.svg).',
    campos: [
      { nome: 'logo', rotulo: 'Arquivo do logotipo', tipo: 'texto', valor: evento.arquivo_logotipo || '', max: 80 },
      { nome: 'circuito', rotulo: 'Arquivo do traçado do circuito', tipo: 'texto', valor: evento.arquivo_circuito || '', max: 80 },
    ],
    validar: (v) => ([v.logo, v.circuito].some((a) => a && !ARQUIVO_SEGURO.test(a)) ? 'Use apenas letras, números, hífen, ponto e sublinhado nos nomes.' : (v.logo || v.circuito ? null : 'Informe ao menos um arquivo.')),
    botao: 'Salvar', motivoExemplo: 'Ex.: imagens do GP',
    enviar: (v) => api.acao('adm_definir_arquivos_evento', { p_evento: id, p_motivo: v.motivo, p_logotipo: v.logo, p_circuito: v.circuito }).then(() => 'Imagens atualizadas.'),
  })));
  return raiz;
}

// ---------- PARTICIPANTES E EQUIPES ----------
export async function telaPessoas(ctx) {
  const [participantes, equipes, filiacoes] = await Promise.all([api.listarParticipantes(), api.listarEquipes(), api.listarFiliacoesVigentes()]);
  const equipeDe = new Map(filiacoes.map((f) => [f.participante_id, f.equipe_id]));
  const nomeEq = new Map(equipes.map((e) => [e.id, e.nome]));
  const optPart = participantes.map((p) => ({ valor: p.id, rotulo: p.nome_exibicao + (p.ativo ? '' : ' (inativo)') }));

  const raiz = h('section', { class: 'pagina' }, h('h1', {}, 'Participantes e equipes'));
  raiz.append(h('h2', {}, 'Participantes'),
    participantes.length ? h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, ['Nome', 'Situação', 'Equipe vigente'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, participantes.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.nome_exibicao),
        h('td', {}, p.ativo ? 'Ativo' : 'Inativo'), h('td', {}, nomeEq.get(equipeDe.get(p.id)) || '—')))))) : h('p', { class: 'aviso' }, 'Nenhum participante cadastrado.'));

  raiz.append(secao(ctx, 'Cadastrar participante', formulario(ctx, {
    ajuda: 'A conta de login com este e-mail precisa existir antes (criada ao gerar o convite no Supabase). Este passo vincula o nome de exibição à conta. O e-mail nunca é exibido publicamente.',
    campos: [
      { nome: 'nome', rotulo: 'Nome de exibição (como será chamado)', tipo: 'texto', obrigatorio: true, max: 40 },
      { nome: 'email', rotulo: 'E-mail da conta', tipo: 'email', obrigatorio: true },
    ],
    botao: 'Cadastrar', motivoExemplo: 'Ex.: cadastro solicitado pelo participante',
    enviar: (v) => api.acao('adm_cadastrar_participante', { p_nome: v.nome, p_email: v.email, p_motivo: v.motivo }).then(() => 'Participante cadastrado.'),
  })));
  raiz.append(secao(ctx, 'Alterar nome ou situação de um participante', formulario(ctx, {
    campos: [
      { nome: 'participante', rotulo: 'Participante', tipo: 'select', opcoes: optPart, numerico: true, obrigatorio: true },
      { nome: 'nome', rotulo: 'Novo nome (opcional)', tipo: 'texto', max: 40 },
      { nome: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }], vazioRotulo: 'Manter como está' },
    ],
    validar: (v) => (v.nome || v.ativo ? null : 'Informe ao menos uma alteração.'),
    botao: 'Salvar', motivoExemplo: 'Ex.: correção de grafia',
    enviar: (v) => api.acao('adm_alterar_participante', { p_participante: v.participante, p_motivo: v.motivo, p_nome: v.nome, p_ativo: v.ativo === null ? null : v.ativo === 'sim' }).then(() => 'Participante atualizado.'),
  })));
  raiz.append(secao(ctx, 'Registrar geração de link de senha', formulario(ctx, {
    ajuda: 'Registra no histórico público que um link de definição de senha foi gerado para o participante (cadastro ou redefinição). Nunca inclua o link ou a senha no motivo.',
    campos: [
      { nome: 'participante', rotulo: 'Participante', tipo: 'select', opcoes: optPart, numerico: true, obrigatorio: true },
      { nome: 'finalidade', rotulo: 'Finalidade', tipo: 'select', opcoes: [{ valor: 'cadastro', rotulo: 'Cadastro' }, { valor: 'redefinicao', rotulo: 'Redefinição de senha' }], obrigatorio: true },
    ],
    botao: 'Registrar', motivoExemplo: 'Ex.: link enviado em mensagem privada',
    enviar: (v) => api.acao('adm_registrar_link_gerado', { p_participante: v.participante, p_finalidade: v.finalidade, p_motivo: v.motivo }).then(() => 'Registrado.'),
  })));

  raiz.append(h('h2', {}, 'Equipes'),
    equipes.length ? h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, ['Equipe', 'Integrantes vigentes'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, equipes.map((e) => h('tr', {}, h('th', { scope: 'row' }, e.nome),
        h('td', {}, participantes.filter((p) => equipeDe.get(p.id) === e.id).map((p) => p.nome_exibicao).join(', ') || '—')))))) : h('p', { class: 'aviso' }, 'Nenhuma equipe criada.'));
  raiz.append(secao(ctx, 'Criar equipe', formulario(ctx, {
    campos: [{ nome: 'nome', rotulo: 'Nome da equipe', tipo: 'texto', obrigatorio: true, max: 40 }],
    botao: 'Criar equipe', motivoExemplo: 'Ex.: formação da equipe',
    enviar: (v) => api.acao('adm_criar_equipe', { p_nome: v.nome, p_motivo: v.motivo }).then(() => 'Equipe criada.'),
  })));
  raiz.append(secao(ctx, 'Definir ou trocar a equipe de um participante', formulario(ctx, {
    ajuda: 'Encerra a filiação vigente e inicia a nova (os pontos já feitos permanecem na equipe anterior). Só é permitido entre eventos e com no máximo 2 integrantes por equipe.',
    campos: [
      { nome: 'participante', rotulo: 'Participante', tipo: 'select', opcoes: optPart, numerico: true, obrigatorio: true },
      { nome: 'equipe', rotulo: 'Nova equipe', tipo: 'select', opcoes: equipes.map((e) => ({ valor: e.id, rotulo: e.nome })), numerico: true, vazioRotulo: '(sem equipe)' },
    ],
    botao: 'Salvar filiação', motivoExemplo: 'Ex.: troca de equipe solicitada pelos dois',
    enviar: (v) => api.acao('adm_definir_filiacao', { p_participante: v.participante, p_equipe: v.equipe, p_motivo: v.motivo }).then(() => 'Filiação atualizada.'),
  })));
  return raiz;
}
