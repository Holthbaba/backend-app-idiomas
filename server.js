// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import wordRoutes from './routes/wordRoutes.js';
import listeningRoutes from './routes/listeningRoutes.js'; // Importe as novas rotas

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/api/words', wordRoutes);
app.use('/api/listening', listeningRoutes); // Use as novas rotas

// Rota de "saúde"
app.get('/', (req, res) => {
  res.send('API do App de Idiomas está funcionando!');
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});