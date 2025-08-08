// routes/wordRoutes.js
import express from 'express';
import {
  getTodasPalavras,
  adicionarPalavra,
  iniciarLicao,
  checarResposta,
  deletePalavra,
} from '../controllers/wordController.js';

const router = express.Router();

// Rota para pegar todas as palavras
router.get('/', getTodasPalavras);

// Rota para adicionar uma nova palavra
router.post('/add', adicionarPalavra);

// Rota para iniciar um desafio da lição
router.get('/lesson/start', iniciarLicao);

// Rota para checar a resposta de um desafio
router.post('/lesson/check', checarResposta);

//Deletar palavra
router.delete('/:id', deletePalavra);

export default router;