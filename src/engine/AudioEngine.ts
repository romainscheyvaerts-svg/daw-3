
import { Track, Clip, PluginInstance, TrackType, TrackSend, PluginParameter, PluginType } from '../types';
import { ReverbNode } from '../plugins/ReverbPlugin';
import { SyncDelayNode } from '../plugins/DelayPlugin';
import { ChorusNode } from '../plugins/ChorusPlugin';
import { FlangerNode } from '../plugins/FlangerPlugin';
import { VocalDoublerNode } from '../plugins/DoublerPlugin';
import { StereoSpreaderNode } from '../plugins/StereoSpreaderPlugin';
import { AutoTuneNode } from '../plugins/AutoTunePlugin';
import { CompressorNode } from '../plugins/CompressorPlugin';
import { DeEsserNode } from '../plugins/DeEsserPlugin';
import { DenoiserNode } from '../plugins/DenoiserPlugin';
import { ProEQ12Node } from '../plugins/ProEQ12Plugin';
import { VocalSaturatorNode } from '../plugins/VocalSaturatorPlugin';
import { MasterSyncNode } from '../plugins/MasterSyncPlugin';
import { Synthesizer } from './Synthesizer';
import { AudioSampler } from './AudioSampler';
import { DrumSamplerNode } from './DrumSamplerNode';
import { MelodicSamplerNode } from './MelodicSamplerNode';
import { DrumRackNode } from './DrumRackNode';

interface TrackDSP {
  input: GainNode;          
  output: GainNode;         
  panner: StereoPannerNode; 
  gain: GainNode;           
  analyzer: AnalyserNode;       // Post-Fader (pour le mix)
  inputAnalyzer: AnalyserNode;  // Pre-Fader (pour le monitoring visuel REC)
  recordingTap: GainNode;       // Point de capture propre (Pre-FX)
  pluginChain: Map<string, { input: AudioNode; output: AudioNode; instance: any }>; 
  sends: Map<string, GainNode>; 
  activePluginType?: PluginType; // Type de plugin instrument actif
  
  // Instruments
  synth?: Synthesizer; 
  sampler?: AudioSampler; 
  drumSampler?: DrumSamplerNode; 
  melodicSampler?: MelodicSamplerNode; 
  drumRack?: DrumRackNode; 
}

interface ScheduledSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  clipId: string;
}

export class AudioEngine {
  public ctx: AudioContext | null = null;
  
  // Master Section
  private masterOutput: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  public masterAnalyzer: AnalyserNode | null = null; 
  public masterAnalyzerL: AnalyserNode | null = null;
  public masterAnalyzerR: AnalyserNode | null = null;
  private masterSplitter: ChannelSplitterNode | null = null;
  
  // Graph Storage
  public tracksDSP: Map<string, TrackDSP> = new Map();
  private activeSources: Map<string, ScheduledSource> = new Map();
  
  // Preview
  private previewSource: AudioBufferSourceNode | null = null;
  private previewGain: GainNode | null = null;
  public previewAnalyzer: AnalyserNode | null = null;

  // Transport & Clock
  private isPlaying: boolean = false;
  private schedulerTimer: number | null = null;
  private nextScheduleTime: number = 0;
  private playbackStartTime: number = 0; 
  private pausedAt: number = 0; 
  private LOOKAHEAD_MS = 25.0; 
  private SCHEDULE_AHEAD_SEC = 0.1; 

  // Recording & Input
  private activeInputStreams: Map<string, MediaStreamAudioSourceNode> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recStartTime: number = 0;
  private recordingTrackId: string | null = null;
  private isRecMode: boolean = false;

  public sampleRate: number = 44100;

  constructor() {}

  public async init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 44100 });
    this.sampleRate = this.ctx.sampleRate;

    // Master Chain
    this.masterOutput = this.ctx.createGain();
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5; // Safety Limiter
    this.masterLimiter.ratio.value = 20.0;
    this.masterLimiter.attack.value = 0.005;

    this.masterAnalyzer = this.ctx.createAnalyser();
    this.masterAnalyzer.fftSize = 2048;
    
    this.masterSplitter = this.ctx.createChannelSplitter(2);
    this.masterAnalyzerL = this.ctx.createAnalyser();
    this.masterAnalyzerR = this.ctx.createAnalyser();

    // Wiring Master
    this.masterOutput.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyzer);
    this.masterAnalyzer.connect(this.ctx.destination);
    
    this.masterAnalyzer.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterAnalyzerL, 0);
    this.masterSplitter.connect(this.masterAnalyzerR, 1);

    // Preview Channel (Independent)
    this.previewGain = this.ctx.createGain();
    this.previewAnalyzer = this.ctx.createAnalyser();
    this.previewGain.connect(this.previewAnalyzer);
    this.previewAnalyzer.connect(this.ctx.destination);
  }

  // --- PREVIEW & UTILS ---
  public async playHighResPreview(url: string): Promise<void> { 
      await this.init(); 
      if (this.ctx?.state === 'suspended') await this.ctx.resume(); 
      this.stopPreview(); 
      try { 
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer); 
          this.previewSource = this.ctx!.createBufferSource(); 
          this.previewSource.buffer = audioBuffer; 
          this.previewSource.connect(this.previewGain!); 
          this.previewSource.onended = () => { /* optional */ }; 
          this.previewSource.start(0); 
          this.previewGain!.gain.value = 0.8; 
      } catch (e: any) { 
          console.error("[AudioEngine] Preview Error:", e.message); 
          throw e; 
      } 
  }

  public stopPreview() { 
      if (this.previewSource) { 
          try { this.previewSource.stop(); this.previewSource.disconnect(); } catch(e) {} 
          this.previewSource = null; 
      } 
  }
  
  public getPreviewAnalyzer() { return this.previewAnalyzer; }

  // --- TRACK MANAGEMENT ---

  public updateTrack(track: Track, allTracks: Track[]) {
    if (!this.ctx) return;
    
    let dsp = this.tracksDSP.get(track.id);
    
    // 1. Creation du DSP si inexistant
    if (!dsp) {
      dsp = {
        input: this.ctx.createGain(),
        output: this.ctx.createGain(),
        gain: this.ctx.createGain(),
        panner: this.ctx.createStereoPanner(),
        analyzer: this.ctx.createAnalyser(),
        inputAnalyzer: this.ctx.createAnalyser(), // Nouvel analyseur d'entrée
        recordingTap: this.ctx.createGain(),
        pluginChain: new Map(),
        sends: new Map(),
      };
      
      // Configuration Analyseur Entrée
      dsp.inputAnalyzer.fftSize = 1024;
      dsp.inputAnalyzer.smoothingTimeConstant = 0.5;

      // Instruments Init
      if (track.type === TrackType.MIDI) {
          dsp.synth = new Synthesizer(this.ctx);
          dsp.synth.output.connect(dsp.input);
      } else if (track.type === TrackType.SAMPLER) {
          // On initialise les deux moteurs pour permettre le switch à la volée
          dsp.melodicSampler = new MelodicSamplerNode(this.ctx);
          dsp.melodicSampler.output.connect(dsp.input);
          
          dsp.drumSampler = new DrumSamplerNode(this.ctx);
          dsp.drumSampler.output.connect(dsp.input);
          
          dsp.sampler = new AudioSampler(this.ctx); 
      } else if (track.type === TrackType.DRUM_RACK) {
          dsp.drumRack = new DrumRackNode(this.ctx);
          dsp.drumRack.output.connect(dsp.input);
      }

      this.tracksDSP.set(track.id, dsp);
    }
    
    // Detection du plugin instrument actif pour le routage MIDI
    const instrumentPlugin = track.plugins.find(p => ['MELODIC_SAMPLER', 'DRUM_SAMPLER', 'SAMPLER', 'DRUM_RACK_UI'].includes(p.type));
    if (instrumentPlugin) {
        dsp.activePluginType = instrumentPlugin.type;
    } else {
        // Fallback par défaut si aucun plugin instrument n'est trouvé
        if (track.type === TrackType.DRUM_RACK) dsp.activePluginType = 'DRUM_RACK_UI';
        else if (track.type === TrackType.SAMPLER) dsp.activePluginType = 'DRUM_SAMPLER'; 
    }

    // 2. Gestion Entrée Micro (Input Monitoring)
    this.manageTrackInput(track, dsp);

    // 3. Chaîne de Plugins
    dsp.input.disconnect();
    
    // --- ROUTAGE CRITIQUE POUR ENREGISTREMENT ---
    // 1. On connecte l'entrée au RecordingTap (Capture Dry)
    dsp.input.connect(dsp.recordingTap);
    
    // 2. On connecte l'entrée à l'analyseur visuel (Pre-Fader)
    dsp.input.connect(dsp.inputAnalyzer);

    // 3. On continue vers la chaîne d'effets (Monitoring Wet)
    let head: AudioNode = dsp.input;

    // Parcours des plugins
    for (const plugin of track.plugins) {
      let nodeData = dsp.pluginChain.get(plugin.id);
      
      if (!nodeData && plugin.isEnabled) {
        const instance = this.createPluginNode(plugin, this.ctx);
        if (instance) {
          nodeData = {
            input: instance.input,
            output: instance.output,
            instance: instance.node
          };
          dsp.pluginChain.set(plugin.id, nodeData);
        }
      }
      
      // Update Params
      if (nodeData && nodeData.instance && nodeData.instance.updateParams) {
         try { nodeData.instance.updateParams(plugin.params); } catch(e) {}
      }

      // Connexion
      if (nodeData && plugin.isEnabled) {
        try {
          head.connect(nodeData.input);
          head = nodeData.output;
        } catch (e) {
          console.error(`Error connecting plugin ${plugin.id}`, e);
        }
      }
    }

    // Sortie de chaîne vers Volume/Pan
    head.connect(dsp.gain);
    dsp.gain.connect(dsp.panner); 
    dsp.panner.connect(dsp.analyzer); 
    dsp.analyzer.connect(dsp.output);

    // Valeurs temps réel
    const now = this.ctx.currentTime;
    dsp.gain.gain.setTargetAtTime(track.isMuted ? 0 : track.volume, now, 0.015);
    dsp.panner.pan.setTargetAtTime(track.pan, now, 0.015);
    
    // 4. Routing de sortie (Bus ou Master)
    dsp.output.disconnect();
    let destNode: AudioNode = this.masterOutput!;
    
    if (track.outputTrackId && track.outputTrackId !== 'master') {
        const destDSP = this.tracksDSP.get(track.outputTrackId);
        if (destDSP) destNode = destDSP.input;
    }
    dsp.output.connect(destNode);

    // Mise à jour spécifique DrumRack
    if (track.type === TrackType.DRUM_RACK && dsp.drumRack && track.drumPads) {
        dsp.drumRack.updatePadsState(track.drumPads);
    }
  }

  // --- INPUT / MICROPHONE HANDLING ---
  private async manageTrackInput(track: Track, dsp: TrackDSP) {
    if (track.type !== TrackType.AUDIO) return;

    if (track.isTrackArmed) {
        // Si pas déjà connecté
        if (!this.activeInputStreams.has(track.id)) {
            try {
                // Tentative d'accès micro avec configuration optimisée
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        latency: 0,
                        deviceId: track.inputDeviceId && track.inputDeviceId !== 'mic-default' ? track.inputDeviceId : undefined
                    } as MediaTrackConstraints
                });

                const source = this.ctx!.createMediaStreamSource(stream);
                source.connect(dsp.input); 
                
                this.activeInputStreams.set(track.id, source);
                console.log(`🎤 Micro activé sur la piste ${track.name} (ID: ${track.id})`);
            } catch (e) {
                console.error(`Erreur accès micro sur ${track.name}:`, e);
                alert("Impossible d'accéder au microphone. Vérifiez les permissions.");
            }
        }
    } else {
        // Si désarmé, on déconnecte proprement
        if (this.activeInputStreams.has(track.id)) {
            const source = this.activeInputStreams.get(track.id);
            if (source) {
                source.disconnect();
                // Optionnel : ne pas stopper le stream complet pour éviter latence à la réactivation
                // source.mediaStream.getTracks().forEach(t => t.stop()); 
            }
            this.activeInputStreams.delete(track.id);
            console.log(`🎤 Micro désactivé sur ${track.name}`);
        }
    }
  }

  // --- RECORDING ENGINE ---
  
  public async startRecording(currentTime: number, trackId: string): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    
    const dsp = this.tracksDSP.get(trackId);
    if (!dsp) {
        console.error("Impossible d'enregistrer : DSP introuvable pour la piste " + trackId);
        return false;
    }

    try {
        const dest = this.ctx.createMediaStreamDestination();
        
        // On capture depuis le recordingTap qui est alimenté directement par l'Input
        // Indépendamment du volume de la piste ou des effets
        dsp.recordingTap.connect(dest);
        
        // Configuration Recorder avec mimeType explicite pour compatibilité
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/webm' }; // Fallback
        }
        
        this.mediaRecorder = new MediaRecorder(dest.stream, options);
        this.audioChunks = [];
        this.recStartTime = currentTime;
        this.recordingTrackId = trackId;

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.audioChunks.push(e.data);
            }
        };

        this.mediaRecorder.start(100); // Slice toutes les 100ms pour éviter perte de données
        console.log(`🔴 Enregistrement DÉMARRÉ sur ${trackId} à ${currentTime}s`);
        return true;
    } catch (e) {
        console.error("Erreur critique startRecording:", e);
        return false;
    }
  }

  public async stopRecording(): Promise<{ clip: Clip, trackId: string } | null> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        console.warn("Stop recording appelé sans enregistrement actif.");
        return null;
    }

    return new Promise((resolve) => {
        const trackId = this.recordingTrackId!;
        
        this.mediaRecorder!.onstop = async () => {
            console.log(`⏹️ Enregistrement ARRÊTÉ. Traitement de ${this.audioChunks.length} chunks...`);
            
            // Création du Blob
            const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
            const blob = new Blob(this.audioChunks, { type: mimeType });
            
            this.audioChunks = [];
            this.mediaRecorder = null;
            this.recordingTrackId = null;

            if (blob.size === 0) { 
                console.warn("Enregistrement vide (0 octets).");
                resolve(null); 
                return; 
            }

            try {
                // Conversion ArrayBuffer -> AudioBuffer
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
                
                // Création du Clip
                const clip: Clip = {
                    id: `clip-rec-${Date.now()}`,
                    name: 'Vocal Recording',
                    start: this.recStartTime,
                    duration: audioBuffer.duration,
                    offset: 0,
                    fadeIn: 0.01,
                    fadeOut: 0.01,
                    type: TrackType.AUDIO,
                    color: '#ef4444', // Rouge Rec
                    buffer: audioBuffer,
                    gain: 1.0
                };
                
                resolve({ clip, trackId });
            } catch (e) {
                console.error("Erreur décodage audio enregistré:", e);
                resolve(null);
            }
        };

        this.mediaRecorder!.stop();
    });
  }

  // --- PLAYBACK ENGINE ---

  public startPlayback(startOffset: number, tracks: Track[]) {
    if (!this.ctx) return;
    if (this.isPlaying) this.stopAll();

    this.isPlaying = true;
    this.pausedAt = startOffset;
    this.nextScheduleTime = this.ctx.currentTime + 0.05; 
    this.playbackStartTime = this.ctx.currentTime - startOffset; 

    this.schedulerTimer = window.setInterval(() => {
      this.scheduler(tracks);
    }, this.LOOKAHEAD_MS);
  }

  public stopAll() {
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.activeSources.forEach((src) => {
      try { 
        src.source.stop(); 
        src.source.disconnect(); 
        src.gain.disconnect(); 
      } catch (e) { }
    });
    this.activeSources.clear();
    
    this.tracksDSP.forEach(dsp => {
        if (dsp.synth) dsp.synth.releaseAll();
        if (dsp.sampler) dsp.sampler.stopAll();
        if (dsp.drumSampler) dsp.drumSampler.stop();
        if (dsp.melodicSampler) dsp.melodicSampler.stopAll();
    });
  }

  public seekTo(time: number, tracks: Track[], wasPlaying: boolean) {
    this.stopAll();
    this.pausedAt = time;
    if (wasPlaying) {
      this.startPlayback(time, tracks);
    }
  }

  private scheduler(tracks: Track[]) {
    if (!this.ctx) return;
    
    while (this.nextScheduleTime < this.ctx.currentTime + this.SCHEDULE_AHEAD_SEC) {
      const scheduleUntil = this.nextScheduleTime + this.SCHEDULE_AHEAD_SEC;
      const projectTimeStart = this.nextScheduleTime - this.playbackStartTime;
      const projectTimeEnd = scheduleUntil - this.playbackStartTime;
      
      this.scheduleClips(tracks, projectTimeStart, projectTimeEnd, this.nextScheduleTime);
      this.scheduleMidi(tracks, projectTimeStart, projectTimeEnd, this.nextScheduleTime);
      
      this.nextScheduleTime += this.SCHEDULE_AHEAD_SEC; 
    }
  }

  private scheduleClips(tracks: Track[], start: number, end: number, when: number) {
      tracks.forEach(track => {
          if (track.isMuted) return;
          if (track.type !== TrackType.AUDIO) return;

          track.clips.forEach(clip => {
              if (!clip.buffer) return;
              
              if (clip.start < end && (clip.start + clip.duration) > start) {
                  const sourceKey = `${clip.id}`;
                  if (this.activeSources.has(sourceKey)) return;

                  this.playClipSource(track.id, clip, when, start);
              }
          });
      });
  }

  private scheduleMidi(tracks: Track[], start: number, end: number, when: number) {
      tracks.forEach(track => {
          if (track.isMuted) return;
          if (![TrackType.MIDI, TrackType.SAMPLER, TrackType.DRUM_RACK].includes(track.type)) return;

          track.clips.forEach(clip => {
             if (clip.type !== TrackType.MIDI || !clip.notes) return;
             if (clip.start >= end || clip.start + clip.duration <= start) return;

             clip.notes.forEach(note => {
                 const noteAbsStart = clip.start + note.start;
                 const noteAbsEnd = noteAbsStart + note.duration;

                 if (noteAbsStart >= start && noteAbsStart < end) {
                     const scheduleTime = when + (noteAbsStart - start);
                     this.triggerTrackAttack(track.id, note.pitch, note.velocity, scheduleTime);
                 }
                 
                 if (noteAbsEnd >= start && noteAbsEnd < end) {
                     const scheduleTime = when + (noteAbsEnd - start);
                     this.triggerTrackRelease(track.id, note.pitch, scheduleTime);
                 }
             });
          });
      });
  }

  private playClipSource(trackId: string, clip: Clip, when: number, projectTime: number) {
      const dsp = this.tracksDSP.get(trackId);
      if (!dsp || !clip.buffer || !this.ctx) return;

      const source = this.ctx.createBufferSource();
      source.buffer = clip.buffer;
      
      const gain = this.ctx.createGain();
      gain.gain.value = clip.gain || 1.0;
      
      source.connect(gain);
      gain.connect(dsp.input);

      let offset = 0;
      let duration = clip.duration;
      let startTime = clip.start;
      
      if (projectTime > clip.start) {
          offset = (projectTime - clip.start) + clip.offset;
          duration = clip.duration - (projectTime - clip.start);
          startTime = projectTime;
      } else {
          offset = clip.offset;
      }
      
      const playTime = when + (startTime - projectTime);
      
      if (duration > 0) {
          source.start(playTime, offset, duration);
          this.activeSources.set(clip.id, { source, gain, clipId: clip.id });
          source.onended = () => { this.activeSources.delete(clip.id); };
      }
  }

  // --- INSTRUMENTS ---
  public triggerTrackAttack(tid: string, pitch: number, vel: number, time: number = 0) {
      const dsp = this.tracksDSP.get(tid);
      if(!dsp || !this.ctx) return;
      const now = Math.max(time, this.ctx.currentTime);
      
      // Routage MIDI intelligent basé sur le plugin instrument actif
      if (dsp.activePluginType === 'DRUM_RACK_UI' && dsp.drumRack) {
          dsp.drumRack.trigger(pitch, vel, now);
      } 
      else if (dsp.activePluginType === 'DRUM_SAMPLER' && dsp.drumSampler) {
          dsp.drumSampler.trigger(vel, now);
      }
      else if (dsp.activePluginType === 'MELODIC_SAMPLER' && dsp.melodicSampler) {
          dsp.melodicSampler.triggerAttack(pitch, vel, now);
      }
      else if (dsp.synth) {
          dsp.synth.triggerAttack(pitch, vel, now);
      }
      // Fallbacks pour les cas limites
      else if (dsp.melodicSampler) {
           dsp.melodicSampler.triggerAttack(pitch, vel, now);
      }
  }

  public triggerTrackRelease(tid: string, pitch: number, time: number = 0) {
      const dsp = this.tracksDSP.get(tid);
      if(!dsp || !this.ctx) return;
      const now = Math.max(time, this.ctx.currentTime);
      if(dsp.synth) dsp.synth.triggerRelease(pitch, now);
      if(dsp.melodicSampler) dsp.melodicSampler.triggerRelease(pitch, now);
  }
  
  public previewMidiNote(tid: string, pitch: number, duration: number = 0.5) {
      this.triggerTrackAttack(tid, pitch, 0.8);
      setTimeout(() => this.triggerTrackRelease(tid, pitch), duration * 1000);
  }

  public loadSamplerBuffer(tid: string, buf: AudioBuffer) {
       const dsp = this.tracksDSP.get(tid);
       if(dsp?.melodicSampler) dsp.melodicSampler.loadBuffer(buf);
       if(dsp?.drumSampler) dsp.drumSampler.loadBuffer(buf);
  }
  
  public loadDrumRackSample(tid: string, padId: number, buf: AudioBuffer) {
      const dsp = this.tracksDSP.get(tid);
      if(dsp?.drumRack) dsp.drumRack.loadSample(padId, buf);
  }
  
  public getDrumRackNode(tid: string) { return this.tracksDSP.get(tid)?.drumRack || null; }
  public getDrumSamplerNode(tid: string) { return this.tracksDSP.get(tid)?.drumSampler || null; }
  public getMelodicSamplerNode(tid: string) { return this.tracksDSP.get(tid)?.melodicSampler || null; }

  // --- PLUGIN FACTORY ---
  private createPluginNode(plugin: PluginInstance, ctx: AudioContext) {
    try {
      let node: any = null;
      switch (plugin.type) {
        case 'AUTOTUNE': node = new AutoTuneNode(ctx); break;
        case 'REVERB': node = new ReverbNode(ctx); break;
        case 'COMPRESSOR': node = new CompressorNode(ctx); break;
        case 'DELAY': node = new SyncDelayNode(ctx, 120); break;
        case 'CHORUS': node = new ChorusNode(ctx); break;
        case 'FLANGER': node = new FlangerNode(ctx); break;
        case 'DOUBLER': node = new VocalDoublerNode(ctx); break;
        case 'STEREOSPREADER': node = new StereoSpreaderNode(ctx); break;
        case 'DEESSER': node = new DeEsserNode(ctx); break;
        case 'DENOISER': node = new DenoiserNode(ctx); break;
        case 'PROEQ12': node = new ProEQ12Node(ctx, plugin.params as any); break;
        case 'VOCALSATURATOR': node = new VocalSaturatorNode(ctx); break;
        case 'MASTERSYNC': node = new MasterSyncNode(ctx); break;
        default: console.warn(`Unknown plugin: ${plugin.type}`); return null;
      }
      
      if (node && node.input && node.output) {
         if (node.updateParams && plugin.params) node.updateParams(plugin.params);
         return { input: node.input, output: node.output, node };
      }
      return null;
    } catch (e) {
      console.error(`Failed to create plugin ${plugin.type}`, e);
      return null;
    }
  }

  // --- UTILS ---
  public getRMS(analyser: AnalyserNode | null): number {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const sample = (data[i] - 128) / 128; sum += sample * sample; }
    return Math.sqrt(sum / data.length);
  }
  
  public getCurrentTime() { 
      return this.ctx ? (this.isPlaying ? this.ctx.currentTime - this.playbackStartTime : this.pausedAt) : 0; 
  }
  
  public getIsPlaying() { return this.isPlaying; }
  
  // Correction: Si la piste est en cours d'enregistrement (monitor), on renvoie l'InputAnalyzer.
  // Sinon on renvoie l'analyseur de sortie standard.
  public getTrackAnalyzer(trackId: string) { 
      const dsp = this.tracksDSP.get(trackId); 
      if (!dsp) return null;
      // Priorité à l'analyseur d'entrée si un micro est actif sur cette piste
      if (this.activeInputStreams.has(trackId)) return dsp.inputAnalyzer;
      return dsp.analyzer; 
  }
  
  public getMasterAnalyzer() { return this.masterAnalyzer; }
  public getPluginNodeInstance(trackId: string, pluginId: string) { 
      return this.tracksDSP.get(trackId)?.pluginChain.get(pluginId)?.instance || null; 
  }

  public setRecMode(active: boolean) { this.isRecMode = active; }
  public setDelayCompensation(enabled: boolean) {}
  public setLatencyMode(mode: string) {}
  public setInputDevice(id: string) {}
  public setOutputDevice(id: string) {}
  public playTestTone() {}
  public async renderProject(tracks: Track[], dur: number, off: number, sr: number, cb: any) { return this.ctx!.createBuffer(2, 44100, 44100); }
  public scrub(tracks: Track[], time: number, velocity: number) {}
  public stopScrubbing() {}
  public async enableVSTAudioStreaming(trackId: string, pluginId: string) {}
  public disableVSTAudioStreaming() {}
}

export const audioEngine = new AudioEngine();
