const dayjs = require('dayjs');
require('dayjs/locale/pt-br');
dayjs.locale('pt-br');

class DateHelper {
    constructor() {
        // Exemplo de feriados (YYYY-MM-DD)
        this.feriados = ['2026-01-01', '2026-04-21', '2026-05-01']; 
        this.gradeHorarios = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    }

    // Gera os próximos 7 dias úteis disponíveis
    getDiasDisponiveis() {
        let dias = [];
        let dataAtual = dayjs();
        
        while (dias.length < 7) {
            const diaSemana = dataAtual.day(); // 0 = Domingo, 6 = Sábado
            const dataFormatada = dataAtual.format('YYYY-MM-DD');

            // Regra: Não ser fim de semana e não ser feriado
            if (diaSemana !== 0 && diaSemana !== 6 && !this.feriados.includes(dataFormatada)) {
                dias.push({
                    label: dataAtual.format('DD/MM (dddd)'),
                    valor: dataFormatada
                });
            }
            dataAtual = dataAtual.add(1, 'day');
        }
        return dias;
    }

    // Filtra horários livres para um dia específico
    async getHorariosLivres(dataEscolhida, agendamentosOcupados) {
        const agora = dayjs();
        const ehHoje = dataEscolhida === agora.format('YYYY-MM-DD');

        return this.gradeHorarios.filter(hora => {
            // 1. Remove horários que já passaram (se for hoje)
            if (ehHoje) {
                const [h, m] = hora.split(':');
                const horaSlot = agora.set('hour', h).set('minute', m);
                if (horaSlot.isBefore(agora)) return false;
            }

            // 2. Remove horários que já estão no banco de dados
            const ocupado = agendamentosOcupados.some(ag => ag.data_hora.includes(hora));
            return !ocupado;
        });
    }
}

module.exports = new DateHelper();