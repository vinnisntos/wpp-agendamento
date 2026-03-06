const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
    constructor() {
        this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    }

    // ✅ NOVO: Necessário para o passo WELCOME
    async buscarClientePorTelefone(telefone) {
        const { data, error } = await this.supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle(); // maybeSingle não dá erro se não achar
        return data;
    }

    // ✅ NOVO: Necessário para o passo FINALIZAR (pegar o token da empresa)
    async buscarEmpresaPorId(id) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
        return data;
    }

    async buscarEmpresaPorTelefone(telefoneBot) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('telefone_whatsapp', telefoneBot)
            .single();
        return data;
    }

    async listarServicos(profileId) {
        const { data } = await this.supabase
            .from('servicos')
            .select('*')
            .eq('profile_id', profileId)
            .eq('ativo', true);
        return data || [];
    }

    async garantirCliente(profileId, telefone, nome) {
        const { data, error } = await this.supabase
            .from('clientes')
            .upsert(
                { profile_id: profileId, telefone: telefone, nome: nome },
                { onConflict: 'profile_id, telefone' }
            )
            .select('id').single();
        return data?.id;
    }

    async criarAgendamento(agendamento) {
        const { data, error } = await this.supabase
            .from('agendamentos')
            .insert([agendamento])
            .select().single();
        if (error) throw error;
        return data;
    }

    // ✅ Ajustado: Busca pelo external_reference que é o ID do pagamento do MP
    async confirmarPagamentoNoSupabase(paymentId) {
        const { data, error } = await this.supabase
            .from('agendamentos')
            .update({ status: 'confirmado' })
            .eq('external_reference', String(paymentId))
            .select('telefone, status')
            .single();
        return { data, error };
    }

    async buscarAgendamentosDoDia(profileId, data) {
        const inicioDia = `${data}T00:00:00Z`;
        const fimDia = `${data}T23:59:59Z`;
        const { data: agendamentos } = await this.supabase
            .from('agendamentos')
            .select('data_hora_inicio')
            .eq('profile_id', profileId)
            .neq('status', 'cancelado')
            .gte('data_hora_inicio', inicioDia)
            .lte('data_hora_inicio', fimDia);
        return agendamentos?.map(ag => ag.data_hora_inicio) || [];
    }
}

module.exports = new DatabaseService();