import React, { useState } from 'react';
import { CategoriaLancamento, dataLocal } from '../lancamentos';
import { LinhaParcela, MAX_PARCELAS, montarParcelas, paraLinha, somaDasLinhas } from '../parcelas';
import { formatarReais, parseValor } from '../valores';

interface EditorParcelasProps {
    total: number;
    linhas: LinhaParcela[];
    onLinhas: (linhas: LinhaParcela[]) => void;
    categorias: CategoriaLancamento[];
    categoriaId: string;
    onCategoria: (id: string) => void;
}

const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

const EditorParcelas = ({ total, linhas, onLinhas, categorias, categoriaId, onCategoria }: EditorParcelasProps) => {
    const [entrada, setEntrada] = useState('');
    const [dataEntrada, setDataEntrada] = useState(dataLocal());
    const [quantidade, setQuantidade] = useState('1');
    const [primeiro, setPrimeiro] = useState('');
    const [erro, setErro] = useState('');

    const montar = () => {
        setErro('');
        const valorEntrada = parseValor(entrada);
        const numero = Number(quantidade) || 0;
        if (!(total > 0)) {
            setErro('Informe o valor total antes de montar.');
            return;
        }
        if (valorEntrada > total) {
            setErro('A entrada é maior que o valor total.');
            return;
        }
        if (valorEntrada > 0 && !dataEntrada) {
            setErro('Informe a data da entrada.');
            return;
        }
        const sobra = valorEntrada < total;
        if (sobra && (numero < 1 || numero > MAX_PARCELAS || !Number.isInteger(numero))) {
            setErro(`Informe de 1 a ${MAX_PARCELAS} parcelas.`);
            return;
        }
        if (sobra && !primeiro) {
            setErro('Informe o primeiro vencimento.');
            return;
        }
        onLinhas(montarParcelas({ total, entrada: valorEntrada, dataEntrada, quantidade: numero, primeiroVencimento: primeiro }).map(paraLinha));
    };

    const alterar = (indice: number, campo: keyof LinhaParcela, valor: string) =>
        onLinhas(linhas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));

    const soma = somaDasLinhas(linhas);
    const diferente = linhas.length > 0 && Math.abs(soma - total) >= 0.01;

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="parcelas-entrada" className={estiloRotulo}>Entrada (R$)</label>
                    <input id="parcelas-entrada" inputMode="decimal" placeholder="Opcional" className={`${estiloInput} text-right`} value={entrada} onChange={e => setEntrada(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="parcelas-data-entrada" className={estiloRotulo}>Data da entrada</label>
                    <input id="parcelas-data-entrada" type="date" className={estiloInput} value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="parcelas-quantidade" className={estiloRotulo}>Parcelas</label>
                    <input id="parcelas-quantidade" type="number" min={1} max={MAX_PARCELAS} className={`${estiloInput} text-right`} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="parcelas-primeiro" className={estiloRotulo}>1º vencimento</label>
                    <input id="parcelas-primeiro" type="date" className={estiloInput} value={primeiro} onChange={e => setPrimeiro(e.target.value)} />
                </div>
            </div>

            <div>
                <label htmlFor="parcelas-categoria" className={estiloRotulo}>Categoria da receita</label>
                <select id="parcelas-categoria" className={estiloInput} value={categoriaId} onChange={e => onCategoria(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {categorias.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
            </div>

            <button type="button" onClick={montar} className="h-11 bg-white text-secondary border-2 border-secondary flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-gray-50">
                <span className="material-symbols-outlined text-[18px]">calculate</span>
                Montar parcelas
            </button>
            {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}

            {linhas.length > 0 && (
                <div className="flex flex-col gap-2 border-t-2 border-secondary/10 pt-3">
                    <p className="text-xs text-gray-500">Ajuste valores e datas, se precisar.</p>
                    {linhas.map((linha, i) => (
                        <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_6.5rem_9.5rem_auto] gap-2 items-center border-b border-gray-100 pb-2">
                            <input aria-label={`Descrição da linha ${i + 1}`} className={`${estiloInput} col-span-1`} value={linha.descricao} onChange={e => alterar(i, 'descricao', e.target.value)} />
                            <button type="button" aria-label={`Remover linha ${i + 1}`} onClick={() => onLinhas(linhas.filter((_, j) => j !== i))} className="p-1 text-gray-500 hover:text-accent-error sm:order-last">
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                            <input aria-label={`Valor da linha ${i + 1}`} inputMode="decimal" className={`${estiloInput} text-right`} value={linha.valor} onChange={e => alterar(i, 'valor', e.target.value)} />
                            <input aria-label={`Vencimento da linha ${i + 1}`} type="date" className={estiloInput} value={linha.vencimento} onChange={e => alterar(i, 'vencimento', e.target.value)} />
                        </div>
                    ))}
                    <p className={`text-sm font-mono font-bold ${diferente ? 'text-amber-700' : 'text-secondary'}`}>
                        Soma: {formatarReais(soma)}{diferente ? ` (o valor a parcelar é ${formatarReais(total)})` : ''}
                    </p>
                </div>
            )}
        </div>
    );
};

export default EditorParcelas;
