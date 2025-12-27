
import React, { useState, useEffect, useRef } from 'react';
import { PluginParameter } from '../types';

export type DetectionMode = 'PEAK' | 'RMS';

export interface CompressorProParams {
  threshold: number;      // -60 to 0 dB
  ratio: number;          // 1 to 20
  knee: number;           // 0 to 24 dB
  attack: number;         // 0.1 to 100 ms
  release: number;        // 10 to 1000 ms
  makeupGain: number;     // 0 to 24 dB
  mix: number;            // 0 to 100% (parallel compression)
  detectionMode: DetectionMode;
  analogMode: boolean;    // Analog saturation modeling
  autoMakeup: boolean;    // Auto-calculate makeup gain
  sidechainHPF: number;   // Sidechain high-pass filter (Hz)
  isEnabled: boolean;
}

export class CompressorProNode {
  private ctx: AudioContext;
  public input: GainNode;
  public output: GainNode;

  // Signal Chain
  private dryGain: GainNode;
  private wetGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private analogSaturation: WaveShaperNode;
  private sidechainFilter: BiquadFilterNode;

  // Oversampling Chain (4x)
  private oversampleInput: GainNode;
  private oversampleOutput: GainNode;
  private oversampleDelay: DelayNode;

  private params: CompressorProParams = {
    threshold: -24,
    ratio: 4,
    knee: 12,
    attack: 3,
    release: 100,
    makeupGain: 0,
    mix: 100,
    detectionMode: 'RMS',
    analogMode: true,
    autoMakeup: true,
    sidechainHPF: 150,
    isEnabled: true
  };

  public latency: number = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Parallel Compression Path
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // Dynamics Section
    this.compressor = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();

    // Sidechain Filter
    this.sidechainFilter = ctx.createBiquadFilter();
    this.sidechainFilter.type = 'highpass';
    this.sidechainFilter.frequency.value = 150;
    this.sidechainFilter.Q.value = 0.707;

    // Analog Saturation (Soft Clipper with Harmonics)
    this.analogSaturation = ctx.createWaveShaper();
    this.analogSaturation.curve = this.createAnalogCurve();
    this.analogSaturation.oversample = '4x';

    // Oversampling
    this.oversampleInput = ctx.createGain();
    this.oversampleOutput = ctx.createGain();
    this.oversampleDelay = ctx.createDelay(0.1);
    this.oversampleDelay.delayTime.value = 0.003; 

    this.latency = 3; 

    // Connect Signal Chain
    this.connectNodes();
    this.updateParameters();
  }

  private connectNodes(): void {
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path
    this.input.connect(this.oversampleInput);
    
    // Sidechain path
    this.oversampleInput.connect(this.sidechainFilter);
    this.sidechainFilter.connect(this.compressor);

    // Main signal path through compressor
    this.oversampleInput.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    
    // Optional analog saturation
    this.makeupGain.connect(this.analogSaturation);
    this.analogSaturation.connect(this.oversampleOutput);
    
    // Compensate latency
    this.oversampleOutput.connect(this.oversampleDelay);
    this.oversampleDelay.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  private createAnalogCurve(): Float32Array {
    const samples = 8192;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2 / samples) - 1;
      const tanh = Math.tanh(x * 1.5); 
      const harmonics = Math.sin(x * 3 * deg) * 0.1;
      const evenHarmonic = Math.cos(x * 2 * deg) * 0.05;
      curve[i] = tanh + harmonics + evenHarmonic;
    }
    return curve;
  }

  public updateParameter(param: keyof CompressorProParams, value: any): void {
    this.params = { ...this.params, [param]: value };
    this.updateParameters();
  }
  
  public updateParams(params: Partial<CompressorProParams>): void {
    this.params = { ...this.params, ...params };
    this.updateParameters();
  }

  private updateParameters(): void {
    const now = this.ctx.currentTime;
    const { threshold, ratio, knee, attack, release, makeupGain, mix, analogMode, autoMakeup, sidechainHPF } = this.params;

    this.compressor.threshold.setValueAtTime(threshold, now);
    this.compressor.ratio.setValueAtTime(ratio, now);
    this.compressor.knee.setValueAtTime(knee, now);
    this.compressor.attack.setValueAtTime(attack / 1000, now);
    this.compressor.release.setValueAtTime(release / 1000, now);

    this.sidechainFilter.frequency.setValueAtTime(sidechainHPF, now);

    let finalMakeup = makeupGain;
    if (autoMakeup) {
      const autoGain = Math.abs(threshold) / ratio * 0.8;
      finalMakeup = Math.min(autoGain, 24);
    }

    const makeupLinear = Math.pow(10, finalMakeup / 20);
    this.makeupGain.gain.setValueAtTime(makeupLinear, now);

    const wetAmount = mix / 100;
    const dryAmount = 1 - wetAmount;
    this.wetGain.gain.setValueAtTime(wetAmount, now);
    this.dryGain.gain.setValueAtTime(dryAmount, now);

    if (analogMode) {
      this.analogSaturation.curve = this.createAnalogCurve();
    } else {
      const linear = new Float32Array(2);
      linear[0] = -1;
      linear[1] = 1;
      this.analogSaturation.curve = linear;
    }
  }

  public getReduction(): number {
    return this.compressor.reduction || 0;
  }

  public getParameters(): PluginParameter[] {
    return [
        { id: 'threshold', name: 'Threshold', type: 'float', min: -60, max: 0, value: this.params.threshold, unit: 'dB' },
        { id: 'ratio', name: 'Ratio', type: 'float', min: 1, max: 20, value: this.params.ratio, unit: ':1' },
        { id: 'makeupGain', name: 'Makeup', type: 'float', min: 0, max: 24, value: this.params.makeupGain, unit: 'dB' }
    ];
  }
}
