const { MercadoPagoConfig, Payment } = require('mercadopago');

class PaymentService {
    // ✅ CORREÇÃO: Removido o agendamentoId dos parâmetros para bater com o states.js
    async gerarPix(valor, nome, accessToken) {
        if (!accessToken) throw new Error("Token do Mercado Pago ausente.");

        const client = new MercadoPagoConfig({ accessToken });
        const payment = new Payment(client);

        const body = {
            transaction_amount: parseFloat(valor),
            description: `Reserva de Horário - ${nome}`,
            payment_method_id: 'pix',
            payer: { email: 'cliente@agendamento.com' },
            date_of_expiration: new Date(Date.now() + 15 * 60000).toISOString(), 
        };

        const result = await payment.create({ body });
        
        return {
            id: result.id,
            pix_copia_e_cola: result.point_of_interaction.transaction_data.qr_code,
        };
    }
}

module.exports = new PaymentService();