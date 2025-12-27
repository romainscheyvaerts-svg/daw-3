
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PluginMetadata, PluginType, User } from '../types';
import { novaBridge, NovaStatus } from '../services/NovaBridge';
import InstrumentCatalog from './InstrumentCatalog';

interface SideBrowserProps {
  onLocalImport?: (file: File) => void;
  activeTabOverride?: 'local' | 'fx' | 'nova' | 'store';
  onTabChange?: (tab: 'local' | 'fx' | 'nova' | 'store') => void;
  onAddPlugin?: (type: string, metadata?: any) => void;
  shouldFocusSearch?: boolean;
  onSearchFocused?: () => void;
  user?: User | null;
  onBuyLicense?: (instId: number) => void; 
}

const SideBrowser: React.FC<SideBrowserProps> = ({ 
  onLocalImport, 
  activeTabOverride, 
  onTabChange,
  onAddPlugin,
  shouldFocusSearch,
  onSearchFocused,
  user,
  onBuyLicense
}) => {
  const [internalTab, setInternalTab] = useState<'local' | 'fx' | 'nova' | 'store'>('store');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Nova Bridge State
  const [novaStatus, setNovaStatus] = useState<NovaStatus>({ isConnected: false, pluginCount: 0, lastMessage: '' });
  const [novaPlugins, setNovaPlugins] = useState<PluginMetadata[]>([]);

  const activeTab = activeTabOverride || internalTab;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- NOVA BRIDGE SUBSCRIPTION ---
  useEffect(() => {
    const unsubStatus = novaBridge.subscribe(setNovaStatus);
    const unsubPlugins = novaBridge.subscribeToPlugins(setNovaPlugins);
    return () => {
      unsubStatus();
      unsubPlugins();
    };
  }, []);

  // Auto-refresh plugins when opening Nova tab
  useEffect(() => {
      if (activeTab === 'nova') {
          // Petit délai pour s'assurer que la connexion est prête si on vient de charger la page
          setTimeout(() => novaBridge.requestPlugins(), 100);
      }
  }, [activeTab]);

  const AVAILABLE_FX = [
    // --- SAMPLERS REMOVED ---
    // They are now exclusive to Track Creation
    
    // --- EFFECTS ---
    { id: 'MASTERSYNC', name: 'Master Sync', desc: 'Auto-Analysis & Scaling', icon: 'fa-sync-alt', color: '#00f2ff' },
    { id: 'VOCALSATURATOR', name: 'Vocal Saturator', desc: 'Analog Warmth & Drive', icon: 'fa-fire', color: '#10b981' },
    { id: 'PROEQ12', name: 'Pro-EQ 12', desc: '12-Band Surgical EQ', icon: 'fa-wave-square', color: '#00f2ff' },
    { id: 'AUTOTUNE', name: 'Auto-Tune Pro', desc: 'Neural Pitch Correction', icon: 'fa-microphone-alt', color: '#00f2ff' },
    { id: 'DENOISER', name: 'Denoiser', desc: 'Noise Suppression', icon: 'fa-broom', color: '#00ff88' },
    { id: 'COMPRESSOR', name: 'Leveler', desc: 'Dynamics Processor', icon: 'fa-compress-alt', color: '#f97316' },
    { id: 'REVERB', name: 'Spatial Verb', desc: 'Hybrid Reverb', icon: 'fa-mountain-sun', color: '#6366f1' },
    { id: 'DELAY', name: 'Sync Delay', desc: 'Tempo Echo', icon: 'fa-history', color: '#0ea5e9' },
    { id: 'CHORUS', name: 'Vocal Chorus', desc: 'Stereo Widener', icon: 'fa-layer-group', color: '#a855f7' },
    { id: 'FLANGER', name: 'Studio Flanger', desc: 'Jet Modulation', icon: 'fa-wind', color: '#3b82f6' },
    { id: 'DOUBLER', name: 'Vocal Doubler', desc: 'Haas Image Doubling', icon: 'fa-people-arrows', color: '#8b5cf6' },
    { id: 'STEREOSPREADER', name: 'Phase Guard', desc: 'M/S Width Spreader', icon: 'fa-arrows-alt-h', color: '#06b6d4' },
    { id: 'DEESSER', name: 'S-Killer', desc: 'Sibilance Processor', icon: 'fa-scissors', color: '#ef4444' }
  ];

  const sortedInternalFX = useMemo(() => {
    // Only Effects now
    return AVAILABLE_FX.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filteredInternalFX = useMemo(() => {
    if (activeTab !== 'fx') return [];
    return sortedInternalFX.filter(fx => 
      fx.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      fx.desc.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, sortedInternalFX, activeTab]);

  const filteredNovaPlugins = useMemo(() => {
    if (activeTab !== 'nova') return [];
    return novaPlugins.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.vendor.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, novaPlugins, activeTab]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if ((activeTab === 'fx' || activeTab === 'nova') && shouldFocusSearch) {
      searchInputRef.current?.focus();
      if (shouldFocusSearch && onSearchFocused) onSearchFocused();
    }
  }, [activeTab, shouldFocusSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = activeTab === 'fx' ? filteredInternalFX : (activeTab === 'nova' ? filteredNovaPlugins : []);
    if (list.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = list[selectedIndex];
      if (selected) {
        if (activeTab === 'fx') handleAddPlugin((selected as any).id);
        else if (activeTab === 'nova') handleAddPlugin('VST3', selected);
      }
    } else if (e.key === 'Escape') {
      setSearchTerm('');
    }
  };

  const setActiveTab = (tab: 'local' | 'fx' | 'nova' | 'store') => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
    setSearchTerm('');
  };

  const handleDragStartInternal = (e: React.DragEvent, type: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('pluginType', type);
    e.dataTransfer.setData('application/nova-plugin', type);
  };

  const handleDragStartVST = (e: React.DragEvent, p: PluginMetadata) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('pluginType', 'VST3');
    e.dataTransfer.setData('pluginName', p.name);
    e.dataTransfer.setData('pluginVendor', p.vendor);
    e.dataTransfer.setData('application/nova-plugin', 'VST3');
  };

  const handleAddPlugin = (type: string, metadata?: any) => {
    if (onAddPlugin) {
      onAddPlugin(type, metadata);
      setSearchTerm(''); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#08090b] border-r border-white/5 shadow-2xl overflow-hidden">
      {/* HEADER TABS */}
      <div className="flex bg-black/40 border-b border-white/5">
        <button onClick={() => setActiveTab('local')} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all ${activeTab === 'local' ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}>
          Local
        </button>
        <button onClick={() => setActiveTab('fx')} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all ${activeTab === 'fx' ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}>
          Internal
        </button>
        <button onClick={() => setActiveTab('nova')} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'nova' ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}>
          <span>Bridge</span>
          <div className={`w-1.5 h-1.5 rounded-full ${novaStatus.isConnected ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500'}`} />
        </button>
        <button onClick={() => setActiveTab('store')} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all ${activeTab === 'store' ? 'bg-white/10 text-cyan-400 shadow-inner' : 'text-slate-500 hover:text-cyan-400'}`}>
          Store
        </button>
      </div>

      <div className="flex-1 overflow-hidden" onKeyDown={handleKeyDown}>
        
        {/* === TAB: STORE (CATALOG) === */}
        {activeTab === 'store' && (
            <InstrumentCatalog user={user || null} onPurchase={onBuyLicense} />
        )}

        {/* === TAB: INTERNAL FX & INSTRUMENTS === */}
        {activeTab === 'fx' && (
          <div className="space-y-3 pb-20 p-4 h-full overflow-y-auto custom-scroll">
            <div className="sticky top-0 z-10 bg-[#08090b] pb-4">
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600"></i>
                <input 
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full h-11 bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 text-[11px] font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-cyan-500/30 transition-all uppercase tracking-widest"
                />
              </div>
            </div>

            <h3 className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 px-2">Mixing Plugins ({filteredInternalFX.length})</h3>
            
            <div className="space-y-2">
              {filteredInternalFX.map((fx, idx) => (
                <div 
                  key={fx.id} 
                  draggable={true} 
                  onDragStart={(e) => handleDragStartInternal(e, fx.id)}
                  onClick={() => handleAddPlugin(fx.id)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full p-4 bg-white/[0.02] border rounded-2xl flex items-center space-x-4 transition-all group cursor-grab active:cursor-grabbing ${idx === selectedIndex ? 'bg-white/[0.06] border-cyan-500/50 shadow-lg shadow-cyan-500/5' : 'border-white/5 hover:bg-white/[0.04]'}`}
                >
                  <div 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-transform group-hover:rotate-6 ${idx === selectedIndex ? 'scale-110' : ''}`} 
                    style={{ backgroundColor: `${fx.color}15`, color: fx.color, borderColor: `${fx.color}30` }}
                  >
                    <i className={`fas ${fx.icon} text-xs`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black text-white uppercase tracking-tight truncate">{fx.name}</div>
                    <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-0.5 truncate">{fx.desc}</div>
                  </div>
                  {idx === selectedIndex && (
                    <div className="animate-pulse">
                      <i className="fas fa-plus text-cyan-500 text-[10px]"></i>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === TAB: NOVA BRIDGE (VST3) === */}
        {activeTab === 'nova' && (
          <div className="space-y-3 pb-20 p-4 h-full overflow-y-auto custom-scroll">
            <div className="sticky top-0 z-10 bg-[#08090b] pb-4 space-y-2">
              <div className="flex justify-between items-center px-2">
                 <div className="flex items-center space-x-2">
                     <span className={`text-[8px] font-black uppercase tracking-widest ${novaStatus.isConnected ? 'text-green-500' : 'text-red-500'}`}>
                        {novaStatus.isConnected ? 'LINK ACTIVE' : 'DISCONNECTED'}
                     </span>
                     <span className="text-[8px] font-mono text-slate-500">
                        {novaStatus.pluginCount} FOUND
                     </span>
                 </div>
                 {/* MANUAL REFRESH BUTTON */}
                 <button 
                    onClick={() => novaBridge.requestPlugins()} 
                    className="text-[10px] text-slate-400 hover:text-white transition-colors p-1 bg-white/5 rounded hover:bg-white/10"
                    title="Rafraîchir la liste"
                 >
                    <i className="fas fa-sync-alt mr-1"></i> Refresh
                 </button>
              </div>
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600"></i>
                <input 
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher VST3..."
                  className="w-full h-11 bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 text-[11px] font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-green-500/30 transition-all uppercase tracking-widest"
                />
              </div>
            </div>

            {!novaStatus.isConnected && (
                <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-2xl flex flex-col items-center text-center space-y-3">
                    <i className="fas fa-plug text-red-500 text-xl animate-pulse"></i>
                    <p className="text-[10px] text-red-300 font-bold">Nova Bridge non détecté</p>
                    <p className="text-[8px] text-slate-500">Lancez le serveur Python pour accéder à vos VST3.</p>
                </div>
            )}

            <div className="space-y-1">
              {filteredNovaPlugins.map((p, idx) => (
                <div 
                  key={p.id}
                  draggable={true} 
                  onDragStart={(e) => handleDragStartVST(e, p)} 
                  onClick={() => handleAddPlugin('VST3', p)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full p-3 border rounded-xl flex items-center space-x-3 transition-all cursor-grab active:cursor-grabbing ${idx === selectedIndex ? 'bg-white/[0.06] border-green-500/40' : 'bg-transparent border-transparent hover:bg-white/[0.02]'}`}
                >
                  <div className="w-8 h-8 rounded bg-black/40 border border-white/5 flex items-center justify-center text-[8px] font-black text-slate-500">
                     VST3
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-200 truncate">{p.name}</div>
                    <div className="text-[8px] font-black text-slate-600 uppercase truncate">{p.vendor}</div>
                  </div>
                  {idx === selectedIndex && <i className="fas fa-plus text-[8px] text-green-500"></i>}
                </div>
              ))}
              
              {novaStatus.isConnected && filteredNovaPlugins.length === 0 && (
                  <div className="py-10 text-center opacity-40">
                    <p className="text-[10px] font-black uppercase text-slate-500">Aucun plugin correspondant</p>
                  </div>
              )}
            </div>
          </div>
        )}

        {/* === TAB: LOCAL === */}
        {activeTab === 'local' && (
          <div className="h-full flex flex-col items-center justify-center space-y-8 opacity-40 px-6 text-center">
             <i className="fas fa-file-audio text-4xl text-slate-700"></i>
             <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Importation Locale</p>
                <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="px-10 py-4 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-cyan-400 transition-all shadow-xl active:scale-95"
                >
                  Parcourir
                </button>
             </div>
             <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="audio/*" 
                onChange={(e) => {
                    if(e.target.files?.[0]) {
                        onLocalImport?.(e.target.files[0]);
                        e.target.value = ''; 
                    }
                }} 
             />
          </div>
        )}
      </div>
    </div>
  );
};
export default SideBrowser;
