
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Track, TrackType, DAWState, ProjectPhase, PluginInstance, PluginType, MobileTab, TrackSend, Clip, AIAction, AutomationLane, AIChatMessage, ViewMode, User, Theme, DrumPad } from './types';
import { audioEngine } from './engine/AudioEngine';
import TransportBar from './components/TransportBar';
import SideBrowser from './components/SideBrowser';
import ArrangementView from './components/ArrangementView';
import MixerView from './components/MixerView';
import PluginEditor from './components/PluginEditor';
import ChatAssistant from './components/ChatAssistant';
import ViewModeSwitcher from './components/ViewModeSwitcher';
import ContextMenu from './components/ContextMenu';
import TouchInteractionManager from './components/TouchInteractionManager';
import GlobalClipMenu from './components/GlobalClipMenu'; 
import TrackCreationBar from './components/TrackCreationBar';
import AuthScreen from './components/AuthScreen';
import AutomationEditorView from './components/AutomationEditorView';
import ShareModal from './components/ShareModal';
import SaveProjectModal from './components/SaveProjectModal';
import LoadProjectModal from './components/LoadProjectModal';
import ExportModal from './components/ExportModal'; 
import AudioSettingsPanel from './components/AudioSettingsPanel'; 
import PluginManager from './components/PluginManager'; 
import { supabaseManager } from './services/SupabaseManager';
import { SessionSerializer } from './services/SessionSerializer';
import { getAIProductionAssistance } from './services/AIService';
import { novaBridge } from './services/NovaBridge';
import { ProjectIO } from './services/ProjectIO';
import PianoRoll from './components/PianoRoll';
import { midiManager } from './services/MidiManager';
import { AUDIO_CONFIG, UI_CONFIG, NOTES } from './utils/constants';
import { generateId } from './utils/helpers';

// VIDE : Le menu d'effets est vide.
const AVAILABLE_FX_MENU: { id: string, name: string, icon: string }[] = [];

const createDefaultAutomation = (param: string, color: string): AutomationLane => ({
  id: generateId('auto'),
  parameterName: param, points: [], color: color, isExpanded: false, min: 0, max: 1.5
});

const createDefaultPlugins = (type: PluginType, mix: number = 0.3, bpm: number = 120, paramsOverride: any = {}): PluginInstance => {
  let params: any = { isEnabled: true };
  let name: string = type;

  // Uniquement les instruments supportés
  switch (type) {
    case 'MELODIC_SAMPLER':
        name = 'Melodic Sampler';
        params = { rootKey: 60, fineTune: 0, glide: 0.05, loop: true, loopStart: 0, loopEnd: 1, attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, filterCutoff: 20000, filterRes: 0, velocityToFilter: 0.5, lfoRate: 4, lfoAmount: 0, lfoDest: 'PITCH', saturation: 0, bitCrush: 0, chorus: 0, width: 0.5, isEnabled: true };
        break;
    case 'DRUM_SAMPLER':
        name = 'Drum Sampler';
        params = { gain: 0, transpose: 0, fineTune: 0, sampleStart: 0, sampleEnd: 1, attack: 0.005, hold: 0.05, decay: 0.2, sustain: 0, release: 0.1, cutoff: 20000, resonance: 0, pan: 0, velocitySens: 0.8, reverse: false, normalize: false, chokeGroup: 1, isEnabled: true };
        break;
  }

  params = { ...params, ...paramsOverride };
  return { id: generateId('pl'), name, type, isEnabled: true, params, latency: 0 };
};

const createInitialSends = (bpm: number): Track[] => [
  { id: 'send-A', name: 'SEND A', type: TrackType.SEND, color: '#00f2ff', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.8, pan: 0, outputTrackId: 'master', sends: [], clips: [], plugins: [], automationLanes: [createDefaultAutomation('volume', '#00f2ff')], totalLatency: 0 },
  { id: 'send-B', name: 'SEND B', type: TrackType.SEND, color: '#6366f1', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.8, pan: 0, outputTrackId: 'master', sends: [], clips: [], plugins: [], automationLanes: [createDefaultAutomation('volume', '#6366f1')], totalLatency: 0 },
];

const createBusVox = (defaultSends: TrackSend[], bpm: number): Track => ({
  id: 'bus-vox', name: 'BUS VOX', type: TrackType.BUS, color: '#fbbf24', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 1.0, pan: 0, outputTrackId: 'master', sends: [...defaultSends], clips: [], plugins: [], automationLanes: [createDefaultAutomation('volume', '#fbbf24')], totalLatency: 0
});

const SaveOverlay: React.FC<{ progress: number; message: string }> = ({ progress, message }) => (
  <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
    <div className="w-64 space-y-4 text-center">
      <div className="w-16 h-16 mx-auto rounded-full border-4 border-cyan-500/30 border-t-cyan-500 animate-spin"></div>
      <h3 className="text-xl font-black text-white uppercase tracking-widest">{message}</h3>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
    </div>
  </div>
);

const MobileBottomNav: React.FC<{ activeTab: MobileTab, onTabChange: (tab: MobileTab) => void }> = ({ activeTab, onTabChange }) => (
    <div className="h-16 bg-[#0c0d10] border-t border-white/10 flex items-center justify-around z-50">
        <button onClick={() => onTabChange('PROJECT')} className={`flex flex-col items-center space-y-1 ${activeTab === 'PROJECT' ? 'text-cyan-400' : 'text-slate-500'}`}>
            <i className="fas fa-project-diagram text-lg"></i>
            <span className="text-[9px] font-black uppercase">Arrangement</span>
        </button>
        <button onClick={() => onTabChange('MIXER')} className={`flex flex-col items-center space-y-1 ${activeTab === 'MIXER' ? 'text-cyan-400' : 'text-slate-500'}`}>
            <i className="fas fa-sliders-h text-lg"></i>
            <span className="text-[9px] font-black uppercase">Mixer</span>
        </button>
        <button onClick={() => onTabChange('NOVA')} className={`flex flex-col items-center space-y-1 ${activeTab === 'NOVA' ? 'text-cyan-400' : 'text-slate-500'}`}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 -mt-6 border-4 border-[#0c0d10]">
                <i className="fas fa-robot text-white text-lg"></i>
            </div>
            <span className="text-[9px] font-black uppercase">AI Nova</span>
        </button>
        <button onClick={() => onTabChange('BROWSER')} className={`flex flex-col items-center space-y-1 ${activeTab === 'BROWSER' ? 'text-cyan-400' : 'text-slate-500'}`}>
            <i className="fas fa-folder text-lg"></i>
            <span className="text-[9px] font-black uppercase">Browser</span>
        </button>
        <button onClick={() => onTabChange('AUTOMATION')} className={`flex flex-col items-center space-y-1 ${activeTab === 'AUTOMATION' ? 'text-cyan-400' : 'text-slate-500'}`}>
            <i className="fas fa-wave-square text-lg"></i>
            <span className="text-[9px] font-black uppercase">Auto</span>
        </button>
    </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null); 
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [saveState, setSaveState] = useState<{ isSaving: boolean; progress: number; message: string }>({ isSaving: false, progress: 0, message: '' });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [exportModal, setExportModal] = useState<{ type: 'FRAUD' | 'RECORDING', link: string, message: string } | null>(null);
  const [browserWidth, setBrowserWidth] = useState(320); 
  const [isResizingBrowser, setIsResizingBrowser] = useState(false);
  const [isPluginManagerOpen, setIsPluginManagerOpen] = useState(false); 
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false); 
  const [isLoadMenuOpen, setIsLoadMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [midiEditorOpen, setMidiEditorOpen] = useState<{trackId: string, clipId: string} | null>(null);

  const [aiNotification, setAiNotification] = useState<string | null>(null);
  const [activePlugin, setActivePlugin] = useState<{trackId: string, plugin: PluginInstance} | null>(null);
  const [externalImportNotice, setExternalImportNotice] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('PROJECT');
  
  const [sideTab, setSideTab] = useState<'local' | 'nova' | 'store'>('store');
  const [shouldFocusSearch, setShouldFocusSearch] = useState(false);
  const [addPluginMenu, setAddPluginMenu] = useState<{ trackId: string, x: number, y: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('DESKTOP');
  const isMobile = viewMode === 'MOBILE';

  useEffect(() => {
      const u = supabaseManager.getUser();
      if(u) setUser(u);
  }, []);

  const initialState: DAWState = {
    id: 'proj-1', name: 'STUDIO_SESSION', bpm: AUDIO_CONFIG.DEFAULT_BPM, isPlaying: false, isRecording: false, currentTime: 0,
    isLoopActive: false, loopStart: 0, loopEnd: 0,
    tracks: [
      { id: 'instrumental', name: 'BEAT', type: TrackType.AUDIO, color: '#eab308', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.7, pan: 0, outputTrackId: 'master', sends: createInitialSends(AUDIO_CONFIG.DEFAULT_BPM).map(s => ({ id: s.id, level: 0, isEnabled: true })), clips: [], plugins: [], automationLanes: [createDefaultAutomation('volume', '#eab308')], totalLatency: 0 },
      { id: 'track-rec-main', name: 'REC', type: TrackType.AUDIO, color: '#ff0000', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 1.0, pan: 0, outputTrackId: 'bus-vox', sends: createInitialSends(AUDIO_CONFIG.DEFAULT_BPM).map(s => ({ id: s.id, level: 0, isEnabled: true })), clips: [], plugins: [], automationLanes: [createDefaultAutomation('volume', '#ff0000')], totalLatency: 0 },
      createBusVox(createInitialSends(AUDIO_CONFIG.DEFAULT_BPM).map(s => ({ id: s.id, level: 0, isEnabled: true })), AUDIO_CONFIG.DEFAULT_BPM), 
      ...createInitialSends(AUDIO_CONFIG.DEFAULT_BPM)
    ],
    selectedTrackId: 'track-rec-main', currentView: 'ARRANGEMENT', projectPhase: ProjectPhase.SETUP, isLowLatencyMode: false, isRecModeActive: false, systemMaxLatency: 0, recStartTime: null,
    isDelayCompEnabled: false
  };

  const [state, setState] = useState<DAWState>(initialState);
  const stateRef = useRef(state);
  
  useEffect(() => { stateRef.current = state; }, [state]);
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggleTheme = () => { setTheme(prev => prev === 'dark' ? 'light' : 'dark'); };

  useEffect(() => { novaBridge.connect(); }, []);
  useEffect(() => { if (audioEngine.ctx) state.tracks.forEach(t => audioEngine.updateTrack(t, state.tracks)); }, [state.tracks]); 
  
  useEffect(() => {
    let animId: number;
    const updateLoop = () => {
      if (stateRef.current.isPlaying) {
         const time = audioEngine.getCurrentTime();
         setState(curr => ({ ...curr, currentTime: time }));
         animId = requestAnimationFrame(updateLoop);
      }
    };
    if (state.isPlaying) {
        animId = requestAnimationFrame(updateLoop);
    }
    return () => cancelAnimationFrame(animId);
  }, [state.isPlaying]);

  const handleLogout = async () => { await supabaseManager.signOut(); setUser(null); };
  const handleBuyLicense = (instrumentId: number) => { if (!user) return; const updatedUser = { ...user, owned_instruments: [...(user.owned_instruments || []), instrumentId] }; setUser(updatedUser); setAiNotification(`✅ Licence achetée avec succès ! Export débloqué.`); };
  
  const handleCreateTrack = useCallback((type: TrackType, name?: string, initialPluginType?: PluginType) => {
      setState(prev => {
          let drumPads: DrumPad[] | undefined = undefined;
          if (type === TrackType.DRUM_RACK) {
              drumPads = Array.from({ length: 30 }, (_, i) => ({
                id: i + 1, name: `Pad ${i + 1}`, sampleName: 'Empty', volume: 0.8, pan: 0, isMuted: false, isSolo: false, midiNote: 60 + i
              }));
          }

          const plugins: PluginInstance[] = [];
          if (initialPluginType) {
               plugins.push(createDefaultPlugins(initialPluginType, 1.0, prev.bpm));
          }

          const newTrack: Track = {
              id: generateId('track'),
              name: name || `${type} TRACK`,
              type,
              color: UI_CONFIG.TRACK_COLORS[prev.tracks.length % UI_CONFIG.TRACK_COLORS.length],
              isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false,
              volume: 1.0, pan: 0, outputTrackId: 'master',
              sends: createInitialSends(prev.bpm).map(s => ({ id: s.id, level: 0, isEnabled: true })),
              clips: [], 
              plugins, 
              automationLanes: [], 
              totalLatency: 0,
              drumPads
          };
          return { ...prev, tracks: [...prev.tracks, newTrack] };
      });
  }, []);

  const handleUpdateTrack = useCallback((t: Track) => { setState(prev => ({ ...prev, tracks: prev.tracks.map(trk => trk.id === t.id ? t : trk) })); }, []);
  const handleSeek = useCallback((time: number) => { setState(prev => ({ ...prev, currentTime: time })); audioEngine.seekTo(time, stateRef.current.tracks, stateRef.current.isPlaying); }, []);
  
  const handleTogglePlay = useCallback(async () => { 
      if (!audioEngine.ctx) await audioEngine.init();
      if (audioEngine.ctx?.state === 'suspended') await audioEngine.ctx.resume();
      
      stateRef.current.tracks.forEach(t => audioEngine.updateTrack(t, stateRef.current.tracks));
      
      if (!stateRef.current.isPlaying) { 
          audioEngine.startPlayback(stateRef.current.currentTime, stateRef.current.tracks); 
          setState(s => ({ ...s, isPlaying: true }));
      } else { 
          audioEngine.stopAll(); 
          setState(s => ({ ...s, isPlaying: false }));
      } 
  }, []);
  
  const handleStop = useCallback(async () => {
    audioEngine.stopAll();
    audioEngine.seekTo(0, stateRef.current.tracks, false); 
    setState(s => ({ ...s, isPlaying: false, isRecording: false, currentTime: 0 }));
  }, []);

  const handleAddPluginFromContext = (tid: string, type: PluginType) => {
      setState(prev => {
          const track = prev.tracks.find(t => t.id === tid);
          if (!track) return prev;
          const newPlugin = createDefaultPlugins(type, 0.5, prev.bpm);
          return { ...prev, tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: [...t.plugins, newPlugin] } : t) };
      });
  };

  const handleRemovePlugin = useCallback((tid: string, pid: string) => {
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: t.plugins.filter(p => p.id !== pid) } : t)
      }));
      if (activePlugin?.plugin.id === pid) setActivePlugin(null);
  }, [activePlugin]);
  
  const handleUniversalAudioImport = async (source: string | File, name: string) => {
    try {
      setExternalImportNotice(`Analyse du flux binaire : ${name}...`);
      await audioEngine.init();
      let targetUrl: string; let isObjectUrl = false;
      if (source instanceof File) { targetUrl = URL.createObjectURL(source); isObjectUrl = true; } else { targetUrl = source; }
      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error(`Fichier audio inaccessible (HTTP ${response.status})`);
      const arrayBuffer = await response.arrayBuffer();
      if (isObjectUrl) URL.revokeObjectURL(targetUrl);
      const audioBuffer = await audioEngine.ctx!.decodeAudioData(arrayBuffer);
      const newClip: Clip = { id: generateId('c'), name: name.replace(/_/g, ' ').toUpperCase(), start: 0, duration: audioBuffer.duration, offset: 0, fadeIn: 0.05, fadeOut: 0.05, type: TrackType.AUDIO, color: '#eab308', buffer: audioBuffer };
      setState(prev => {
        const instruTrack = prev.tracks.find(t => t.id === 'instrumental');
        let newTracks: Track[]; let targetId: string;
        if (instruTrack && instruTrack.clips.length === 0) { newTracks = prev.tracks.map(t => t.id === 'instrumental' ? { ...t, clips: [newClip], name: name.toUpperCase() } : t); targetId = 'instrumental'; } 
        else { const color = UI_CONFIG.TRACK_COLORS[prev.tracks.length % UI_CONFIG.TRACK_COLORS.length]; const defaultSends = createInitialSends(prev.bpm).map(s => ({ id: s.id, level: 0, isEnabled: true })); const newTrack: Track = { id: generateId('track'), name: name.toUpperCase(), type: TrackType.AUDIO, color, isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 1.0, pan: 0, outputTrackId: 'master', sends: defaultSends, clips: [newClip], plugins: [], automationLanes: [createDefaultAutomation('volume', color)], totalLatency: 0 }; newTracks = [...prev.tracks, newTrack]; targetId = newTrack.id; }
        return { ...prev, tracks: newTracks, selectedTrackId: targetId, currentView: 'ARRANGEMENT' };
      });
      setActiveMobileTab('PROJECT');
      setExternalImportNotice(null); setAiNotification(`Import terminé : [${name}]`);
    } catch (err: any) { 
        console.error("[IMPORT] Error:", err); 
        setExternalImportNotice(`Erreur Import: ${err.message}`); 
        setTimeout(() => setExternalImportNotice(null), 3000); 
    }
  };

  useEffect(() => { (window as any).DAW_CORE = { handleAudioImport: (url: string, name: string) => handleUniversalAudioImport(url, name) }; }, []);

  const handleEditClip = (trackId: string, clipId: string, action: string, payload?: any) => {
    setState(prev => {
      const track = prev.tracks.find(t => t.id === trackId);
      if (!track) return prev;
      let newClips = [...track.clips];
      const idx = newClips.findIndex(c => c.id === clipId);
      if (idx === -1 && action !== 'PASTE') return prev;
      
      switch(action) {
        case 'MOVE': if(idx > -1) newClips[idx] = { ...newClips[idx], start: payload.start }; break;
        case 'UPDATE_PROPS': if(idx > -1) newClips[idx] = { ...newClips[idx], ...payload }; break;
        case 'DELETE': if(idx > -1) newClips.splice(idx, 1); break;
        case 'MUTE': if(idx > -1) newClips[idx] = { ...newClips[idx], isMuted: !newClips[idx].isMuted }; break;
        case 'DUPLICATE': if(idx > -1) newClips.push({ ...newClips[idx], id: generateId('clip'), start: newClips[idx].start + newClips[idx].duration + 0.1 }); break;
        case 'RENAME': if(idx > -1) newClips[idx] = { ...newClips[idx], name: payload.name }; break;
        case 'SPLIT': 
            if(idx > -1) {
              const clip = newClips[idx];
              const splitTime = payload.time;
              if (splitTime > clip.start && splitTime < clip.start + clip.duration) {
                  const firstDuration = splitTime - clip.start;
                  const secondDuration = clip.duration - firstDuration;
                  newClips[idx] = { ...clip, duration: firstDuration };
                  newClips.push({ ...clip, id: generateId('clip'), start: splitTime, duration: secondDuration, offset: clip.offset + firstDuration });
              }
            }
            break;
      }
      return { ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, clips: newClips } : t) };
    });
  };

  const handleUpdatePluginParams = useCallback((trackId: string, pluginId: string, params: Record<string, any>) => {
    setState(prev => {
      const newTracks = prev.tracks.map(t => (t.id !== trackId) ? t : {
          ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, params: { ...p.params, ...params } } : p)
      });
      return { ...prev, tracks: newTracks };
    });
    const pluginNode = audioEngine.getPluginNodeInstance(trackId, pluginId);
    if (pluginNode && pluginNode.updateParams) { pluginNode.updateParams(params); }
  }, []);

  const handleBrowserResizeStart = (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = browserWidth;
      setIsResizingBrowser(true);
      
      const onMove = (m: MouseEvent) => {
          const delta = m.clientX - startX;
          setBrowserWidth(Math.max(200, Math.min(600, startWidth + delta)));
      };
      
      const onUp = () => {
          setIsResizingBrowser(false);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
      };
      
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
  };

  const handleDeleteTrack = useCallback((trackId: string) => {
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.filter(t => t.id !== trackId),
          selectedTrackId: prev.selectedTrackId === trackId ? null : prev.selectedTrackId
      }));
  }, []);

  const handleMoveClip = useCallback((sourceTrackId: string, destTrackId: string, clipId: string) => {
      setState(prev => {
          const sourceTrack = prev.tracks.find(t => t.id === sourceTrackId);
          const destTrack = prev.tracks.find(t => t.id === destTrackId);
          if (!sourceTrack || !destTrack) return prev;
          
          const clip = sourceTrack.clips.find(c => c.id === clipId);
          if (!clip) return prev;
          
          const newSourceClips = sourceTrack.clips.filter(c => c.id !== clipId);
          const newDestClips = [...destTrack.clips, { ...clip }]; 
          
          const newTracks = prev.tracks.map(t => {
              if (t.id === sourceTrackId) return { ...t, clips: newSourceClips };
              if (t.id === destTrackId) return { ...t, clips: newDestClips };
              return t;
          });
          
          return { ...prev, tracks: newTracks };
      });
  }, []);

  const handleCreatePatternAndOpen = useCallback((trackId: string, time: number) => {
      const newClipId = generateId('clip-midi');
      const newClip: Clip = {
          id: newClipId,
          name: 'Pattern MIDI',
          start: time,
          duration: 4, 
          offset: 0,
          fadeIn: 0,
          fadeOut: 0,
          type: TrackType.MIDI,
          color: '#22c55e',
          notes: []
      };
      
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t)
      }));
      
      setMidiEditorOpen({ trackId, clipId: newClipId });
  }, []);

  const handleAddBus = useCallback(() => {
      handleCreateTrack(TrackType.BUS, "Group Bus");
  }, [handleCreateTrack]);

  if (!user) { return <AuthScreen onAuthenticated={(u) => { setUser(u); setIsAuthOpen(false); }} />; }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden relative transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <div className="relative z-50">
        <TransportBar 
          isPlaying={state.isPlaying} currentTime={state.currentTime} bpm={state.bpm} 
          onBpmChange={(bpm) => setState(s => ({...s, bpm}))} isRecording={state.isRecording} isLoopActive={state.isLoopActive}
          onToggleLoop={() => setState(prev => ({ ...prev, isLoopActive: !prev.isLoopActive }))} 
          onStop={handleStop} onTogglePlay={handleTogglePlay} onToggleRecord={() => {}} 
          currentView={state.currentView} onChangeView={v => setState(s => ({ ...s, currentView: v }))} 
          currentTheme={theme} onToggleTheme={toggleTheme}
          user={user} onOpenAuth={() => setIsAuthOpen(true)} onLogout={handleLogout}
        >
          <div className="ml-4 border-l border-white/5 pl-4"><ViewModeSwitcher currentMode={viewMode} onChange={setViewMode} /></div>
        </TransportBar>
      </div>
      
      <TrackCreationBar onCreateTrack={handleCreateTrack} />
      <TouchInteractionManager />
      <GlobalClipMenu />

      <div className="flex-1 flex overflow-hidden relative">
        {(!isMobile || activeMobileTab === 'BROWSER') && browserWidth > 0 && (
          <aside className={`${isMobile ? 'w-full absolute inset-0 z-40' : ''} transition-none z-20 flex bg-[#08090b]`} style={{ width: isMobile ? '100%' : `${browserWidth}px` }}>
            <div className="flex-1 overflow-hidden relative border-r border-white/5 h-full">
                <SideBrowser 
                    activeTabOverride={sideTab} 
                    onTabChange={setSideTab} 
                    shouldFocusSearch={shouldFocusSearch} 
                    onSearchFocused={() => setShouldFocusSearch(false)} 
                    onAddPlugin={(type, meta) => { 
                        if (state.selectedTrackId) {
                            handleAddPluginFromContext(state.selectedTrackId, type as PluginType);
                        }
                    }} 
                    onLocalImport={(f) => handleUniversalAudioImport(f, f.name.split('.')[0])} 
                    user={user} 
                    onBuyLicense={handleBuyLicense} 
                />
            </div>
            {!isMobile && (<div className="w-1 cursor-col-resize hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-50 flex items-center justify-center group h-full" onMouseDown={handleBrowserResizeStart}><div className="w-0.5 h-8 bg-white/20 rounded-full group-hover:bg-white/50" /></div>)}
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          {((!isMobile && state.currentView === 'ARRANGEMENT') || (isMobile && activeMobileTab === 'PROJECT')) && (
            <ArrangementView 
               tracks={state.tracks} currentTime={state.currentTime} 
               isLoopActive={state.isLoopActive} loopStart={state.loopStart} loopEnd={state.loopEnd}
               onSetLoop={(start, end) => setState(prev => ({ ...prev, loopStart: start, loopEnd: end, isLoopActive: true }))}
               onSeek={handleSeek} bpm={state.bpm} 
               selectedTrackId={state.selectedTrackId} onSelectTrack={id => setState(p => ({ ...p, selectedTrackId: id }))} 
               onUpdateTrack={handleUpdateTrack} onReorderTracks={() => {}} 
               onDropPluginOnTrack={(tid, type) => handleAddPluginFromContext(tid, type)}
               onSelectPlugin={(tid, p) => setActivePlugin({trackId:tid, plugin:p})} 
               onRemovePlugin={handleRemovePlugin} 
               onRequestAddPlugin={(tid, x, y) => setAddPluginMenu({ trackId: tid, x, y })} 
               onAddTrack={handleCreateTrack} 
               onDuplicateTrack={(tid) => { /* logic */ }} onDeleteTrack={handleDeleteTrack} 
               isRecording={state.isRecording} recStartTime={state.recStartTime}
               onEditClip={handleEditClip}
               onMoveClip={handleMoveClip}
               onEditMidi={(trackId, clipId) => setMidiEditorOpen({ trackId, clipId })}
               onCreatePattern={handleCreatePatternAndOpen}
               onSwapInstrument={() => setSideTab('nova')}
            /> 
          )}
          
          {((!isMobile && state.currentView === 'MIXER') || (isMobile && activeMobileTab === 'MIXER')) && (
             <MixerView 
                tracks={state.tracks} 
                onUpdateTrack={handleUpdateTrack} 
                onOpenPlugin={(tid, p) => setActivePlugin({trackId:tid, plugin:p})} 
                onDropPluginOnTrack={(tid, type) => handleAddPluginFromContext(tid, type)}
                onRemovePlugin={handleRemovePlugin}
                onAddBus={handleAddBus}
                onToggleBypass={(tid, pid) => handleUpdatePluginParams(tid, pid, { isEnabled: !state.tracks.find(t=>t.id===tid)?.plugins.find(p=>p.id===pid)?.isEnabled })}
                onRequestAddPlugin={(tid, x, y) => setAddPluginMenu({ trackId: tid, x, y })}
             />
          )}
        </main>
      </div>
      
      {isMobile && <MobileBottomNav activeTab={activeMobileTab} onTabChange={setActiveMobileTab} />}
      
      {activePlugin && (
        <div className={`fixed inset-0 flex items-center justify-center z-[200] ${isMobile ? 'bg-[#0c0d10]' : 'bg-black/60 backdrop-blur-sm'}`} onMouseDown={() => !isMobile && setActivePlugin(null)}>
           <div className={`relative ${isMobile ? 'w-full h-full p-4 overflow-y-auto' : ''}`} onMouseDown={e => e.stopPropagation()}>
              <PluginEditor 
                  plugin={activePlugin.plugin} 
                  trackId={activePlugin.trackId} 
                  onClose={() => setActivePlugin(null)} 
                  onUpdateParams={(p) => handleUpdatePluginParams(activePlugin.trackId, activePlugin.plugin.id, p)} 
                  isMobile={isMobile} 
                  track={state.tracks.find(t => t.id === activePlugin.trackId)} 
                  onUpdateTrack={handleUpdateTrack} 
              />
           </div>
        </div>
      )}
      
      {addPluginMenu && <ContextMenu x={addPluginMenu.x} y={addPluginMenu.y} onClose={() => setAddPluginMenu(null)} items={AVAILABLE_FX_MENU.map(fx => ({ label: fx.name, icon: fx.icon, onClick: () => handleAddPluginFromContext(addPluginMenu.trackId, fx.id as PluginType) }))} />}

      {midiEditorOpen && state.tracks.find(t => t.id === midiEditorOpen.trackId) && (
          <div className="fixed inset-0 z-[250] bg-[#0c0d10] flex flex-col animate-in slide-in-from-bottom-10 duration-200">
             <PianoRoll 
                 track={state.tracks.find(t => t.id === midiEditorOpen.trackId)!} 
                 clipId={midiEditorOpen.clipId} 
                 bpm={state.bpm} 
                 currentTime={state.currentTime}
                 onUpdateTrack={handleUpdateTrack}
                 onClose={() => setMidiEditorOpen(null)}
             />
          </div>
      )}

      {isAudioSettingsOpen && <AudioSettingsPanel onClose={() => setIsAudioSettingsOpen(false)} />}
      
      <div className={isMobile && activeMobileTab !== 'NOVA' ? 'hidden' : ''}>
        <ChatAssistant onSendMessage={(msg) => getAIProductionAssistance(stateRef.current, msg)} onExecuteAction={() => {}} externalNotification={aiNotification} isMobile={isMobile} forceOpen={isMobile && activeMobileTab === 'NOVA'} onClose={() => setActiveMobileTab('PROJECT')} />
      </div>
      
      {isShareModalOpen && user && <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} onShare={() => {}} projectName={state.name} />}
    </div>
  );
}
