const db = require('../services/DatabaseService');
const dateHelper = require('../services/DateHelper');
const paymentService = require('../services/PaymentService');
const dayjs = require('dayjs');

// Helper para validar números de menu e evitar que o bot quebre
const validarOpcao = (texto, lista) => {
    const num = parseInt(texto);
    return (!isNaN(num) && num > 0 && num <= lista.length) ? num - 1 : null;
};

const states = {
    WELCOME: async (session, text, ws) => {
        const cliente = await db.buscarClientePorTelefone(session.dados.telefone);
        
        if (cliente) {
            session.dados.nome = cliente.nome;
            session.dados.cliente_id = cliente.id;
            await ws.sendText(session.dados.telefone, `Olá, *${cliente.nome}*! ✨\nQue bom te ver de novo.`);
            // Salto direto para serviços para poupar tempo do cliente]
            return states.LISTAR_SERVICOS(session, null, ws);
        }
        
        await ws.sendText(session.dados.telefone, "Olá! Bem-vindo(a). ✨\nPara começarmos, qual é o seu nome?");
        session.step = 'PEGAR_NOME';
    },

    PEGAR_NOME: async (session, text, ws) => {
        // Validação defensiva: impede nomes vazios ou puramente numéricos
        if (text.length < 2 || !/^[a-zA-ZÀ-ÿ\s]+$/.test(text)) {
            return ws.sendText(session.dados.telefone, "Poderia me dizer seu nome apenas com letras? 😊");
        }
        
        session.dados.nome = text;
        // Já garante o cliente no Supabase para vincular os logs
        session.dados.cliente_id = await db.garantirCliente(session.dados.profile_id, session.dados.telefone, text);
        return states.LISTAR_SERVICOS(session, null, ws);
    },

    LISTAR_SERVICOS: async (session, text, ws) => {
        const servicos = await db.listarServicos(session.dados.profile_id);
        session.tempServicos = servicos;
        
        if (!servicos.length) {
            return ws.sendText(session.dados.telefone, "No momento não temos serviços cadastrados. 😕");
        }

        let menu = `O que vamos fazer hoje, *${session.dados.nome}*?\n\n`;
        servicos.forEach((s, i) => menu += `${i + 1}. ${s.nome} (R$ ${s.preco})\n`);
        menu += `\n*0. Sair*`;

        await ws.sendText(session.dados.telefone, menu);
        session.step = 'ESCOLHER_DIA';
    },

    ESCOLHER_DIA: async (session, text, ws) => {
        const idx = validarOpcao(text, session.tempServicos || []);
        
        if (idx === null) {
            return ws.sendText(session.dados.telefone, "Ops! Escolha uma das opções numéricas do menu acima. 🙏");
        }

        session.dados.servico_id = session.tempServicos[idx].id;
        const dias = dateHelper.getDiasDisponiveis();
        session.tempDias = dias;

        let menu = "Para qual dia você deseja agendar?\n\n";
        dias.forEach((d, i) => menu += `${i + 1}. ${d.label}\n`);
        
        await ws.sendText(session.dados.telefone, menu);
        session.step = 'ESCOLHER_HORA';
    },

    ESCOLHER_HORA: async (session, text, ws) => {
        const idx = validarOpcao(text, session.tempDias || []);
        
        if (idx === null) {
            return ws.sendText(session.dados.telefone, "Escolha um dia válido da lista (ex: 1, 2...).");
        }

        session.dados.data = session.tempDias[idx].valor;
        const ocupados = await db.buscarAgendamentosDoDia(session.dados.profile_id, session.dados.data);
        const livres = await dateHelper.getHorariosLivres(session.dados.data, ocupados);
        
        if (livres.length === 0) {
            await ws.sendText(session.dados.telefone, "Poxa, esse dia lotou! 😅 Tente outro dia:");
            return states.ESCOLHER_DIA(session, "voltar", ws);
        }

        session.tempHoras = livres;
        let menu = `Horários para ${session.tempDias[idx].label}:\n\n`;
        livres.forEach((h, i) => menu += `${i + 1}. ${h}\n`);

        await ws.sendText(session.dados.telefone, menu);
        session.step = 'FINALIZAR';
    },

    FINALIZAR: async (session, text, ws) => {
        const idx = validarOpcao(text, session.tempHoras || []);
        if (idx === null) {
            return ws.sendText(session.dados.telefone, "Selecione um horário digitando o número correspondente.");
        }

        const hora = session.tempHoras[idx];
        const servico = session.tempServicos.find(s => s.id === session.dados.servico_id);
        const inicio = `${session.dados.data}T${hora}:00Z`;
        const fim = dayjs(inicio).add(servico.duracao_minutos || 30, 'minute').toISOString();

        try {
            // Busca o token específico da empresa para o pagamento multi-empresa
            const empresa = await db.buscarEmpresaPorId(session.dados.profile_id);
            
            if (!empresa?.mp_access_token) {
                return ws.sendText(session.dados.telefone, "Esta empresa ainda não configurou pagamentos. Contate o suporte. 🛠️");
            }

            // 1. Gerar o pagamento via API do Mercado Pago
            const pagamento = await paymentService.gerarPix(
                servico.preco, 
                session.dados.nome, 
                empresa.mp_access_token
            );

            // 2. Salvar agendamento com status PENDENTE no Supabase
            await db.criarAgendamento({
                profile_id: session.dados.profile_id,
                cliente_id: session.dados.cliente_id,
                servico_id: session.dados.servico_id,
                data_hora_inicio: inicio,
                data_hora_fim: fim,
                external_reference: String(pagamento.id), // Link para o Webhook confirmar depois
                status: 'pendente_pagamento'
            });

            // 3. Enviar as instruções finais
            await ws.sendText(session.dados.telefone, `Quase lá! Para confirmar seu horário, realize o pagamento de *R$ ${servico.preco}* via PIX:`);
            
            // Envia o código copia e cola isolado para facilitar no celular
            await ws.sendText(session.dados.telefone, pagamento.pix_copia_e_cola); 
            
            await ws.sendText(session.dados.telefone, "⚠️ *Atenção:* O horário só será garantido após o pagamento. Você tem 15 minutos!");

            // Limpa a sessão para evitar loops
            delete session.tempServicos;
            delete session.tempDias;
            delete session.tempHoras;

        } catch (e) {
            console.error("❌ Erro no Finalizar:", e);
            await ws.sendText(session.dados.telefone, "Erro ao gerar seu pagamento. Tente novamente em alguns instantes.");
        }
    }
};

module.exports = states;