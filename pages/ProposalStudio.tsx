import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface Proposta {
   id: string;
   titulo: string;
   status: string;
   data_evento: string | null;
   created_at: string;
   client_id: string | null;
   clients?: { name: string } | null;
   lead_id: string | null;
   leads?: { name: string } | null;
   proposta_itens?: { valor_unitario: number; quantidade: number }[];
   incluir_deslocamento: boolean;
   custo_deslocamento: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
   'Rascunho': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
   'Enviada': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
   'Aprovada': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300' },
   'Recusada': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
};

const ProposalStudio = () => {
   const navigate = useNavigate();
   const { user } = useAuth();
   const [propostas, setPropostas] = useState<Proposta[]>([]);
   const [loading, setLoading] = useState(true);
   const [filterStatus, setFilterStatus] = useState('');
   const [search, setSearch] = useState('');

   const fetchPropostas = async () => {
      setLoading(true);
      const { data } = await supabase
         .from('propostas')
         .select('*, clients(name), leads(name), proposta_itens(valor_unitario, quantidade)')
         .order('updated_at', { ascending: false });
      if (data) setPropostas(data as any);
      setLoading(false);
   };

   useEffect(() => { fetchPropostas(); }, []);

   const handleCreate = async () => {
      if (!user) return;
      const { data, error } = await supabase
         .from('propostas')
         .insert({ user_id: user.id, titulo: 'Nova Proposta' })
         .select('id')
         .single();
      if (data) navigate(`/proposals/${data.id}`);
      if (error) alert('Erro: ' + error.message);
   };

   const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('Excluir esta proposta?')) return;
      await supabase.from('propostas').delete().eq('id', id);
      await fetchPropostas();
   };

   // const getTotal = (p: Proposta): number => {
   //    const itensTotal = (p.proposta_itens || []).reduce((s, i) => s + (Number(i.valor_unitario) * Number(i.quantidade)), 0);
   //    return itensTotal + (p.incluir_deslocamento ? Number(p.custo_deslocamento) : 0);
   // };

   const filtered = propostas.filter(p => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (search) {
         const s = search.toLowerCase();
         const clientName = p.clients?.name || '';
         const leadName = p.leads?.name || '';
         if (!p.titulo.toLowerCase().includes(s) && !clientName.toLowerCase().includes(s) && !leadName.toLowerCase().includes(s)) return false;
      }
      return true;
   });

   const statuses = ['', 'Rascunho', 'Enviada', 'Aprovada', 'Recusada'];

   return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-background-light">
         {/* Header */}
         <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
               <h2 className="font-display text-4xl font-black tracking-tight text-secondary md:text-5xl">Propostas</h2>
               <p className="mt-2 font-mono text-gray-500">Orçamentos e previsões de custo para seus clientes.</p>
            </div>
            <button
               onClick={handleCreate}
               className="flex items-center gap-2 border-2 border-secondary bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-white shadow-hard transition-all hover:-translate-y-0.5 hover:shadow-hard-hover active:translate-y-0 active:shadow-none"
            >
               <span className="material-symbols-outlined text-[20px]">add</span>
               Nova Proposta
            </button>
         </div>

         {/* Filters */}
         <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative grow md:grow-0">
               <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
               <input
                  className="w-full md:w-56 pl-9 pr-4 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 rounded-sm font-mono text-sm placeholder-gray-400"
                  placeholder="Buscar proposta..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
               />
            </div>

         </div>

         {/* Content */}
         {
            loading ? (
               <div className="flex items-center justify-center py-20">
                  <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
               </div>
            ) : filtered.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <span className="material-symbols-outlined text-6xl mb-4">description</span>
                  <p className="font-display text-lg font-bold text-secondary">Nenhuma proposta encontrada</p>
                  <p className="font-mono text-sm mt-1 mb-6">Crie sua primeira proposta para começar.</p>
                  <button
                     onClick={handleCreate}
                     className="flex items-center gap-2 border-2 border-secondary bg-primary px-5 py-2.5 font-display text-sm font-bold uppercase tracking-widest text-white shadow-hard transition-all hover:-translate-y-0.5 hover:shadow-hard-hover"
                  >
                     <span className="material-symbols-outlined text-[18px]">add</span>
                     Criar Proposta
                  </button>
               </div>
            ) : (
               <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map(p => {
                     const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Rascunho'];
                     const dateStr = p.data_evento
                        ? new Date(p.data_evento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
                        : null;
                     return (
                        <div
                           key={p.id}
                           onClick={() => navigate(`/proposals/${p.id}`)}
                           className="group bg-white border-2 border-secondary p-5 shadow-hard-sm cursor-pointer transition-all hover:-translate-y-1 hover:shadow-hard flex flex-col justify-between"
                        >
                           <div>
                              <h3 className="font-display text-lg font-bold text-secondary group-hover:text-primary transition-colors leading-tight mb-3">
                                 {p.titulo}
                              </h3>
                              <div className="flex items-center gap-2 text-sm text-gray-500 font-mono mt-1">
                                 <span className="material-symbols-outlined text-[16px]">{p.lead_id ? 'person_outline' : 'person'}</span>
                                 {p.leads?.name || p.clients?.name || 'Lead não vinculado'}
                              </div>

                              {dateStr && (
                                 <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-500">
                                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                    {dateStr}
                                 </div>
                              )}

                              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                 <span className="material-symbols-outlined text-[12px]">receipt</span>
                                 {(p.proposta_itens || []).length} {(p.proposta_itens || []).length === 1 ? 'item' : 'itens'}
                              </div>
                           </div>

                           <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                              <span className="font-mono text-sm font-bold text-gray-400 uppercase tracking-wider">
                                 Ver Opções
                              </span>
                              <button
                                 onClick={(e) => handleDelete(p.id, e)}
                                 className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all p-1"
                              >
                                 <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )
         }
      </div>
   );
};

export default ProposalStudio;
