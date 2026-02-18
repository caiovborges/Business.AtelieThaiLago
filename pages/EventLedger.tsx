import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface Categoria {
   id: number;
   nome: string;
   tipo: 'receita' | 'despesa';
}

interface Transacao {
   id: string;
   tipo: 'receita' | 'despesa';
   descricao: string;
   categoria_id: number | null;
   categorias?: { id: number; nome: string } | null;
   valor: number;
   data: string | null;
}

interface Evento {
   id: string;
   nome: string;
   status: string;
   data_evento: string | null;
   clients?: { name: string } | null;
   cidades?: { nome: string; estados?: { sigla: string } } | null;
}

const STATUS_COLORS: Record<string, string> = {
   'Pendente': 'bg-yellow-100 text-yellow-800 border-yellow-300',
   'Confirmado': 'bg-blue-100 text-blue-800 border-blue-300',
   'Concluído': 'bg-green-100 text-green-800 border-green-300',
   'Cancelado': 'bg-red-100 text-red-800 border-red-300',
};

const EventLedger = () => {
   const { id } = useParams();
   const navigate = useNavigate();
   const { user } = useAuth();
   const [evento, setEvento] = useState<Evento | null>(null);
   const [transacoes, setTransacoes] = useState<Transacao[]>([]);
   const [categorias, setCategorias] = useState<Categoria[]>([]);
   const [loading, setLoading] = useState(true);

   // Income form
   const [incDate, setIncDate] = useState('');
   const [incDesc, setIncDesc] = useState('');
   const [incCatId, setIncCatId] = useState<string>('');
   const [incAmount, setIncAmount] = useState('');
   const [addingInc, setAddingInc] = useState(false);

   // Expense form
   const [expDate, setExpDate] = useState('');
   const [expDesc, setExpDesc] = useState('');
   const [expCatId, setExpCatId] = useState<string>('');
   const [expAmount, setExpAmount] = useState('');
   const [addingExp, setAddingExp] = useState(false);

   // Category management
   const [showCatManager, setShowCatManager] = useState(false);
   const [newCatNome, setNewCatNome] = useState('');
   const [newCatTipo, setNewCatTipo] = useState<'receita' | 'despesa'>('receita');
   const [addingCat, setAddingCat] = useState(false);
   const catManagerRef = useRef<HTMLDivElement>(null);

   // Click outside to close category manager
   useEffect(() => {
      if (!showCatManager) return;
      const handleClick = (e: MouseEvent) => {
         if (catManagerRef.current && !catManagerRef.current.contains(e.target as Node)) {
            setShowCatManager(false);
         }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
   }, [showCatManager]);

   const fetchData = async () => {
      if (!id) return;
      setLoading(true);

      const [eventoRes, transRes, catRes] = await Promise.all([
         supabase
            .from('eventos')
            .select('id, nome, status, data_evento, clients(name), cidades(nome, estados(sigla))')
            .eq('id', id)
            .single(),
         supabase
            .from('transacoes')
            .select('*, categorias(id, nome)')
            .eq('evento_id', id)
            .order('data', { ascending: true, nullsFirst: false }),
         supabase
            .from('categorias')
            .select('*')
            .order('nome'),
      ]);

      if (eventoRes.data) setEvento(eventoRes.data as any);
      if (transRes.data) setTransacoes(transRes.data as any);
      if (catRes.data) setCategorias(catRes.data as any);
      setLoading(false);
   };

   useEffect(() => {
      fetchData();
   }, [id]);

   const parseAmount = (val: string): number => {
      const cleaned = val.replace(/\./g, '').replace(',', '.');
      return parseFloat(cleaned) || 0;
   };

   const handleAddReceita = async () => {
      if (!incDesc.trim() || !incAmount || !user || !id) return;
      setAddingInc(true);
      const { error } = await supabase.from('transacoes').insert({
         evento_id: id,
         user_id: user.id,
         tipo: 'receita',
         descricao: incDesc.trim(),
         categoria_id: incCatId ? Number(incCatId) : null,
         valor: parseAmount(incAmount),
         data: incDate || null,
      });
      if (error) {
         console.error('Erro ao salvar receita:', error);
         alert('Erro ao salvar: ' + error.message);
      } else {
         setIncDate(''); setIncDesc(''); setIncCatId(''); setIncAmount('');
         await fetchData();
      }
      setAddingInc(false);
   };

   const handleAddDespesa = async () => {
      if (!expDesc.trim() || !expAmount || !user || !id) return;
      setAddingExp(true);
      const { error } = await supabase.from('transacoes').insert({
         evento_id: id,
         user_id: user.id,
         tipo: 'despesa',
         descricao: expDesc.trim(),
         categoria_id: expCatId ? Number(expCatId) : null,
         valor: parseAmount(expAmount),
         data: expDate || null,
      });
      if (error) {
         console.error('Erro ao salvar despesa:', error);
         alert('Erro ao salvar: ' + error.message);
      } else {
         setExpDate(''); setExpDesc(''); setExpCatId(''); setExpAmount('');
         await fetchData();
      }
      setAddingExp(false);
   };

   const handleDeleteTransaction = async (transId: string) => {
      await supabase.from('transacoes').delete().eq('id', transId);
      await fetchData();
   };

   const handleAddCategoria = async () => {
      if (!newCatNome.trim() || !user) return;
      setAddingCat(true);
      const { error } = await supabase.from('categorias').insert({
         user_id: user.id,
         nome: newCatNome.trim(),
         tipo: newCatTipo,
      });
      if (!error) {
         setNewCatNome('');
         await fetchData();
      }
      setAddingCat(false);
   };

   const handleDeleteCategoria = async (catId: number) => {
      if (!confirm('Excluir esta categoria? Transações associadas perderão a categoria.')) return;
      await supabase.from('categorias').delete().eq('id', catId);
      await fetchData();
   };

   if (loading) {
      return (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
               <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
               <p className="font-mono text-sm text-white">Carregando evento...</p>
            </div>
         </div>
      );
   }

   if (!evento) {
      return (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white border-2 border-secondary p-8 text-center shadow-hard">
               <span className="material-symbols-outlined text-5xl text-gray-300 mb-4">event_busy</span>
               <p className="font-display text-lg font-bold text-secondary mb-4">Evento não encontrado</p>
               <button onClick={() => navigate('/events')} className="px-4 py-2 bg-primary text-white font-display font-bold text-sm uppercase border-2 border-secondary shadow-hard-sm">
                  Voltar
               </button>
            </div>
         </div>
      );
   }

   const receitas = transacoes.filter(t => t.tipo === 'receita');
   const despesas = transacoes.filter(t => t.tipo === 'despesa');
   const totalReceita = receitas.reduce((sum, t) => sum + Number(t.valor), 0);
   const totalDespesa = despesas.reduce((sum, t) => sum + Number(t.valor), 0);
   const lucro = totalReceita - totalDespesa;

   const catReceita = categorias.filter(c => c.tipo === 'receita');
   const catDespesa = categorias.filter(c => c.tipo === 'despesa');

   const cidadeEstado = evento.cidades
      ? `${evento.cidades.nome}${evento.cidades.estados ? ', ' + evento.cidades.estados.sigla : ''}`
      : null;

   const formatDisplayDate = (dateStr: string | null): string => {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
   };

   const eventDateFormatted = evento.data_evento
      ? new Date(evento.data_evento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '';

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
         <div className="relative w-full max-w-7xl h-[90vh] bg-background-light shadow-2xl overflow-hidden border-2 border-secondary flex flex-col">

            {/* Header */}
            <header className="flex-none flex items-center justify-between px-6 py-5 border-b-2 border-secondary bg-white">
               <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-primary border-2 border-secondary flex items-center justify-center shadow-hard-dark">
                     <span className="material-symbols-outlined text-white text-3xl">palette</span>
                  </div>
                  <div>
                     <h1 className="font-display font-bold text-2xl md:text-3xl text-secondary tracking-tight leading-none">
                        {evento.nome}{eventDateFormatted ? ` - ${eventDateFormatted}` : ''}
                     </h1>
                     <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 border text-xs font-mono font-bold uppercase tracking-wider ${STATUS_COLORS[evento.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                           {evento.status}
                        </span>
                        <p className="text-gray-500 font-body text-sm">
                           {[evento.clients?.name, cidadeEstado].filter(Boolean).join(' \u2022 ')}
                        </p>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-2">
                  {/* Category Manager Toggle */}
                  <div className="relative" ref={catManagerRef}>
                     <button
                        onClick={() => setShowCatManager(!showCatManager)}
                        className={`flex items-center justify-center h-10 w-10 bg-white border-2 border-secondary hover:bg-gray-100 transition-colors shadow-hard-sm active:translate-y-[2px] active:shadow-none ${showCatManager ? 'bg-gray-100 shadow-none translate-y-[2px]' : ''}`}
                        title="Gerenciar Categorias"
                     >
                        <span className="material-symbols-outlined text-xl">category</span>
                     </button>

                     {/* Category Manager Dropdown */}
                     {showCatManager && (
                        <div className="absolute right-0 mt-2 w-80 bg-white border-2 border-secondary shadow-hard z-50 max-h-[70vh] overflow-y-auto">
                           <div className="p-4 border-b-2 border-secondary bg-gray-50">
                              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-secondary">Gerenciar Categorias</h3>
                           </div>

                           {/* Add new category */}
                           <div className="p-4 border-b border-gray-200 space-y-3">
                              <div className="flex gap-2">
                                 <button
                                    type="button"
                                    onClick={() => setNewCatTipo('receita')}
                                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider border-2 transition-all ${newCatTipo === 'receita'
                                       ? 'bg-accent-success/10 text-accent-success border-accent-success'
                                       : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                       }`}
                                 >
                                    Receita
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => setNewCatTipo('despesa')}
                                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider border-2 transition-all ${newCatTipo === 'despesa'
                                       ? 'bg-accent-error/10 text-accent-error border-accent-error'
                                       : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                       }`}
                                 >
                                    Despesa
                                 </button>
                              </div>
                              <div className="flex gap-2">
                                 <input
                                    className="flex-1 bg-surface border-2 border-secondary p-2 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                                    placeholder="Nome da categoria..."
                                    value={newCatNome}
                                    onChange={(e) => setNewCatNome(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategoria(); } }}
                                    disabled={addingCat}
                                 />
                                 <button
                                    onClick={handleAddCategoria}
                                    disabled={addingCat || !newCatNome.trim()}
                                    className="h-[38px] px-3 border-2 border-secondary bg-primary text-white text-xs font-bold uppercase shadow-hard-sm hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    {addingCat ? (
                                       <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                                    ) : (
                                       <span className="material-symbols-outlined text-[16px]">add</span>
                                    )}
                                 </button>
                              </div>
                           </div>

                           {/* Category lists */}
                           <div className="p-4 space-y-4">
                              {/* Receita categories */}
                              <div>
                                 <p className="text-xs font-bold uppercase tracking-wider text-accent-success mb-2 flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-accent-success"></span>
                                    Receita
                                 </p>
                                 {catReceita.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-mono">Nenhuma categoria</p>
                                 ) : (
                                    <div className="space-y-1">
                                       {catReceita.map(c => (
                                          <div key={c.id} className="flex items-center justify-between group px-2 py-1.5 hover:bg-accent-success/5 transition-colors">
                                             <span className="text-sm text-secondary">{c.nome}</span>
                                             <button
                                                onClick={() => handleDeleteCategoria(c.id)}
                                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all"
                                             >
                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                             </button>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                              </div>

                              <div className="h-px bg-gray-200"></div>

                              {/* Despesa categories */}
                              <div>
                                 <p className="text-xs font-bold uppercase tracking-wider text-accent-error mb-2 flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-accent-error"></span>
                                    Despesa
                                 </p>
                                 {catDespesa.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-mono">Nenhuma categoria</p>
                                 ) : (
                                    <div className="space-y-1">
                                       {catDespesa.map(c => (
                                          <div key={c.id} className="flex items-center justify-between group px-2 py-1.5 hover:bg-accent-error/5 transition-colors">
                                             <span className="text-sm text-secondary">{c.nome}</span>
                                             <button
                                                onClick={() => handleDeleteCategoria(c.id)}
                                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all"
                                             >
                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                             </button>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>
                     )}
                  </div>

                  <button
                     onClick={() => navigate('/events')}
                     className="group flex items-center justify-center h-10 w-10 bg-white border-2 border-secondary hover:bg-gray-100 transition-colors shadow-hard-sm active:translate-y-[2px] active:shadow-none active:translate-x-[2px]"
                  >
                     <span className="material-symbols-outlined text-2xl group-hover:rotate-90 transition-transform duration-300">close</span>
                  </button>
               </div>
            </header>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
               {/* Receita (Income) */}
               <section className="flex-1 flex flex-col border-b-2 md:border-b-0 md:border-r-2 border-secondary bg-white/50 relative">
                  <div className="flex-none p-6 pb-2 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-accent-success"></div>
                        <h2 className="font-display font-bold text-xl uppercase tracking-wide text-secondary">Receita</h2>
                     </div>
                     <span className="font-mono text-accent-success font-bold bg-accent-success/10 px-2 py-1 rounded text-sm">
                        + R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4">
                     {receitas.map(item => (
                        <div key={item.id} className="group bg-white border-2 border-secondary p-4 shadow-sm hover:shadow-hard-dark transition-all duration-200 cursor-pointer">
                           <div className="flex justify-between items-start mb-2">
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1 border border-gray-300">
                                 {formatDisplayDate(item.data)}
                              </span>
                              <button
                                 onClick={() => handleDeleteTransaction(item.id)}
                                 className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-opacity"
                              >
                                 <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                           </div>
                           <div className="flex justify-between items-end gap-4">
                              <div className="flex-1">
                                 <p className="font-body font-medium text-lg leading-tight">{item.descricao}</p>
                                 {item.categorias && (
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                       <span className="material-symbols-outlined text-[12px]">label</span>
                                       {item.categorias.nome}
                                    </p>
                                 )}
                              </div>
                              <div className="text-right">
                                 <p className="font-mono font-bold text-xl text-accent-success">
                                    R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                 </p>
                              </div>
                           </div>
                        </div>
                     ))}

                     {receitas.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                           <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                           <p className="font-mono text-sm">Nenhuma receita cadastrada</p>
                        </div>
                     )}

                     {/* Add Income Form */}
                     <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50/50 hover:bg-white hover:border-accent-success transition-colors">
                        <div className="grid grid-cols-12 gap-3 items-end">
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Data</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 focus:border-accent-success focus:ring-0 outline-none transition-colors rounded-none"
                                 type="date"
                                 value={incDate}
                                 onChange={(e) => setIncDate(e.target.value)}
                                 disabled={addingInc}
                              />
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Descrição</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-body p-2 focus:border-accent-success focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300"
                                 placeholder="Ex: Sinal (50%)"
                                 type="text"
                                 value={incDesc}
                                 onChange={(e) => setIncDesc(e.target.value)}
                                 disabled={addingInc}
                              />
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Categoria</label>
                              <select
                                 className="w-full bg-white border-2 border-gray-200 text-sm p-2 focus:border-accent-success focus:ring-0 outline-none transition-colors rounded-none appearance-none"
                                 value={incCatId}
                                 onChange={(e) => setIncCatId(e.target.value)}
                                 disabled={addingInc}
                              >
                                 <option value="">Sem categ.</option>
                                 {catReceita.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                 ))}
                              </select>
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Valor</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 text-right focus:border-accent-success focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300 text-accent-success font-medium"
                                 placeholder="0,00"
                                 type="text"
                                 value={incAmount}
                                 onChange={(e) => setIncAmount(e.target.value)}
                                 disabled={addingInc}
                                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddReceita(); } }}
                              />
                           </div>
                        </div>
                        <button
                           onClick={handleAddReceita}
                           disabled={addingInc || !incDesc.trim() || !incAmount}
                           className="w-full mt-3 flex items-center justify-center gap-2 bg-white border-2 border-accent-success text-accent-success font-display font-bold text-sm py-2 hover:bg-accent-success hover:text-white transition-all shadow-[2px_2px_0px_0px_#00C896] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           {addingInc ? (
                              <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span>
                           ) : (
                              <span className="material-symbols-outlined text-lg">add_circle</span>
                           )}
                           ADICIONAR RECEITA
                        </button>
                     </div>
                  </div>
               </section>

               {/* Despesas (Expenses) */}
               <section className="flex-1 flex flex-col bg-background-light relative">
                  <div className="flex-none p-6 pb-2 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-accent-error"></div>
                        <h2 className="font-display font-bold text-xl uppercase tracking-wide text-secondary">Despesas</h2>
                     </div>
                     <span className="font-mono text-accent-error font-bold bg-accent-error/10 px-2 py-1 rounded text-sm">
                        - R$ {totalDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4">
                     {despesas.map(item => (
                        <div key={item.id} className="group bg-white border-2 border-secondary p-4 shadow-sm hover:shadow-hard-dark transition-all duration-200 cursor-pointer">
                           <div className="flex justify-between items-start mb-2">
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1 border border-gray-300">
                                 {formatDisplayDate(item.data)}
                              </span>
                              <button
                                 onClick={() => handleDeleteTransaction(item.id)}
                                 className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-opacity"
                              >
                                 <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                           </div>
                           <div className="flex justify-between items-end gap-4">
                              <div className="flex-1">
                                 <p className="font-body font-medium text-lg leading-tight">{item.descricao}</p>
                                 {item.categorias && (
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                       <span className="material-symbols-outlined text-[12px]">label</span>
                                       {item.categorias.nome}
                                    </p>
                                 )}
                              </div>
                              <div className="text-right">
                                 <p className="font-mono font-bold text-xl text-accent-error">
                                    R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                 </p>
                              </div>
                           </div>
                        </div>
                     ))}

                     {despesas.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                           <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                           <p className="font-mono text-sm">Nenhuma despesa cadastrada</p>
                        </div>
                     )}

                     {/* Add Expense Form */}
                     <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50/50 hover:bg-white hover:border-accent-error transition-colors">
                        <div className="grid grid-cols-12 gap-3 items-end">
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Data</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 focus:border-accent-error focus:ring-0 outline-none transition-colors rounded-none"
                                 type="date"
                                 value={expDate}
                                 onChange={(e) => setExpDate(e.target.value)}
                                 disabled={addingExp}
                              />
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Descrição</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-body p-2 focus:border-accent-error focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300"
                                 placeholder="Ex: Uber, Hotel..."
                                 type="text"
                                 value={expDesc}
                                 onChange={(e) => setExpDesc(e.target.value)}
                                 disabled={addingExp}
                              />
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Categoria</label>
                              <select
                                 className="w-full bg-white border-2 border-gray-200 text-sm p-2 focus:border-accent-error focus:ring-0 outline-none transition-colors rounded-none appearance-none"
                                 value={expCatId}
                                 onChange={(e) => setExpCatId(e.target.value)}
                                 disabled={addingExp}
                              >
                                 <option value="">Sem categ.</option>
                                 {catDespesa.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                 ))}
                              </select>
                           </div>
                           <div className="col-span-3">
                              <label className="block text-xs font-mono text-gray-500 mb-1">Valor</label>
                              <input
                                 className="w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 text-right focus:border-accent-error focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300 text-accent-error font-medium"
                                 placeholder="0,00"
                                 type="text"
                                 value={expAmount}
                                 onChange={(e) => setExpAmount(e.target.value)}
                                 disabled={addingExp}
                                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDespesa(); } }}
                              />
                           </div>
                        </div>
                        <button
                           onClick={handleAddDespesa}
                           disabled={addingExp || !expDesc.trim() || !expAmount}
                           className="w-full mt-3 flex items-center justify-center gap-2 bg-white border-2 border-accent-error text-accent-error font-display font-bold text-sm py-2 hover:bg-accent-error hover:text-white transition-all shadow-[2px_2px_0px_0px_#FF4D4D] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           {addingExp ? (
                              <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span>
                           ) : (
                              <span className="material-symbols-outlined text-lg">add_circle</span>
                           )}
                           ADICIONAR DESPESA
                        </button>
                     </div>
                  </div>
               </section>
            </main>

            {/* Footer */}
            <footer className="flex-none bg-secondary text-white border-t-2 border-secondary z-20">
               <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 gap-4">
                  <div className="flex items-center gap-8 text-sm font-mono opacity-80 w-full md:w-auto justify-between md:justify-start">
                     <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wider text-gray-400">Total Receita</span>
                        <span className="text-accent-success font-bold text-lg">
                           R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                     </div>
                     <div className="h-8 w-px bg-gray-600"></div>
                     <div className="flex flex-col text-right md:text-left">
                        <span className="text-xs uppercase tracking-wider text-gray-400">Total Despesa</span>
                        <span className="text-accent-error font-bold text-lg">
                           R$ {totalDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 bg-white/10 px-6 py-2 rounded border border-white/20 w-full md:w-auto justify-between md:justify-center backdrop-blur-sm">
                     <span className="font-display font-bold uppercase tracking-wider text-sm md:text-base">Lucro do Evento</span>
                     <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-2xl md:text-3xl tracking-tight ${lucro >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                           R$ {lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={`material-symbols-outlined ${lucro >= 0 ? 'text-accent-success' : 'text-accent-error'} animate-pulse`}>
                           {lucro >= 0 ? 'trending_up' : 'trending_down'}
                        </span>
                     </div>
                  </div>
               </div>
            </footer>
         </div>
      </div>
   );
};

export default EventLedger;
