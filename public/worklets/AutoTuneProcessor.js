
/**
 * AutoTuneProcessor.js
 * DSP AudioWorklet pour la correction de hauteur en temps réel.
 * 
 * Pipeline :
 * 1. Input Buffer -> Ring Buffer (Stockage)
 * 2. Downsampling & Autocorrelation (Détection Pitch)
 * 3. Quantization (Midi Snap)
 * 4. Smoothing (Retune Speed)
 * 5. Pitch Shifting (Dual Delay Line Granular Synthesis)
 */

class AutoTuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // --- CONFIGURATION ---
    this.bufferSize = 4096;
    this.bufferMask = this.bufferSize - 1;
    this.buffer = new Float32Array(this.bufferSize); // Ring Buffer pour l'audio
    this.writeIndex = 0;

    // --- ANALYSE PITCH ---
    this.analysisBuffer = new Float32Array(1024); // Buffer pour l'ACF
    this.analysisIndex = 0;
    this.lastDetectedFreq = 440;
    this.framesSinceLastAnalysis = 0;
    this.analysisInterval = 10; // Analyser tous les N blocs (économie CPU)

    // --- PITCH SHIFTING (Granular) ---
    this.phase = 0; // Position dans le grain (0.0 à 1.0)
    this.grainSize = 2048; // Taille de la fenêtre de traitement

    // --- SMOOTHING ---
    this.currentRatio = 1.0; // Ratio actuel (lissé)
    
    // --- GAMMES (Fréquences MIDI pré-calculées pour perf) ---
    // Note: 0 = C, 1 = C#, etc.
    this.scales = {
      'CHROMATIC': [0,1,2,3,4,5,6,7,8,9,10,11],
      'MAJOR': [0,2,4,5,7,9,11],
      'MINOR': [0,2,3,5,7,8,10],
      'MINOR_HARMONIC': [0,2,3,5,7,8,11],
      'PENTATONIC': [0,3,5,7,10]
    };
  }

  static get parameterDescriptors() {
    return [
      { name: 'retuneSpeed', defaultValue: 0.1, minValue: 0.0, maxValue: 1.0 }, // 0 = Robot, 1 = Natural
      { name: 'amount', defaultValue: 1.0, minValue: 0.0, maxValue: 1.0 },
      { name: 'rootKey', defaultValue: 0, minValue: 0, maxValue: 11 }, // 0 = C
      { name: 'scaleType', defaultValue: 0, minValue: 0, maxValue: 4 }, // Index dans scales
      { name: 'bypass', defaultValue: 0, minValue: 0, maxValue: 1 }
    ];
  }

  // --- ALGORITHME D'AUTOCORRÉLATION (YIN SIMPLIFIÉ) ---
  detectPitch(buffer, sampleRate) {
    const SIZE = buffer.length;
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    // 1. Calcul RMS (Gate)
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0; // Silence

    // 2. Autocorrélation Optimisée (Range Vocal: 80Hz - 1000Hz)
    // À 44100Hz : 80Hz = 551 samples, 1000Hz = 44 samples
    const minPeriod = 44; 
    const maxPeriod = 551;

    for (let offset = minPeriod; offset < maxPeriod; offset++) {
      let correlation = 0;
      // On ne scanne qu'une partie du buffer pour la perf
      for (let i = 0; i < SIZE - maxPeriod; i += 2) { 
        correlation += buffer[i] * buffer[i + offset];
      }
      
      // Normalisation grossière
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestCorrelation > 0.01 && bestOffset > 0) {
      return sampleRate / bestOffset;
    }
    return 0;
  }

  // --- QUANTIFICATION (AUTO-TUNE LOGIC) ---
  getNearestFreq(inputFreq, rootKey, scaleIdx) {
    if (inputFreq <= 0) return inputFreq;

    const midi = 69 + 12 * Math.log2(inputFreq / 440);
    const note = Math.round(midi);
    const noteInOctave = note % 12;
    
    // Sélection de la gamme
    const scaleNames = ['CHROMATIC', 'MAJOR', 'MINOR', 'MINOR_HARMONIC', 'PENTATONIC'];
    const currentScale = this.scales[scaleNames[scaleIdx]] || this.scales['CHROMATIC'];

    // Normalisation de la note par rapport à la fondamentale (Root)
    const normalizedNote = (noteInOctave - rootKey + 12) % 12;

    // Trouver la note valide la plus proche
    let minDiff = Infinity;
    let targetNormalized = normalizedNote;

    for (let i = 0; i < currentScale.length; i++) {
      const scaleNote = currentScale[i];
      let diff = Math.abs(normalizedNote - scaleNote);
      // Gérer le bouclage de l'octave (ex: B proche de C)
      if (diff > 6) diff = 12 - diff;

      if (diff < minDiff) {
        minDiff = diff;
        targetNormalized = scaleNote;
      }
    }

    // Reconstruire la note MIDI cible
    // On doit déterminer si on a sauté une octave
    let octaveShift = 0;
    const rawDiff = targetNormalized - normalizedNote;
    if (rawDiff > 6) octaveShift = -1;
    if (rawDiff < -6) octaveShift = 1;

    const targetMidi = (Math.floor(midi / 12) + octaveShift) * 12 + targetNormalized + rootKey;
    
    return 440 * Math.pow(2, (targetMidi - 69) / 12);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    // Bypass
    if (parameters.bypass[0] > 0.5) {
      if (input[0]) output[0].set(input[0]);
      return true;
    }

    if (!input || !input[0]) return true;

    const channelData = input[0];
    const outData = output[0];
    const blockSize = channelData.length;

    // Paramètres AudioParam (k-rate ou a-rate)
    const retuneSpeed = parameters.retuneSpeed[0]; // 0 (Fast) -> 1 (Slow)
    const rootKey = Math.round(parameters.rootKey[0]);
    const scaleType = Math.round(parameters.scaleType[0]);
    const amount = parameters.amount[0];

    // 1. ANALYSE PITCH (Sous-échantillonnée)
    // On accumule dans un buffer d'analyse séparé
    if (this.analysisIndex + blockSize < this.analysisBuffer.length) {
      this.analysisBuffer.set(channelData, this.analysisIndex);
      this.analysisIndex += blockSize;
    } else {
      // Buffer plein, on analyse
      const detected = this.detectPitch(this.analysisBuffer, sampleRate);
      if (detected > 0) {
        this.lastDetectedFreq = detected;
      }
      this.analysisIndex = 0; // Reset
    }

    // 2. CALCUL RATIO DE CORRECTION
    const targetFreq = this.getNearestFreq(this.lastDetectedFreq, rootKey, scaleType);
    let targetRatio = 1.0;
    
    if (this.lastDetectedFreq > 0 && targetFreq > 0) {
      targetRatio = targetFreq / this.lastDetectedFreq;
    }

    // Limiter les ratios extrêmes pour éviter les artefacts
    targetRatio = Math.max(0.5, Math.min(2.0, targetRatio));

    // 3. LISSAGE DU RATIO (Retune Speed)
    // Si retuneSpeed est 0, smoothing factor est proche de 1 (Instantané)
    // Si retuneSpeed est 1, smoothing factor est petit (Lent)
    const smoothing = 1.0 - (retuneSpeed * 0.95); 
    this.currentRatio += (targetRatio - this.currentRatio) * smoothing;

    // 4. PITCH SHIFTING (Delay Line Modulation / Granular)
    // Pour changer le pitch sans changer la durée, on module la tête de lecture.
    // Ratio > 1 (Plus aigu) : On lit plus vite, il faut faire des sauts en arrière (crossfade).
    // Ratio < 1 (Plus grave) : On lit plus lentement.
    
    // Note : C'est une implémentation simplifiée type "Rotating Tape Head"
    
    for (let i = 0; i < blockSize; i++) {
      // Écriture dans le Ring Buffer
      this.buffer[this.writeIndex] = channelData[i];

      // Calcul de la vitesse de lecture relative
      // Si ratio = 1, speed = 1. Si ratio = 2, speed = 2.
      // Le "grain" avance à la vitesse du ratio.
      const pitchFactor = 1.0 - this.currentRatio; // Delta de vitesse
      
      // Avancée du pointeur de phase (Window Phasor)
      // La fréquence du grain dépend de la différence de pitch pour minimiser les artefacts
      this.phase += (1.0 - this.currentRatio) / this.grainSize; 
      if (this.phase < 0) this.phase += 1;
      if (this.phase >= 1) this.phase -= 1;

      // On crée deux têtes de lecture décalées de 180° (0.5)
      // Cela permet de faire un fondu enchaîné constant
      const offsetA = this.phase * this.grainSize;
      const offsetB = ((this.phase + 0.5) % 1) * this.grainSize;

      // Positions de lecture dans le passé
      let readIdxA = this.writeIndex - offsetA;
      let readIdxB = this.writeIndex - offsetB;

      // Wrap indices
      if (readIdxA < 0) readIdxA += this.bufferSize;
      if (readIdxB < 0) readIdxB += this.bufferSize;

      // Interpolation linéaire pour la lecture (Anti-aliasing basique)
      const idxA_Int = Math.floor(readIdxA);
      const fracA = readIdxA - idxA_Int;
      const sampleA = this.buffer[idxA_Int & this.bufferMask] * (1 - fracA) + 
                      this.buffer[(idxA_Int + 1) & this.bufferMask] * fracA;

      const idxB_Int = Math.floor(readIdxB);
      const fracB = readIdxB - idxB_Int;
      const sampleB = this.buffer[idxB_Int & this.bufferMask] * (1 - fracB) + 
                      this.buffer[(idxB_Int + 1) & this.bufferMask] * fracB;

      // Fenêtrage (Triangle Window pour le crossfade)
      // Gain est max quand phase est 0.5, min quand 0 ou 1
      // Pour offsetA : peak à 0.5. Pour offsetB : peak à 0.0/1.0
      // Ajustement : On utilise une courbe sinusoïdale ou triangle.
      
      // Triangle simple : 
      // Weight A is 1 at phase 0.5, 0 at 0 and 1? No.
      // Standard pitch shifter window:
      let weightA = 0.5 * (1 - Math.cos(2 * Math.PI * this.phase));
      let weightB = 0.5 * (1 - Math.cos(2 * Math.PI * ((this.phase + 0.5) % 1)));

      // Signal traité
      const wetSignal = (sampleA * weightA) + (sampleB * weightB);

      // Mélange Dry/Wet
      outData[i] = (wetSignal * amount) + (channelData[i] * (1 - amount));

      // Avance tête écriture
      this.writeIndex = (this.writeIndex + 1) & this.bufferMask;
    }

    // --- ENVOI DONNÉES UI (MessagePort) ---
    // On envoie ~60fps
    if (this.framesSinceLastAnalysis++ > 5) {
      this.port.postMessage({
        detectedFreq: this.lastDetectedFreq,
        targetFreq: targetFreq,
        correctionCents: 1200 * Math.log2(targetRatio || 1)
      });
      this.framesSinceLastAnalysis = 0;
    }

    return true;
  }
}

registerProcessor('auto-tune-processor', AutoTuneProcessor);
