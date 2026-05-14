/**
 * Firebase modular SDK bridge.
 *
 * Firebase 9.23.0 compat is initialized globally by firebase-config.js (CDN).
 * getApp() returns that same default app — no double-init, no extra network request.
 * This file exists solely to provide typed modular-SDK handles to the TypeScript layer.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDpxQsBojIZCiRGMn8fyLUmJIOm_2M_5EU',
  authDomain: 'climbmaps-80cae.firebaseapp.com',
  projectId: 'climbmaps-80cae',
  storageBucket: 'climbmaps-80cae.firebasestorage.app',
  messagingSenderId: '627029956398',
  appId: '1:627029956398:web:ac68aa375da7f654480cbf',
  measurementId: 'G-52WLBVG198',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const getCurrentUserId = (): string | null =>
  getAuth(app).currentUser?.uid ?? null;
