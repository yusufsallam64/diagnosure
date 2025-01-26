// lib/db/collections.ts
import { Collection, Document } from 'mongodb';
import client from './client';
import type { Patient } from '@/types/patient';

const DB_NAME = process.env.MONGODB_DB_NAME || 'test';

export const getUsersCollection = async (): Promise<Collection<Patient>> => {
  await client.connect();
  return client.db(DB_NAME).collection<Patient>('users');
};