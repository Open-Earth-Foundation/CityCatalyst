import express, { Express, Request, Response } from 'express';
import 'express-async-errors';
import dotenv from 'dotenv';
import { errorHandler } from './util/error-handler';
import authRouter from './routes/auth';

dotenv.config();

const app: Express = express();
const port = process.env.PORT ?? 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', authRouter);

app.get('/', (req: Request, res: Response) => {
  res.send('CityCatalyst API');
});

app.use(errorHandler);
app.listen(port, () => {
  console.log(`⚡️Server running at http://localhost:${port}`);
});

