import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatarReais, parseValor } from '../valores';
import { STATUS, corStatus } from '../statusEvento';
import {
   CATEGORIA_EQUIPE, Categoria, CustoPrevisto, Despesa, Plano,
   carregarPlano, nomesDaEquipe, resumir, salvarCustos,
} from '../planejamento';
import { TabelaCategorias } from '../components/PrevistoRealizado';

interface EventoLista {
   id: string;
   nome: string;
   status: string;
   data_evento: string | null;
   valor_previsto: number | null;
   clients?: { name: string } | null;
}

type DoEvento<T> = T & { evento_id: string };

// Linha da tela: o valor fica como texto enquanto a pessoa digita.
interface Linha {
   chave: string;
   categoria_id: number | null;
   descricao: string;
   valor: string;
}

const ABAS = [STATUS.confirmado, STATUS.concluido];

let contador = 0;
const novaChave = () => `custo-${++contador}`;
const paraTexto = (valor: number) => (valor ? String(valor).replace('.', ',') : '');

const formatDate = (dateStr: string | null) => {
   if (!dateStr) return 'Sem data';
   const d = new Date(dateStr + 'T12:00:00');
   return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace('.', '');
};

const corMargem = (valor: number) => (valor > 0 ? 'text-accent-success' : valor < 0 ? 'text-accent-error' : 'text-gray-500');

const campo = 'px-3 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 outline-none text-sm rounded-none transition-colors';

const EventPlanner = () => {
   const [parametros, setParametros] = useSearchParams();
   const [aba, setAba] = useState<string>(STATUS.confirmado);
   const [eventos, setEventos] = useState<EventoLista[]>([]);
   const [custos, setCustos] = useState<DoEvento<CustoPrevisto>[]>([]);
   const [despesas, setDespesas] = useState<DoEvento<Despesa>[]>([]);
   const [recebidoPorEvento, setRecebidoPorEvento] = useState<Record<string, number>>({});
   const [categorias, setCategorias] = useState<Categoria[]>([]);
   const [carregando, setCarregando] = useState(true);
   const [erro, setErro] = useState('');

   // Modal
   const [plano, setPlano] = useState<Plano | null>(null);
   const [linhas, setLinhas] = useState<Linha[]>([]);
   const [salvando, setSalvando] = useState(false);
   const [erroModal, setErroModal] = useState('');

   const carregar = async () => {
      setCarregando(true);
      const [ev, cp, tr, cat] = await Promise.all([
         supabase
            .from('eventos')
            .select('id, nome, status, data_evento, valor_previsto, clients(name)')
            .in('status', ABAS)
            .order('data_evento', { ascending: true, nullsFirst: false }),
         supabase.from('custos_previstos').select('evento_id, categoria_id, descricao, valor').order('created_at'),
         supabase.from('transacoes').select('evento_id, tipo, categoria_id, valor').not('evento_id', 'is', null),
         supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').order('nome'),
      ]);
      const falha = ev.error || cp.error || tr.error || cat.error;
      setErro(falha ? 'Não foi possível carregar o planejamento: ' + falha.message : '');
      if (ev.data) setEventos(ev.data as unknown as EventoLista[]);
      if (cp.data) setCustos(cp.data.map(c => ({ ...c, valor: Number(c.valor) })));
      if (tr.data) {
         const lista = tr.data as { evento_id: string; tipo: string; categoria_id: number | null; valor: number }[];
         setDespesas(lista.filter(t => t.tipo === 'despesa').map(t => ({ evento_id: t.evento_id, categoria_id: t.categoria_id, valor: Number(t.valor) })));
         const recebido: Record<string, number> = {};
         lista.filter(t => t.tipo === 'receita').forEach(t => { recebido[t.evento_id] = (recebido[t.evento_id] || 0) + Number(t.valor); });
         setRecebidoPorEvento(recebido);
      }
      if (cat.data) setCategorias(cat.data as Categoria[]);
      setCarregando(false);
   };

   useEffect(() => { carregar(); }, []);

   const abrir = async (eventoId: string) => {
      setErroModal('');
      try {
         const p = await carregarPlano(eventoId);
         setPlano(p);
         setLinhas(p.custos.map(c => ({ chave: novaChave(), categoria_id: c.categoria_id, descricao: c.descricao, valor: paraTexto(c.valor) })));
      } catch (e) {
         setErro((e as Error).message);
      }
   };

   // Vindo do lead fechado ou da tela do evento: /planejamento?evento=<id>
   useEffect(() => {
      const eventoId = parametros.get('evento');
      if (!eventoId) return;
      abrir(eventoId);
      setParametros({}, { replace: true });
   }, [parametros]);

   const fechar = () => { setPlano(null); setLinhas([]); };

   const equipeId = categorias.find(c => c.nome === CATEGORIA_EQUIPE)?.id ?? null;
   const outrasCategorias = categorias.filter(c => c.id !== equipeId);
   const sugestoes = nomesDaEquipe(custos, categorias);

   const resumoDe = (evento: EventoLista) => resumir({
      contrato: Number(evento.valor_previsto) || 0,
      custos: custos.filter(c => c.evento_id === evento.id),
      despesas: despesas.filter(d => d.evento_id === evento.id),
      recebido: recebidoPorEvento[evento.id] || 0,
      categorias,
   });

   // ---- Modal: linhas ----
   const alterar = (chave: string, mudanca: Partial<Linha>) =>
      setLinhas(atual => atual.map(l => (l.chave === chave ? { ...l, ...mudanca } : l)));
   const remover = (chave: string) => setLinhas(atual => atual.filter(l => l.chave !== chave));
   const adicionar = (categoria_id: number | null) =>
      setLinhas(atual => [...atual, { chave: novaChave(), categoria_id, descricao: '', valor: '' }]);

   const linhasEquipe = linhas.filter(l => equipeId !== null && l.categoria_id === equipeId);
   const linhasOutras = linhas.filter(l => !(equipeId !== null && l.categoria_id === equipeId));

   // Linha totalmente vazia e ignorada; com valor e sem nome e erro.
   const preenchidas = linhas.filter(l => l.descricao.trim() || parseValor(l.valor) > 0);
   const custosDaTela: CustoPrevisto[] = preenchidas.map(l => ({
      categoria_id: l.categoria_id,
      descricao: l.descricao.trim(),
      valor: parseValor(l.valor),
   }));

   const resumoModal = plano && resumir({
      contrato: Number(plano.evento.valor_previsto) || 0,
      custos: custosDaTela,
      despesas: plano.despesas,
      recebido: plano.recebido,
      categorias: plano.categorias,
   });

   const salvar = async () => {
      if (!plano) return;
      if (custosDaTela.some(c => !c.descricao)) {
         setErroModal('Toda linha com valor precisa de um nome ou descrição.');
         return;
      }
      setSalvando(true);
      setErroModal('');
      try {
         await salvarCustos(plano.evento.id, custosDaTela);
         await carregar();
         fechar();
      } catch (e) {
         setErroModal((e as Error).message);
      }
      setSalvando(false);
   };

   const lista = eventos.filter(e => e.status === aba);
   if (aba === STATUS.concluido) lista.reverse();

   return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background-light">
         <header className="px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-2 border-secondary/5 bg-background-light/50 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex flex-col gap-1">
               <h2 className="text-4xl font-black text-secondary tracking-tight font-display">Planejamento</h2>
               <p className="text-gray-500 font-medium max-w-lg">Planeje equipe e custos e compare com o que foi gasto de verdade.</p>
            </div>
            <div className="flex border-2 border-secondary shadow-hard-sm">
               {ABAS.map(status => (
                  <button
                     key={status}
                     onClick={() => setAba(status)}
                     className={`px-5 py-2.5 font-display font-bold text-sm border-r border-gray-200 last:border-r-0 transition-colors ${aba === status ? 'bg-secondary text-white' : 'bg-white text-secondary hover:bg-gray-50'}`}
                  >
                     {status === STATUS.confirmado ? 'Próximos' : 'Concluídos'}
                  </button>
               ))}
            </div>
         </header>

         <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {erro && <p className="mb-4 border-2 border-accent-error bg-accent-error/10 p-3 text-sm text-accent-error">{erro}</p>}
            {carregando ? (
               <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                     <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
                     <p className="font-mono text-sm text-gray-500">Carregando eventos...</p>
                  </div>
               </div>
            ) : lista.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">event_busy</span>
                  <h3 className="font-display text-xl font-bold text-secondary mb-1">
                     {aba === STATUS.confirmado ? 'Nenhum evento confirmado' : 'Nenhum evento concluído'}
                  </h3>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {lista.map(evento => {
                     const r = resumoDe(evento);
                     const equipe = custos.filter(c => c.evento_id === evento.id && c.categoria_id === equipeId).map(c => c.descricao);
                     const concluido = evento.status === STATUS.concluido;
                     return (
                        <div
                           key={evento.id}
                           onClick={() => abrir(evento.id)}
                           className="bg-white border-2 border-secondary p-5 flex flex-col gap-4 shadow-sm hover:-translate-y-1 hover:shadow-hard transition-all cursor-pointer rounded-sm"
                        >
                           <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                 <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-widest">{formatDate(evento.data_evento)}</span>
                                 <h3 className="font-display text-lg font-bold text-secondary mt-1 break-words">{evento.nome}</h3>
                                 <p className="text-sm text-gray-500">{evento.clients?.name}</p>
                              </div>
                              <span className={`shrink-0 px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${corStatus(evento.status)}`}>
                                 {evento.status}
                              </span>
                           </div>

                           <div className="h-px bg-gray-100"></div>

                           {concluido ? (
                              <div className="grid grid-cols-2 gap-2">
                                 <div>
                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Margem prevista</span>
                                    <span className={`font-mono font-bold ${corMargem(r.margemPrevista)}`}>{formatarReais(r.margemPrevista)}</span>
                                 </div>
                                 <div className="text-right">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Margem real</span>
                                    <span className={`font-mono font-bold text-lg ${corMargem(r.margemReal)}`}>{formatarReais(r.margemReal)}</span>
                                 </div>
                              </div>
                           ) : (
                              <div className="flex justify-between items-end gap-2">
                                 <div className="flex flex-col gap-1 min-w-0">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Equipe</span>
                                    <div className="flex gap-1 flex-wrap">
                                       {equipe.length > 0 ? (
                                          equipe.map(p => (
                                             <span key={p} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-medium">{p}</span>
                                          ))
                                       ) : (
                                          <span className="text-xs text-gray-400 italic">Não definida</span>
                                       )}
                                    </div>
                                 </div>
                                 <div className="text-right shrink-0">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Margem prevista</span>
                                    <span className={`font-mono font-bold text-lg ${corMargem(r.margemPrevista)}`}>{formatarReais(r.margemPrevista)}</span>
                                 </div>
                              </div>
                           )}
                        </div>
                     );
                  })}
               </div>
            )}
         </div>

         {/* Modal de Planejamento */}
         {plano && resumoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
               <div className="w-full max-w-4xl bg-white border-2 border-secondary shadow-hard relative my-auto">
                  <header className="px-6 py-4 border-b-2 border-secondary bg-gray-50 flex justify-between items-center sticky top-0 z-10">
                     <div>
                        <h3 className="font-display text-xl font-bold text-secondary">Planejar: {plano.evento.nome}</h3>
                        <p className="text-sm text-gray-500 font-mono mt-1">{formatDate(plano.evento.data_evento)} · {plano.evento.status}</p>
                     </div>
                     <button onClick={fechar} className="text-gray-400 hover:text-accent-error transition-colors p-2">
                        <span className="material-symbols-outlined text-2xl">close</span>
                     </button>
                  </header>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Esquerda: contrato, equipe e custos */}
                     <div className="space-y-6">
                        <div>
                           <span className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Valor do contrato</span>
                           <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-2 border-gray-200">
                              <span className="font-mono font-bold text-accent-success">{formatarReais(resumoModal.contrato)}</span>
                              <Link to={`/events/${plano.evento.id}`} className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">
                                 Alterar contrato
                              </Link>
                           </div>
                           {resumoModal.receita > resumoModal.contrato && (
                              <p className="mt-1 text-xs text-gray-500">
                                 {resumoModal.contrato === 0 ? 'Sem contrato preenchido' : 'Recebeu mais que o contrato'}: as margens usam o recebido, {formatarReais(resumoModal.receita)}.
                              </p>
                           )}
                        </div>

                        {/* Equipe */}
                        <div className="bg-gray-50 border-2 border-secondary p-4 rounded-sm">
                           <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-mono font-bold text-secondary uppercase tracking-wider">Equipe ({CATEGORIA_EQUIPE})</span>
                              <span className="font-mono text-sm font-bold text-accent-error">{formatarReais(resumoModal.equipe)}</span>
                           </div>
                           {equipeId === null ? (
                              <p className="text-sm text-accent-error">A categoria de despesa "{CATEGORIA_EQUIPE}" não existe. Crie em Eventos → Categorias.</p>
                           ) : (
                              <>
                                 <div className="flex flex-col gap-2 mb-3">
                                    {linhasEquipe.map(l => (
                                       <div key={l.chave} className="flex gap-2">
                                          <input className={`${campo} flex-[2] min-w-0`} placeholder="Nome da pintora" list="sugestoes-equipe"
                                             value={l.descricao} onChange={e => alterar(l.chave, { descricao: e.target.value })} />
                                          <input className={`${campo} flex-1 min-w-0 font-mono`} placeholder="Cachê" inputMode="decimal"
                                             value={l.valor} onChange={e => alterar(l.chave, { valor: e.target.value })} />
                                          <button onClick={() => remover(l.chave)} aria-label="Remover" className="text-gray-400 hover:text-accent-error transition-colors">
                                             <span className="material-symbols-outlined text-[18px]">delete</span>
                                          </button>
                                       </div>
                                    ))}
                                    {linhasEquipe.length === 0 && <span className="text-sm text-gray-400 italic">Nenhuma pessoa na equipe.</span>}
                                 </div>
                                 <datalist id="sugestoes-equipe">
                                    {sugestoes.map(nome => <option key={nome} value={nome} />)}
                                 </datalist>
                                 <button onClick={() => adicionar(equipeId)}
                                    className="px-3 py-1.5 bg-primary text-white border-2 border-secondary font-bold uppercase text-xs hover:bg-[#c0056b] transition-colors shadow-hard-sm">
                                    + Pessoa
                                 </button>
                              </>
                           )}
                        </div>

                        {/* Outros custos */}
                        <div>
                           <span className="block text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-3">Outros custos previstos</span>
                           <div className="flex flex-col gap-2 mb-3">
                              {linhasOutras.map(l => (
                                 <div key={l.chave} className="flex flex-wrap sm:flex-nowrap gap-2">
                                    <select className={`${campo} w-full sm:w-36`} value={l.categoria_id ?? ''}
                                       onChange={e => alterar(l.chave, { categoria_id: e.target.value ? Number(e.target.value) : null })}>
                                       <option value="">Sem categoria</option>
                                       {outrasCategorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                    <input className={`${campo} flex-[2] min-w-0`} placeholder="Descrição"
                                       value={l.descricao} onChange={e => alterar(l.chave, { descricao: e.target.value })} />
                                    <input className={`${campo} flex-1 min-w-0 font-mono`} placeholder="Valor" inputMode="decimal"
                                       value={l.valor} onChange={e => alterar(l.chave, { valor: e.target.value })} />
                                    <button onClick={() => remover(l.chave)} aria-label="Remover" className="text-gray-400 hover:text-accent-error transition-colors">
                                       <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                 </div>
                              ))}
                              {linhasOutras.length === 0 && <span className="text-sm text-gray-400 italic">Nenhum custo previsto.</span>}
                           </div>
                           <button onClick={() => adicionar(outrasCategorias[0]?.id ?? null)}
                              className="px-3 py-1.5 bg-secondary text-white border-2 border-secondary font-bold uppercase text-xs hover:bg-primary transition-colors shadow-hard-sm">
                              + Custo
                           </button>
                        </div>
                     </div>

                     {/* Direita: resumo */}
                     <div className="flex flex-col gap-6">
                        <div className="bg-secondary text-white p-6 flex flex-col rounded-sm relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 opacity-10">
                              <span className="material-symbols-outlined text-8xl">monitoring</span>
                           </div>
                           <h4 className="font-mono text-sm uppercase tracking-widest text-gray-400 mb-6 relative z-10">Resumo do planejamento</h4>
                           <div className="space-y-4 relative z-10">
                              <div className="flex justify-between items-center text-sm border-b border-gray-600 pb-2">
                                 <span className="text-gray-300">{resumoModal.receita > resumoModal.contrato ? 'Receita (recebido)' : 'Valor do contrato'}</span>
                                 <span className="font-mono font-medium">{formatarReais(resumoModal.receita)}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm border-b border-gray-600 pb-2">
                                 <span className="text-gray-300">Custos previstos</span>
                                 <span className="font-mono font-medium text-accent-error">− {formatarReais(resumoModal.previsto)}</span>
                              </div>
                              <div className="flex justify-between items-end pt-2">
                                 <span className="font-display font-bold text-lg">Margem prevista</span>
                                 <div className="text-right">
                                    <span className={`font-mono font-bold text-2xl block ${resumoModal.margemPrevista >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                                       {formatarReais(resumoModal.margemPrevista)}
                                    </span>
                                    {resumoModal.percentualPrevisto !== null && (
                                       <span className={`text-xs font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${resumoModal.margemPrevista >= 0 ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-error/20 text-accent-error'}`}>
                                          {resumoModal.percentualPrevisto.toLocaleString('pt-BR')}%
                                       </span>
                                    )}
                                 </div>
                              </div>
                              {resumoModal.realizado > 0 && (
                                 <>
                                    <div className="flex justify-between items-center text-sm border-t border-gray-600 pt-3">
                                       <span className="text-gray-300">Gasto até agora</span>
                                       <span className="font-mono font-medium text-accent-error">− {formatarReais(resumoModal.realizado)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                       <span className="font-display font-bold">Margem real</span>
                                       <span className={`font-mono font-bold text-xl ${resumoModal.margemReal >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                                          {formatarReais(resumoModal.margemReal)}
                                       </span>
                                    </div>
                                 </>
                              )}
                              <div className="flex justify-between items-center text-xs text-gray-400">
                                 <span>Já recebido</span>
                                 <span className="font-mono">{formatarReais(resumoModal.recebido)}</span>
                              </div>
                           </div>
                        </div>

                        {resumoModal.porCategoria.length > 0 && (
                           <div className="border-2 border-secondary p-4 rounded-sm">
                              <h4 className="font-display font-bold uppercase tracking-wider text-sm text-secondary mb-2">Previsto × realizado</h4>
                              <TabelaCategorias resumo={resumoModal} />
                           </div>
                        )}
                     </div>
                  </div>

                  <footer className="px-6 py-4 bg-gray-50 border-t-2 border-secondary flex flex-col sm:flex-row sm:items-center justify-end gap-3 rounded-b-sm">
                     {erroModal && <p className="text-sm text-accent-error sm:mr-auto">{erroModal}</p>}
                     <button
                        onClick={fechar}
                        className="px-6 py-2 bg-white text-secondary font-display font-bold text-sm uppercase tracking-wider border-2 border-secondary hover:bg-gray-100 transition-colors shadow-hard-sm"
                     >
                        Cancelar
                     </button>
                     <button
                        onClick={salvar}
                        disabled={salvando}
                        className="px-6 py-2 bg-primary text-white font-display font-bold text-sm uppercase tracking-wider border-2 border-secondary hover:bg-[#c0056b] hover:-translate-y-0.5 transition-all shadow-hard disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                        <span className={`material-symbols-outlined text-[18px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'save'}</span>
                        Salvar planejamento
                     </button>
                  </footer>
               </div>
            </div>
         )}
      </div>
   );
};

export default EventPlanner;
