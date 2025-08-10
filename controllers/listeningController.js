// controllers/listeningController.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

export const iniciarLicaoListening = async (req, res) => {
  try {
    const prompt = `
      Crie um texto em inglês para um estudante de nível intermediário.
      O texto precisa ter até 300 caracteres.
      Explore um contexto variado (pode ser cotidiano, acadêmico, cultural, uma pequena notícia, etc.). Varie o tema a cada chamada.
      Após o texto, crie exatamente 3 perguntas de interpretação sobre ele, em inglês.

      Formate a sua resposta EXATAMENTE da seguinte maneira, sem adicionar nenhum outro texto ou formatação:
      [START_TEXT]
      (Seu texto em inglês aqui)
      [END_TEXT]
      [START_QUESTIONS]
      1. (Sua primeira pergunta aqui)
      2. (Sua segunda pergunta aqui)
      3. (Sua terceira pergunta aqui)
      [END_QUESTIONS]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const textoGerado = text.split('[START_TEXT]')[1].split('[END_TEXT]')[0].trim();
    const perguntasTexto = text.split('[START_QUESTIONS]')[1].split('[END_QUESTIONS]')[0].trim();
    const perguntasArray = perguntasTexto.split('\n').map(p => p.replace(/^\d+\.\s*/, '').trim()).filter(p => p.length > 0);

    if (!textoGerado || perguntasArray.length !== 3) {
      throw new Error('A IA não retornou o formato esperado.');
    }

    res.status(200).json({
      texto: textoGerado,
      perguntas: perguntasArray,
    });

  } catch (error) {
    console.error("Erro ao gerar lição de listening:", error);
    res.status(500).json({ message: 'Erro ao gerar lição de listening.', error: error.message });
  }
};

export const checarRespostasListening = async (req, res) => {
  const { texto, perguntas, respostas } = req.body;

  if (!texto || !perguntas || !respostas) {
    return res.status(400).json({ message: 'Dados insuficientes para checar as respostas.' });
  }

  try {
    const prompt = `
      Avalie as respostas de um aluno para as seguintes perguntas de interpretação de texto.
      Seja um corretor amigável e forneça um feedback construtivo em português.
      Indique se a resposta está correta, parcialmente correta ou incorreta, e explique brevemente o porquê.

      Texto Original: "${texto}"

      Perguntas e Respostas do Aluno:
      1. Pergunta: "${perguntas[0]}"
         Resposta: "${respostas[0]}"
      2. Pergunta: "${perguntas[1]}"
         Resposta: "${respostas[1]}"
      3. Pergunta: "${perguntas[2]}"
         Resposta: "${respostas[2]}"

      Forneça um feedback geral sobre as respostas em um único parágrafo.
    `;

    const result = await model.generateContent(prompt);
    const feedback = result.response.text();

    res.status(200).json({ feedback });

  } catch (error) {
    console.error("Erro ao checar respostas de listening:", error);
    res.status(500).json({ message: 'Erro ao processar as respostas.', error: error.message });
  }
};