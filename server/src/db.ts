import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb(uri = config.mongoUri): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  console.log(`[db] conectado a ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
}
