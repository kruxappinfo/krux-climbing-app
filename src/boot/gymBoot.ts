/**
 * Gym boot — exposes window.__kruxSeedTests so auth.js (vanilla JS) can call
 * seedDefaultTestsIfEmpty after login without knowing about the TS module graph.
 *
 * Load this file as a compiled ES-module script in index.html, after firebase-config.js.
 *   <script type="module" src="./dist/boot/gymBoot.js"></script>
 */

import { seedDefaultTestsIfEmpty } from '../features/activity/gym/services/testSeeding.service';
import { testRepository } from '../lib/testRepository';

declare global {
  interface Window {
    __kruxSeedTests?: () => Promise<void>;
  }
}

window.__kruxSeedTests = async () => {
  await seedDefaultTestsIfEmpty(testRepository);
};
