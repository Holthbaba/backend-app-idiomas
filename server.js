import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import wordRoutes from './routes/wordRoutes.js';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Permite requisições de outras origens (seu frontend)
app.use(express.json()); // Permite que o servidor entenda JSON no corpo das requisições

// Rota principal da API
app.use('/api/words', wordRoutes);

// Rota de "saúde" para verificar se o servidor está no ar
app.get('/', (req, res) => {
  res.send('API do App de Idiomas está funcionando!');
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});