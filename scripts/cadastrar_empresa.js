require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Conexão direta para o script (já que ele roda fora do fluxo do bot)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function iniciarCadastro() {
    process.stdout.write('\x1Bc'); // Limpa a tela antes de começar
    console.log("🏢 --- CADASTRO DE NOVA EMPRESA (SaaS) ---\n");

    try {
        const nomeEmpresa = await question("1. Nome da Empresa: "); // Ajustado o nome aqui
        
        const telefone = await question("2. Telefone do Bot (ex: 5511999999999): ");

        console.log("\n⏳ Gravando no Supabase...");

        const { data, error } = await supabase
            .from('profiles')
            .insert([
                { 
                    nome_empresa: nomeEmpresa, // ✅ Nome correto conforme seu print
                    telefone_whatsapp: telefone,
                    plano_ativo: true // Já deixa como ativo por padrão
                }
            ])
            .select();

        // verifica se houve erro na inserção
        if (error) throw error;
        
        console.log("\n✅ Empresa cadastrada com sucesso!");
        console.log("🆔 ID Gerado:", data[0].id);
        console.log("------------------------------------------");

    } catch (err) {
        // em caso de erro mostra mensagem clara para o usuário
        console.error("\n❌ Erro ao cadastrar:", err.message);
    } finally {
        rl.close();
    }
}

iniciarCadastro();
