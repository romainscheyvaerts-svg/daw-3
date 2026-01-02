
import React, { useEffect, useState } from 'react';
import { PluginInstance, Track } from '../types';
import { audioEngine } from '../engine/AudioEngine';
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
  track?: Track;
  onUpdateTrack?: (track: Track) => void;
}

const PluginEditor: React.FC<PluginEditorProps> = ({ plugin, trackId, onClose, onUpdateParams, isMobile, track, onUpdateTrack }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Vérification : seuls les types autorisés (Instruments et VST3) passent
    if (plugin.type === 'VST3' || plugin.type === 'SAMPLER' || plugin.type === 'DRUM_SAMPLER' || plugin.type === 'MELODIC_SAMPLER' || plugin.type === 'DRUM_RACK_UI') {
        return;
    }
    // Tout autre type (anciens FX) est considéré comme non supporté/supprimé
    setError("Plugin type not supported (Internal FX Removed).");
  }, [trackId, plugin.id, plugin.type]);

  if (plugin.type === 'VST3') return <div className="fixed inset-0 flex items-center justify-center z-[300]"><VSTPluginWindow plugin={plugin} trackId={trackId} onClose={onClose} /></div>;
  if (plugin.type === 'SAMPLER') return <div className="fixed inset-0 flex items-center justify-center z-[300]"><SamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} /></div>;
  if (plugin.type === 'DRUM_SAMPLER') return <div className="fixed inset-0 flex items-center justify-center z-[300]"><DrumSamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} /></div>;
  if (plugin.type === 'MELODIC_SAMPLER') return <div className="fixed inset-0 flex items-center justify-center z-[300]"><MelodicSamplerEditor plugin={plugin} trackId={trackId} onClose={onClose} /></div>;
  if (plugin.type === 'DRUM_RACK_UI') {
      if (!track || !onUpdateTrack) return null;
      return <div className="fixed inset-0 flex items-center justify-center z-[300]"><DrumRack track={track} onUpdateTrack={onUpdateTrack} /> <button onClick={onClose} className="absolute top-4 right-4 text-white"><i className="fas fa-times"></i></button></div>;
  }

  if (error) {
     return (
      <div className="bg-[#0f1115] border border-red-500/30 p-10 rounded-[32px] text-center w-80 shadow-2xl">
         <i className="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
         <p className="text-white font-bold text-sm mb-2">Erreur Plugin</p>
         <p className="text-slate-500 text-xs">{error}</p>
         <button onClick={onClose} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-xs">Fermer</button>
      </div>
    ); 
  }

  return (
    <div className={`relative group/plugin ${isMobile ? 'w-full h-full flex flex-col items-center justify-center pt-16' : ''}`}>
      <div className={`absolute left-0 right-0 h-12 bg-black/90 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-50 shadow-2xl ${isMobile ? 'top-0 fixed' : '-top-14 rounded-full border border-white/10'}`}>
         <div className="flex items-center space-x-3">
            <span className="text-[10px] font-black text-white uppercase tracking-widest">{plugin.name}</span>
         </div>
         <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-red-500 text-slate-500 hover:text-white transition-all flex items-center justify-center">
            <i className="fas fa-times text-xs"></i>
         </button>
      </div>
      <div className="p-20 text-white opacity-50">Plugin UI Not Found</div>
    </div>
  );
};
export default PluginEditor;
