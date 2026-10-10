/**
 * CSWA website — Express server
 *
 * Development: runs the API only (Vite serves the React app and proxies /api).
 * Production:  also serves the built React app from ../client/dist.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.use('/api', apiRouter);

// Serve the production build of the React client when it exists.
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Single-page app: send index.html for any non-API route.
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`CSWA server running at http://localhost:${PORT}`);
});
