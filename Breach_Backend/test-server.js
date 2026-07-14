import express from 'express';
import { parseExpenseController } from './src/controllers/nlp.controller.js';

const app = express();
app.use(express.json());

// Mock requireAuth to inject a user
app.use((req, res, next) => {
  req.auth = { userId: 'e632d433-87cb-4b36-a83d-1ebde55cf73a' }; // Replace with a real UUID
  next();
});

app.post('/test-nlp', parseExpenseController);

app.listen(3001, () => {
  console.log('Isolated NLP test server running on port 3001');
});
