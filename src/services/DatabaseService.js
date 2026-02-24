const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
    constructor() {
        this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    }

    // Busca a empresa dona do chip (Multi-tenant entry point)
    async buscarEmpresaPorTelefone(telefoneBot) {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('telefone_whatsapp', telefoneBot)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Erro ao buscar empresa:', error.message);
            return null;
        }
    }

    // Lista serviços ativos daquela empresa específica
    async listarServicos(profileId) {
        const { data, error } = await this.supabase
            .from('servicos')
            .select('*')
            .eq('profile_id', profileId)
            .eq('ativo', true)
            .order('nome', { ascending: true });

        if (error) {
            console.error('❌ Erro ao listar serviços:', error.message);
            return [];
        }
        return data || [];
    }

    // Garante que o cliente existe no contexto daquela empresa
    async garantirCliente(profileId, telefone, nome) {
        try {
            const { data, error } = await this.supabase
                .from('clientes')
                .upsert(
                    { profile_id: profileId, telefone: telefone, nome: nome },
                    { onConflict: 'profile_id, telefone' }
                )
                .select('id')
                .single();

            if (error) throw error;
            return data?.id;
        } catch (error) {
            console.error('❌ Erro ao garantir cliente:', error.message);
            return null;
        }
    }

    // Insere o agendamento no banco
    async criarAgendamento(agendamento) {
        const { data, error } = await this.supabase
            .from('agendamentos')
            .insert([agendamento])
            .select();

        if (error) {
            console.error('❌ Erro ao criar agendamento:', error.message);
            throw error;
        }
        return data;
    }

    // Busca horários ocupados para evitar overbooking
    async buscarAgendamentosDoDia(profileId, data) {
        const inicioDia = `${data}T00:00:00Z`;
        const fimDia = `${data}T23:59:59Z`;

        const { data: agendamentos, error } = await this.supabase
            .from('agendamentos')
            .select('data_hora_inicio')
            .eq('profile_id', profileId)
            .neq('status', 'cancelado') // ✅ Importante: horários cancelados devem estar livres!
            .gte('data_hora_inicio', inicioDia)
            .lte('data_hora_inicio', fimDia);

        if (error) {
            console.error('❌ Erro ao buscar agendamentos:', error.message);
            return [];
        }

        // Retorna um array simples de strings de horários para facilitar a comparação no DateHelper
        return agendamentos.map(ag => ag.data_hora_inicio);
    }
}

module.exports = new DatabaseService();