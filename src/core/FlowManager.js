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

        if (!this.sessions[from]) {
            const meuNumero = whatsappService.sock.user.id.split(':')[0];
            const empresa = await db.buscarEmpresaPorTelefone(meuNumero);
            
            // ✅ Validação: Se o número do bot não estiver no banco, ignora
            if (!empresa) {
                console.error(`⚠️ O número ${meuNumero} não está vinculado a nenhuma empresa no banco.`);
                return;
            }

            this.sessions[from] = {
                step: 'WELCOME', 
                dados: { telefone: from, profile_id: empresa.id },
                lastInteraction: Date.now()
            };
        }

        const session = this.sessions[from];
        session.lastInteraction = Date.now();

        try {
            const handler = states[session.step];
            if (handler) {
                await handler(session, text, whatsappService);
            }
        } catch (error) {
            console.error(`❌ Erro no fluxo (${session.step}):`, error);
            await whatsappService.sendText(from, "Ops, tive um erro técnico. Digite seu nome para recomeçar.");
            session.step = 'WELCOME'; 
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