import React, { useState, useEffect, useRef } from 'react';

export interface CompressorParams {
  threshold: number;   
  ratio: number;       
  knee: number;        
  attack: number;      
  release: number;     
  makeupGain: number;  
  isEnabled: boolean;
}

export class CompressorNode {
  public input: GainNode;
  public output: GainNode;
  
  private ctx: AudioContext;
  private compressor: DynamicsCompressorNode;
  private makeupGainNode: GainNode;

  private params: CompressorParams = {
    threshold: -24,
    ratio: 4,
    knee: 12,
    attack: 0.003,
    release: 0.25,
    makeupGain: 1.0,
    isEnabled: true
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    
    // Core nodes
    this.compressor = ctx.createDynamicsCompressor();
    this.makeupGainNode = ctx.createGain();

    // Wiring
    this.input.connect(this.compressor);
    this.compressor.connect(this.makeupGainNode);
    this.makeupGainNode.connect(this.output);

    this.applyParams();
  }

  public updateParams(p: Partial<CompressorParams>) {
    this.params = { ...this.params, ...p };
    this.applyParams();
  }

  private applyParams() {
    const now = this.ctx.currentTime;
    
    // Bypass Logic
    if (!this.params.isEnabled) {
       // Disconnect effect chain, bridge input to output
       // Simply setting gain is easier for keeping graph intact
       this.compressor.threshold.setTargetAtTime(0, now, 0.01);
       this.compressor.ratio.setTargetAtTime(1, now, 0.01);
       this.makeupGainNode.gain.setTargetAtTime(1, now, 0.01);
       return;
    }

    this.compressor.threshold.setTargetAtTime(this.params.threshold, now, 0.01);
    this.compressor.ratio.setTargetAtTime(this.params.ratio, now, 0.01);
    this.compressor.knee.setTargetAtTime(this.params.knee, now, 0.01);
    this.compressor.attack.setTargetAtTime(this.params.attack, now, 0.01);
    this.compressor.release.setTargetAtTime(this.params.release, now, 0.01);
    this.makeupGainNode.gain.setTargetAtTime(this.params.makeupGain, now, 0.01);
  }

  public getReduction() { return this.compressor.reduction; }
}

export const VocalCompressorUI: React.FC<any> = ({ node, initialParams, onParamsChange }) => {
    const update = (k: string, v: any) => {
        onParamsChange({...initialParams, [k]: v});
        node.updateParams({[k]: v});
    }
    return (
        <div className="p-4 text-white">
            <h3 className="font-bold mb-4">Compressor</h3>
            <div className="space-y-2">
                <div>Threshold: <input type="range" min="-60" max="0" value={initialParams.threshold} onChange={e=>update('threshold', Number(e.target.value))} /></div>
                <div>Ratio: <input type="range" min="1" max="20" value={initialParams.ratio} onChange={e=>update('ratio', Number(e.target.value))} /></div>
                <div>Makeup: <input type="range" min="0" max="2" step="0.1" value={initialParams.makeupGain} onChange={e=>update('makeupGain', Number(e.target.value))} /></div>
                <button onClick={() => update('isEnabled', !initialParams.isEnabled)} className="bg-blue-500 px-2 rounded">
                    {initialParams.isEnabled ? 'ON' : 'BYPASS'}
                </button>
            </div>
        </div>
    );
};
