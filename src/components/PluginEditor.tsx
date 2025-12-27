
import React from 'react';
import { PluginInstance, Track } from '../types';
import { audioEngine } from '../engine/AudioEngine';
import { AutoTuneUI } from '../plugins/AutoTunePlugin';
import { ProfessionalReverbUI } from '../plugins/ReverbPlugin';
import { VocalCompressorUI } from '../plugins/CompressorPlugin';
import { SyncDelayUI } from '../plugins/DelayPlugin';
import { VocalChorusUI } from '../plugins/ChorusPlugin';
import { StudioFlangerUI } from '../plugins/FlangerPlugin';
import { VocalDoublerUI } from '../plugins/DoublerPlugin';
import { StereoSpreaderUI } from '../plugins/StereoSpreaderPlugin';
import { VocalDeEsserUI } from '../plugins/DeEsserPlugin';
import { VocalDenoiserUI } from '../plugins/DenoiserPlugin';
import { ProEQ12UI } from '../plugins/ProEQ12Plugin';
import { VocalSaturatorUI } from '../plugins/VocalSaturatorPlugin';
import { MasterSyncUI } from '../plugins/MasterSyncPlugin';
import VSTPluginWindow from './VSTPluginWindow';
import SamplerEditor from './SamplerEditor'; 
import DrumSamplerEditor from './DrumSamplerEditor';
import MelodicSamplerEditor from './MelodicSamplerEditor';
import DrumRack from './DrumRack';

interface PluginEditorProps {
  plugin: PluginInstance;
  trackId: string;
  onUpdateParams: (params: Record<string, any>) => void;
  onClose: () => void;
  isMobile?: boolean; 
  track?: Track; // Needed for Drum Rack
  onUpdateTrack?: (track: Track) => void; // Needed for Drum Rack
}

const PluginEditor: React.FC<PluginEditorProps> = ({ plugin, trackId, onClose, onUpdateParams, isMobile, track, onUpdateTrack }) => {
  
  // --- SPECIAL CASE: VST3 EXTERNALS ---
  if (plugin.type === 'VST3') {
      return (
          <div className="fixed inset-0 flex items-center justify-center z-[300] pointer-events-none">
              <div className="pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg">
                  <VSTPluginWindow plugin={plugin} trackId={trackId} onClose={onClose} />
              </div>
          </div>
      );
  }

  // --- SPECIAL CASE: INSTRUMENTS ---
  if (plugin.type === 'SAMPLER') {
      return (
          <div className="fixed inset-0 flex items-center justify-center z-[300] pointer-events-none">
              <div className="pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px]">
                  <SamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} />
              </div>
          </div>
      );
  }

  if (plugin.type === 'DRUM_SAMPLER') {
      return (
          <div className="fixed inset-0 flex items-center justify-center z-[300] pointer-events-none">
              <div className="pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px]">
                  <DrumSamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} />
              </div>
          </div>
      );
  }

  if (plugin.type === 'MELODIC_SAMPLER') {
      return (
          <div className="fixed inset-0 flex items-center justify-center z-[300] pointer-events-none">
              <div className="pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px]">
                  <MelodicSamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} />
              </div>
          </div>
      );
  }

  if (plugin.type === 'DRUM_RACK_UI') {
      if (!track || !onUpdateTrack) {
          return <div className="p-10 text-white bg-red-900 rounded">Error: Track Data Missing</div>;
      }
      return (
          <div className="fixed inset-0 flex items-center justify-center z-[300] pointer-events-none">
              <div className="pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px] relative">
                  <button onClick={onClose} className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><i className="fas fa-times"></i></button>
                  <DrumRack track={track} onUpdateTrack={onUpdateTrack} />
              </div>
          </div>
      );
  }

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

  const renderPluginUI = () => {
    const commonProps = {
        trackId: trackId,
        pluginId: plugin.id
    };

    switch(plugin.type) {
      case 'AUTOTUNE': return <AutoTuneUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'REVERB': return <ProfessionalReverbUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'COMPRESSOR': return <VocalCompressorUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'DELAY': return <SyncDelayUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'CHORUS': return <VocalChorusUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'FLANGER': return <StudioFlangerUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'DOUBLER': return <VocalDoublerUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'STEREOSPREADER': return <StereoSpreaderUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'DEESSER': return <VocalDeEsserUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'DENOISER': return <VocalDenoiserUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'PROEQ12': return <ProEQ12UI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'VOCALSATURATOR': return <VocalSaturatorUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      case 'MASTERSYNC': return <MasterSyncUI node={nodeInstance} initialParams={plugin.params as any} onParamsChange={onUpdateParams} {...commonProps} />;
      default: return <div className="p-20 text-white">Plugin UI Not Found</div>;
    }
  };

  return (
    <div className={`relative group/plugin ${isMobile ? 'w-full h-full flex flex-col items-center justify-center pt-16' : ''}`}>
      {/* Header Bar */}
      <div className={`absolute left-0 right-0 h-12 bg-black/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-50 shadow-2xl ${isMobile ? 'top-0 fixed' : '-top-14 rounded-full border border-white/10'}`}>
         <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-white uppercase tracking-widest">{plugin.name} // NODE ACTIVE</span>
         </div>
         <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-red-500 text-slate-500 hover:text-white transition-all flex items-center justify-center">
            <i className="fas fa-times text-xs"></i>
         </button>
      </div>
      
      {/* Container */}
      <div className={`shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden ${isMobile ? 'rounded-none scale-[0.85] origin-top' : 'rounded-[40px]'}`}>
        {renderPluginUI()}
      </div>
    </div>
  );
};
export default PluginEditor;
