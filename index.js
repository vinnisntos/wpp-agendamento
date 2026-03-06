require('dotenv').config();
const express = require('express');
const whatsappService = require('./src/services/WhatsappService');
const db = require('./src/services/DatabaseService'); // Para atualizar o status no Supabase

const app = express();
app.use(express.json());

console.log('🚀 Iniciando Sistema v2.0 (Azure Cloud Edition)...');

// 1. Rota de Webhook para o Pagamento (O Banco avisa aqui)
app.post('/webhook', async (req, res) => {
    try {
        const { action, data } = req.body;

        // Se o pagamento foi aprovado no Mercado Pago/Asaas
        if (action === 'payment.updated' || action === 'payment.created') {
            const paymentId = data.id;
            
            // Aqui você buscaria no banco o agendamento com esse ID
            // e mudaria o status para 'confirmado'
            const { data: agendamento, error } = await db.confirmarPagamentoNoSupabase(paymentId);

            if (agendamento && !error) {
                // Notifica o cliente via WhatsApp automaticamente
                await whatsappService.sendText(
                    agendamento.telefone, 
                    `✅ *Pagamento Confirmado!*\nSeu horário para *${agendamento.servico_nome}* está garantido.`
                );
                console.log(`💰 Pagamento ${paymentId} confirmado para ${agendamento.telefone}`);
            }
        }
        res.sendStatus(200); // Responde 200 pro banco não ficar tentando enviar de novo
    } catch (err) {
        console.error('❌ Erro no Webhook:', err);
        res.sendStatus(500);
    }
});

// 2. Inicia o Servidor Web na porta da Azure (geralmente 80 ou 443)
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`🌐 Webhook rodando na porta ${PORT}`);
});

// 3. Inicia o robô do WhatsApp
whatsappService.start();