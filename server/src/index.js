import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema } from './db.js';
import api from './routes/api.js';
import { getAiStatus } from './ai/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

initSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api', api);

// 生产：托管前端构建
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, HOST, () => {
  const ai = getAiStatus();
  console.log(`[智学伴] API http://localhost:${PORT}`);
  console.log(`[智学伴] AI configured=${ai.configured} model=${ai.model} base=${ai.baseUrl}`);
  console.log(`[智学伴] AI sources: ${ai.sources.join(' | ')}`);
});
