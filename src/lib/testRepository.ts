import { FirestoreTestRepository } from '../features/activity/gym/repositories/FirestoreTestRepository';
import { db, getCurrentUserId } from './firebase';

export const testRepository = new FirestoreTestRepository({
  db,
  getUserId: getCurrentUserId,
});
