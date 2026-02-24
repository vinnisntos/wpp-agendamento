const db = require('../services/DatabaseService');
const dateHelper = require('../services/DateHelper');
const dayjs = require('dayjs'); // Adicionado o import

class FlowManager {
    constructor() {
        this.sessions = {};
    }

    async processarMensagem(msg, whatsappService) {
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!text) return;

        // 1. Pega o número do bot para saber de qual empresa estamos falando
        const meuNumero = whatsappService.sock.user.id.split(':')[0];
        console.log("📱 O número do meu bot é:", meuNumero);
        const empresa = await db.buscarEmpresaPorTelefone(meuNumero);

        if (!empresa) {
            console.error("❌ Erro: Este número de WhatsApp não está vinculado a nenhuma empresa no Supabase.");
            return;
        }

        if (!this.sessions[from]) {
            // 2. Já guardamos o profile_id da empresa na sessão logo no início
            this.sessions[from] = { 
                step: 0, 
                dados: { 
                    telefone: from,
                    profile_id: empresa.id // Guardado aqui para os próximos passos
                } 
            };
        }
        
        const session = this.sessions[from];

        switch (session.step) {
            case 0: // Identificação
                await whatsappService.sendText(from, `Olá! Bem-vinda ao salão *${empresa.nome_negocio}*. ✨\nQual é o seu nome, por favor?`);
                session.step = 1;
                break;

            case 1: // Salva Nome e Mostra Serviços
                session.dados.nome = text;
                const servicos = await db.listarServicos(session.dados.profile_id);
                session.tempServicos = servicos;

                let menuServ = `Prazer, ${text}! O que vamos fazer hoje?\n\n`;
                servicos.forEach((s, i) => menuServ += `${i + 1}. ${s.nome} (R$ ${s.preco})\n`);
                
                await whatsappService.sendText(from, menuServ);
                session.step = 2;
                break;

            case 2: // Escolha de Data
                const servIdx = parseInt(text) - 1;
                if (session.tempServicos && session.tempServicos[servIdx]) {
                    session.dados.servico_id = session.tempServicos[servIdx].id;
                    const dias = dateHelper.getDiasDisponiveis();
                    session.tempDias = dias;

                    let menuDias = "Para qual dia você deseja agendar?\n\n";
                    dias.forEach((d, i) => menuDias += `${i + 1}. ${d.label}\n`);
                    
                    await whatsappService.sendText(from, menuDias);
                    session.step = 3;
                } else {
                    await whatsappService.sendText(from, "Opção inválida. Digite o número do serviço.");
                }
                break;

            case 3: // Escolha de Horário
                const diaIdx = parseInt(text) - 1;
                if (session.tempDias && session.tempDias[diaIdx]) {
                    session.dados.data = session.tempDias[diaIdx].valor;
                    
                    const ocupados = await db.buscarAgendamentosDoDia(session.dados.profile_id, session.dados.data);
                    const livres = await dateHelper.getHorariosLivres(session.dados.data, ocupados);
                    session.tempHoras = livres;

                    let menuHoras = `Horários disponíveis para ${session.tempDias[diaIdx].label}:\n\n`;
                    livres.forEach((h, i) => menuHoras += `${i + 1}. ${h}\n`);
                    
                    await whatsappService.sendText(from, menuHoras);
                    session.step = 4;
                } else {
                    await whatsappService.sendText(from, "Escolha um dia da lista acima.");
                }
                break;

            // Localize o case 4 no seu FlowManager.js e ajuste assim:

            case 4: 
                const horaIdx = parseInt(text) - 1;
                if (session.tempHoras && session.tempHoras[horaIdx]) {
                    try {
                        // 1. Horário de Início
                        const finalDataHora = `${session.dados.data}T${session.tempHoras[horaIdx]}:00Z`;
                        
                        // 2. Pegamos a duração do serviço que salvamos no Case 1
                        const servicoEscolhido = session.tempServicos.find(s => s.id === session.dados.servico_id);
                        const duracao = servicoEscolhido?.duracao_minutos || 30; // 30min de fallback se der ruim

                        // 3. Calculamos o Horário de Fim usando Dayjs
                        const dataHoraFim = dayjs(finalDataHora).add(duracao, 'minute').toISOString();

                        // 4. Garante o cliente
                        const clienteId = await db.garantirCliente(
                            session.dados.profile_id, 
                            session.dados.telefone, 
                            session.dados.nome
                        );

                        // 5. Monta o objeto com INÍCIO e FIM
                        const agendamento = {
                            profile_id: session.dados.profile_id,
                            cliente_id: clienteId,
                            servico_id: session.dados.servico_id,
                            data_hora_inicio: finalDataHora,
                            data_hora_fim: dataHoraFim, // ✅ Agora o banco não reclama mais!
                            status: 'pendente'
                        };

                        const sucesso = await db.criarAgendamento(agendamento);


                        if (sucesso) {
                            // 🚀 LOG NO CONSOLE PARA O DESENVOLVEDOR (VOCÊ!)
                            console.log(`\n✨ [NOVO AGENDAMENTO REALIZADO] ✨`);
                            console.log(`🏢 Empresa: ${empresa.nome_negocio || 'Barbearia Teste'}`);
                            console.log(`👤 Cliente: ${session.dados.nome}`);
                            console.log(`📞 Contato: ${session.dados.telefone}`);
                            console.log(`💇 Serviço: ${servicoEscolhido.nome}`);
                            console.log(`📅 Data/Hora: ${dayjs(finalDataHora).format('DD/MM/YYYY HH:mm')}`);
                            console.log(`🆔 ID no Banco: ${sucesso[0].id}`); // Pega o ID que o banco acabou de gerar
                            console.log(`------------------------------------------\n`);

                const dataFormatada = dayjs(finalDataHora).format('DD/MM [às] HH:mm');
                await whatsappService.sendText(from, `✅ *Agendado com sucesso!* \n\nTe esperamos dia ${dataFormatada}.`);
                delete this.sessions[from];
            }

                    } catch (error) {
                        console.error("❌ Erro ao processar agendamento:", error);
                        await whatsappService.sendText(from, "Ops! Tive um problema ao salvar seu horário. Pode tentar novamente?");
                    }
                }
                break;
        }
    }
}

// 3. ESSA LINHA É A QUE FALTAVA:
module.exports = new FlowManager();