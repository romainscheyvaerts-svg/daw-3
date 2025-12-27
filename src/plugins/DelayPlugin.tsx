
import React, { useState } from 'react';

export interface DelayParams {
  division: string;
  feedback: number;   
  mix: number;        
  isEnabled: boolean;
  bpm: number;
}

export class SyncDelayNode {
  public input: GainNode;
  public output: GainNode;
  private ctx: AudioContext;
  private delay: DelayNode;
  private feedback: GainNode;
  private dry: GainNode;
  private wet: GainNode;

  private params: DelayParams = {
    division: '1/4',
    feedback: 0.3,
    mix: 0.3,
    isEnabled: true,
    bpm: 120
  };

  constructor(ctx: AudioContext, bpm: number) {
    this.ctx = ctx;
    this.params.bpm = bpm;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    
    this.delay = ctx.createDelay(5.0);
    this.feedback = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();

    // Graph
    this.input.connect(this.dry);
    this.dry.connect(this.output);

    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.output);

    this.applyParams();
  }

  public updateParams(p: Partial<DelayParams>) {
      this.params = { ...this.params, ...p };
      this.applyParams();
  }

  private applyParams() {
      const now = this.ctx.currentTime;
      if (this.params.isEnabled) {
          const beatTime = 60 / this.params.bpm; // 1/4 note
          this.delay.delayTime.setTargetAtTime(beatTime, now, 0.05);
          this.feedback.gain.setTargetAtTime(this.params.feedback, now, 0.02);
          this.wet.gain.setTargetAtTime(this.params.mix, now, 0.02);
          this.dry.gain.setTargetAtTime(1 - this.params.mix, now, 0.02);
      } else {
          this.wet.gain.setTargetAtTime(0, now, 0.02);
          this.dry.gain.setTargetAtTime(1, now, 0.02);
      }
  }
}

export const SyncDelayUI: React.FC<any> = ({ node, initialParams, onParamsChange }) => {
    const update = (k: string, v: any) => {
        onParamsChange({...initialParams, [k]: v});
        node.updateParams({[k]: v});
    }
    return (
        <div className="p-4 text-white">
            <h3 className="font-bold mb-4">Delay</h3>
            <div>Feedback: <input type="range" min="0" max="0.9" step="0.01" value={initialParams.feedback} onChange={e=>update('feedback', Number(e.target.value))} /></div>
            <div>Mix: <input type="range" min="0" max="1" step="0.01" value={initialParams.mix} onChange={e=>update('mix', Number(e.target.value))} /></div>
        </div>
    );
};
