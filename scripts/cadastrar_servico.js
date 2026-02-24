require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Conexão com o Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function cadastrarServico() {
    // Limpa o terminal antes de começar, como você pediu!
    process.stdout.write('\x1Bc'); 
    console.log("✂️  --- CADASTRO DE SERVIÇOS (Salão/Barbearia) ---\n");

    try {
        // 1. Localiza a empresa pelo telefone que você acabou de cadastrar
        const telefone = await question("Qual o telefone do bot da empresa? (ex: 5515981636193): ");
        
        const { data: empresa, error: erroEmpresa } = await supabase
            .from('profiles')
            .select('id, nome_empresa')
            .eq('telefone_whatsapp', telefone)
            .single();

        if (erroEmpresa || !empresa) {
            console.error("\n❌ Empresa não encontrada! Verifique o número no banco.");
            return;
        }

        console.log(`\n✅ Empresa encontrada: ${empresa.nome_empresa}`);
        console.log("------------------------------------------");

        // 2. Coleta os dados do serviço conforme o seu Schema
        const nome = await question("Nome do serviço (ex: Design de Sobrancelha): ");
        const preco = await question("Preço (ex: 35.00): ");
        const duracao = await question("Duração em minutos (ex: 45): ");

        console.log("\n⏳ Gravando no Supabase...");

        const { error } = await supabase
            .from('servicos')
            .insert([
                { 
                    profile_id: empresa.id, // O ID que você gerou no passo anterior
                    nome: nome,
                    preco: parseFloat(preco),
                    duracao_minutos: parseInt(duracao),
                    ativo: true
                }
            ]);

        if (error) throw error;

        console.log("\n✨ Serviço cadastrado com sucesso!");
        
        const continuar = await question("\nDeseja cadastrar outro serviço? (s/n): ");
        if (continuar.toLowerCase() === 's') {
            await cadastrarServico();
        }

    } catch (err) {
        console.error("\n❌ Erro ao cadastrar:", err.message);
    } finally {
        rl.close();
    }
}

cadastrarServico();