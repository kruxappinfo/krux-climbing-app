// ================== SEED GYM DATA ==================
// Script de semilla para probar Pirámide de grados y
// ActivityHeatmap en la sección Rocódromo.
//
// USO (consola del navegador, con sesión iniciada):
//   await seedGymData()       → inserta ~60 ascensos de prueba
//   await clearGymSeedData()  → elimina los ascensos insertados
//
// Los docs se marcan con _seed:true para poder borrarlos.
// ====================================================

async function seedGymData() {
  const user = firebase.auth().currentUser;
  if (!user) { console.error('[seed] Sin usuario autenticado'); return; }

  const uid = user.uid;
  const db  = firebase.firestore();
  const batch = db.batch();

  const seededIds = [];

  function ts(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(18 + Math.floor(Math.random() * 3), 0, 0, 0);
    return firebase.firestore.Timestamp.fromDate(d);
  }

  function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ── Vías indoor ───────────────────────────────────────────
  const VIA_SENDS = [
    // grade,  flash, redpoint  (se generan N docs por cada uno)
    { grade: '5+',  flash: 6, redpoint: 2 },
    { grade: '6a',  flash: 5, redpoint: 3 },
    { grade: '6a+', flash: 3, redpoint: 4 },
    { grade: '6b',  flash: 2, redpoint: 3 },
    { grade: '6b+', flash: 1, redpoint: 2 },
    { grade: '6c',  flash: 0, redpoint: 1 },
  ];

  const TRAINING_TYPES = ['fuerza', 'resistencia', 'bloque', 'indoor', 'tecnica', 'antagonistas'];
  const RPE_BY_GRADE   = { '5+': [4,5], '6a': [5,6], '6a+': [6,7], '6b': [7,8], '6b+': [8,9], '6c': [8,9] };

  let dayOffset = 1;
  VIA_SENDS.forEach(({ grade, flash, redpoint }) => {
    for (let i = 0; i < flash; i++) {
      const ref = db.collection('ascents').doc();
      seededIds.push(ref.id);
      const rpeRange = RPE_BY_GRADE[grade] || [5, 7];
      batch.set(ref, {
        userId: uid,
        date: ts(dayOffset++ % 140 + 1),
        style: 'flash',
        grade,
        climbType: 'indoor',
        schoolName: 'Rocódromo Test',
        trainingType: randFrom(TRAINING_TYPES),
        rpe: rpeRange[0] + Math.floor(Math.random() * (rpeRange[1] - rpeRange[0] + 1)),
        _seed: true,
      });
    }
    for (let i = 0; i < redpoint; i++) {
      const ref = db.collection('ascents').doc();
      seededIds.push(ref.id);
      const rpeRange = RPE_BY_GRADE[grade] || [5, 7];
      batch.set(ref, {
        userId: uid,
        date: ts(dayOffset++ % 140 + 1),
        style: 'redpoint',
        grade,
        climbType: 'indoor',
        schoolName: 'Rocódromo Test',
        trainingType: randFrom(TRAINING_TYPES),
        rpe: rpeRange[0] + Math.floor(Math.random() * (rpeRange[1] - rpeRange[0] + 1)),
        _seed: true,
      });
    }
  });

  // ── Proyectos vía ─────────────────────────────────────────
  const VIA_PROJECTS = [
    { grade: '7a',  routeName: 'Diedro amarillo',  attempts: 8,  bestAttempt: '70%' },
    { grade: '6c+', routeName: 'Desplome rojo',     attempts: 5,  bestAttempt: 'Cruz final' },
    { grade: '6c',  routeName: 'Muro cóncavo',      attempts: 3,  bestAttempt: 'Paso 2' },
  ];
  VIA_PROJECTS.forEach(p => {
    const ref = db.collection('ascents').doc();
    seededIds.push(ref.id);
    batch.set(ref, {
      userId: uid,
      date: ts(dayOffset++ % 30 + 1),
      style: 'project',
      grade: p.grade,
      routeName: p.routeName,
      climbType: 'indoor',
      schoolName: 'Rocódromo Test',
      attempts: p.attempts,
      bestAttempt: p.bestAttempt,
      _seed: true,
    });
  });

  // ── Boulder ───────────────────────────────────────────────
  const BOULDER_SENDS = [
    { grade: '5',   flash: 5, redpoint: 2 },
    { grade: '5+',  flash: 4, redpoint: 3 },
    { grade: '6A',  flash: 3, redpoint: 2 },
    { grade: '6A+', flash: 1, redpoint: 3 },
    { grade: '6B',  flash: 0, redpoint: 1 },
  ];

  BOULDER_SENDS.forEach(({ grade, flash, redpoint }) => {
    for (let i = 0; i < flash; i++) {
      const ref = db.collection('ascents').doc();
      seededIds.push(ref.id);
      batch.set(ref, {
        userId: uid,
        date: ts(dayOffset++ % 140 + 1),
        style: 'flash',
        grade,
        climbType: 'boulder',
        schoolName: 'Rocódromo Test',
        trainingType: randFrom(TRAINING_TYPES),
        rpe: 6 + Math.floor(Math.random() * 3),
        _seed: true,
      });
    }
    for (let i = 0; i < redpoint; i++) {
      const ref = db.collection('ascents').doc();
      seededIds.push(ref.id);
      batch.set(ref, {
        userId: uid,
        date: ts(dayOffset++ % 140 + 1),
        style: 'redpoint',
        grade,
        climbType: 'boulder',
        schoolName: 'Rocódromo Test',
        trainingType: randFrom(TRAINING_TYPES),
        rpe: 6 + Math.floor(Math.random() * 3),
        _seed: true,
      });
    }
  });

  // ── Proyectos boulder ─────────────────────────────────────
  const BOULDER_PROJECTS = [
    { grade: '6C',  routeName: 'Bloque techo',    attempts: 12, bestAttempt: 'Salida' },
    { grade: '6B+', routeName: 'Mantle imposible', attempts: 6,  bestAttempt: '2º movimiento' },
  ];
  BOULDER_PROJECTS.forEach(p => {
    const ref = db.collection('ascents').doc();
    seededIds.push(ref.id);
    batch.set(ref, {
      userId: uid,
      date: ts(dayOffset++ % 20 + 1),
      style: 'project',
      grade: p.grade,
      routeName: p.routeName,
      climbType: 'boulder',
      schoolName: 'Rocódromo Test',
      attempts: p.attempts,
      bestAttempt: p.bestAttempt,
      _seed: true,
    });
  });

  await batch.commit();

  // Guarda los IDs para poder borrarlos
  window._seedIds = seededIds;
  console.log(`[seed] ✅ Insertados ${seededIds.length} ascensos de prueba.`);
  console.log('[seed] IDs guardados en window._seedIds');
  console.log('[seed] Para borrarlos: await clearGymSeedData()');

  return seededIds;
}

async function clearGymSeedData() {
  const user = firebase.auth().currentUser;
  if (!user) { console.error('[seed] Sin usuario autenticado'); return; }

  const db = firebase.firestore();

  // Borra por campo _seed:true del usuario actual
  const snap = await db.collection('ascents')
    .where('userId', '==', user.uid)
    .where('_seed', '==', true)
    .get();

  if (snap.empty) { console.log('[seed] No hay datos de semilla que borrar.'); return; }

  const batchSize = 500;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[seed] 🗑️ Eliminados ${docs.size} ascensos de semilla.`);
  window._seedIds = [];
}
