import React, { useState } from 'react';

export interface ReverbParams {
  decay: number;      
  mix: number;        
  preDelay: number;
  isEnabled: boolean;
}

export class ReverbNode {
  public input: GainNode;
  public output: GainNode;
  private ctx: AudioContext;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  
  private params: ReverbParams = {
    decay: 2.0,
    mix: 0.3,
    preDelay: 0.01,
    isEnabled: true
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    
    this.convolver = ctx.createConvolver();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    
    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
    
    this.generateImpulse();
    this.applyParams();
  }

  private generateImpulse() {
    const duration = this.params.decay;
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 4);
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
    }
    this.convolver.buffer = impulse;
  }

  public updateParams(p: Partial<ReverbParams>) {
    const oldDecay = this.params.decay;
    this.params = { ...this.params, ...p };
    
    if (this.params.decay !== oldDecay) this.generateImpulse();
    this.applyParams();
  }

  private applyParams() {
      const now = this.ctx.currentTime;
      if (this.params.isEnabled) {
          this.dryGain.gain.setTargetAtTime(1 - this.params.mix, now, 0.02);
          this.wetGain.gain.setTargetAtTime(this.params.mix, now, 0.02);
      } else {
          this.dryGain.gain.setTargetAtTime(1, now, 0.02);
          this.wetGain.gain.setTargetAtTime(0, now, 0.02);
      }
  }
}

export const ProfessionalReverbUI: React.FC<any> = ({ node, initialParams, onParamsChange }) => {
    const update = (k: string, v: any) => {
        onParamsChange({...initialParams, [k]: v});
        node.updateParams({[k]: v});
    }
    return (
        <div className="p-4 text-white">
            <h3 className="font-bold mb-4">Reverb</h3>
            <div className="space-y-4">
                <div>Decay: <input type="range" min="0.1" max="10" step="0.1" value={initialParams.decay} onChange={e=>update('decay', Number(e.target.value))} /></div>
                <div>Mix: <input type="range" min="0" max="1" step="0.01" value={initialParams.mix} onChange={e=>update('mix', Number(e.target.value))} /></div>
                <button onClick={() => update('isEnabled', !initialParams.isEnabled)} className="bg-purple-500 px-3 py-1 rounded">
                    {initialParams.isEnabled ? 'ON' : 'BYPASS'}
                </button>
            </div>
        </div>
    );
};
