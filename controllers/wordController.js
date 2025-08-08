// controllers/wordController.js
import pool from '../config/db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// --- Funções Principais Refatoradas ---

export const getTodasPalavras = async (req, res) => {
  // Esta função não precisa de alterações
  try {
    const [rows] = await pool.query('SELECT * FROM palavras ORDER BY palavra');
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar palavras.', error: error.message });
  }
};

/**
 * NOVA LÓGICA: Adiciona a palavra, chama a IA para gerar 5 frases
 * e armazena todas no banco de dados.
 */
export const adicionarPalavra = async (req, res) => {
  const { palavra, idioma = 'en-US' } = req.body;
  if (!palavra) {
    return res.status(400).json({ message: 'A palavra é obrigatória.' });
  }

  const connection = await pool.getConnection(); // Pega uma conexão para usar transação

  try {
    // Inicia a transação
    await connection.beginTransaction();

    // 1. Insere a nova palavra na tabela 'palavras'
    const [resultPalavra] = await connection.query(
      'INSERT INTO palavras (palavra, idioma, status) VALUES (?, ?, ?)',
      [palavra, idioma, 'aprendendo']
    );
    const novaPalavraId = resultPalavra.insertId;

    // 2. Cria o prompt para a IA
    const prompt = `Gere exatamente 5 frases em inglês usando a palavra "${palavra}". As frases devem ter diferentes níveis de complexidade e explorar diferentes contextos. Formate a resposta como uma lista numerada, com cada frase em uma nova linha. Exemplo:
1. Frase um.
2. Frase dois.
3. Frase três.
4. Frase quatro.
5. Frase cinco.`;

    // 3. Chama a API do Gemini
    const resultIA = await model.generateContent(prompt);
    const textoFrases = resultIA.response.text();

    // 4. Processa a resposta e insere as frases no banco
    const frasesArray = textoFrases.split('\n').map(f => f.replace(/^\d+\.\s*/, '').trim()).filter(f => f.length > 0);
    
    if (frasesArray.length === 0) {
        throw new Error("A IA não retornou frases válidas.");
    }

    for (const frase of frasesArray) {
      await connection.query(
        'INSERT INTO frases (palavra_id, frase_texto) VALUES (?, ?)',
        [novaPalavraId, frase]
      );
    }

    // Se tudo deu certo, confirma a transação
    await connection.commit();
    res.status(201).json({ id: novaPalavraId, palavra, message: `${frasesArray.length} frases foram geradas e salvas.` });

  } catch (error) {
    // Se algo deu errado, desfaz todas as operações
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Esta palavra já foi adicionada.' });
    }
    console.error("Erro em adicionarPalavra:", error);
    res.status(500).json({ message: 'Erro ao adicionar palavra e gerar frases.', error: error.message });
  } finally {
    // Libera a conexão de volta para o pool
    connection.release();
  }
};


/**
 * NOVA LÓGICA: Busca uma frase aleatória no banco de dados que ainda não foi "aprendida".
 */
export const iniciarLicao = async (req, res) => {
  try {
    // Busca uma frase aleatória de uma palavra que ainda esteja com o status 'aprendendo'
    const [frases] = await pool.query(`
      SELECT f.id, f.palavra_id, f.frase_texto 
      FROM frases f
      JOIN palavras p ON f.palavra_id = p.id
      WHERE p.status = 'aprendendo'
      ORDER BY RAND() 
      LIMIT 1
    `);

    if (frases.length === 0) {
      return res.status(404).json({ message: 'Parabéns! Nenhuma frase nova para aprender.' });
    }

    res.status(200).json(frases[0]); // Retorna { id, palavra_id, frase_texto }

  } catch (error) {
    res.status(500).json({ message: 'Erro ao iniciar lição.', error: error.message });
  }
};


/**
 * NOVA LÓGICA: Deleta a frase se a resposta estiver correta e verifica se a palavra foi aprendida.
 */
export const checarResposta = async (req, res) => {
    const { fraseId, palavraId, fraseOriginal, respostaUsuario } = req.body;
    if (!fraseId || !palavraId || !fraseOriginal || !respostaUsuario) {
        return res.status(400).json({ message: 'Dados insuficientes para checar a resposta.' });
    }
    const connection = await pool.getConnection();

    try {
        const prompt = `A tradução a seguir está correta? Responda apenas com a palavra 'CORRETO' ou 'INCORRETO'. Frase original: "${fraseOriginal}". Tradução: "${respostaUsuario}".`;
        const result = await model.generateContent(prompt);
        const feedback = result.response.text().trim().toUpperCase();

        if (feedback.includes('CORRETO')) {
            await connection.beginTransaction();

            // 1. Deleta a frase que o usuário acertou
            await connection.query('DELETE FROM frases WHERE id = ?', [fraseId]);

            // 2. Verifica se ainda existem frases para aquela palavra
            const [frasesRestantes] = await connection.query('SELECT COUNT(*) as count FROM frases WHERE palavra_id = ?', [palavraId]);
            const contagem = frasesRestantes[0].count;

            if (contagem === 0) {
                // 3. Se não houver mais frases, marca a palavra como 'aprendida'
                await connection.query("UPDATE palavras SET status = 'aprendida' WHERE id = ?", [palavraId]);
                await connection.commit();
                res.status(200).json({ acertou: true, palavraAprendida: true, message: 'Resposta correta! Palavra concluída!' });
            } else {
                await connection.commit();
                res.status(200).json({ acertou: true, palavraAprendida: false, message: `Resposta correta! Restam ${contagem} frases.` });
            }
        } else {
            // Se errou, não faz nada no banco
            res.status(200).json({ acertou: false, message: 'Resposta incorreta.' });
        }
    } catch (error) {
        if(connection) await connection.rollback();
        res.status(500).json({ message: 'Erro ao checar resposta.', error: error.message });
    } finally {
        if(connection) connection.release();
    }
};

export const deletePalavra = async (req, res) => {
  // O ID vem dos parâmetros da URL (ex: /api/words/15)
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM palavras WHERE id = ?', [id]);

    // Verifica se alguma linha foi realmente afetada.
    // Se affectedRows for 0, significa que não foi encontrada nenhuma palavra com aquele ID.
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Palavra não encontrada.' });
    }

    // Se a exclusão foi bem-sucedida
    res.status(200).json({ message: 'Palavra e suas frases associadas foram deletadas com sucesso.' });

  } catch (error) {
    console.error("Erro ao deletar palavra:", error);
    res.status(500).json({ message: 'Erro no servidor ao tentar deletar a palavra.', error: error.message });
  }
};