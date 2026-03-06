const states = require('../flows/states');
const db = require('../services/DatabaseService');

class FlowManager {
    constructor() {
        this.sessions = {};
        this.timeoutLimit = 5 * 60 * 1000; 
        setInterval(() => this.limparSessoesInativas(), 60000);
    }

    async processarMensagem(msg, whatsappService) {
        const from = msg.key.remoteJid;
        const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
        if (!text) return;

        if (['0', 'sair', 'cancelar', 'recomeçar'].includes(text.toLowerCase())) {
            await whatsappService.sendText(from, "Atendimento encerrado. 👋");
            delete this.sessions[from];
            return;
        }

        try {
            // ✅ CORREÇÃO: Tudo dentro do try/catch para erros não matarem o bot
            if (!this.sessions[from]) {
                // Pega só os números do ID do bot para não dar erro no banco
                const meuNumero = whatsappService.sock.user.id.split(':')[0].replace(/\D/g, '');
                const empresa = await db.buscarEmpresaPorTelefone(meuNumero);
                
                if (!empresa) {
                    console.error(`⚠️ ATENÇÃO: O número do bot (${meuNumero}) não está na tabela 'profiles'.`);
                    return; // Ignora se a empresa não existir
                }

                this.sessions[from] = {
                    step: 'WELCOME', 
                    dados: { telefone: from, profile_id: empresa.id },
                    lastInteraction: Date.now()
                };
            }

            const session = this.sessions[from];
            session.lastInteraction = Date.now();

            const handler = states[session.step];
            if (handler) {
                await handler(session, text, whatsappService);
            }
        } catch (error) {
            console.error(`❌ Erro no fluxo:`, error);
            await whatsappService.sendText(from, "Ops, tive um erro técnico. Digite seu nome para recomeçar.");
            if (this.sessions[from]) this.sessions[from].step = 'WELCOME'; 
        }
    }

    limparSessoesInativas() {
        const agora = Date.now();
        Object.keys(this.sessions).forEach(f => {
            if (agora - this.sessions[f].lastInteraction > this.timeoutLimit) delete this.sessions[f];
        });
    }
}

module.exports = new FlowManager();