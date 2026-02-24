const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino'); // O Baileys gosta de usar o pino para logs
const flowManager = require('../core/FlowManager');

class WhatsAppService {
    constructor() {
        this.sock = null;
    }

    async start() {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        // Pega a versão mais recente do WhatsApp Web para não dar erro de versão desatualizada
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🚀 Usando WhatsApp Web v${version.join('.')}, última versão: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'error' }), // Diminui o barulho no terminal, mostra só erro real
            browser: ["Ubuntu", "Chrome", "20.0.04"], // Mudamos para Ubuntu/Chrome para testar estabilidade
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        this.sock.ev.on('connection.update', (update) => this.handleConnection(update));
        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
    }

    handleConnection(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- ESCANEIE O QR CODE ABAIXO ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            // Se o erro for 405 ou 401, o ideal é limpar a sessão e tentar de novo
            if (statusCode === 405 || statusCode === 401) {
                console.log('❌ Erro de autenticação/método (405). Tente apagar a pasta auth_info_baileys.');
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexão fechada (${statusCode}). Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(() => this.start(), 3000); // Espera 3 seg antes de tentar de novo
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado com sucesso!');
        }
    }

    async handleMessages(m) {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify' && msg.message) {
            await flowManager.processarMensagem(msg, this);
        }
    }

    async sendText(to, text) {
        if (this.sock) {
            await this.sock.sendMessage(to, { text: text });
        }
    }
}

module.exports = new WhatsAppService();