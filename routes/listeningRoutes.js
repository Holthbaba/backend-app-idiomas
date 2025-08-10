// routes/listeningRoutes.js
import express from 'express';
import {
  iniciarLicaoListening,
  checarRespostasListening,
} from '../controllers/listeningController.js';

const router = express.Router();

// Rota para iniciar um desafio de listening
router.get('/start', iniciarLicaoListening);

// Rota para checar as respostas de um desafio de listening
router.post('/check', checarRespostasListening);

export default router;