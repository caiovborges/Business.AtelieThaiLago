// Previsto x realizado de um evento, por categoria. A conta e do modulo planejamento.ts.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Resumo, carregarPlano, resumir } from '../planejamento';
import { formatarReais } from '../valores';

// Gastar mais que o previsto e ruim (vermelho); gastar menos e bom (verde).
const corDiferenca = (diferenca: number) =>
    diferenca > 0 ? 'text-accent-error' : diferenca < 0 ? 'text-accent-success' : 'text-gray-400';

const comSinal = (valor: number) => (valor > 0 ? '+ ' : valor < 0 ? '− ' : '') + formatarReais(Math.abs(valor));

export const TabelaCategorias = ({ resumo }: { resumo: Resumo }) => (
    <table className="w-full text-sm">
        <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400 text-right">
                <th className="text-left font-bold pb-1">Categoria</th>
                <th className="font-bold pb-1">Previsto</th>
                <th className="font-bold pb-1">Gasto</th>
                <th className="font-bold pb-1">Diferença</th>
            </tr>
        </thead>
        <tbody className="font-mono">
            {resumo.porCategoria.map(linha => (
                <tr key={linha.nome} className="border-t border-gray-100 text-right">
                    <td className="py-1.5 text-left font-body text-gray-700">{linha.nome}</td>
                    <td className="py-1.5 text-gray-600">{formatarReais(linha.previsto)}</td>
                    <td className="py-1.5 text-gray-600">{formatarReais(linha.realizado)}</td>
                    <td className={`py-1.5 font-bold ${corDiferenca(linha.diferenca)}`}>{comSinal(linha.diferenca)}</td>
                </tr>
            ))}
            <tr className="border-t-2 border-secondary text-right font-bold">
                <td className="py-1.5 text-left font-body">Total</td>
                <td className="py-1.5">{formatarReais(resumo.previsto)}</td>
                <td className="py-1.5">{formatarReais(resumo.realizado)}</td>
                <td className={`py-1.5 ${corDiferenca(resumo.realizado - resumo.previsto)}`}>{comSinal(resumo.realizado - resumo.previsto)}</td>
            </tr>
        </tbody>
    </table>
);

const Margem = ({ titulo, valor, percentual }: { titulo: string; valor: number; percentual: number | null }) => (
    <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{titulo}</p>
        <p className={`font-mono font-bold text-lg ${valor >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
            {formatarReais(valor)}
            {percentual !== null && <span className="ml-1 text-xs">({percentual.toLocaleString('pt-BR')}%)</span>}
        </p>
    </div>
);

interface PrevistoRealizadoProps {
    eventoId: string;
    // Muda quando as despesas da tela mudam, para recarregar
    versao?: unknown;
}

const PrevistoRealizado = ({ eventoId, versao }: PrevistoRealizadoProps) => {
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let atual = true;
        carregarPlano(eventoId)
            .then(plano => {
                if (!atual) return;
                setErro('');
                setResumo(resumir({
                    contrato: Number(plano.evento.valor_previsto) || 0,
                    custos: plano.custos,
                    despesas: plano.despesas,
                    recebido: plano.recebido,
                    categorias: plano.categorias,
                }));
            })
            .catch((e: Error) => atual && setErro(e.message));
        return () => { atual = false; };
    }, [eventoId, versao]);

    if (erro) return <p className="text-sm text-accent-error">{erro}</p>;
    if (!resumo) return null;

    const semPlano = resumo.previsto === 0;

    return (
        <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold uppercase tracking-wider text-sm text-secondary">Previsto × realizado</h3>
                <Link to={`/planejamento?evento=${eventoId}`} className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">
                    {semPlano ? 'Planejar' : 'Editar plano'}
                </Link>
            </div>
            {semPlano && resumo.realizado === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum custo previsto nem despesa lançada ainda.</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <Margem titulo="Margem prevista" valor={resumo.margemPrevista} percentual={resumo.percentualPrevisto} />
                        <Margem titulo="Margem real" valor={resumo.margemReal} percentual={resumo.percentualReal} />
                    </div>
                    <TabelaCategorias resumo={resumo} />
                </>
            )}
        </div>
    );
};

export default PrevistoRealizado;
