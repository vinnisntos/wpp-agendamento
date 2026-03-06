require('dotenv').config();
const express = require('express');
const whatsappService = require('./src/services/WhatsappService');
const db = require('./src/services/DatabaseService'); 

const app = express();
app.use(express.json());

console.log('🚀 Iniciando Sistema v2.0 (Azure Cloud Edition)...');

// 1. Rota de Webhook
app.post('/webhook', async (req, res) => {
    // 🕵️ ESPIÃO: Printa TUDO que chegar, independente do formato
    console.log("🔔 [ALERTA] Bateram na porta do Webhook!");
    console.log("📦 Corpo (Body):", req.body);
    console.log("🔗 URL (Query):", req.query);

    try {
        // O MP às vezes manda a 'action' no body, e às vezes manda 'topic' na query.
        // O espião acima vai nos mostrar exatamente como está chegando pra você.
        
        const action = req.body.action || req.body.type || req.query.topic;
        const paymentId = req.body.data?.id || req.query.id;

        if (paymentId) {
            console.log(`🔎 Buscando pagamento ${paymentId} no banco...`);
            const { data: agendamento, error } = await db.confirmarPagamentoNoSupabase(paymentId);

            if (agendamento && !error) {
                await whatsappService.sendText(
                    agendamento.telefone, 
                    `✅ *Pagamento Confirmado!*\nSeu horário está garantido. Te esperamos! 🚀`
                );
                console.log(`💰 SUCESSO! Pagamento ${paymentId} confirmado para ${agendamento.telefone}`);
            } else {
                console.log(`⚠️ Pagamento ${paymentId} recebido, mas agendamento não encontrado no banco ou já confirmado.`);
            }
        }
        
        res.sendStatus(200); 
    } catch (err) {
        console.error('❌ Erro no Webhook:', err);
        res.sendStatus(500);
    }
});

// 2. Inicia o Servidor Web na porta 3000 (evita bloqueio de root do Linux)
const PORT = 3000; 

// O '0.0.0.0' é a chave mágica do Linux para aceitar conexões da internet toda
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Webhook escutando de portas escancaradas na ${PORT}`);
});