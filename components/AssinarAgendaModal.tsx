import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface AssinarAgendaModalProps {
    aberto: boolean;
    onClose: () => void;
}

const urlBase = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda`;

const AssinarAgendaModal = ({ aberto, onClose }: AssinarAgendaModalProps) => {
    const { user } = useAuth();
    const [token, setToken] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [copiado, setCopiado] = useState(false);

    const criar = async () => {
        const { data, error } = await supabase
            .from('agenda_assinaturas')
            .insert({ user_id: user!.id })
            .select('token')
            .single();
        if (error) throw error;
        return data.token as string;
    };

    useEffect(() => {
        if (!aberto || !user) return;
        let atual = true;
        setErro('');
        setCopiado(false);
        setCarregando(true);
        (async () => {
            try {
                const { data, error } = await supabase.from('agenda_assinaturas').select('token').eq('user_id', user.id).maybeSingle();
                if (error) throw error;
                const valor = data?.token ?? await criar();
                if (atual) setToken(valor);
            } catch (falha: any) {
                if (atual) setErro('Não foi possível preparar o link: ' + falha.message);
            } finally {
                if (atual) setCarregando(false);
            }
        })();
        return () => { atual = false; };
    }, [aberto, user?.id]);

    if (!aberto) return null;

    const linkHttps = token ? `${urlBase()}?token=${token}` : '';
    const linkAssinar = linkHttps.replace(/^https?:\/\//, 'webcal://');

    const copiar = async () => {
        setErro('');
        try {
            await navigator.clipboard.writeText(linkHttps);
            setCopiado(true);
        } catch {
            setErro('Não foi possível copiar. Selecione o link no campo e copie manualmente.');
        }
    };

    const gerarNovo = async () => {
        if (!window.confirm('Gerar um novo link? O link atual para de funcionar, e será preciso assinar de novo em cada aparelho.')) return;
        setErro('');
        setCopiado(false);
        setCarregando(true);
        try {
            const { error } = await supabase.from('agenda_assinaturas').delete().eq('user_id', user!.id);
            if (error) throw error;
            setToken(await criar());
        } catch (falha: any) {
            setToken('');
            setErro('Não foi possível gerar o link: ' + falha.message);
        } finally {
            setCarregando(false);
        }
    };

    const titulo = 'font-display font-bold text-secondary';
    const passos = 'list-decimal pl-5 text-sm text-gray-700 flex flex-col gap-1';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Agenda no celular</h2>
                    <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <div className="p-4 md:p-6 flex flex-col gap-4">
                    <p className="text-sm text-gray-700">
                        Eventos, reuniões e próximos contatos aparecem na agenda e se atualizam sozinhos. A agenda do celular só mostra as informações: mudanças são feitas aqui no sistema.
                    </p>

                    {erro && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>}

                    {carregando && (
                        <div className="flex justify-center py-6">
                            <span className="animate-spin material-symbols-outlined text-3xl text-primary">progress_activity</span>
                        </div>
                    )}

                    {!carregando && token && (
                        <>
                            <section className="flex flex-col gap-2">
                                <h3 className={titulo}>No iPhone</h3>
                                <ol className={passos}>
                                    <li>Abra esta tela no próprio iPhone, entrando no sistema pelo Safari.</li>
                                    <li>Toque em <strong>Assinar no iPhone</strong>.</li>
                                    <li>Confirme em <strong>Assinar</strong> e depois em <strong>OK</strong>.</li>
                                </ol>
                                <a href={linkAssinar} className="h-12 mt-1 bg-primary text-white border-2 border-secondary shadow-hard rounded-sm flex items-center justify-center gap-2 font-display text-sm font-bold uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-[20px]">event_available</span>
                                    Assinar no iPhone
                                </a>
                            </section>

                            <section className="flex flex-col gap-2 border-t-2 border-secondary/10 pt-4">
                                <h3 className={titulo}>No Google Agenda</h3>
                                <ol className={passos}>
                                    <li>Copie o link abaixo.</li>
                                    <li>No computador, abra o Google Agenda e, em <strong>Outras agendas</strong>, escolha <strong>Do URL</strong>.</li>
                                    <li>Cole o link e confirme.</li>
                                </ol>
                                <label htmlFor="agenda-link" className="sr-only">Link da agenda</label>
                                <input id="agenda-link" readOnly value={linkHttps} onFocus={e => e.target.select()}
                                    className="w-full bg-surface border-2 border-secondary p-2.5 font-mono text-xs outline-none" />
                                <button type="button" onClick={copiar} className="h-11 self-start px-4 bg-white text-secondary border-2 border-secondary rounded-sm flex items-center gap-1 text-xs font-bold uppercase hover:bg-gray-50">
                                    <span className="material-symbols-outlined text-[18px]">{copiado ? 'check' : 'content_copy'}</span>
                                    {copiado ? 'Link copiado' : 'Copiar link'}
                                </button>
                            </section>

                            <section className="flex flex-col gap-2 border-t-2 border-secondary/10 pt-4">
                                <h3 className={titulo}>Privacidade</h3>
                                <p className="text-sm text-gray-700">
                                    Quem tiver este link consegue ver a agenda, então não o compartilhe. A agenda mostra nomes, datas e locais, sem telefones nem valores.
                                </p>
                                <button type="button" onClick={gerarNovo} className="h-11 self-start px-4 bg-white text-gray-600 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase hover:border-accent-error hover:text-accent-error transition-colors">
                                    Gerar novo link
                                </button>
                            </section>
                        </>
                    )}

                    {!carregando && !token && !erro && <p className="text-sm text-gray-500">Link indisponível.</p>}
                </div>
            </div>
        </div>
    );
};

export default AssinarAgendaModal;
