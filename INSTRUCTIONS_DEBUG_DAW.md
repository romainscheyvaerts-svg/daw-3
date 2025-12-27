# INSTRUCTIONS DE DEBUG - Nova DAW

## RÉSUMÉ DES PROBLÈMES IDENTIFIÉS

Ce document contient les instructions détaillées pour réparer les fonctionnalités cassées du DAW Nova.

---

## PROBLÈME 1: L'ENREGISTREMENT (REC) NE SE LANCE PAS

### Diagnostic

Le problème se situe dans la chaîne d'appels suivante:
1. `handleToggleRecord()` dans `App.tsx:421-479`
2. `audioEngine.startRecording()` dans `AudioEngine.ts:334-375`
3. `manageTrackInput()` dans `AudioEngine.ts:289-330` - **PROBLÈME: ASYNC NON AWAIT**

### Cause Racine

Dans `AudioEngine.ts:214`, la fonction `manageTrackInput()` est appelée SANS `await`:
```typescript
// PROBLÈME - Ligne 214
this.manageTrackInput(track, dsp); // Manque 'await' !
```

Cette fonction est `async` car elle demande l'accès au microphone (`navigator.mediaDevices.getUserMedia`), mais elle n'est pas attendue. Résultat: le micro n'est pas connecté quand l'enregistrement démarre.

### Solution

**Fichier:** `src/engine/AudioEngine.ts`

1. Modifier `updateTrack` pour qu'elle soit `async`:
```typescript
// Ligne 159 - AVANT:
public updateTrack(track: Track, allTracks: Track[]) {

// APRÈS:
public async updateTrack(track: Track, allTracks: Track[]): Promise<void> {
```

2. Ajouter `await` à l'appel de `manageTrackInput`:
```typescript
// Ligne 214 - AVANT:
this.manageTrackInput(track, dsp);

// APRÈS:
await this.manageTrackInput(track, dsp);
```

3. Mettre à jour les appels dans `App.tsx`:
```typescript
// Ligne 247-251 - Dans le useEffect qui sync l'engine avec le state
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

4. Dans `handleToggleRecord`, s'assurer que le DSP est prêt AVANT d'enregistrer:
```typescript
// Ligne 427-447 - APRÈS avoir trouvé armedTrack:
const armedTrack = stateRef.current.tracks.find(t => t.isTrackArmed);
if (!armedTrack) { /* ... error handling */ }

// AJOUTER CES LIGNES:
// Forcer la mise à jour du DSP de la piste armée
await audioEngine.updateTrack(armedTrack, stateRef.current.tracks);

// Petite attente pour s'assurer que le micro est connecté
await new Promise(resolve => setTimeout(resolve, 100));
```

---

## PROBLÈME 2: LES FX NE S'OUVRENT PLUS

### Diagnostic

Le problème se trouve dans `PluginEditor.tsx:93-102`:
```typescript
const nodeInstance = audioEngine.getPluginNodeInstance(trackId, plugin.id);

if (!nodeInstance) {
  return (
    <div>Initialisation DSP...</div> // <-- Plugin reste bloqué ici
  );
}
```

### Cause Racine

Les plugins ne sont créés que dans `AudioEngine.updateTrack()` quand:
1. La piste est mise à jour
2. Le plugin a `isEnabled: true`

Mais si l'AudioContext n'est pas initialisé OU si la piste n'a jamais été mise à jour, le nœud n'existe pas.

### Solution

**Fichier:** `src/components/PluginEditor.tsx`

1. Ajouter une initialisation forcée au montage du composant:
```typescript
// AJOUTER après la ligne 34:
import { useEffect, useState } from 'react';

const PluginEditor: React.FC<PluginEditorProps> = ({ plugin, trackId, onClose, onUpdateParams, isMobile, track, onUpdateTrack }) => {
  const [isReady, setIsReady] = useState(false);

  // AJOUTER ce useEffect:
  useEffect(() => {
    const initPlugin = async () => {
      // S'assurer que l'AudioContext est initialisé
      if (!audioEngine.ctx) {
        await audioEngine.init();
      }
      if (audioEngine.ctx?.state === 'suspended') {
        await audioEngine.ctx.resume();
      }

      // Forcer la création du nœud si nécessaire
      const existingNode = audioEngine.getPluginNodeInstance(trackId, plugin.id);
      if (!existingNode) {
        // Récupérer la piste et forcer updateTrack
        const daw = (window as any).DAW_CONTROL?.getState?.();
        if (daw) {
          const track = daw.tracks.find((t: any) => t.id === trackId);
          if (track) {
            await audioEngine.updateTrack(track, daw.tracks);
          }
        }
      }

      // Petite attente puis vérifier à nouveau
      await new Promise(r => setTimeout(r, 50));
      setIsReady(true);
    };

    initPlugin();
  }, [trackId, plugin.id]);

  // ... reste du code
```

2. Modifier la vérification du nodeInstance:
```typescript
// REMPLACER les lignes 93-102 par:
const nodeInstance = audioEngine.getPluginNodeInstance(trackId, plugin.id);

if (!nodeInstance || !isReady) {
  return (
    <div className="bg-[#0f1115] border border-white/10 p-10 rounded-[32px] text-center w-80 shadow-2xl">
       <div className="w-8 h-8 mx-auto mb-4 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
       <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Initialisation DSP...</p>
       <button
         onClick={onClose}
         className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs"
       >
         Fermer
       </button>
    </div>
  );
}
```

---

## PROBLÈME 3: DUPLICATION DE FICHIERS ENTRE `/` ET `/src/`

### Diagnostic

Il existe une duplication problématique:
- `/components/` (racine)
- `/src/components/`
- `/plugins/` (racine)
- `/src/plugins/`
- etc.

Les imports dans `App.tsx` utilisent des chemins relatifs `./components/` depuis `/src/App.tsx`, donc ils pointent vers `/src/components/`.

### Impact

- Modifications faites dans `/components/` ne sont PAS utilisées
- Confusion lors du développement
- Risque d'incohérences

### Solution

**Option A: Garder uniquement `/src/` (Recommandé)**

1. Vérifier que tous les fichiers nécessaires sont dans `/src/`
2. Supprimer les dossiers en double à la racine
3. S'assurer que les imports utilisent les bons chemins

**Option B: Utiliser des alias Vite**

Modifier `vite.config.ts`:
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@components': path.resolve(__dirname, './src/components'),
    '@plugins': path.resolve(__dirname, './src/plugins'),
    '@engine': path.resolve(__dirname, './src/engine'),
  }
}
```

---

## PROBLÈME 4: INITIALISATION AUDIO ENGINE

### Diagnostic

L'`AudioEngine` peut ne pas être initialisé au moment où les composants essaient de l'utiliser.

### Solution

**Fichier:** `src/App.tsx`

Ajouter une initialisation proactive au démarrage:
```typescript
// AJOUTER après la ligne 290 (après ensureAudioEngine definition):
useEffect(() => {
  // Initialisation préventive de l'AudioEngine
  const preInit = async () => {
    try {
      await audioEngine.init();
      console.log('🎵 AudioEngine pré-initialisé');
    } catch (e) {
      console.warn('AudioEngine pré-init échouée (normal si pas d\'interaction user)', e);
    }
  };

  // Écouter le premier click pour initialiser
  const handleFirstInteraction = async () => {
    await ensureAudioEngine();
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

## PROBLÈME 5: PLUGINS NON CRÉÉS POUR NOUVELLES PISTES

### Diagnostic

Quand on ajoute un plugin à une piste, le nœud DSP n'est pas créé immédiatement.

**Fichier:** `src/App.tsx`

### Solution

Dans `handleAddPluginFromContext` (ligne 551-558):
```typescript
const handleAddPluginFromContext = async (tid: string, type: PluginType, meta?: any) => {
    setState(prev => {
        const track = prev.tracks.find(t => t.id === tid);
        if (!track) return prev;
        const newPlugin = createDefaultPlugins(type, 0.5, prev.bpm, meta);
        return { ...prev, tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: [...t.plugins, newPlugin] } : t) };
    });

    // AJOUTER: Forcer la mise à jour du DSP après ajout du plugin
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

## PROBLÈME 6: CLICK SUR PLUGIN DANS MIXER/ARRANGEMENT

### Diagnostic

Les handlers `onSelectPlugin` peuvent ne pas initialiser l'engine avant d'ouvrir le plugin.

### Solution

**Fichier:** `src/App.tsx`

Modifier les callbacks dans ArrangementView et MixerView:
```typescript
// Ligne 860 - ArrangementView
onSelectPlugin={async (tid, p) => {
    await ensureAudioEngine();

    // Forcer mise à jour de la piste pour créer le nœud du plugin
    const track = stateRef.current.tracks.find(t => t.id === tid);
    if (track) {
        await audioEngine.updateTrack(track, stateRef.current.tracks);
    }

    // Petite attente puis ouvrir
    setTimeout(() => {
        setActivePlugin({trackId: tid, plugin: p});
    }, 50);
}}
```

---

## CHECKLIST DE VÉRIFICATION

Après avoir appliqué ces corrections, tester:

- [ ] **Enregistrement**:
  1. Créer une piste AUDIO
  2. Armer la piste (bouton REC rouge sur la piste)
  3. Cliquer sur REC dans la TransportBar
  4. Parler dans le micro
  5. Arrêter l'enregistrement → Un clip doit apparaître

- [ ] **Plugins FX**:
  1. Ajouter un plugin (Reverb, Delay, etc.) à une piste
  2. Cliquer sur le plugin
  3. L'interface du plugin doit s'ouvrir (pas "Initialisation DSP...")
  4. Modifier les paramètres → L'audio doit changer en temps réel

- [ ] **Lecture avec FX**:
  1. Importer un fichier audio
  2. Ajouter des effets
  3. Lancer la lecture
  4. Les effets doivent être audibles

---

## ARCHITECTURE CRITIQUE À COMPRENDRE

```
User Action (Click Record)
    ↓
handleToggleRecord() [App.tsx]
    ↓
audioEngine.init() + .resume() [Obligatoire avant toute action]
    ↓
updateTrack() [Connecte le micro si piste armée]
    ↓
startRecording() [Crée MediaRecorder sur recordingTap]
    ↓
MediaRecorder.ondataavailable → audioChunks[]
    ↓
stopRecording() → Blob → AudioBuffer → Clip
```

```
User Action (Open Plugin)
    ↓
setActivePlugin({trackId, plugin})
    ↓
PluginEditor rendu
    ↓
audioEngine.getPluginNodeInstance(trackId, pluginId)
    ↓
SI null → "Initialisation..." (PROBLÈME)
SI existant → renderPluginUI()
```

---

## FICHIERS À MODIFIER (PRIORITÉ)

1. **`src/engine/AudioEngine.ts`** - Rendre updateTrack async
2. **`src/App.tsx`** - Corriger les appels async
3. **`src/components/PluginEditor.tsx`** - Ajouter initialisation forcée

---

## NOTES IMPORTANTES

- **AudioContext**: Doit TOUJOURS être initialisé après une interaction utilisateur (click/keypress)
- **Async/Await**: Toutes les opérations audio sont asynchrones
- **DSP Chain**: input → recordingTap → plugins → gain → panner → output
- **Le recordingTap capture le signal AVANT les effets (signal dry)**
