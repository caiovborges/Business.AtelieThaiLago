import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import EventModal, { EventFormData, EditingEvent } from '../components/EventModal';

const STATUS_COLORS: Record<string, string> = {
   'Confirmado': 'bg-blue-100 text-blue-800 border-blue-300',
   'Concluído': 'bg-green-100 text-green-800 border-green-300',
   'Cancelado': 'bg-red-100 text-red-800 border-red-300',
};

const SERVICO_ICONS: Record<string, string> = {
   'Árvore de Digitais': 'nature',
   'Aquarela dos Convidados': 'palette',
   'Pintura dos Noivos': 'brush',
   'Identidade Visual': 'design_services',
   'Outros': 'star',
};

interface SupabaseEvento {
   id: string;
   nome: string;
   client_id: string | null;
   data_evento: string | null;
   servico: string | string[] | null;
   status: string;
   cidade_id: number | null;
   local: string | null;
   observacoes: string | null;
   contrato_url: string | null;
   created_at: string;
   clients?: { id: string; name: string } | null;
   cidades?: { nome: string; estado_id: number; estados?: { sigla: string; nome: string } } | null;
}

const ALL_STATUSES = ['Todos', 'Confirmado', 'Concluído', 'Cancelado'];

const EventCanvas = () => {
   const navigate = useNavigate();
   const { user } = useAuth();
   const [events, setEvents] = useState<SupabaseEvento[]>([]);
   const [loading, setLoading] = useState(true);
   const [filter, setFilter] = useState('Todos');
   const [searchTerm, setSearchTerm] = useState('');
   const [modalOpen, setModalOpen] = useState(false);
   const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null);

   const fetchEvents = async () => {
      setLoading(true);
      const { data, error } = await supabase
         .from('eventos')
         .select('*, clients(id, name), cidades(nome, estado_id, estados(sigla, nome))')
         .order('data_evento', { ascending: true, nullsFirst: false });

      if (!error && data) {
         setEvents(data as SupabaseEvento[]);
      }
      setLoading(false);
   };

   useEffect(() => {
      fetchEvents();
   }, []);

   const handleSaveEvent = async (eventData: EventFormData, contratoFile: File | null) => {
      if (!user) throw new Error('Você precisa estar logado.');

      let contrato_url: string | null = editingEvent?.contrato_url || null;

      if (contratoFile) {
         const fileExt = contratoFile.name.split('.').pop();
         const filePath = `${user.id}/${Date.now()}.${fileExt}`;
         const { error: uploadError } = await supabase.storage
            .from('contratos')
            .upload(filePath, contratoFile);

         if (uploadError) throw new Error('Erro ao enviar contrato: ' + uploadError.message);

         const { data: urlData } = supabase.storage
            .from('contratos')
            .getPublicUrl(filePath);

         contrato_url = urlData.publicUrl;
      }

      const payload = {
         nome: eventData.nome,
         client_id: eventData.client_id,
         data_evento: eventData.data_evento || null,
         servico: eventData.servico || null,
         status: eventData.status,
         cidade_id: eventData.cidade_id,
         local: eventData.local || null,
         observacoes: eventData.observacoes || null,
         contrato_url,
      };

      if (editingEvent) {
         const { error } = await supabase.from('eventos').update(payload).eq('id', editingEvent.id);
         if (error) throw new Error(error.message);
      } else {
         const { error } = await supabase.from('eventos').insert({ ...payload, user_id: user.id });
         if (error) throw new Error(error.message);
      }
      await fetchEvents();
   };

   const handleEditEvent = (event: SupabaseEvento) => {
      setEditingEvent({
         id: event.id,
         nome: event.nome,
         client_id: event.client_id,
         data_evento: event.data_evento || '',
         servico: event.servico || '',
         status: event.status,
         cidade_id: event.cidade_id,
         local: event.local || '',
         observacoes: event.observacoes || '',
         contrato_url: event.contrato_url,
         _estado_id: event.cidades?.estado_id ?? null,
      });
      setModalOpen(true);
   };

   const handleNewEvent = () => {
      setEditingEvent(null);
      setModalOpen(true);
   };

   const handleCloseModal = () => {
      setModalOpen(false);
      setEditingEvent(null);
   };

   const handleDeleteEvent = async (id: string) => {
      if (!confirm('Tem certeza que deseja excluir este evento?')) return;
      await supabase.from('eventos').delete().eq('id', id);
      await fetchEvents();
   };

   const filteredEvents = events.filter(event => {
      const matchesStatus = filter === 'Todos' || event.status === filter;
      const matchesSearch = !searchTerm ||
         event.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (event.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
         (event.local || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
   });

   // Group events by month/year
   const groupedEvents: Record<string, SupabaseEvento[]> = {};
   filteredEvents.forEach(event => {
      const date = event.data_evento ? new Date(event.data_evento + 'T12:00:00') : null;
      const key = date
         ? date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
         : 'Sem data';
      if (!groupedEvents[key]) groupedEvents[key] = [];
      groupedEvents[key].push(event);
   });

   const formatDate = (dateStr: string | null) => {
      if (!dateStr) return { day: '\u2014', month: '', weekday: '' };
      const d = new Date(dateStr + 'T12:00:00');
      return {
         day: d.getDate().toString().padStart(2, '0'),
         month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', ''),
         weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', ''),
      };
   };

   return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background-light">
         <header className="px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-2 border-secondary/5 bg-background-light/50 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex flex-col gap-1">
               <h2 className="text-4xl font-black text-secondary tracking-tight font-display">Eventos</h2>
               <p className="text-gray-500 font-medium max-w-lg">Gerencie seus eventos de pintura e acompanhe cada sessão.</p>
            </div>
            <button
               onClick={handleNewEvent}
               className="group flex items-center justify-center gap-2 bg-primary hover:bg-[#c0056b] text-white h-12 px-6 border-2 border-secondary shadow-hard hover:translate-y-[2px] hover:shadow-none transition-all rounded-sm"
            >
               <span className="material-symbols-outlined text-[20px] font-bold">add</span>
               <span className="font-display font-bold text-sm tracking-wider uppercase">Novo Evento</span>
            </button>
         </header>

         <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {/* Tabs + Search */}
            <div className="flex flex-col items-stretch md:flex-row md:justify-between md:items-end gap-6 mb-8">
               <div className="flex flex-wrap gap-0 bg-white border-2 border-secondary rounded-sm shadow-sm overflow-hidden w-full md:w-auto">
                  {ALL_STATUSES.map((status) => (
                     <button
                        key={status}
                        onClick={() => setFilter(status)}
                        className={`flex-1 md:flex-none px-4 md:px-5 py-2.5 font-display font-bold text-xs md:text-sm border-r border-gray-200 last:border-r-0 transition-colors ${filter === status ? 'bg-secondary text-white' : 'bg-white text-secondary hover:bg-gray-50'
                           }`}
                     >
                        {status}
                     </button>
                  ))}
               </div>

               <div className="relative grow md:grow-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[20px]">search</span>
                  <input
                     className="w-full md:w-80 pl-10 pr-4 py-2.5 bg-white border-2 border-secondary focus:border-primary focus:ring-0 rounded-sm font-mono text-sm placeholder-gray-400"
                     placeholder="Buscar evento ou cliente..."
                     type="text"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
            </div>

            {/* Content */}
            {loading ? (
               <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                     <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
                     <p className="font-mono text-sm text-gray-500">Carregando eventos...</p>
                  </div>
               </div>
            ) : filteredEvents.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">event_busy</span>
                  <h3 className="font-display text-xl font-bold text-secondary mb-1">
                     {searchTerm || filter !== 'Todos' ? 'Nenhum evento encontrado' : 'Nenhum evento cadastrado'}
                  </h3>
                  <p className="font-body text-gray-500 mb-6">
                     {searchTerm || filter !== 'Todos'
                        ? 'Tente buscar com outros termos ou remover os filtros.'
                        : 'Comece criando seu primeiro evento!'}
                  </p>
                  {!searchTerm && filter === 'Todos' && (
                     <button onClick={handleNewEvent} className="px-6 py-3 border-2 border-secondary bg-primary text-white font-display font-bold text-sm uppercase tracking-wider shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 transition-all flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">add</span>
                        Novo Evento
                     </button>
                  )}
               </div>
            ) : (
               <div className="flex flex-col gap-4">
                  {Object.entries(groupedEvents).map(([monthYear, evts]) => (
                     <React.Fragment key={monthYear}>
                        <div className="flex items-center gap-4 py-2">
                           <span className="font-mono text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{monthYear}</span>
                           <div className="h-px bg-secondary/10 flex-1"></div>
                        </div>

                        {evts.map(event => {
                           const { day, month, weekday } = formatDate(event.data_evento);
                           const cidadeEstado = event.cidades
                              ? `${event.cidades.nome}${event.cidades.estados ? ', ' + event.cidades.estados.sigla : ''}`
                              : null;

                           return (
                              <div
                                 key={event.id}
                                 className={`group relative bg-white border-2 border-secondary p-0 hover:-translate-y-1 hover:shadow-hard-hover transition-all duration-200 cursor-pointer rounded-sm overflow-hidden ${event.status === 'Cancelado' ? 'grayscale opacity-70 hover:grayscale-0 hover:opacity-100' : ''
                                    }`}
                                 onClick={() => navigate(`/events/${event.id}`)}
                              >
                                 <div className="flex flex-col md:flex-row items-stretch">
                                    {/* Date */}
                                    <div className="w-full md:w-32 bg-gray-50 md:border-r-2 border-b-2 md:border-b-0 border-secondary flex flex-col items-center justify-center p-4 shrink-0">
                                       <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{month}</span>
                                       <span className={`font-display text-4xl font-bold ${event.status === 'Concluído' ? 'text-gray-600 line-through decoration-primary decoration-2' : 'text-secondary'
                                          }`}>{day}</span>
                                       <span className="font-mono text-[10px] font-medium text-gray-400 mt-1">{weekday}</span>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 p-5 flex flex-col justify-center gap-2">
                                       <div className="flex flex-wrap items-center gap-3 mb-1">
                                          <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[event.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                                             {event.status}
                                          </span>
                                          {(() => {
                                             const servicos = Array.isArray(event.servico)
                                                ? event.servico
                                                : event.servico ? [event.servico] : [];

                                             return servicos.map(s => (
                                                <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/30 text-[10px] font-mono text-primary">
                                                   <span className="material-symbols-outlined text-[12px]">{SERVICO_ICONS[s] || 'brush'}</span>
                                                   {s}
                                                </span>
                                             ));
                                          })()}
                                          {(cidadeEstado || event.local) && (
                                             <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-gray-500">
                                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                {event.local ? `${event.local}${cidadeEstado ? ` \u00b7 ${cidadeEstado}` : ''}` : cidadeEstado}
                                             </span>
                                          )}
                                          {event.contrato_url && (
                                             <span className="flex items-center gap-1 text-[11px] font-mono text-green-600">
                                                <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                                Contrato
                                             </span>
                                          )}
                                       </div>
                                       <h3 className="font-display text-xl font-bold text-secondary group-hover:text-primary transition-colors">{event.nome}</h3>
                                       {event.clients && (
                                          <div className="flex items-center gap-2">
                                             <span className="material-symbols-outlined text-gray-400 text-[16px]">person</span>
                                             <span className="text-sm font-medium text-gray-600">{event.clients.name}</span>
                                          </div>
                                       )}
                                       {event.observacoes && (
                                          <p className="text-xs text-gray-400 font-mono line-clamp-1 mt-1">{event.observacoes}</p>
                                       )}
                                    </div>

                                    {/* Actions */}
                                    <div className="w-full md:w-24 bg-gray-50/50 md:border-l-2 border-t-2 md:border-t-0 border-secondary p-3 flex md:flex-col items-center justify-center gap-2 shrink-0">
                                       <button
                                          onClick={(e) => { e.stopPropagation(); handleEditEvent(event); }}
                                          className="p-2 text-gray-400 hover:text-primary transition-colors"
                                          title="Editar"
                                       >
                                          <span className="material-symbols-outlined text-[20px]">edit</span>
                                       </button>
                                       <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                                          className="p-2 text-gray-400 hover:text-accent-error transition-colors"
                                          title="Excluir"
                                       >
                                          <span className="material-symbols-outlined text-[20px]">delete</span>
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           );
                        })}
                     </React.Fragment>
                  ))}
               </div>
            )
            }
         </div >

         {/* Event Modal */}
         < EventModal
            isOpen={modalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveEvent}
            editingEvent={editingEvent}
         />
      </div >
   );
};

export default EventCanvas;
