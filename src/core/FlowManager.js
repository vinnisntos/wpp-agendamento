const db = require('../services/DatabaseService');
const dateHelper = require('../services/DateHelper');
const dayjs = require('dayjs');

class FlowManager {
    constructor() {
        this.sessions = {};
        // Limite de 5 minutos de inatividade
        this.timeoutLimit = 5 * 60 * 1000; 
        
        // Middleware de limpeza: roda a cada 1 minuto
        setInterval(() => this.limparSessoesInativas(), 60000);
    }

    async processarMensagem(msg, whatsappService) {
        const from = msg.key.remoteJid;
        const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
        
        if (!text) return;

        // 1. Contexto da Empresa
        const meuNumero = whatsappService.sock.user.id.split(':')[0];
        const empresa = await db.buscarEmpresaPorTelefone(meuNumero);

        if (!empresa) {
            console.error("❌ Erro: Empresa não encontrada para este número.");
            return;
        }

        // 2. Guarda Global (Protocolo de Saída)
        if (text === '0' || text.toLowerCase() === 'sair' || text.toLowerCase() === 'cancelar') {
            await whatsappService.sendText(from, "Atendimento encerrado. 👋\nSe precisar de algo, estarei por aqui!");
            delete this.sessions[from];
            return;
        }

        // 3. Gestão de Sessão e Inatividade
        if (!this.sessions[from]) {
            this.sessions[from] = { 
                step: 0, 
                dados: { telefone: from, profile_id: empresa.id },
                lastInteraction: Date.now()
            };
        } else {
            // Atualiza o timestamp a cada nova mensagem recebida
            this.sessions[from].lastInteraction = Date.now();
        }
        
        const session = this.sessions[from];

        // 4. Fluxo de Estados
        switch (session.step) {
           case 0: // Boas-vindas
                const clienteExistente = await db.buscarClientePorTelefone(from);

                if (clienteExistente) {
                    session.dados.nome = clienteExistente.nome;
                    session.dados.cliente_id = clienteExistente.id; // Já salva o ID
                    
                    await whatsappService.sendText(from, `Olá, *${clienteExistente.nome}*! Que bom te ver de novo na *${empresa.nome_negocio}*. ✨`);
                    
                    // Pula direto para a listagem de serviços (Lógica do Case 1)
                    const servicos = await db.listarServicos(session.dados.profile_id);
                    session.tempServicos = servicos;
                    let menuServ = `O que vamos fazer hoje?\n\n`;
                    servicos.forEach((s, i) => menuServ += `${i + 1}. ${s.nome} (R$ ${s.preco})\n`);

                    await whatsappService.sendText(from, menuServ);
                    session.step = 2; // Pula o step 1
                } else {
                    await whatsappService.sendText(from, `Olá! Bem-vindo(a) a *${empresa.nome_negocio}*. ✨\nQual é o seu nome, por favor?`);
                    session.step = 1;
                }
                break;

            case 2: // Serviço -> Dias
                const servIdx = parseInt(text) - 1;
                if (session.tempServicos?.[servIdx]) {
                    session.dados.servico_id = session.tempServicos[servIdx].id;
                    const dias = dateHelper.getDiasDisponiveis();
                    session.tempDias = dias;

                    let menuDias = "Para qual dia você deseja agendar?\n\n";
                    dias.forEach((d, i) => menuDias += `${i + 1}. ${d.label}\n`);
                    menuDias += `\n0. Sair`;
                    
                    await whatsappService.sendText(from, menuDias);
                    session.step = 3;
                } else {
                    await whatsappService.sendText(from, "Opção inválida. Digite o número do serviço ou 0 para sair.");
                }
                break;

            case 3: // Dia -> Horários
                const diaIdx = parseInt(text) - 1;
                if (session.tempDias?.[diaIdx]) {
                    session.dados.data = session.tempDias[diaIdx].valor;
                    
                    // Busca agendamentos e filtra os horários livres
                    const ocupados = await db.buscarAgendamentosDoDia(session.dados.profile_id, session.dados.data);
                    const livres = await dateHelper.getHorariosLivres(session.dados.data, ocupados);
                    session.tempHoras = livres;

                    // --- VALIDAÇÃO DE DISPONIBILIDADE ---
                    if (livres.length === 0) {
                        await whatsappService.sendText(from, "Poxa, esse dia já está totalmente preenchido. 😅\nPor favor, escolha outro dia da lista:");
                        
                        // Reexibe o menu de dias para o usuário não se perder
                        let menuDias = "";
                        session.tempDias.forEach((d, i) => menuDias += `${i + 1}. ${d.label}\n`);
                        await whatsappService.sendText(from, menuDias);
                        
                        session.step = 3; // Mantém no step 3 para ele tentar outro dia
                        return; 
                    }

                    let menuHoras = `Horários disponíveis para ${session.tempDias[diaIdx].label}:\n\n`;
                    livres.forEach((h, i) => menuHoras += `${i + 1}. ${h}\n`);
                    menuHoras += `\n0. Sair`;
                    
                    await whatsappService.sendText(from, menuHoras);
                    session.step = 4;
                } else {
                    await whatsappService.sendText(from, "Escolha um dia da lista ou digite 0 para sair.");
                }
                break;

            case 4: // Horário -> Finalização
                const horaIdx = parseInt(text) - 1;
                if (session.tempHoras?.[horaIdx]) {
                    try {
                        const servico = session.tempServicos.find(s => s.id === session.dados.servico_id);
                        const dataHoraInicio = `${session.dados.data}T${session.tempHoras[horaIdx]}:00Z`;
                        const dataHoraFim = dayjs(dataHoraInicio).add(servico?.duracao_minutos || 30, 'minute').toISOString();

                        const clienteId = await db.garantirCliente(session.dados.profile_id, session.dados.telefone, session.dados.nome);

                        await db.criarAgendamento({
                            profile_id: session.dados.profile_id,
                            cliente_id: clienteId,
                            servico_id: session.dados.servico_id,
                            data_hora_inicio: dataHoraInicio,
                            data_hora_fim: dataHoraFim,
                            status: 'pendente'
                        });

                        const dataFormatada = dayjs(dataHoraInicio).format('DD/MM [às] HH:mm');
                        await whatsappService.sendText(from, `✅ *Agendado com sucesso!*\n\n*Serviço:* ${servico.nome}\n*Horário:* ${dataFormatada}\n\nTe esperamos! 👋`);
                        
                        delete this.sessions[from]; 
                    } catch (error) {
                        console.error("❌ Erro ao criar agendamento:", error);
                        await whatsappService.sendText(from, "Erro ao salvar agendamento. Tente novamente.");
                    }
                } else {
                    await whatsappService.sendText(from, "Opção inválida. Escolha um horário da lista.");
                }
                break;

            default:
                await whatsappService.sendText(from, "Não entendi. Vamos recomeçar? Qual é o seu nome?");
                session.step = 1;
                break;
        }
    }

    limparSessoesInativas() {
        const agora = Date.now();
        Object.keys(this.sessions).forEach(from => {
            if (agora - this.sessions[from].lastInteraction > this.timeoutLimit) {
                console.log(`♻️ [Sessão Expirada]: ${from}`);
                delete this.sessions[from];
            }
        });
    }
}

module.exports = new FlowManager();
