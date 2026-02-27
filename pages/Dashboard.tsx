import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
  valor: number;
  data: string | null;
  evento_id: string | null;
  categoria_id: number | null;
  categorias?: { nome: string } | null;
  eventos?: { nome: string } | null;
}

interface ProximoEvento {
  id: string;
  nome: string;
  data_evento: string | null;
  status: string;
  servico: string | string[] | null;
  clients?: { name: string } | null;
}

interface FollowUp {
  id: string;
  scheduled_at: string;
  type: string;
  leads?: { name: string } | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Pendente': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Confirmado': { bg: 'bg-blue-100', text: 'text-blue-800' },
  'Concluído': { bg: 'bg-green-100', text: 'text-green-800' },
  'Cancelado': { bg: 'bg-red-100', text: 'text-red-800' },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [proximosEventos, setProximosEventos] = useState<ProximoEvento[]>([]);
  const [pendingFollowups, setPendingFollowups] = useState<FollowUp[]>([]);
  const [recentTransacoes, setRecentTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);

  // Add transaction form
  const [addTipo, setAddTipo] = useState<'receita' | 'despesa'>('receita');
  const [addDate, setAddDate] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addCatId, setAddCatId] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [adding, setAdding] = useState(false);

  // Category manager
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatNome, setNewCatNome] = useState('');
  const [newCatTipo, setNewCatTipo] = useState<'receita' | 'despesa'>('receita');
  const [addingCat, setAddingCat] = useState(false);
  const catManagerRef = useRef<HTMLDivElement>(null);

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
    setLoading(true);
    const [transRes, catRes, eventosRes, recentRes, followupsRes] = await Promise.all([
      supabase.from('transacoes').select('id, tipo, valor, data').order('data', { ascending: true }),
      supabase.from('categorias').select('*').order('nome'),
      supabase
        .from('eventos')
        .select('id, nome, data_evento, status, servico, clients(name)')
        .in('status', ['Pendente', 'Confirmado'])
        .order('data_evento', { ascending: true })
        .limit(5),
      supabase
        .from('transacoes')
        .select('id, tipo, descricao, valor, data, evento_id, categoria_id, categorias(nome), eventos(nome)')
        .is('evento_id', null)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('lead_followups')
        .select('id, scheduled_at, type, leads(name)')
        .eq('done', false)
        .order('scheduled_at', { ascending: true })
        .limit(5),
    ]);

    if (transRes.data) setTransacoes(transRes.data as any);
    if (catRes.data) setCategorias(catRes.data as any);
    if (eventosRes.data) setProximosEventos(eventosRes.data as any);
    if (recentRes.data) setRecentTransacoes(recentRes.data as any);
    if (followupsRes.data) setPendingFollowups(followupsRes.data as any);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const totalReceita = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const totalDespesa = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  const lucro = totalReceita - totalDespesa;
  const margem = totalReceita > 0 ? Math.round((lucro / totalReceita) * 100) : 0;

  const chartData = (() => {
    const months: Record<string, { income: number; expense: number }> = {};
    transacoes.forEach(t => {
      if (!t.data) return;
      const d = new Date(t.data + 'T12:00:00');
      const sortKey = d.toISOString().slice(0, 7);
      if (!months[sortKey]) months[sortKey] = { income: 0, expense: 0 };
      if (t.tipo === 'receita') months[sortKey].income += Number(t.valor);
      else months[sortKey].expense += Number(t.valor);
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, val]) => {
        const d = new Date(key + '-15');
        return {
          name: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
          income: val.income,
          expense: val.expense,
        };
      });
  })();

  const parseAmount = (val: string): number => {
    const cleaned = val.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  const handleAddTransaction = async () => {
    if (!addDesc.trim() || !addAmount || !user) return;
    setAdding(true);
    const { error } = await supabase.from('transacoes').insert({
      user_id: user.id,
      evento_id: null,
      tipo: addTipo,
      descricao: addDesc.trim(),
      categoria_id: addCatId ? Number(addCatId) : null,
      valor: parseAmount(addAmount),
      data: addDate || null,
    });
    if (error) {
      console.error('Erro ao salvar transação:', error);
      alert('Erro ao salvar: ' + error.message);
    } else {
      setAddDate(''); setAddDesc(''); setAddCatId(''); setAddAmount('');
      await fetchData();
    }
    setAdding(false);
  };

  const handleDeleteTransaction = async (id: string) => {
    await supabase.from('transacoes').delete().eq('id', id);
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

  const formatDisplayDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const currentMonth = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const catFiltered = categorias.filter(c => c.tipo === addTipo);
  const catReceita = categorias.filter(c => c.tipo === 'receita');
  const catDespesa = categorias.filter(c => c.tipo === 'despesa');

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-background-light">
      {/* Header */}
      <div className="mb-6 md:mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight text-secondary">Studio Dashboard</h2>
          <p className="mt-2 font-mono text-xs md:text-base text-gray-500">Visão geral do seu império criativo &bull; <span className="text-primary font-bold capitalize">{currentMonth}</span></p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            <p className="font-mono text-sm text-gray-500">Carregando dados...</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="mb-10 grid gap-6 md:grid-cols-3">
            <div className="group relative flex flex-col justify-between border-2 border-secondary bg-white p-6 shadow-hard transition-all hover:-translate-y-1 hover:shadow-hard-hover">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-gray-500">Faturamento Total</h3>
                <div className="rounded-full border-2 border-secondary bg-primary/10 p-1 text-primary">
                  <span className="material-symbols-outlined text-[20px]">trending_up</span>
                </div>
              </div>
              <div className="mt-4">
                <p className="font-mono text-3xl font-bold text-primary md:text-4xl">
                  R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {transacoes.filter(t => t.tipo === 'receita').length} transações
                </p>
              </div>
            </div>

            <div className="group relative flex flex-col justify-between border-2 border-secondary bg-white p-6 shadow-hard transition-all hover:-translate-y-1 hover:shadow-hard-hover">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-gray-500">Despesas Totais</h3>
                <div className="rounded-full border-2 border-secondary bg-gray-100 p-1 text-secondary">
                  <span className="material-symbols-outlined text-[20px]">trending_down</span>
                </div>
              </div>
              <div className="mt-4">
                <p className="font-mono text-3xl font-bold text-secondary md:text-4xl">
                  R$ {totalDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {transacoes.filter(t => t.tipo === 'despesa').length} transações
                </p>
              </div>
            </div>

            <div className="group relative flex flex-col justify-between border-2 border-secondary bg-white p-6 shadow-hard transition-all hover:-translate-y-1 hover:shadow-hard-hover">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-gray-500">Lucro Líquido</h3>
                <div className={`rounded-full border-2 border-secondary p-1 ${lucro >= 0 ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-error/10 text-accent-error'}`}>
                  <span className="material-symbols-outlined text-[20px]">{lucro >= 0 ? 'attach_money' : 'money_off'}</span>
                </div>
              </div>
              <div className="mt-4">
                <p className={`font-mono text-3xl font-bold md:text-4xl ${lucro >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                  R$ {lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">Margem: {margem}%</p>
              </div>
            </div>
          </div>

          {/* Chart + Upcoming Events + Follow-ups */}
          <div className="grid gap-8 lg:grid-cols-4 mb-10">
            <div className="border-2 border-secondary bg-white p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)] lg:col-span-2 flex flex-col">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-secondary">Fluxo Financeiro</h3>
                <span className="font-mono text-xs text-gray-400">Últimos 6 meses</span>
              </div>
              <div className="flex-1 min-h-[300px] w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={4}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontFamily: 'Chivo Mono', fontSize: 12, fill: '#6B7280' }} dy={10} />
                      <Tooltip
                        cursor={{ fill: '#f3f4f6' }}
                        contentStyle={{ border: '2px solid #1A1A1A', borderRadius: '0px', boxShadow: '4px 4px 0px 0px #1A1A1A' }}
                        labelStyle={{ fontFamily: 'Space Grotesk', fontWeight: 'bold', textTransform: 'uppercase' }}
                        itemStyle={{ fontFamily: 'Chivo Mono' }}
                        formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      />
                      <Bar dataKey="income" name="Receita" fill="#E6007E" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="expense" name="Despesas" fill="#1A1A1A" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <span className="material-symbols-outlined text-5xl mb-2">bar_chart</span>
                    <p className="font-mono text-sm">Adicione transações para ver o gráfico</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 bg-primary"></div>
                  <span className="font-mono text-xs text-gray-600">Receita</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 bg-secondary"></div>
                  <span className="font-mono text-xs text-gray-600">Despesas</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col border-2 border-secondary bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)] lg:col-span-1">
              <div className="flex items-center justify-between border-b-2 border-secondary p-4">
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-secondary">Próximos Eventos</h3>
                <button onClick={() => navigate('/events')} className="flex h-8 w-8 items-center justify-center rounded-full border border-secondary hover:bg-gray-50">
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
              <div className="flex flex-col flex-1">
                {proximosEventos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 p-6 text-gray-400">
                    <span className="material-symbols-outlined text-4xl mb-2">event</span>
                    <p className="font-mono text-sm text-center">Nenhum evento próximo</p>
                  </div>
                ) : (
                  proximosEventos.map(event => {
                    const dateStr = event.data_evento
                      ? new Date(event.data_evento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase()
                      : 'S/D';
                    const sc = STATUS_COLORS[event.status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
                    return (
                      <div key={event.id} onClick={() => navigate(`/events/${event.id}`)} className="group flex items-start justify-between border-b border-gray-100 p-4 transition-colors hover:bg-gray-50 cursor-pointer">
                        <div>
                          <p className="font-mono text-xs font-bold text-primary mb-1">{dateStr}</p>
                          <p className="font-display text-sm font-bold text-secondary group-hover:text-primary transition-colors">{event.nome}</p>
                          <p className="text-xs text-gray-500">{event.clients?.name || (Array.isArray(event.servico) ? event.servico.join(', ') : event.servico) || ''}</p>
                        </div>
                        <span className={`rounded-full border border-secondary px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${sc.bg} ${sc.text}`}>
                          {event.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Next Follow-ups */}
            <div className="flex flex-col border-2 border-secondary bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)] lg:col-span-1">
              <div className="flex items-center justify-between border-b-2 border-secondary p-4">
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-secondary">Follow-ups</h3>
                <button onClick={() => navigate('/leads')} className="flex h-8 w-8 items-center justify-center rounded-full border border-secondary hover:bg-gray-50">
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
              <div className="flex flex-col flex-1">
                {pendingFollowups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 p-6 text-gray-400">
                    <span className="material-symbols-outlined text-4xl mb-2">call</span>
                    <p className="font-mono text-sm text-center">Nenhum follow-up pendente</p>
                  </div>
                ) : (
                  pendingFollowups.map(fu => {
                    const d = new Date(fu.scheduled_at);
                    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    let icon = 'call';
                    let color = 'bg-orange-100 text-orange-800';
                    if (fu.type === 'Whatsapp') { icon = 'chat'; color = 'bg-green-100 text-green-800'; }
                    if (fu.type === 'Email') { icon = 'mail'; color = 'bg-blue-100 text-blue-800'; }

                    return (
                      <div key={fu.id} className="group flex items-start justify-between border-b border-gray-100 p-4 transition-colors hover:bg-gray-50 cursor-pointer" onClick={() => navigate('/leads')}>
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-full ${color}`}>
                            <span className="material-symbols-outlined text-[16px]">{icon}</span>
                          </div>
                          <div>
                            <p className="font-display text-sm font-bold text-secondary group-hover:text-primary transition-colors">{fu.leads?.name || 'Lead'}</p>
                            <p className="font-mono text-xs text-gray-500">{dateStr} às {timeStr}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* General Transactions Section */}
          <div className="border-2 border-secondary bg-white p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold uppercase tracking-tight text-secondary">
                Entradas & Saídas Gerais
              </h3>
              <div className="flex items-center gap-2">
                {/* Category Manager */}
                <div className="relative" ref={catManagerRef}>
                  <button
                    onClick={() => setShowCatManager(!showCatManager)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-secondary transition-all shadow-hard-sm active:translate-y-[2px] active:shadow-none ${showCatManager ? 'bg-gray-100 shadow-none translate-y-[2px]' : 'bg-white hover:bg-gray-50'}`}
                    title="Gerenciar Categorias"
                  >
                    <span className="material-symbols-outlined text-[16px]">category</span>
                    <span className="inline">Categorias</span>
                  </button>

                  {showCatManager && (
                    <div className="absolute right-0 mt-2 w-80 bg-white border-2 border-secondary shadow-hard z-50 max-h-[70vh] overflow-y-auto">
                      <div className="p-4 border-b-2 border-secondary bg-gray-50">
                        <h3 className="font-display font-bold text-sm uppercase tracking-wider text-secondary">Gerenciar Categorias</h3>
                      </div>

                      <div className="p-4 border-b border-gray-200 space-y-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setNewCatTipo('receita')}
                            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider border-2 transition-all ${newCatTipo === 'receita' ? 'bg-accent-success/10 text-accent-success border-accent-success' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                            Receita
                          </button>
                          <button type="button" onClick={() => setNewCatTipo('despesa')}
                            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider border-2 transition-all ${newCatTipo === 'despesa' ? 'bg-accent-error/10 text-accent-error border-accent-error' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
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
                          <button onClick={handleAddCategoria} disabled={addingCat || !newCatNome.trim()}
                            className="h-[38px] px-3 border-2 border-secondary bg-primary text-white text-xs font-bold uppercase shadow-hard-sm hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            {addingCat ? <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span> : <span className="material-symbols-outlined text-[16px]">add</span>}
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-accent-success mb-2 flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-accent-success"></span> Receita
                          </p>
                          {catReceita.length === 0 ? (
                            <p className="text-xs text-gray-400 font-mono">Nenhuma categoria</p>
                          ) : (
                            <div className="space-y-1">
                              {catReceita.map(c => (
                                <div key={c.id} className="flex items-center justify-between group px-2 py-1.5 hover:bg-accent-success/5 transition-colors">
                                  <span className="text-sm text-secondary">{c.nome}</span>
                                  <button onClick={() => handleDeleteCategoria(c.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all">
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="h-px bg-gray-200"></div>

                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-accent-error mb-2 flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-accent-error"></span> Despesa
                          </p>
                          {catDespesa.length === 0 ? (
                            <p className="text-xs text-gray-400 font-mono">Nenhuma categoria</p>
                          ) : (
                            <div className="space-y-1">
                              {catDespesa.map(c => (
                                <div key={c.id} className="flex items-center justify-between group px-2 py-1.5 hover:bg-accent-error/5 transition-colors">
                                  <span className="text-sm text-secondary">{c.nome}</span>
                                  <button onClick={() => handleDeleteCategoria(c.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all">
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

                <span className="font-mono text-xs text-gray-400">Sem evento vinculado</span>
              </div>
            </div>

            {/* Add Form */}
            <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50/50 hover:bg-white transition-colors mb-6">
              <div className="flex gap-3 mb-3">
                <button type="button" onClick={() => { setAddTipo('receita'); setAddCatId(''); }}
                  className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-all ${addTipo === 'receita' ? 'bg-accent-success/10 text-accent-success border-accent-success shadow-[2px_2px_0px_0px_#00C896]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_upward</span> Receita
                </button>
                <button type="button" onClick={() => { setAddTipo('despesa'); setAddCatId(''); }}
                  className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-all ${addTipo === 'despesa' ? 'bg-accent-error/10 text-accent-error border-accent-error shadow-[2px_2px_0px_0px_#FF4D4D]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_downward</span> Despesa
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-1 lg:col-span-3">
                  <label className="block text-xs font-mono text-gray-500 mb-1">Data</label>
                  <input className={`w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 focus:ring-0 outline-none transition-colors rounded-none ${addTipo === 'receita' ? 'focus:border-accent-success' : 'focus:border-accent-error'}`}
                    type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} disabled={adding} />
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-mono text-gray-500 mb-1">Descrição</label>
                  <input className={`w-full bg-white border-2 border-gray-200 text-sm font-body p-2 focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300 ${addTipo === 'receita' ? 'focus:border-accent-success' : 'focus:border-accent-error'}`}
                    placeholder="Ex: Venda..." type="text" value={addDesc} onChange={(e) => setAddDesc(e.target.value)} disabled={adding} />
                </div>
                <div className="md:col-span-1 lg:col-span-3">
                  <label className="block text-xs font-mono text-gray-500 mb-1">Categoria</label>
                  <select className={`w-full bg-white border-2 border-gray-200 text-sm p-2 focus:ring-0 outline-none transition-colors rounded-none appearance-none ${addTipo === 'receita' ? 'focus:border-accent-success' : 'focus:border-accent-error'}`}
                    value={addCatId} onChange={(e) => setAddCatId(e.target.value)} disabled={adding}>
                    <option value="">Sem categ.</option>
                    {catFiltered.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="md:col-span-1 lg:col-span-3 w-full">
                  <label className="block text-xs font-mono text-gray-500 mb-1">Valor</label>
                  <input className={`w-full bg-white border-2 border-gray-200 text-sm font-mono p-2 text-right focus:ring-0 outline-none transition-colors rounded-none placeholder:text-gray-300 font-medium ${addTipo === 'receita' ? 'focus:border-accent-success text-accent-success' : 'focus:border-accent-error text-accent-error'}`}
                    placeholder="0,00" type="text" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} disabled={adding}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTransaction(); } }} />
                </div>
              </div>

              <button type="button" onClick={handleAddTransaction} disabled={adding || !addDesc.trim() || !addAmount}
                className={`w-full mt-4 flex items-center justify-center gap-2 bg-white border-2 font-display font-bold text-sm py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${addTipo === 'receita'
                  ? 'border-accent-success text-accent-success hover:bg-accent-success hover:text-white shadow-[2px_2px_0px_0px_#00C896] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                  : 'border-accent-error text-accent-error hover:bg-accent-error hover:text-white shadow-[2px_2px_0px_0px_#FF4D4D] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                  }`}>
                {adding ? <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span> : <span className="material-symbols-outlined text-lg">add_circle</span>}
                {addTipo === 'receita' ? 'ADICIONAR RECEITA' : 'ADICIONAR DESPESA'}
              </button>
            </div>

            {/* Recent general transactions */}
            {recentTransacoes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-gray-400 uppercase tracking-wider">Recentes</p>
                  <button onClick={() => navigate('/financeiro')} className="text-xs font-mono text-primary hover:underline flex items-center gap-1">
                    Ver tudo <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
                {recentTransacoes.map(t => (
                  <div key={t.id} className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-white border border-gray-200 hover:border-secondary transition-all">
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-[20px] ${t.tipo === 'receita' ? 'text-accent-success' : 'text-accent-error'}`}>
                        {t.tipo === 'receita' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                      <div>
                        <p className="font-body text-sm font-medium text-secondary">{t.descricao}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {t.data && <span className="font-mono">{formatDisplayDate(t.data)}</span>}
                          {t.categorias && (
                            <span className="flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[10px]">label</span>
                              {t.categorias.nome}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold ${t.tipo === 'receita' ? 'text-accent-success' : 'text-accent-error'}`}>
                        {t.tipo === 'receita' ? '+' : '-'} R$ {Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button onClick={() => handleDeleteTransaction(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
