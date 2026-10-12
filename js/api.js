// Acesso ao Supabase pela interface do ADM. Toda ação administrativa passa por
// funções do banco (adm_*), que verificam se a conta é de ADM com segundo fator,
// exigem o motivo e geram o registro público. A interface em si não decide nada.
import { CONFIG } from './config.js';

export const configurado = !CONFIG.SUPABASE_URL.startsWith('COLE') && !CONFIG.SUPABASE_KEY.startsWith('COLE');
export const SITE_PUBLICO = CONFIG.SITE_PUBLICO;
let sb = null;

export function iniciar() {
  sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}
export const cliente = () => sb;

let deslocamentoMs = 0;
export async function sincronizarRelogio() {
  const t0 = Date.now();
  const { data, error } = await sb.rpc('hora_servidor');
  const t1 = Date.now();
  if (!error && data) deslocamentoMs = new Date(data).getTime() - (t0 + t1) / 2;
}
export const agora = () => Date.now() + deslocamentoMs;

async function ler(consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data;
}

// ---------- leituras (dados públicos) ----------
export const listarEventos = () => ler(sb.from('eventos').select('*').order('id', { ascending: false }));
export const listarSessoes = () => ler(sb.from('sessoes').select('*').order('evento_id').order('ordem'));
export const listarParticipantes = () => ler(sb.from('participantes').select('*').order('nome_exibicao'));
export const listarEquipes = () => ler(sb.from('equipes').select('*').order('nome'));
export const listarFiliacoesVigentes = () => ler(sb.from('filiacoes').select('*').is('fim', null));

export async function carregarEvento(id) {
  const [evento] = await ler(sb.from('eventos').select('*').eq('id', id));
  if (!evento) throw new Error('Evento não encontrado.');
  const sessoes = await ler(sb.from('sessoes').select('*').eq('evento_id', id).order('ordem'));
  const ids = sessoes.map((s) => s.id);
  const vazio = Promise.resolve([]);
  const [concorrentes, resultados, palpites, inscricoes] = await Promise.all([
    ids.length ? ler(sb.from('sessao_concorrentes').select('*').in('sessao_id', ids)) : vazio,
    ids.length ? ler(sb.from('resultados').select('*').in('sessao_id', ids)) : vazio,
    ids.length ? ler(sb.from('palpites').select('id,sessao_id,participante_id').in('sessao_id', ids)) : vazio,
    ler(sb.from('inscricoes_evento').select('*').eq('evento_id', id)),
  ]);
  return { evento, sessoes, concorrentes, resultados, palpites, inscricoes };
}

// ---------- autenticação e segundo fator (TOTP) ----------
export async function entrar(email, senha) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) throw new Error('E-mail ou senha incorretos.');
}
export const sair = () => sb.auth.signOut();

export async function nivelDeAcesso() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  return data;   // { currentLevel, nextLevel }
}
export async function fatorVerificado() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp?.[0] || null;
}
// Inicia o cadastro do app autenticador. Remove tentativas anteriores abandonadas.
export async function iniciarCadastroTotp() {
  const { data: lista } = await sb.auth.mfa.listFactors();
  for (const f of (lista?.all || []).filter((x) => x.status === 'unverified')) {
    await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ADM ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw new Error(error.message);
  return data;   // { id, totp: { qr_code, secret, uri } }
}
export async function verificarTotp(factorId, codigo) {
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, '') });
  if (error) throw new Error('Código inválido ou expirado. Confira o relógio do celular e tente novamente.');
}
export async function souAdm() {
  const { data, error } = await sb.rpc('adm_sou_adm');
  return !error && data === true;
}

// ---------- ações administrativas (funções do banco) ----------
export async function acao(nome, argumentos) {
  const { data, error } = await sb.rpc(nome, argumentos);
  if (error) throw new Error(error.message);
  return data;
}
