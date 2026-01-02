
import { Track, Clip, PluginInstance, TrackType, TrackSend, PluginType } from '../types';
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
  analyzer: AnalyserNode;       
  inputAnalyzer: AnalyserNode;  
  recordingTap: GainNode;       
  pluginChain: Map<string, { input: AudioNode; output: AudioNode; instance: any }>; 
  sends: Map<string, GainNode>; 
  
  synth?: Synthesizer; 
  sampler?: AudioSampler; 
  drumSampler?: DrumSamplerNode; 
  melodicSampler?: MelodicSamplerNode; 
  drumRack?: DrumRackNode; 
  
  activePluginType?: string; 
}

export class AudioEngine {
  public ctx: AudioContext | null = null;
  private masterOutput: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  public masterAnalyzerL: AnalyserNode | null = null;
  public masterAnalyzerR: AnalyserNode | null = null;
  private masterSplitter: ChannelSplitterNode | null = null;
  public tracksDSP: Map<string, TrackDSP> = new Map();
  public sampleRate: number = 44100;
  private isPlaying: boolean = false;

  private previewSource: AudioBufferSourceNode | null = null;
  private previewGain: GainNode | null = null;
  public previewAnalyzer: AnalyserNode | null = null;
  private isPreviewPlaying: boolean = false;

  constructor() {}

  public async init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 44100 });
    this.sampleRate = this.ctx.sampleRate;
    
    this.masterOutput = this.ctx.createGain();
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5; 
    this.masterLimiter.ratio.value = 20.0;
    this.masterLimiter.attack.value = 0.005;

    const masterAnalyzer = this.ctx.createAnalyser();
    this.masterSplitter = this.ctx.createChannelSplitter(2);
    this.masterAnalyzerL = this.ctx.createAnalyser();
    this.masterAnalyzerR = this.ctx.createAnalyser();

    this.masterOutput.connect(this.masterLimiter);
    this.masterLimiter.connect(masterAnalyzer);
    masterAnalyzer.connect(this.ctx.destination);
    
    masterAnalyzer.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterAnalyzerL, 0);
    this.masterSplitter.connect(this.masterAnalyzerR, 1);

    this.previewGain = this.ctx.createGain();
    this.previewAnalyzer = this.ctx.createAnalyser();
    this.previewAnalyzer.fftSize = 256; 
    this.previewGain.connect(this.previewAnalyzer);
    this.previewAnalyzer.connect(this.ctx.destination);
  }

  public async updateTrack(track: Track, allTracks: Track[]): Promise<void> {
    if (!this.ctx) return;
    let dsp = this.tracksDSP.get(track.id);
    
    if (!dsp) {
      dsp = {
        input: this.ctx.createGain(),
        output: this.ctx.createGain(),
        gain: this.ctx.createGain(),
        panner: this.ctx.createStereoPanner(),
        analyzer: this.ctx.createAnalyser(),
        inputAnalyzer: this.ctx.createAnalyser(),
        recordingTap: this.ctx.createGain(),
        pluginChain: new Map(),
        sends: new Map(),
        activePluginType: undefined
      };
      
      if (track.type === TrackType.MIDI) { 
          dsp.synth = new Synthesizer(this.ctx); 
          dsp.synth.output.connect(dsp.input); 
          dsp.activePluginType = 'SYNTH';
      } 
      else if (track.type === TrackType.SAMPLER) { 
          dsp.melodicSampler = new MelodicSamplerNode(this.ctx); 
          dsp.melodicSampler.output.connect(dsp.input); 
          dsp.drumSampler = new DrumSamplerNode(this.ctx); 
          dsp.drumSampler.output.connect(dsp.input); 
          dsp.sampler = new AudioSampler(this.ctx); 
          dsp.activePluginType = 'MELODIC_SAMPLER';
      } 
      else if (track.type === TrackType.DRUM_RACK) { 
          dsp.drumRack = new DrumRackNode(this.ctx); 
          dsp.drumRack.output.connect(dsp.input); 
          dsp.activePluginType = 'DRUM_RACK_UI';
      }
      
      this.tracksDSP.set(track.id, dsp);
    }

    const instrumentPlugin = track.plugins.find(p => ['MELODIC_SAMPLER', 'DRUM_SAMPLER', 'SAMPLER', 'DRUM_RACK_UI'].includes(p.type));
    if (instrumentPlugin) {
        dsp.activePluginType = instrumentPlugin.type;
    }

    dsp.input.disconnect();
    
    let head: AudioNode = dsp.input;
    const activePluginIds = new Set<string>();

    for (const plugin of track.plugins) {
       if (['MELODIC_SAMPLER', 'DRUM_SAMPLER', 'SAMPLER', 'DRUM_RACK_UI', 'VST3'].includes(plugin.type)) continue;
       if (!plugin.isEnabled) continue;
       
       activePluginIds.add(plugin.id);
       let pEntry = dsp.pluginChain.get(plugin.id);
       
       if (!pEntry) {
           const created = this.createPluginNode(plugin);
           if (created) {
               pEntry = { input: created.input, output: created.output, instance: created.instance };
               dsp.pluginChain.set(plugin.id, pEntry);
           }
       } else {
           if (pEntry.instance.updateParams) {
               pEntry.instance.updateParams(plugin.params);
           }
       }
       
       if (pEntry) {
           head.connect(pEntry.input);
           head = pEntry.output;
       }
    }

    for (const [pid, entry] of dsp.pluginChain.entries()) {
        if (!activePluginIds.has(pid)) {
            try {
                entry.input.disconnect();
                entry.output.disconnect();
            } catch(e) {}
            dsp.pluginChain.delete(pid);
        }
    }

    try { head.disconnect(); dsp.gain.disconnect(); dsp.panner.disconnect(); dsp.analyzer.disconnect(); } catch(e) {}
    
    head.connect(dsp.gain); 
    dsp.gain.connect(dsp.panner); 
    dsp.panner.connect(dsp.analyzer); 
    dsp.analyzer.connect(dsp.output);

    const now = this.ctx.currentTime;
    dsp.gain.gain.setTargetAtTime(track.isMuted ? 0 : track.volume, now, 0.015);
    dsp.panner.pan.setTargetAtTime(track.pan, now, 0.015);
    
    dsp.output.disconnect();
    let destNode: AudioNode = this.masterOutput!;
    if (track.outputTrackId && track.outputTrackId !== 'master') {
        const destDSP = this.tracksDSP.get(track.outputTrackId);
        if (destDSP) destNode = destDSP.input;
    }
    dsp.output.connect(destNode);
    
    if (track.type === TrackType.DRUM_RACK && dsp.drumRack && track.drumPads) {
        dsp.drumRack.updatePadsState(track.drumPads);
    }
  }

  private createPluginNode(plugin: PluginInstance) {
      if (!this.ctx) return null;
      // TOUS LES PLUGINS INTERNES SONT SUPPRIMÉS - RENVOIE NULL
      return null;
  }

  public getPluginNodeInstance(trackId: string, pluginId: string) { 
      return this.tracksDSP.get(trackId)?.pluginChain.get(pluginId)?.instance || null; 
  }
  
  public getTrackAnalyzer(trackId: string) { return this.tracksDSP.get(trackId)?.analyzer || null; }
  public getMasterAnalyzer() { return this.masterAnalyzerL; } 
  public getCurrentTime() { return this.ctx ? this.ctx.currentTime : 0; }
  public getIsPlaying() { return this.isPlaying; }

  public startPlayback(startOffset: number, tracks: Track[]) { this.isPlaying = true; }
  public stopAll() { this.isPlaying = false; }
  public seekTo(time: number, tracks: Track[], wasPlaying: boolean) {}
  
  public triggerTrackAttack(tid: string, pitch: number, vel: number, time: number = 0) {
      const dsp = this.tracksDSP.get(tid);
      if(!dsp || !this.ctx) return;
      const now = Math.max(time, this.ctx.currentTime);
      
      if (dsp.activePluginType === 'DRUM_RACK_UI' && dsp.drumRack) {
          dsp.drumRack.trigger(pitch, vel, now);
      } else if (dsp.activePluginType === 'DRUM_SAMPLER' && dsp.drumSampler) {
          dsp.drumSampler.trigger(vel, now);
      } else if (dsp.activePluginType === 'MELODIC_SAMPLER' && dsp.melodicSampler) {
          dsp.melodicSampler.triggerAttack(pitch, vel, now);
      } else if (dsp.synth) {
          dsp.synth.triggerAttack(pitch, vel, now);
      }
  }

  public triggerTrackRelease(tid: string, pitch: number, time: number = 0) {
      const dsp = this.tracksDSP.get(tid);
      if(!dsp || !this.ctx) return;
      const now = Math.max(time, this.ctx.currentTime);
      
      if(dsp.synth) dsp.synth.triggerRelease(pitch, now);
      if(dsp.melodicSampler) dsp.melodicSampler.triggerRelease(pitch, now);
  }

  public previewMidiNote(tid: string, pitch: number, duration: number = 0.5) { this.triggerTrackAttack(tid, pitch, 0.8); setTimeout(() => this.triggerTrackRelease(tid, pitch), duration * 1000); }
  
  public loadSamplerBuffer(tid: string, buf: AudioBuffer) { const dsp = this.tracksDSP.get(tid); if(dsp?.melodicSampler) dsp.melodicSampler.loadBuffer(buf); if(dsp?.drumSampler) dsp.drumSampler.loadBuffer(buf); }
  public loadDrumRackSample(tid: string, padId: number, buf: AudioBuffer) { const dsp = this.tracksDSP.get(tid); if(dsp?.drumRack) dsp.drumRack.loadSample(padId, buf); }
  
  public getDrumRackNode(tid: string) { return this.tracksDSP.get(tid)?.drumRack || null; }
  public getDrumSamplerNode(tid: string) { return this.tracksDSP.get(tid)?.drumSampler || null; }
  public getMelodicSamplerNode(tid: string) { return this.tracksDSP.get(tid)?.melodicSampler || null; }
  
  public getRMS(analyser: AnalyserNode | null): number { return 0; }
  public setRecMode(active: boolean) {}
  public setDelayCompensation(enabled: boolean) {}
  public setLatencyMode(mode: string) {}
  public setInputDevice(id: string) {}
  public setOutputDevice(id: string) {}
  public playTestTone() {}
  public async renderProject(tracks: Track[], dur: number, off: number, sr: number, cb: any) { return this.ctx!.createBuffer(2, 44100, 44100); }
  public scrub(tracks: Track[], time: number, velocity: number) {}
  public stopScrubbing() {}
  
  public async enableVSTAudioStreaming(trackId: string, pluginId: string) { console.log('VST Streaming not fully implemented in mock'); }
  public disableVSTAudioStreaming() {}
  
  public async startRecording(currentTime: number, trackId: string): Promise<boolean> { return false; }
  public async stopRecording(): Promise<any> { return null; }

  public async playHighResPreview(url: string, onEnded?: () => void): Promise<void> {
      await this.init();
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      this.stopPreview();
      try {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
          
          this.previewSource = this.ctx!.createBufferSource();
          this.previewSource.buffer = audioBuffer;
          this.previewSource.connect(this.previewGain!);
          
          this.previewSource.onended = () => {
              this.isPreviewPlaying = false;
              if (onEnded) onEnded();
          };
          
          this.previewSource.start(0);
          this.isPreviewPlaying = true;
          this.previewGain!.gain.value = 0.8;
      } catch (e) {
          console.error("[AudioEngine] Preview Error:", e);
          this.isPreviewPlaying = false;
      }
  }

  public stopPreview() {
      if (this.previewSource) {
          try { this.previewSource.stop(); this.previewSource.disconnect(); } catch(e) {}
          this.previewSource = null;
      }
      this.isPreviewPlaying = false;
  }

  public getPreviewAnalyzer() { return this.previewAnalyzer; }
  
  // Dummy method to satisfy type checker in AutomationEditorView but returns empty
  public getTrackPluginParameters(trackId: string): any[] { return []; }
}

export const audioEngine = new AudioEngine();
