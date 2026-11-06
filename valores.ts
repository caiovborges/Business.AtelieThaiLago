// Leitura e exibicao de valores em reais.

// Aceita "1.500,50", "45,90", "45.90", "1500" e numeros vindos do banco.
export function parseValor(valor: string | number | null | undefined): number {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    const texto = (valor ?? '').replace(/[^\d.,]/g, '');
    if (!texto) return 0;

    const ultimaVirgula = texto.lastIndexOf(',');
    const ultimoPonto = texto.lastIndexOf('.');
    let normalizado: string;

    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
        // O ultimo separador e o decimal
        const decimal = ultimaVirgula > ultimoPonto ? ',' : '.';
        const milhar = decimal === ',' ? '.' : ',';
        normalizado = texto.split(milhar).join('').replace(decimal, '.');
    } else if (ultimaVirgula >= 0) {
        const partes = texto.split(',');
        normalizado = partes.length === 2 ? partes.join('.') : partes.join('');
    } else if (ultimoPonto >= 0) {
        const partes = texto.split('.');
        const eMilhar = partes.length > 2 || partes[1].length === 3;
        normalizado = eMilhar ? partes.join('') : partes.join('.');
    } else {
        normalizado = texto;
    }

    const numero = Number(normalizado);
    return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
}

export function formatarReais(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
