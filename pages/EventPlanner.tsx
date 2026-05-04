import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface EventoPlanejamento {
   id: string;
   nome: string;
   status: string;
   data_evento: string | null;
   valor_previsto: number;
   pintoras: string[];
   custo_prev_materiais: number;
   custo_prev_deslocamento: number;
   custo_prev_equipe: number;
   custo_prev_outros: number;
   custos_personalizados?: { id: number, descricao: string, valor: number }[];
   clients?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
   'Pendente': 'bg-yellow-100 text-yellow-800 border-yellow-300',
   'Confirmado': 'bg-blue-100 text-blue-800 border-blue-300',
   'Concluído': 'bg-green-100 text-green-800 border-green-300',
   'Cancelado': 'bg-red-100 text-red-800 border-red-300',
};

const EventPlanner = () => {
   const { user } = useAuth();
   const [events, setEvents] = useState<EventoPlanejamento[]>([]);
   const [loading, setLoading] = useState(true);
   const [selectedEvent, setSelectedEvent] = useState<EventoPlanejamento | null>(null);
   const [saving, setSaving] = useState(false);

   // Formulário de planejamento
   const [valorPrevisto, setValorPrevisto] = useState('0');
   const [custoMateriais, setCustoMateriais] = useState('0');
   const [custoDeslocamento, setCustoDeslocamento] = useState('0');
   const [custoEquipe, setCustoEquipe] = useState('0');
   const [custoOutros, setCustoOutros] = useState('0');
   const [pintoras, setPintoras] = useState<string[]>([]);
   const [novaPintora, setNovaPintora] = useState('');
   const [custosPersonalizados, setCustosPersonalizados] = useState<{ id: number, descricao: string, valor: number }[]>([]);
   const [novaDescricaoCusto, setNovaDescricaoCusto] = useState('');
   const [novoValorCusto, setNovoValorCusto] = useState('');

   const fetchEvents = async () => {
      setLoading(true);
      const { data, error } = await supabase
         .from('eventos')
         .select('id, nome, status, data_evento, valor_previsto, pintoras, custo_prev_materiais, custo_prev_deslocamento, custo_prev_equipe, custo_prev_outros, custos_personalizados, clients(name)')
         .in('status', ['Pendente', 'Confirmado'])
         .order('data_evento', { ascending: true, nullsFirst: false });

      if (!error && data) {
         setEvents(data as any);
      }
      setLoading(false);
   };

   useEffect(() => {
      fetchEvents();
   }, []);

   const openPlanner = (event: EventoPlanejamento) => {
      setSelectedEvent(event);
      setValorPrevisto((event.valor_previsto || 0).toString());
      setCustoMateriais((event.custo_prev_materiais || 0).toString());
      setCustoDeslocamento((event.custo_prev_deslocamento || 0).toString());
      setCustoEquipe((event.custo_prev_equipe || 0).toString());
      setCustoOutros((event.custo_prev_outros || 0).toString());
      setPintoras(event.pintoras || []);
      setCustosPersonalizados(event.custos_personalizados || []);
   };

   const closePlanner = () => {
      setSelectedEvent(null);
   };

   const handleAddPintora = (e: React.KeyboardEvent | React.MouseEvent) => {
      if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !novaPintora.trim()) return;
      e.preventDefault();
      if (!pintoras.includes(novaPintora.trim())) {
         setPintoras([...pintoras, novaPintora.trim()]);
      }
      setNovaPintora('');
   };

   const handleRemovePintora = (nome: string) => {
      setPintoras(pintoras.filter(p => p !== nome));
   };

   const handleAddCustoPersonalizado = (e: React.KeyboardEvent | React.MouseEvent) => {
      if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter')) return;
      e.preventDefault();
      
      const parseNum = (val: string) => parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
      const valorFormatado = parseNum(novoValorCusto);
      
      if (!novaDescricaoCusto.trim() || valorFormatado <= 0) return;

      setCustosPersonalizados([
         ...custosPersonalizados,
         { id: Date.now(), descricao: novaDescricaoCusto.trim(), valor: valorFormatado }
      ]);
      setNovaDescricaoCusto('');
      setNovoValorCusto('');
   };

   const handleRemoveCustoPersonalizado = (id: number) => {
      setCustosPersonalizados(custosPersonalizados.filter(c => c.id !== id));
   };

   const handleSave = async () => {
      if (!selectedEvent) return;
      setSaving(true);

      const parseNum = (val: string) => parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;

      const payload = {
         valor_previsto: parseNum(valorPrevisto),
         custo_prev_materiais: parseNum(custoMateriais),
         custo_prev_deslocamento: parseNum(custoDeslocamento),
         custo_prev_equipe: parseNum(custoEquipe),
         custo_prev_outros: parseNum(custoOutros),
         pintoras: pintoras,
         custos_personalizados: custosPersonalizados
      };

      const { error } = await supabase.from('eventos').update(payload).eq('id', selectedEvent.id);

      if (error) {
         alert('Erro ao salvar planejamento: ' + error.message);
      } else {
         await fetchEvents();
         closePlanner();
      }
      setSaving(false);
   };

   const totalCustosPersonalizados = custosPersonalizados.reduce((acc, curr) => acc + curr.valor, 0);

   const totalCustos = 
      (parseFloat(custoMateriais) || 0) + 
      (parseFloat(custoDeslocamento) || 0) + 
      (parseFloat(custoEquipe) || 0) + 
      (parseFloat(custoOutros) || 0) +
      totalCustosPersonalizados;
      
   const receitaPrevista = parseFloat(valorPrevisto) || 0;
   const margemLucro = receitaPrevista - totalCustos;
   const percentualMargem = receitaPrevista > 0 ? ((margemLucro / receitaPrevista) * 100).toFixed(1) : '0.0';

   const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Sem data';
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '');
   };

   return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background-light">
         <header className="px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-2 border-secondary/5 bg-background-light/50 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex flex-col gap-1">
               <h2 className="text-4xl font-black text-secondary tracking-tight font-display">Planejamento</h2>
               <p className="text-gray-500 font-medium max-w-lg">Planeje a margem, custos e equipe dos próximos eventos.</p>
            </div>
         </header>

         <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {loading ? (
               <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                     <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
                     <p className="font-mono text-sm text-gray-500">Carregando eventos...</p>
                  </div>
               </div>
            ) : events.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">event_busy</span>
                  <h3 className="font-display text-xl font-bold text-secondary mb-1">Nenhum evento futuro</h3>
                  <p className="font-body text-gray-500 mb-6">Apenas eventos Pendentes ou Confirmados aparecem aqui.</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {events.map(event => {
                     const totalCustom = (event.custos_personalizados || []).reduce((acc, curr) => acc + curr.valor, 0);
                     const totalPrevisto = (event.custo_prev_materiais || 0) + (event.custo_prev_deslocamento || 0) + (event.custo_prev_equipe || 0) + (event.custo_prev_outros || 0) + totalCustom;
                     const margem = (event.valor_previsto || 0) - totalPrevisto;

                     return (
                        <div 
                           key={event.id}
                           onClick={() => openPlanner(event)}
                           className="bg-white border-2 border-secondary p-5 flex flex-col gap-4 shadow-sm hover:-translate-y-1 hover:shadow-hard transition-all cursor-pointer rounded-sm"
                        >
                           <div className="flex justify-between items-start">
                              <div>
                                 <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-widest">{formatDate(event.data_evento)}</span>
                                 <h3 className="font-display text-lg font-bold text-secondary mt-1">{event.nome}</h3>
                                 <p className="text-sm text-gray-500">{event.clients?.name}</p>
                              </div>
                              <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[event.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                                 {event.status}
                              </span>
                           </div>

                           <div className="h-px bg-gray-100"></div>

                           <div className="flex justify-between items-end">
                              <div className="flex flex-col gap-1">
                                 <span className="text-[10px] uppercase font-bold text-gray-400">Pintoras</span>
                                 <div className="flex gap-1 flex-wrap">
                                    {(event.pintoras || []).length > 0 ? (
                                       event.pintoras.map(p => (
                                          <span key={p} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-medium">{p}</span>
                                       ))
                                    ) : (
                                       <span className="text-xs text-gray-400 italic">Não definidas</span>
                                    )}
                                 </div>
                              </div>
                              <div className="text-right">
                                 <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Margem Est.</span>
                                 <span className={`font-mono font-bold text-lg ${margem > 0 ? 'text-accent-success' : margem < 0 ? 'text-accent-error' : 'text-gray-500'}`}>
                                    R$ {margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                 </span>
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
         </div>

         {/* Modal de Planejamento */}
         {selectedEvent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
               <div className="w-full max-w-4xl bg-white border-2 border-secondary shadow-hard relative my-auto">
                  <header className="px-6 py-4 border-b-2 border-secondary bg-gray-50 flex justify-between items-center sticky top-0 z-10">
                     <div>
                        <h3 className="font-display text-xl font-bold text-secondary">Planejar: {selectedEvent.nome}</h3>
                        <p className="text-sm text-gray-500 font-mono mt-1">Preencha as estimativas para calcular a margem</p>
                     </div>
                     <button onClick={closePlanner} className="text-gray-400 hover:text-accent-error transition-colors p-2">
                        <span className="material-symbols-outlined text-2xl">close</span>
                     </button>
                  </header>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Esquerda: Custos e Valores */}
                     <div className="space-y-4">
                        <div>
                           <label className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Valor Fechado (Receita)</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400">R$</span>
                              <input 
                                 type="text" 
                                 className="w-full pl-10 pr-3 py-2 bg-surface border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono font-bold text-accent-success rounded-none transition-colors"
                                 value={valorPrevisto}
                                 onChange={(e) => setValorPrevisto(e.target.value)}
                              />
                           </div>
                        </div>

                        <div className="h-px bg-gray-200 my-4"></div>

                        <div>
                           <label className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Custo com Equipe</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400">R$</span>
                              <input 
                                 type="text" 
                                 className="w-full pl-10 pr-3 py-2 bg-surface border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono text-accent-error rounded-none transition-colors"
                                 value={custoEquipe}
                                 onChange={(e) => setCustoEquipe(e.target.value)}
                              />
                           </div>
                        </div>

                        <div>
                           <label className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Deslocamento/Logística</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400">R$</span>
                              <input 
                                 type="text" 
                                 className="w-full pl-10 pr-3 py-2 bg-surface border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono text-accent-error rounded-none transition-colors"
                                 value={custoDeslocamento}
                                 onChange={(e) => setCustoDeslocamento(e.target.value)}
                              />
                           </div>
                        </div>

                        <div>
                           <label className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Materiais</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400">R$</span>
                              <input 
                                 type="text" 
                                 className="w-full pl-10 pr-3 py-2 bg-surface border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono text-accent-error rounded-none transition-colors"
                                 value={custoMateriais}
                                 onChange={(e) => setCustoMateriais(e.target.value)}
                              />
                           </div>
                        </div>

                        <div>
                           <label className="block text-xs font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Outros Custos</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400">R$</span>
                              <input 
                                 type="text" 
                                 className="w-full pl-10 pr-3 py-2 bg-surface border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono text-accent-error rounded-none transition-colors"
                                 value={custoOutros}
                                 onChange={(e) => setCustoOutros(e.target.value)}
                              />
                           </div>
                        </div>

                        <div className="h-px bg-gray-200 my-4"></div>

                        {/* Custos Personalizados */}
                        <div>
                           <label className="block text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-3">Custos Específicos</label>
                           
                           <div className="flex flex-col gap-2 mb-3">
                              {custosPersonalizados.map(custo => (
                                 <div key={custo.id} className="flex justify-between items-center bg-gray-50 border-2 border-gray-200 p-2 text-sm rounded-sm">
                                    <span className="font-medium text-gray-700">{custo.descricao}</span>
                                    <div className="flex items-center gap-3">
                                       <span className="font-mono font-bold text-accent-error">R$ {custo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                       <button onClick={() => handleRemoveCustoPersonalizado(custo.id)} className="text-gray-400 hover:text-accent-error transition-colors">
                                          <span className="material-symbols-outlined text-[18px]">delete</span>
                                       </button>
                                    </div>
                                 </div>
                              ))}
                              {custosPersonalizados.length === 0 && <span className="text-sm text-gray-400 italic">Nenhum custo específico adicionado.</span>}
                           </div>

                           <div className="flex gap-2">
                              <input 
                                 type="text" 
                                 className="flex-[2] px-3 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-body text-sm rounded-none transition-colors"
                                 placeholder="Ex: Refeição Extra"
                                 value={novaDescricaoCusto}
                                 onChange={(e) => setNovaDescricaoCusto(e.target.value)}
                                 onKeyDown={handleAddCustoPersonalizado}
                              />
                              <input 
                                 type="text" 
                                 className="flex-1 px-3 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-mono text-sm rounded-none transition-colors"
                                 placeholder="Valor"
                                 value={novoValorCusto}
                                 onChange={(e) => setNovoValorCusto(e.target.value)}
                                 onKeyDown={handleAddCustoPersonalizado}
                              />
                              <button 
                                 onClick={handleAddCustoPersonalizado}
                                 className="px-3 bg-secondary text-white border-2 border-secondary font-bold uppercase text-xs hover:bg-primary transition-colors shadow-hard-sm"
                              >
                                 Add
                              </button>
                           </div>
                        </div>
                     </div>

                     {/* Direita: Equipe e Resumo */}
                     <div className="flex flex-col gap-6">
                        {/* Equipe */}
                        <div className="bg-gray-50 border-2 border-secondary p-4 rounded-sm">
                           <label className="block text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-3">Equipe de Pintoras</label>
                           
                           <div className="flex flex-wrap gap-2 mb-4">
                              {pintoras.map(p => (
                                 <div key={p} className="flex items-center gap-1 bg-white border-2 border-primary text-primary px-2 py-1 rounded-sm text-sm font-medium shadow-sm">
                                    {p}
                                    <button onClick={() => handleRemovePintora(p)} className="hover:text-accent-error transition-colors flex items-center ml-1">
                                       <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                 </div>
                              ))}
                              {pintoras.length === 0 && <span className="text-sm text-gray-400 italic">Nenhuma pintora adicionada</span>}
                           </div>

                           <div className="flex gap-2">
                              <input 
                                 type="text" 
                                 className="flex-1 px-3 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 outline-none font-body text-sm rounded-none transition-colors"
                                 placeholder="Nome da pintora..."
                                 value={novaPintora}
                                 onChange={(e) => setNovaPintora(e.target.value)}
                                 onKeyDown={handleAddPintora}
                              />
                              <button 
                                 onClick={handleAddPintora}
                                 className="px-3 bg-primary text-white border-2 border-secondary font-bold uppercase text-xs hover:bg-[#c0056b] transition-colors shadow-hard-sm"
                              >
                                 Add
                              </button>
                           </div>
                        </div>

                        {/* Dashboard Resumo */}
                        <div className="flex-1 bg-secondary text-white p-6 flex flex-col justify-center rounded-sm relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 opacity-10">
                              <span className="material-symbols-outlined text-8xl">monitoring</span>
                           </div>
                           
                           <h4 className="font-mono text-sm uppercase tracking-widest text-gray-400 mb-6 relative z-10">Resumo do Planejamento</h4>
                           
                           <div className="space-y-4 relative z-10">
                              <div className="flex justify-between items-center text-sm border-b border-gray-600 pb-2">
                                 <span className="text-gray-300">Receita Prevista</span>
                                 <span className="font-mono font-medium">R$ {receitaPrevista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm border-b border-gray-600 pb-2">
                                 <span className="text-gray-300">Custos Totais</span>
                                 <span className="font-mono font-medium text-accent-error">- R$ {totalCustos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between items-end pt-2">
                                 <span className="font-display font-bold text-lg">Margem Prevista</span>
                                 <div className="text-right">
                                    <span className={`font-mono font-bold text-2xl block ${margemLucro >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                                       R$ {margemLucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${margemLucro >= 0 ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-error/20 text-accent-error'}`}>
                                       {percentualMargem}%
                                    </span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>

                  <footer className="px-6 py-4 bg-gray-50 border-t-2 border-secondary flex justify-end gap-3 rounded-b-sm">
                     <button 
                        onClick={closePlanner}
                        className="px-6 py-2 bg-white text-secondary font-display font-bold text-sm uppercase tracking-wider border-2 border-secondary hover:bg-gray-100 transition-colors shadow-hard-sm"
                     >
                        Cancelar
                     </button>
                     <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-primary text-white font-display font-bold text-sm uppercase tracking-wider border-2 border-secondary hover:bg-[#c0056b] hover:-translate-y-0.5 transition-all shadow-hard disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        {saving ? (
                           <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                        ) : (
                           <span className="material-symbols-outlined text-[18px]">save</span>
                        )}
                        Salvar Planejamento
                     </button>
                  </footer>
               </div>
            </div>
         )}
      </div>
   );
};

export default EventPlanner;
