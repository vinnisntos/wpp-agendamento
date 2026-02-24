require('dotenv').config();
const whatsappService = require('./src/services/WhatsappService');

console.log('🚀 Iniciando Sistema v2.0 (OOP)...');

// Inicia o robô
whatsappService.start();

// Aqui você poderia iniciar um servidor Express (Dashboard) no futuro
// app.listen(3000...)

