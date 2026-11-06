// Envio e abertura de contratos. A pasta e privada: abrir exige um link temporario.
import { supabase } from './supabaseClient';

const PASTA = 'contratos';
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

// Registros antigos guardam o link inteiro; os novos, so o caminho do arquivo.
export function caminhoContrato(valor: string): string {
    const marcador = `/${PASTA}/`;
    const posicao = valor.indexOf(marcador);
    return posicao >= 0 ? decodeURIComponent(valor.slice(posicao + marcador.length)) : valor;
}

export async function abrirContrato(valor: string): Promise<void> {
    // Abre a aba antes de esperar a resposta, senao o celular bloqueia como pop-up
    const aba = window.open('', '_blank');
    const { data, error } = await supabase.storage.from(PASTA).createSignedUrl(caminhoContrato(valor), 300);
    if (error || !data) {
        aba?.close();
        throw new Error('Não foi possível abrir o contrato: ' + (error?.message || 'sem resposta'));
    }
    if (aba) aba.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
}

export async function enviarContrato(arquivo: File, usuarioId: string): Promise<string> {
    if (arquivo.size > TAMANHO_MAXIMO) {
        throw new Error('O contrato precisa ter no máximo 20 MB.');
    }
    const extensao = (arquivo.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const caminho = `${usuarioId}/${Date.now()}.${extensao}`;
    const { error } = await supabase.storage.from(PASTA).upload(caminho, arquivo);
    if (error) throw new Error('Erro ao enviar o contrato: ' + error.message);
    return caminho;
}

export async function removerContrato(caminho: string): Promise<void> {
    await supabase.storage.from(PASTA).remove([caminho]);
}
