// Leitura e gravacao dos textos editados das mensagens.
import { supabase } from './supabaseClient';
import { ChaveMensagem, definirTextosPersonalizados, textosPersonalizados } from './leadContato';

// Se a leitura falhar, o app continua com os textos padrao.
export async function carregarMensagens(): Promise<void> {
    const { data, error } = await supabase.from('mensagens_followup').select('chave, texto');
    if (error) {
        console.warn('Não foi possível carregar as mensagens editadas.');
        return;
    }
    const textos: Partial<Record<ChaveMensagem, string>> = {};
    for (const linha of data || []) textos[linha.chave as ChaveMensagem] = linha.texto;
    definirTextosPersonalizados(textos);
}

export async function salvarMensagem(chave: ChaveMensagem, texto: string): Promise<void> {
    const { error } = await supabase
        .from('mensagens_followup')
        .upsert({ chave, texto, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) throw new Error('Não foi possível salvar a mensagem: ' + error.message);
    definirTextosPersonalizados({ ...textosPersonalizados(), [chave]: texto });
}

export async function restaurarMensagem(chave: ChaveMensagem): Promise<void> {
    const { error } = await supabase.from('mensagens_followup').delete().eq('chave', chave);
    if (error) throw new Error('Não foi possível restaurar a mensagem: ' + error.message);
    const textos = { ...textosPersonalizados() };
    delete textos[chave];
    definirTextosPersonalizados(textos);
}
