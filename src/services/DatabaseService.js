const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
    constructor() {
        this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    }

    // Busca a empresa dona do chip
    async buscarEmpresaPorTelefone(telefoneBot) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('telefone_whatsapp', telefoneBot)
            .single();
            
        return data; 
    }

    // LISTA SERVIÇOS: Usa 'profile_id' e 'ativo' (conforme seu print)
    async listarServicos(profileId) {
        const { data } = await this.supabase
            .from('servicos')
            .select('*')
            .eq('profile_id', profileId)
            .eq('ativo', true);
        return data || [];
    }

    // NOVO: Como você tem tabela de 'clientes', precisamos garantir que o cliente existe
    async garantirCliente(profileId, telefone, nome) {
        const { data, error } = await this.supabase
            .from('clientes')
            .upsert(
                { profile_id: profileId, telefone: telefone, nome: nome },
                { onConflict: 'profile_id, telefone' }
            )
            .select('id')
            .single();
            
        if (error) console.error('Erro ao garantir cliente:', error);
        return data?.id;
    }

    // CRIAR AGENDAMENTO: Ajustado para usar 'data_hora_inicio' e 'cliente_id'
    async criarAgendamento(agendamento) {
        const { data, error } = await this.supabase
            .from('agendamentos')
            .insert([agendamento])
            .select();
        
        if (error) throw error;
        return data;
    }

    // BUSCAR AGENDAMENTOS: Ajustado para 'data_hora_inicio'
    async buscarAgendamentosDoDia(profileId, data) {
        // ⚠️ O ERRO ESTAVA AQUI: As variáveis abaixo precisam ser criadas!
        const inicioDia = `${data}T00:00:00Z`;
        const fimDia = `${data}T23:59:59Z`;

        const { data: agendamentos, error } = await this.supabase
        .from('agendamentos')
        .select('data_hora_inicio')
        .eq('profile_id', profileId)
        .gte('data_hora_inicio', inicioDia) // Agora ele sabe o que é inicioDia
        .lte('data_hora_inicio', fimDia);   // Agora ele sabe o que é fimDia

        if (error) {
            console.error('Erro ao buscar agendamentos:', error.message);
            return [];
        }

        // Mapeamos para manter a compatibilidade com o restante do código
        return agendamentos.map(ag => ({ data_hora: ag.data_hora_inicio }));
    }
}

module.exports = new DatabaseService();