// controllers/wordController.js
import pool from '../config/db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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
 * ATUALIZADO: Agora também busca os significados da palavra e salva em uma tabela separada.
 */
export const adicionarPalavra = async (req, res) => {
  const { palavra, idioma = 'en-US' } = req.body;
  if (!palavra) {
    return res.status(400).json({ message: 'A palavra é obrigatória.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insere a nova palavra
    const [resultPalavra] = await connection.query(
      'INSERT INTO palavras (palavra, idioma, status) VALUES (?, ?, ?)',
      [palavra, idioma, 'aprendendo']
    );
    const novaPalavraId = resultPalavra.insertId;

    // 2. Gera as frases
    const promptFrases = `Gere exatamente 5 frases em inglês usando a palavra "${palavra}". As frases devem explorar diferentes contextos. O output precisa ser apenas as frases.`;
    const resultIAFrases = await model.generateContent(promptFrases);
    const textoFrases = resultIAFrases.response.text();
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

    // 3. Gera os detalhes da palavra (significados e contextos)
    const promptDetalhes = `Forneça os significados em português da palavra "${palavra}" e explique seus usos em vários contextos. Formate como um texto único, objetivo e claro.`;
    const resultIADetalhes = await model.generateContent(promptDetalhes);
    const detalhesTexto = resultIADetalhes.response.text();

    // 4. Salva os detalhes na nova tabela 'palavra_detalhes'
    await connection.query(
      'INSERT INTO palavra_detalhes (palavra_id, detalhes) VALUES (?, ?)',
      [novaPalavraId, detalhesTexto]
    );

    await connection.commit();
    res.status(201).json({
      id: novaPalavraId,
      palavra,
      message: `${frasesArray.length} frases e os detalhes da palavra foram gerados e salvos.`
    });

  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Esta palavra já foi adicionada.' });
    }
    console.error("Erro em adicionarPalavra:", error);
    res.status(500).json({ message: 'Erro ao adicionar palavra e gerar conteúdo.', error: error.message });
  } finally {
    connection.release();
  }
};


export const iniciarLicao = async (req, res) => {
  try {
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

    res.status(200).json(frases[0]);

  } catch (error) {
    res.status(500).json({ message: 'Erro ao iniciar lição.', error: error.message });
  }
};


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

            await connection.query('DELETE FROM frases WHERE id = ?', [fraseId]);

            const [frasesRestantes] = await connection.query('SELECT COUNT(*) as count FROM frases WHERE palavra_id = ?', [palavraId]);
            const contagem = frasesRestantes[0].count;

            if (contagem === 0) {
                await connection.query("UPDATE palavras SET status = 'aprendida' WHERE id = ?", [palavraId]);
                await connection.commit();
                res.status(200).json({ acertou: true, palavraAprendida: true, message: 'Resposta correta! Palavra concluída!' });
            } else {
                await connection.commit();
                res.status(200).json({ acertou: true, palavraAprendida: false, message: `Resposta correta! Restam ${contagem} frases.` });
            }
        } else {
            res.status(200).json({ acertou: false, message: 'Resposta incorreta.' });
        }
    } catch (error) {
        if(connection) await connection.rollback();
        res.status(500).json({ message: 'Erro ao checar resposta.', error: error.message });
    } finally {
        if(connection) connection.release();
    }
};

// NOVA FUNÇÃO
export const getPalavraDetalhes = async (req, res) => {
  const { id } = req.params;
  try {
    // Busca os detalhes da palavra e a palavra em si
    const [rows] = await pool.query(`
      SELECT p.palavra, pd.detalhes
      FROM palavras p
      JOIN palavra_detalhes pd ON p.id = pd.palavra_id
      WHERE p.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Detalhes não encontrados para esta palavra.' });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar detalhes da palavra.', error: error.message });
  }
};

export const deletePalavra = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM palavras WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Palavra não encontrada.' });
    }
    res.status(200).json({ message: 'Palavra, frases e detalhes associados foram deletados com sucesso.' });
  } catch (error) {
    console.error("Erro ao deletar palavra:", error);
    res.status(500).json({ message: 'Erro no servidor ao tentar deletar a palavra.', error: error.message });
  }
};