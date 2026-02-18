import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import ClientModal, { INTERESSES, INTERESSE_ICONS, ClientFormData, EditingClient } from '../components/AddClientModal';

// Helper: generate initials from name
const getInitials = (name: string): string[] => {
   if (name.includes('&')) {
      return name.split('&').map(part => part.trim().charAt(0).toUpperCase());
   }
   const words = name.trim().split(/\s+/);
   if (words.length >= 2) {
      return [words[0].charAt(0).toUpperCase(), words[words.length - 1].charAt(0).toUpperCase()];
   }
   return [name.charAt(0).toUpperCase()];
};

const INITIAL_COLORS = [
   'bg-blue-100', 'bg-yellow-100', 'bg-purple-200', 'bg-green-100',
   'bg-pink-100', 'bg-orange-100', 'bg-red-100', 'bg-cyan-100',
];
const getInitialColor = (initial: string): string => {
   const code = initial.charCodeAt(0);
   return INITIAL_COLORS[code % INITIAL_COLORS.length];
};

interface SupabaseClient {
   id: string;
   name: string;
   interesse: string[] | null;
   email: string | null;
   phone: string | null;
   instagram: string | null;
   cidade_id: number | null;
   cidades?: { nome: string; estado_id: number; estados?: { sigla: string; nome: string } } | null;
}

const ClientRegistry = () => {
   const navigate = useNavigate();
   const { user } = useAuth();
   const [searchTerm, setSearchTerm] = useState('');
   const [clients, setClients] = useState<SupabaseClient[]>([]);
   const [loading, setLoading] = useState(true);
   const [modalOpen, setModalOpen] = useState(false);
   const [editingClient, setEditingClient] = useState<EditingClient | null>(null);

   // Filter state
   const [showFilters, setShowFilters] = useState(false);
   const [filterInteresse, setFilterInteresse] = useState<string>('');
   const [filterEstado, setFilterEstado] = useState<string>('');
   const [estados, setEstados] = useState<{ id: number; nome: string; sigla: string }[]>([]);
   const filterRef = useRef<HTMLDivElement>(null);
   const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({});

   // Click outside to close filter
   useEffect(() => {
      if (!showFilters) return;
      const handleClick = (e: MouseEvent) => {
         if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
            setShowFilters(false);
         }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
   }, [showFilters]);

   const fetchClients = async () => {
      setLoading(true);
      const { data, error } = await supabase
         .from('clients')
         .select('*, cidades(nome, estado_id, estados(sigla, nome))')
         .order('created_at', { ascending: false });

      if (!error && data) {
         setClients(data as SupabaseClient[]);
      }
      setLoading(false);
   };

   useEffect(() => {
      fetchClients();
      supabase.from('estados').select('*').order('nome').then(({ data }) => {
         if (data) setEstados(data);
      });
      // Fetch proposal counts per client
      supabase.from('propostas').select('client_id').then(({ data }) => {
         if (data) {
            const counts: Record<string, number> = {};
            data.forEach((p: any) => { if (p.client_id) counts[p.client_id] = (counts[p.client_id] || 0) + 1; });
            setProposalCounts(counts);
         }
      });
   }, []);

   const handleSaveClient = async (clientData: ClientFormData) => {
      if (!user) throw new Error('Você precisa estar logado.');

      const payload = {
         name: clientData.name,
         interesse: clientData.interesse.length > 0 ? clientData.interesse : null,
         email: clientData.email || null,
         phone: clientData.phone || null,
         instagram: clientData.instagram || null,
         cidade_id: clientData.cidade_id,
      };

      if (editingClient) {
         const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
         if (error) throw new Error(error.message);
      } else {
         const { error } = await supabase.from('clients').insert({ ...payload, user_id: user.id });
         if (error) throw new Error(error.message);
      }
      await fetchClients();
   };

   const handleEditClient = (client: SupabaseClient) => {
      setEditingClient({
         id: client.id,
         name: client.name,
         interesse: client.interesse || [],
         email: client.email || '',
         phone: client.phone || '',
         instagram: client.instagram || '',
         cidade_id: client.cidade_id,
         _estado_id: client.cidades?.estado_id ?? null,
      });
      setModalOpen(true);
   };

   const handleNewClient = () => {
      setEditingClient(null);
      setModalOpen(true);
   };

   const handleCloseModal = () => {
      setModalOpen(false);
      setEditingClient(null);
   };

   const handleDeleteClient = async (id: string) => {
      if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
      await supabase.from('clients').delete().eq('id', id);
      await fetchClients();
   };

   const activeFilterCount = (filterInteresse ? 1 : 0) + (filterEstado ? 1 : 0);

   const clearFilters = () => {
      setFilterInteresse('');
      setFilterEstado('');
   };

   const filteredClients = clients.filter(client => {
      const matchesSearch = !searchTerm ||
         client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (client.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
         (client.interesse || []).some(i => i.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesInteresse = !filterInteresse ||
         (client.interesse || []).includes(filterInteresse);

      const matchesEstado = !filterEstado || client.cidades?.estados?.sigla === filterEstado;

      return matchesSearch && matchesInteresse && matchesEstado;
   });

   return (
      <div class="flex-1 flex flex-col h-full overflow-hidden relative">
         <div class="absolute inset-0 z-0 pointer-events-none bg-noise opacity-50 mix-blend-multiply"></div>

         {/* Header */}
         <header class="relative z-20 px-10 py-8 pb-4 flex flex-col gap-6">
            <div class="flex justify-between items-end">
               <div>
                  <h2 class="font-display text-4xl font-bold text-secondary leading-tight">Registro de Clientes</h2>
                  <p class="font-body text-gray-600 mt-1 max-w-lg">Gerencie os noivos, parceiros e cerimonialistas. Mantenha o seu CRM tão organizado quanto sua paleta de cores.</p>
               </div>
               <div class="flex gap-2 text-sm font-mono text-gray-500">
                  <span class="px-2 py-1 bg-white border border-secondary rounded-sm">Total: {clients.length}</span>
                  <span class="px-2 py-1 bg-white border border-secondary rounded-sm text-accent-success">Filtrados: {filteredClients.length}</span>
               </div>
            </div>

            {/* Toolbar */}
            <div class="flex flex-wrap gap-4 items-center justify-between mt-4">
               <div class="relative group w-full max-w-md">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <span class="material-symbols-outlined text-gray-400 group-focus-within:text-primary transition-colors">search</span>
                  </div>
                  <input
                     class="block w-full pl-10 pr-3 py-3 border-2 border-secondary rounded-sm bg-white text-secondary placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-primary focus:shadow-hard-sm font-mono text-sm transition-all"
                     placeholder="Buscar por nome, email ou interesse..."
                     type="text"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
               <div class="flex gap-4">
                  {/* Filter button + dropdown — all inside ref */}
                  <div class="relative" ref={filterRef}>
                     <button
                        onClick={() => setShowFilters(!showFilters)}
                        class={`px-4 py-3 border-2 border-secondary bg-white hover:bg-gray-50 font-display font-medium text-sm uppercase tracking-wide flex items-center gap-2 shadow-hard-sm active:translate-y-[2px] active:shadow-none transition-all ${showFilters ? 'bg-gray-50 shadow-none translate-y-[2px]' : ''}`}
                     >
                        <span class="material-symbols-outlined text-lg">filter_list</span>
                        Filtros
                        {activeFilterCount > 0 && (
                           <span class="ml-1 h-5 w-5 bg-primary text-white rounded-full text-xs font-bold flex items-center justify-center">{activeFilterCount}</span>
                        )}
                     </button>

                     {/* Filter Dropdown */}
                     {showFilters && (
                        <div class="absolute right-0 mt-2 w-72 bg-white border-2 border-secondary shadow-hard z-50 p-4 space-y-4">
                           <div class="flex items-center justify-between">
                              <p class="font-display text-sm font-bold uppercase tracking-wider text-secondary">Filtrar por</p>
                              {activeFilterCount > 0 && (
                                 <button onClick={clearFilters} class="text-xs font-mono text-primary hover:underline">Limpar</button>
                              )}
                           </div>

                           {/* Interesse filter */}
                           <div>
                              <label class="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Interesse</label>
                              <select
                                 class="w-full bg-surface border-2 border-secondary p-2.5 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none appearance-none"
                                 value={filterInteresse}
                                 onChange={(e) => setFilterInteresse(e.target.value)}
                              >
                                 <option value="">Todos</option>
                                 {INTERESSES.map(i => (
                                    <option key={i} value={i}>{i}</option>
                                 ))}
                              </select>
                           </div>

                           {/* Estado filter */}
                           <div>
                              <label class="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Estado</label>
                              <select
                                 class="w-full bg-surface border-2 border-secondary p-2.5 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none appearance-none"
                                 value={filterEstado}
                                 onChange={(e) => setFilterEstado(e.target.value)}
                              >
                                 <option value="">Todos</option>
                                 {estados.map(e => (
                                    <option key={e.id} value={e.sigla}>{e.sigla} - {e.nome}</option>
                                 ))}
                              </select>
                           </div>

                           <button
                              onClick={() => setShowFilters(false)}
                              class="w-full py-2 border-2 border-secondary bg-primary text-white font-display font-bold text-xs uppercase tracking-wider shadow-hard-sm hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all"
                           >
                              Aplicar
                           </button>
                        </div>
                     )}
                  </div>
                  <button onClick={handleNewClient} class="px-6 py-3 border-2 border-secondary bg-primary text-white font-display font-bold text-sm uppercase tracking-wider flex items-center gap-2 shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all">
                     <span class="material-symbols-outlined text-lg">add</span>
                     Novo Cliente
                  </button>
               </div>
            </div>

            {/* Active filter badges */}
            {activeFilterCount > 0 && (
               <div class="flex gap-2 flex-wrap">
                  {filterInteresse && (
                     <span class="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 border border-primary/30 text-xs font-mono text-primary rounded-sm">
                        <span class="material-symbols-outlined text-[14px]">{INTERESSE_ICONS[filterInteresse] || 'brush'}</span>
                        {filterInteresse}
                        <button onClick={() => setFilterInteresse('')} class="ml-1 hover:text-primary/70"><span class="material-symbols-outlined text-[14px]">close</span></button>
                     </span>
                  )}
                  {filterEstado && (
                     <span class="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 border border-primary/30 text-xs font-mono text-primary rounded-sm">
                        <span class="material-symbols-outlined text-[14px]">location_on</span>
                        {filterEstado}
                        <button onClick={() => setFilterEstado('')} class="ml-1 hover:text-primary/70"><span class="material-symbols-outlined text-[14px]">close</span></button>
                     </span>
                  )}
               </div>
            )}
         </header>

         {/* Grid */}
         <div class="relative z-10 flex-1 overflow-y-auto px-10 py-6 pb-20">
            {loading ? (
               <div class="flex items-center justify-center py-20">
                  <div class="flex flex-col items-center gap-3">
                     <span class="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
                     <p class="font-mono text-sm text-gray-500">Carregando clientes...</p>
                  </div>
               </div>
            ) : filteredClients.length === 0 ? (
               <div class="flex flex-col items-center justify-center py-20 text-center">
                  <span class="material-symbols-outlined text-6xl text-gray-300 mb-4">group_off</span>
                  <h3 class="font-display text-xl font-bold text-secondary mb-1">
                     {searchTerm || activeFilterCount > 0 ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                  </h3>
                  <p class="font-body text-gray-500 mb-6">
                     {searchTerm || activeFilterCount > 0
                        ? 'Tente buscar com outros termos ou remover os filtros.'
                        : 'Comece adicionando seu primeiro cliente!'}
                  </p>
                  {!searchTerm && activeFilterCount === 0 && (
                     <button onClick={handleNewClient} class="px-6 py-3 border-2 border-secondary bg-primary text-white font-display font-bold text-sm uppercase tracking-wider shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 transition-all flex items-center gap-2">
                        <span class="material-symbols-outlined text-lg">add</span>
                        Novo Cliente
                     </button>
                  )}
                  {activeFilterCount > 0 && (
                     <button onClick={clearFilters} class="px-4 py-2 text-primary font-display font-bold text-sm uppercase tracking-wider hover:underline">
                        Limpar Filtros
                     </button>
                  )}
               </div>
            ) : (
               <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {filteredClients.map((client) => {
                     const initials = getInitials(client.name);
                     const colors = initials.map(i => getInitialColor(i));
                     const cidadeEstado = client.cidades
                        ? `${client.cidades.nome}${client.cidades.estados ? ', ' + client.cidades.estados.sigla : ''}`
                        : null;
                     const interesses = client.interesse || [];

                     return (
                        <div
                           key={client.id}
                           class="group relative bg-white border-2 border-secondary p-6 flex flex-col gap-4 shadow-hard hover:shadow-hard-hover hover:-translate-y-1 transition-all duration-200 cursor-pointer"
                           onClick={() => handleEditClient(client)}
                        >
                           <div class="flex justify-between items-start">
                              <div class="flex flex-col">
                                 <h3 class="font-display text-2xl font-bold text-secondary group-hover:text-primary transition-colors">{client.name}</h3>
                                 {interesses.length > 0 && (
                                    <div class="flex flex-wrap gap-1 mt-1">
                                       {interesses.map(int => (
                                          <span key={int} class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/30 text-xs font-mono text-primary rounded-sm">
                                             <span class="material-symbols-outlined text-[14px]">{INTERESSE_ICONS[int] || 'brush'}</span>
                                             {int}
                                          </span>
                                       ))}
                                    </div>
                                 )}
                              </div>
                              <div class="flex gap-1">
                                 <button
                                    onClick={(e) => { e.stopPropagation(); handleEditClient(client); }}
                                    class="text-gray-400 hover:text-primary transition-colors p-1"
                                    title="Editar"
                                 >
                                    <span class="material-symbols-outlined text-[20px]">edit</span>
                                 </button>
                                 <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id); }}
                                    class="text-gray-400 hover:text-accent-error transition-colors p-1"
                                    title="Excluir"
                                 >
                                    <span class="material-symbols-outlined text-[20px]">delete</span>
                                 </button>
                              </div>
                           </div>

                           <div class="space-y-3 pt-2">
                              {cidadeEstado && (
                                 <div class="flex items-center gap-3 text-sm font-body text-gray-600">
                                    <span class="material-symbols-outlined text-lg text-primary">location_on</span>
                                    <span class="font-mono text-secondary">{cidadeEstado}</span>
                                 </div>
                              )}
                              {client.email && (
                                 <div class="flex items-center gap-3 text-sm font-body text-gray-600">
                                    <span class="material-symbols-outlined text-lg text-gray-400">mail</span>
                                    <span>{client.email}</span>
                                 </div>
                              )}
                              {client.phone && (
                                 <div class="flex items-center gap-3 text-sm font-body text-gray-600">
                                    <span class="material-symbols-outlined text-lg text-gray-400">phone</span>
                                    <span>{client.phone}</span>
                                 </div>
                              )}
                              {client.instagram && (
                                 <div class="flex items-center gap-3 text-sm font-body text-gray-600">
                                    <span class="material-symbols-outlined text-lg text-gray-400">alternate_email</span>
                                    <span>{client.instagram}</span>
                                 </div>
                              )}
                           </div>

                           <div class="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                              <div class="flex -space-x-2 overflow-hidden">
                                 {initials.map((init, i) => (
                                    <div key={i} class={`inline-block h-8 w-8 rounded-full ring-2 ring-white ${colors[i]} flex items-center justify-center text-xs font-bold border border-secondary`}>
                                       {init}
                                    </div>
                                 ))}
                              </div>
                              <button
                                 onClick={(e) => { e.stopPropagation(); navigate('/events'); }}
                                 class="font-display font-bold text-sm uppercase tracking-wide border-b-2 border-primary pb-0.5 hover:text-primary hover:border-secondary transition-colors bg-transparent cursor-pointer"
                              >
                                 Ver Eventos
                              </button>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
         </div>

         {/* Client Modal (Add/Edit) */}
         <ClientModal
            isOpen={modalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveClient}
            editingClient={editingClient}
         />
      </div>
   );
};

export default ClientRegistry;
