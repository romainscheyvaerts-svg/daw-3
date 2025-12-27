# GUIDE DE CORRECTIONS - ÉTAPE PAR ÉTAPE

Suivez ces instructions dans l'ordre. Chaque étape contient le code exact à copier-coller.

---

# ÉTAPE 1: Corriger AudioEngine.ts (Enregistrement)

## Fichier: `src/engine/AudioEngine.ts`

### 1.1 - Modifier la signature de updateTrack (ligne 159)

**CHERCHER:**
```typescript
public updateTrack(track: Track, allTracks: Track[]) {
```

**REMPLACER PAR:**
```typescript
public async updateTrack(track: Track, allTracks: Track[]): Promise<void> {
```

---

### 1.2 - Ajouter await à manageTrackInput (ligne 214)

**CHERCHER:**
```typescript
    // 2. Gestion Entrée Micro (Input Monitoring)
    this.manageTrackInput(track, dsp);
```

**REMPLACER PAR:**
```typescript
    // 2. Gestion Entrée Micro (Input Monitoring)
    await this.manageTrackInput(track, dsp);
```

---

# ÉTAPE 2: Corriger App.tsx (Sync Engine)

## Fichier: `src/App.tsx`

### 2.1 - Modifier le useEffect de sync (lignes 247-251)

**CHERCHER:**
```typescript
  // Sync Engine with State
  useEffect(() => {
      if (audioEngine.ctx) {
          state.tracks.forEach(t => audioEngine.updateTrack(t, state.tracks));
      }
  }, [state.tracks]);
```

**REMPLACER PAR:**
```typescript
  // Sync Engine with State
  useEffect(() => {
      const syncTracks = async () => {
          if (audioEngine.ctx) {
              for (const t of state.tracks) {
                  await audioEngine.updateTrack(t, state.tracks);
              }
          }
      };
      syncTracks();
  }, [state.tracks]);
```

---

### 2.2 - Ajouter l'initialisation AudioEngine au démarrage (après ligne 290)

**CHERCHER:**
```typescript
  const isMobile = viewMode === 'MOBILE';
  const ensureAudioEngine = async () => { if (!audioEngine.ctx) await audioEngine.init(); if (audioEngine.ctx?.state === 'suspended') await audioEngine.ctx.resume(); };
```

**REMPLACER PAR:**
```typescript
  const isMobile = viewMode === 'MOBILE';
  const ensureAudioEngine = async () => { if (!audioEngine.ctx) await audioEngine.init(); if (audioEngine.ctx?.state === 'suspended') await audioEngine.ctx.resume(); };

  // Initialisation préventive de l'AudioEngine au premier clic
  useEffect(() => {
    const handleFirstInteraction = async () => {
      await ensureAudioEngine();
      // Pré-initialiser toutes les pistes
      for (const t of stateRef.current.tracks) {
        await audioEngine.updateTrack(t, stateRef.current.tracks);
      }
      console.log('🎵 AudioEngine initialisé');
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);
```

---

# ÉTAPE 3: Corriger handleToggleRecord (Enregistrement)

## Fichier: `src/App.tsx`

### 3.1 - Améliorer handleToggleRecord (lignes 421-479)

**CHERCHER:**
```typescript
  const handleToggleRecord = useCallback(async () => {
    await ensureAudioEngine();

    if (!stateRef.current.isRecording) {
      // === DÉMARRER L'ENREGISTREMENT ===

      // 1. Trouver la piste armée
      const armedTrack = stateRef.current.tracks.find(t => t.isTrackArmed);

      if (!armedTrack) {
        setNoArmedTrackError(true);
        setTimeout(() => setNoArmedTrackError(false), 2000);
        return;
      }

      // 2. Démarrer la lecture (si pas en cours) pour avoir le contexte musical
      if (!stateRef.current.isPlaying) {
        audioEngine.startPlayback(stateRef.current.currentTime, stateRef.current.tracks);
        setVisualState({ isPlaying: true });
      }

      // 3. Lancer l'enregistrement au niveau moteur
      // Le moteur connectera le flux micro propre vers le recorder
      const success = await audioEngine.startRecording(
        stateRef.current.currentTime,
        armedTrack.id
      );
```

**REMPLACER PAR:**
```typescript
  const handleToggleRecord = useCallback(async () => {
    await ensureAudioEngine();

    if (!stateRef.current.isRecording) {
      // === DÉMARRER L'ENREGISTREMENT ===

      // 1. Trouver la piste armée
      const armedTrack = stateRef.current.tracks.find(t => t.isTrackArmed);

      if (!armedTrack) {
        setNoArmedTrackError(true);
        setTimeout(() => setNoArmedTrackError(false), 2000);
        return;
      }

      // 2. IMPORTANT: Forcer la mise à jour du DSP de la piste armée (connecte le micro)
      await audioEngine.updateTrack(armedTrack, stateRef.current.tracks);

      // 3. Attendre que le micro soit bien connecté
      await new Promise(resolve => setTimeout(resolve, 150));

      // 4. Démarrer la lecture (si pas en cours) pour avoir le contexte musical
      if (!stateRef.current.isPlaying) {
        audioEngine.startPlayback(stateRef.current.currentTime, stateRef.current.tracks);
        setVisualState({ isPlaying: true });
      }

      // 5. Lancer l'enregistrement au niveau moteur
      const success = await audioEngine.startRecording(
        stateRef.current.currentTime,
        armedTrack.id
      );
```

---

# ÉTAPE 4: Corriger PluginEditor.tsx (FX qui ne s'ouvrent pas)

## Fichier: `src/components/PluginEditor.tsx`

### 4.1 - Ajouter les imports nécessaires (ligne 2)

**CHERCHER:**
```typescript
import React from 'react';
```

**REMPLACER PAR:**
```typescript
import React, { useEffect, useState } from 'react';
```

---

### 4.2 - Ajouter l'initialisation du plugin (après ligne 34)

**CHERCHER:**
```typescript
const PluginEditor: React.FC<PluginEditorProps> = ({ plugin, trackId, onClose, onUpdateParams, isMobile, track, onUpdateTrack }) => {

  // --- SPECIAL CASE: VST3 EXTERNALS ---
```

**REMPLACER PAR:**
```typescript
const PluginEditor: React.FC<PluginEditorProps> = ({ plugin, trackId, onClose, onUpdateParams, isMobile, track, onUpdateTrack }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialisation forcée du plugin au montage
  useEffect(() => {
    const initPlugin = async () => {
      try {
        // S'assurer que l'AudioContext est initialisé
        if (!audioEngine.ctx) {
          await (audioEngine as any).init();
        }
        if (audioEngine.ctx?.state === 'suspended') {
          await audioEngine.ctx.resume();
        }

        // Vérifier si le nœud existe déjà
        let existingNode = audioEngine.getPluginNodeInstance(trackId, plugin.id);

        if (!existingNode) {
          // Récupérer l'état du DAW et forcer la mise à jour de la piste
          const dawState = (window as any).DAW_CONTROL?.getState?.();
          if (dawState) {
            const currentTrack = dawState.tracks.find((t: any) => t.id === trackId);
            if (currentTrack) {
              await (audioEngine as any).updateTrack(currentTrack, dawState.tracks);
            }
          }
        }

        // Attendre un peu et vérifier à nouveau
        await new Promise(r => setTimeout(r, 100));
        setIsInitializing(false);
      } catch (e: any) {
        console.error('Plugin init error:', e);
        setInitError(e.message);
        setIsInitializing(false);
      }
    };

    initPlugin();
  }, [trackId, plugin.id]);

  // --- SPECIAL CASE: VST3 EXTERNALS ---
```

---

### 4.3 - Améliorer la vérification du nodeInstance (lignes 92-102)

**CHERCHER:**
```typescript
  // --- INTERNAL WEB AUDIO PLUGINS ---
  const nodeInstance = audioEngine.getPluginNodeInstance(trackId, plugin.id);

  if (!nodeInstance) {
    return (
      <div className="bg-[#0f1115] border border-white/10 p-10 rounded-[32px] text-center w-80 shadow-2xl">
         <i className="fas fa-ghost text-4xl text-slate-700 mb-4"></i>
         <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Initialisation DSP...</p>
      </div>
    );
  }
```

**REMPLACER PAR:**
```typescript
  // --- INTERNAL WEB AUDIO PLUGINS ---
  const nodeInstance = audioEngine.getPluginNodeInstance(trackId, plugin.id);

  // Afficher l'état de chargement ou d'erreur
  if (isInitializing || !nodeInstance) {
    return (
      <div className="bg-[#0f1115] border border-white/10 p-10 rounded-[32px] text-center w-80 shadow-2xl">
         {initError ? (
           <>
             <i className="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
             <p className="text-red-400 font-black uppercase text-[10px] tracking-widest mb-2">Erreur DSP</p>
             <p className="text-slate-500 text-[9px]">{initError}</p>
           </>
         ) : (
           <>
             <div className="w-10 h-10 mx-auto mb-4 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
             <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Initialisation DSP...</p>
           </>
         )}
         <button
           onClick={onClose}
           className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl text-[10px] font-bold uppercase transition-all"
         >
           Fermer
         </button>
      </div>
    );
  }
```

---

# ÉTAPE 5: Corriger l'ouverture des plugins depuis ArrangementView

## Fichier: `src/App.tsx`

### 5.1 - Modifier onSelectPlugin dans ArrangementView (vers ligne 860)

**CHERCHER:**
```typescript
               onSelectPlugin={(tid, p) => { ensureAudioEngine(); setActivePlugin({trackId:tid, plugin:p}); }}
```

**REMPLACER PAR:**
```typescript
               onSelectPlugin={async (tid, p) => {
                   await ensureAudioEngine();
                   // Forcer la mise à jour de la piste pour créer le nœud du plugin
                   const track = stateRef.current.tracks.find(t => t.id === tid);
                   if (track) {
                       await audioEngine.updateTrack(track, stateRef.current.tracks);
                   }
                   // Petite attente puis ouvrir
                   setTimeout(() => setActivePlugin({trackId: tid, plugin: p}), 50);
               }}
```

---

# ÉTAPE 6: Corriger handleAddPluginFromContext

## Fichier: `src/App.tsx`

### 6.1 - Modifier handleAddPluginFromContext (lignes 551-558)

**CHERCHER:**
```typescript
  const handleAddPluginFromContext = (tid: string, type: PluginType, meta?: any) => {
      setState(prev => {
          const track = prev.tracks.find(t => t.id === tid);
          if (!track) return prev;
          const newPlugin = createDefaultPlugins(type, 0.5, prev.bpm, meta);
          return { ...prev, tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: [...t.plugins, newPlugin] } : t) };
      });
  };
```

**REMPLACER PAR:**
```typescript
  const handleAddPluginFromContext = async (tid: string, type: PluginType, meta?: any) => {
      setState(prev => {
          const track = prev.tracks.find(t => t.id === tid);
          if (!track) return prev;
          const newPlugin = createDefaultPlugins(type, 0.5, prev.bpm, meta);
          return { ...prev, tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: [...t.plugins, newPlugin] } : t) };
      });

      // Forcer la création du nœud DSP après l'ajout
      await ensureAudioEngine();
      setTimeout(async () => {
          const track = stateRef.current.tracks.find(t => t.id === tid);
          if (track) {
              await audioEngine.updateTrack(track, stateRef.current.tracks);
          }
      }, 50);
  };
```

---

# ÉTAPE 7: Tester les corrections

## Tests à effectuer:

### Test 1: Enregistrement
1. Ouvrir le DAW
2. Cliquer n'importe où pour initialiser l'audio
3. Cliquer sur le bouton "ARM" (🔴) d'une piste audio
4. Cliquer sur le bouton "REC" dans la barre de transport
5. Parler dans le micro pendant quelques secondes
6. Cliquer à nouveau sur "REC" pour arrêter
7. **Résultat attendu:** Un clip audio apparaît sur la piste

### Test 2: Ouverture des FX
1. Ajouter un plugin (Reverb, Delay, etc.) à une piste
2. Cliquer sur le plugin dans la liste
3. **Résultat attendu:** L'interface du plugin s'ouvre (pas "Initialisation DSP..." bloqué)

### Test 3: Lecture avec effets
1. Importer un fichier audio
2. Ajouter des effets (Reverb, Compressor...)
3. Lancer la lecture
4. **Résultat attendu:** Les effets sont audibles

---

# RÉSUMÉ DES FICHIERS MODIFIÉS

| Fichier | Modifications |
|---------|---------------|
| `src/engine/AudioEngine.ts` | 2 modifications (async updateTrack, await manageTrackInput) |
| `src/App.tsx` | 5 modifications (useEffect sync, init audio, handleToggleRecord, onSelectPlugin, handleAddPluginFromContext) |
| `src/components/PluginEditor.tsx` | 3 modifications (imports, useEffect init, vérification nodeInstance) |

---

# EN CAS DE PROBLÈME

Si après ces corrections les problèmes persistent:

1. **Vérifier la console du navigateur** (F12) pour voir les erreurs
2. **S'assurer que le micro est autorisé** dans les paramètres du navigateur
3. **Vérifier que les fichiers sont bien dans `/src/`** et pas à la racine
4. **Relancer le serveur de dev** avec `npm run dev`
