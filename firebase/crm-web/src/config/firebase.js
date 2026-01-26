/**
 * Firebase Configuration
 *
 * Initialize Firebase app with project configuration.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB_FsFAP-FcWenbahB158NAxkKGEcCzNWI",
  authDomain: "hestia-5ced1.firebaseapp.com",
  projectId: "hestia-5ced1",
  storageBucket: "hestia-5ced1.firebasestorage.app",
  messagingSenderId: "157759967334",
  appId: "1:157759967334:web:d7a68ae16301c30a1d9da7",
  measurementId: "G-MLS6G2R9JL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to emulators in development (optional)
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}

export default app;
