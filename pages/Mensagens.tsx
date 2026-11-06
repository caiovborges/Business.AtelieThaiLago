import React, { useEffect, useState } from 'react';
import { ChaveMensagem, MENSAGENS, montarTexto, textoMensagem, textosPersonalizados } from '../leadContato';
import { carregarMensagens, restaurarMensagem, salvarMensagem } from '../mensagensEditadas';

const ORDEM: { chave: ChaveMensagem; quando: string }[] = [
    { chave: 'primeiro', quando: 'Quando o lead chega, antes de qualquer contato.' },
    { chave: 'continuidade', quando: 'Lead sem orçamento, depois da primeira tentativa sem resposta.' },
    { chave: 'retomar', quando: 'Lead sem orçamento, depois de 2 tentativas sem resposta.' },
    { chave: 'posOrcamento', quando: 'Uma semana depois de enviar o orçamento.' },
    { chave: 'caro', quando: 'Quando o casal diz que ficou caro ou fora do orçamento.' },
    { chave: 'lembrete', quando: 'Com orçamento, depois de 1 tentativa sem resposta. As fotos são anexadas na hora.' },
    { chave: 'reuniao', quando: 'Com orçamento, depois de 2 tentativas sem resposta.' },
    { chave: 'confirmarReuniao', quando: 'Antes de uma reunião combinada.' },
    { chave: 'encerramento', quando: 'Depois de 3 tentativas sem resposta. É o último contato.' },
];

const NOME_EXEMPLO = 'Ana & João';
const LIMITE = 2000;

const CartaoMensagem = ({ chave, quando, onAlterado }: { chave: ChaveMensagem; quando: string; onAlterado: () => void }) => {
    const salvo = textoMensagem(chave);
    const personalizada = !!textosPersonalizados()[chave];
    const [texto, setTexto] = useState(salvo);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    useEffect(() => { setTexto(salvo); }, [salvo]);

    const alterado = texto !== salvo;
    const vazio = !texto.trim();
    const longo = texto.length > LIMITE;
    const semNome = !vazio && !texto.includes('{nome}') && MENSAGENS[chave].texto.includes('{nome}');

    const executar = async (acao: () => Promise<void>, sucesso: string) => {
        setOcupado(true);
        setErro('');
        setAviso('');
        try {
            await acao();
            setAviso(sucesso);
            onAlterado();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(false);
        }
    };

    const idCampo = `mensagem-${chave}`;

    return (
        <section className="bg-white border-2 border-secondary p-4 md:p-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-secondary">{MENSAGENS[chave].titulo}</h2>
                {personalizada && (
                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 text-[10px] font-mono font-bold uppercase">Editada</span>
                )}
            </div>
            <p className="text-sm text-gray-600">{quando}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                    <label htmlFor={idCampo} className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Texto</label>
                    <textarea
                        id={idCampo}
                        rows={8}
                        className="w-full bg-surface border-2 border-secondary p-3 text-sm focus:border-primary outline-none resize-y"
                        value={texto}
                        onChange={e => { setTexto(e.target.value); setAviso(''); setErro(''); }}
                    />
                    <p className={`mt-1 text-xs font-mono ${longo ? 'text-accent-error font-bold' : 'text-gray-500'}`}>{texto.length} de {LIMITE} caracteres</p>
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Como fica</p>
                    <div className="min-h-[11rem] bg-green-50 border-2 border-green-200 p-3 text-sm text-secondary whitespace-pre-wrap break-words">
                        {montarTexto(texto, NOME_EXEMPLO)}
                    </div>
                </div>
            </div>

            {semNome && (
                <p className="text-sm font-medium text-amber-700">Este texto não tem {'{nome}'}, então a mensagem vai sem o nome do casal.</p>
            )}
            {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}
            {aviso && <p className="text-sm font-bold text-accent-success">{aviso}</p>}

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={ocupado || !alterado || vazio || longo}
                    onClick={() => executar(() => salvarMensagem(chave, texto), 'Mensagem salva.')}
                    className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Salvar
                </button>
                {personalizada && (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                            if (window.confirm('Voltar esta mensagem ao texto original?')) {
                                executar(() => restaurarMensagem(chave), 'Texto original restaurado.');
                            }
                        }}
                        className="h-11 px-4 bg-white text-secondary border-2 border-secondary rounded-sm text-xs font-bold uppercase hover:bg-gray-50 disabled:opacity-50"
                    >
                        Voltar ao original
                    </button>
                )}
                {alterado && (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => { setTexto(salvo); setErro(''); }}
                        className="h-11 px-4 bg-white text-gray-600 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase"
                    >
                        Descartar
                    </button>
                )}
            </div>
        </section>
    );
};

const Mensagens = () => {
    const [carregando, setCarregando] = useState(true);
    const [, setVersao] = useState(0);

    useEffect(() => {
        carregarMensagens().finally(() => setCarregando(false));
    }, []);

    if (carregando) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-4 md:gap-6">
                <header>
                    <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-secondary">Mensagens</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Estes são os textos que abrem no WhatsApp. Escreva {'{nome}'} onde o nome do casal deve aparecer. A mudança vale para os próximos contatos.
                    </p>
                </header>
                {ORDEM.map(({ chave, quando }) => (
                    <CartaoMensagem key={chave} chave={chave} quando={quando} onAlterado={() => setVersao(v => v + 1)} />
                ))}
            </div>
        </div>
    );
};

export default Mensagens;
