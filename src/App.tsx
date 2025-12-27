
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
import { NOTES } from './plugins/AutoTunePlugin';
import PianoRoll from './components/PianoRoll';
import { midiManager } from './services/MidiManager';
import { AUDIO_CONFIG, UI_CONFIG } from './utils/constants';
import { generateId } from './utils/helpers';

const AVAILABLE_FX_MENU = [
    { id: 'MASTERSYNC', name: 'Master Sync', icon: 'fa-sync-alt' },
    { id: 'VOCALSATURATOR', name: 'Vocal Saturator', icon: 'fa-fire' },
    { id: 'PROEQ12', name: 'Pro-EQ 12', icon: 'fa-wave-square' },
    { id: 'AUTOTUNE', name: 'Auto-Tune Pro', icon: 'fa-microphone-alt' },
    { id: 'DENOISER', name: 'Denoiser', icon: 'fa-broom' },
    { id: 'COMPRESSOR', name: 'Leveler', icon: 'fa-compress-alt' },
    { id: 'REVERB', name: 'Spatial Verb', icon: 'fa-mountain-sun' },
    { id: 'DELAY', name: 'Sync Delay', icon: 'fa-history' },
    { id: 'CHORUS', name: 'Vocal Chorus', icon: 'fa-layer-group' },
    { id: 'FLANGER', name: 'Studio Flanger', icon: 'fa-wind' },
    { id: 'DOUBLER', name: 'Vocal Doubler', icon: 'fa-people-arrows' },
    { id: 'STEREOSPREADER', name: 'Phase Guard', icon: 'fa-arrows-alt-h' },
    { id: 'DEESSER', name: 'S-Killer', icon: 'fa-scissors' }
];

const createDefaultAutomation = (param: string, color: string): AutomationLane => ({
  id: generateId('auto'),
  parameterName: param, points: [], color: color, isExpanded: false, min: 0, max: 1.5
});

const createDefaultPlugins = (type: PluginType, mix: number = 0.3, bpm: number = AUDIO_CONFIG.DEFAULT_BPM, paramsOverride: any = {}): PluginInstance => {
  let params: any = { isEnabled: true };
  let name: string = type;

  if (type === 'DELAY') params = { division: '1/4', feedback: 0.4, damping: 5000, mix, pingPong: false, bpm, isEnabled: true };
  if (type === 'REVERB') params = { decay: 2.5, preDelay: 0.02, damping: 12000, mix, size: 0.7, mode: 'HALL', isEnabled: true };
  if (type === 'COMPRESSOR') params = { threshold: -18, ratio: 4, knee: 12, attack: 0.003, release: 0.25, makeupGain: 1.0, isEnabled: true };
  if (type === 'AUTOTUNE') params = { speed: 0.1, humanize: 0.2, mix: 1.0, rootKey: 0, scale: 'CHROMATIC', isEnabled: true };
  if (type === 'CHORUS') params = { rate: 1.2, depth: 0.35, spread: 0.5, mix: 0.4, isEnabled: true };
  if (type === 'FLANGER') params = { rate: 0.5, depth: 0.5, feedback: 0.7, manual: 0.3, mix: 0.5, invertPhase: false, isEnabled: true };
  if (type === 'DOUBLER') params = { detune: 0.4, width: 0.8, gainL: 0.7, gainR: 0.7, directOn: true, isEnabled: true };
  if (type === 'STEREOSPREADER') params = { width: 1.0, haasDelay: 0.015, lowBypass: 0.8, isEnabled: true };
  if (type === 'DEESSER') params = { threshold: -25, frequency: 6500, q: 1.0, reduction: 0.6, mode: 'BELL', isEnabled: true };
  if (type === 'DENOISER') params = { threshold: -45, reduction: 0.8, release: 0.15, isEnabled: true };
  if (type === 'VOCALSATURATOR') params = { drive: 20, mix: 0.5, tone: 0.0, eqLow: 0, eqMid: 0, eqHigh: 0, mode: 'TAPE', isEnabled: true };
  if (type === 'MASTERSYNC') params = { detectedBpm: 120, detectedKey: 0, isMinor: false, isAnalyzing: false, analysisProgress: 0, isEnabled: true, hasResult: false };
  if (type === 'PROEQ12') {
     const defaultFreqs = [80, 150, 300, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 18000];
     const defaultBands = Array.from({ length: 12 }, (_, i) => ({
      id: i, type: (i === 0 ? 'highpass' : i === 11 ? 'lowpass' : 'peaking') as any, 
      frequency: defaultFreqs[i], gain: 0, q: 1.0, isEnabled: true, isSolo: false
     }));
     params = { isEnabled: true, masterGain: 1.0, bands: defaultBands };
  }
  
  if (type === 'MELODIC_SAMPLER') {
      name = 'Melodic Sampler';
      params = { rootKey: 60, fineTune: 0, glide: 0.05, loop: true, loopStart: 0, loopEnd: 1, attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, filterCutoff: 20000, filterRes: 0, velocityToFilter: 0.5, lfoRate: 4, lfoAmount: 0, lfoDest: 'PITCH', saturation: 0, bitCrush: 0, chorus: 0, width: 0.5, isEnabled: true };
  }
  if (type === 'DRUM_SAMPLER') {
      name = 'Drum Sampler';
      params = { gain: 0, transpose: 0, fineTune: 0, sampleStart: 0, sampleEnd: 1, attack: 0.005, hold: 0.05, decay: 0.2, sustain: 0, release: 0.1, cutoff: 20000, resonance: 0, pan: 0, velocitySens: 0.8, reverse: false, normalize: false, chokeGroup: 1, isEnabled: true };
  }

  params = { ...params, ...paramsOverride };
  return { id: generateId('pl'), name, type, isEnabled: true, params, latency: 0 };
};

const createInitialSends = (bpm: number): Track[] => [
  { id: 'send-delay', name: 'SEND 1/4', type: TrackType.SEND, color: '#00f2ff', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.8, pan: 0, outputTrackId: 'master', sends: [], clips: [], plugins: [createDefaultPlugins('DELAY', 1.0, bpm)], automationLanes: [createDefaultAutomation('volume', '#00f2ff')], totalLatency: 0 },
  { id: 'send-verb-short', name: 'VERB PRO', type: TrackType.SEND, color: '#6366f1', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.8, pan: 0, outputTrackId: 'master', sends: [], clips: [], plugins: [createDefaultPlugins('REVERB', 1.0, bpm)], automationLanes: [createDefaultAutomation('volume', '#6366f1')], totalLatency: 0 },
  { id: 'send-verb-long', name: 'HALL SPACE', type: TrackType.SEND, color: '#a855f7', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 0.8, pan: 0, outputTrackId: 'master', sends: [], clips: [], plugins: [createDefaultPlugins('REVERB', 1.0, bpm)], automationLanes: [createDefaultAutomation('volume', '#a855f7')], totalLatency: 0 }
];

const createBusVox = (defaultSends: TrackSend[], bpm: number): Track => ({
  id: 'bus-vox', name: 'BUS VOX', type: TrackType.BUS, color: '#fbbf24', isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 1.0, pan: 0, outputTrackId: 'master', sends: [...defaultSends], clips: [], plugins: [ { ...createDefaultPlugins('COMPRESSOR', 0.3, bpm), name: 'GLUE COMP' } ], automationLanes: [createDefaultAutomation('volume', '#fbbf24')], totalLatency: 0
});

const SaveOverlay: React.FC<{ progress: number; message: string }> = ({ progress, message }) => (
  <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
    <div className="w-64 space-y-4 text-center">
      <div className="w-16 h-16 mx-auto rounded-full border-4 border-cyan-500/30 border-t-cyan-500 animate-spin"></div>
      <h3 className="text-xl font-black text-white uppercase tracking-widest">{message}</h3>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-xs font-mono text-cyan-400">{progress}%</span>
    </div>
  </div>
);

// Composant de Navigation Mobile
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

const useUndoRedo = (initialState: DAWState) => {
  const [history, setHistory] = useState<{ past: DAWState[]; present: DAWState; future: DAWState[]; }>({ past: [], present: initialState, future: [] });
  const MAX_HISTORY = 100;
  const setState = useCallback((updater: DAWState | ((prev: DAWState) => DAWState)) => {
    setHistory(curr => {
      const newState = typeof updater === 'function' ? updater(curr.present) : updater;
      if (newState === curr.present) return curr;
      const isTimeUpdateOnly = newState.currentTime !== curr.present.currentTime && newState.tracks === curr.present.tracks && newState.isPlaying === curr.present.isPlaying;
      if (isTimeUpdateOnly) return { ...curr, present: newState };
      return { past: [...curr.past, curr.present].slice(-MAX_HISTORY), present: newState, future: [] };
    });
  }, []);
  const setVisualState = useCallback((updater: Partial<DAWState>) => { setHistory(curr => ({ ...curr, present: { ...curr.present, ...updater } })); }, []);
  const undo = useCallback(() => { setHistory(curr => { if (curr.past.length === 0) return curr; return { past: curr.past.slice(0, -1), present: curr.past[curr.past.length - 1], future: [curr.present, ...curr.future] }; }); }, []);
  const redo = useCallback(() => { setHistory(curr => { if (curr.future.length === 0) return curr; return { past: [...curr.past, curr.present], present: curr.future[0], future: curr.future.slice(1) }; }); }, []);
  return { state: history.present, setState, setVisualState, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
};

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
      { 
        id: 'midi-track-1', 
        name: 'MIDI Track 1', 
        type: TrackType.MIDI, 
        color: '#d946ef', 
        isMuted: false, 
        isSolo: false, 
        isTrackArmed: false, 
        isFrozen: false, 
        volume: 0.8, 
        pan: 0, 
        outputTrackId: 'master', 
        sends: createInitialSends(AUDIO_CONFIG.DEFAULT_BPM).map(s => ({ id: s.id, level: 0, isEnabled: true })), 
        clips: [
          {
             id: 'clip-midi-1',
             name: 'Piano Pattern',
             start: 0,
             duration: 4,
             offset: 0,
             fadeIn: 0,
             fadeOut: 0,
             type: TrackType.MIDI,
             color: '#d946ef',
             notes: [
                 { id: 'n1', pitch: 60, start: 0, duration: 0.25, velocity: 0.9, isSelected: true },
                 { id: 'n2', pitch: 64, start: 0.25, duration: 0.25, velocity: 0.8, isSelected: true },
                 { id: 'n3', pitch: 67, start: 0.5, duration: 0.25, velocity: 0.9, isSelected: true },
                 { id: 'n4', pitch: 71, start: 0.75, duration: 0.25, velocity: 0.8, isSelected: true },
                 { id: 'n5', pitch: 72, start: 1.0, duration: 0.25, velocity: 1.0, isSelected: true },
                 { id: 'n6', pitch: 67, start: 1.25, duration: 0.25, velocity: 0.7, isSelected: true },
                 { id: 'n7', pitch: 64, start: 1.5, duration: 0.25, velocity: 0.8, isSelected: true },
                 { id: 'n8', pitch: 60, start: 1.75, duration: 0.25, velocity: 0.6, isSelected: true }
             ]
          }
        ], 
        plugins: [createDefaultPlugins('REVERB', 0.2, AUDIO_CONFIG.DEFAULT_BPM)], 
        automationLanes: [], 
        totalLatency: 0 
      },
      createBusVox(createInitialSends(AUDIO_CONFIG.DEFAULT_BPM).map(s => ({ id: s.id, level: 0, isEnabled: true })), AUDIO_CONFIG.DEFAULT_BPM), 
      ...createInitialSends(AUDIO_CONFIG.DEFAULT_BPM)
    ],
    selectedTrackId: 'midi-track-1', currentView: 'ARRANGEMENT', projectPhase: ProjectPhase.SETUP, isLowLatencyMode: false, isRecModeActive: false, systemMaxLatency: 0, recStartTime: null,
    isDelayCompEnabled: false
  };

  const { state, setState, setVisualState, undo, redo, canUndo, canRedo } = useUndoRedo(initialState);
  
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggleTheme = () => { setTheme(prev => prev === 'dark' ? 'light' : 'dark'); };

  useEffect(() => { novaBridge.connect(); }, []);
  const stateRef = useRef(state); 
  useEffect(() => { stateRef.current = state; }, [state]);
  
  // Sync Engine with State
  useEffect(() => { 
      if (audioEngine.ctx) {
          state.tracks.forEach(t => audioEngine.updateTrack(t, state.tracks));
      }
  }, [state.tracks]); 
  
  // ANIMATION LOOP FOR PLAYHEAD
  useEffect(() => {
    let animId: number;
    
    const updateLoop = () => {
      if (stateRef.current.isPlaying) {
         const time = audioEngine.getCurrentTime();
         setVisualState({ currentTime: time });
         animId = requestAnimationFrame(updateLoop);
      }
    };

    if (state.isPlaying) {
        animId = requestAnimationFrame(updateLoop);
    }
    
    return () => cancelAnimationFrame(animId);
  }, [state.isPlaying, setVisualState]);

  const [activePlugin, setActivePlugin] = useState<{trackId: string, plugin: PluginInstance} | null>(null);
  const [sideTab, setSideTab] = useState<'local' | 'nova' | 'store'>('store');
  const [shouldFocusSearch, setShouldFocusSearch] = useState(false);
  const [externalImportNotice, setExternalImportNotice] = useState<string | null>(null);
  const [isExternalDragging, setIsExternalDragging] = useState(false);
  const [aiNotification, setAiNotification] = useState<string | null>(null);
  const [addPluginMenu, setAddPluginMenu] = useState<{ trackId: string, x: number, y: number } | null>(null);
  const [automationMenu, setAutomationMenu] = useState<{ x: number, y: number, trackId: string, paramId: string, paramName: string, min: number, max: number } | null>(null);
  const [noArmedTrackError, setNoArmedTrackError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('nova_view_mode');
    if (saved) return saved as ViewMode;
    return window.innerWidth < 768 ? 'MOBILE' : (window.innerWidth < 1024 ? 'TABLET' : 'DESKTOP');
  });
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('PROJECT');
  const handleViewModeChange = (mode: ViewMode) => { setViewMode(mode); localStorage.setItem('nova_view_mode', mode); };
  useEffect(() => { document.body.setAttribute('data-view-mode', viewMode); }, [viewMode]);
  const isMobile = viewMode === 'MOBILE';
  const ensureAudioEngine = async () => { if (!audioEngine.ctx) await audioEngine.init(); if (audioEngine.ctx?.state === 'suspended') await audioEngine.ctx.resume(); };

  const handleLogout = async () => { await supabaseManager.signOut(); setUser(null); };
  const handleBuyLicense = (instrumentId: number) => { if (!user) return; const updatedUser = { ...user, owned_instruments: [...(user.owned_instruments || []), instrumentId] }; setUser(updatedUser); setAiNotification(`✅ Licence achetée avec succès ! Export débloqué.`); };
  
  const handleSaveCloud = async (projectName: string) => {
    if (!user) { setIsAuthOpen(true); return; }
    try {
        setState(prev => ({ ...prev, name: projectName }));
        setSaveState({ isSaving: true, progress: 20, message: "Synchronisation..." });
        const stateToSave = { ...stateRef.current, name: projectName };
        const savedProject = await supabaseManager.saveUserSession(stateToSave);
        if (savedProject && savedProject.id) {
            setState(prev => ({ ...prev, id: savedProject.id, name: savedProject.name }));
        }
        setSaveState({ isSaving: true, progress: 100, message: "Sauvegarde réussie !" });
        setTimeout(() => setSaveState({ isSaving: false, progress: 0, message: '' }), 1500);
        setAiNotification("✅ Sauvegarde Cloud terminée.");
    } catch (e: any) {
        setSaveState({ isSaving: false, progress: 0, message: '' });
        setAiNotification(`❌ Erreur Cloud: ${e.message}`);
    }
  };

  const handleSaveAsCopy = async (n: string) => { 
      try {
          const savedProject = await supabaseManager.saveProjectAsCopy(stateRef.current, n);
          if (savedProject && savedProject.id) {
              setState(prev => ({ ...prev, id: savedProject.id, name: savedProject.name }));
          }
          setAiNotification("✅ Copie sauvegardée !");
      } catch(e: any) {
          setAiNotification(`❌ Erreur Copie: ${e.message}`);
      }
  };
  
  const handleSaveLocal = async (n: string) => { SessionSerializer.downloadLocalJSON(stateRef.current, n); };
  
  const handleLoadCloud = async (id: string) => { 
      try {
          const loaded = await supabaseManager.loadUserSession(id);
          if (loaded) setState(loaded);
      } catch(e) {
          console.error(e);
      }
  };
  
  const handleLoadLocalFile = async (f: File) => {
      try {
          if (f.name.endsWith('.zip')) {
              const loaded = await ProjectIO.loadProject(f);
              setState(loaded);
          } else {
              const text = await f.text();
              const loaded = JSON.parse(text);
              setState(loaded);
          }
      } catch(e) {
          console.error(e);
      }
  };
  
  const handleShareProject = async (e: string) => { setIsShareModalOpen(false); };
  const handleExportMix = async () => { setIsExportMenuOpen(true); };

  const handleEditClip = (trackId: string, clipId: string, action: string, payload?: any) => {
    setState(prev => {
      const track = prev.tracks.find(t => t.id === trackId);
      if (!track) return prev;
      let newClips = [...track.clips];
      const idx = newClips.findIndex(c => c.id === clipId);
      if (idx === -1 && action !== 'PASTE') return prev; // Allow paste on track without clip
      
      switch(action) {
        case 'MOVE': if(idx > -1) newClips[idx] = { ...newClips[idx], start: payload.start }; break;
        case 'UPDATE_PROPS': if(idx > -1) newClips[idx] = { ...newClips[idx], ...payload }; break;
        case 'DELETE': if(idx > -1) newClips.splice(idx, 1); break;
        case 'MUTE': if(idx > -1) newClips[idx] = { ...newClips[idx], isMuted: !newClips[idx].isMuted }; break;
        case 'DUPLICATE': if(idx > -1) newClips.push({ ...newClips[idx], id: generateId('c'), start: newClips[idx].start + newClips[idx].duration + 0.1 }); break;
        case 'RENAME': if(idx > -1) newClips[idx] = { ...newClips[idx], name: payload.name }; break;
        case 'SPLIT': 
            if(idx > -1) {
              const clip = newClips[idx];
              const splitTime = payload.time;
              if (splitTime > clip.start && splitTime < clip.start + clip.duration) {
                  const firstDuration = splitTime - clip.start;
                  const secondDuration = clip.duration - firstDuration;
                  newClips[idx] = { ...clip, duration: firstDuration };
                  newClips.push({ ...clip, id: generateId('c'), start: splitTime, duration: secondDuration, offset: clip.offset + firstDuration });
              }
            }
            break;
      }
      return { ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, clips: newClips } : t) };
    });
  };

  const handleUpdateBpm = useCallback((newBpm: number) => { setState(prev => ({ ...prev, bpm: Math.max(20, Math.min(999, newBpm)) })); }, [setState]);
  const handleUpdateTrack = useCallback((t: Track) => { setState(prev => ({ ...prev, tracks: prev.tracks.map(trk => trk.id === t.id ? t : trk) })); }, [setState]);
  
  const handleUpdatePluginParams = useCallback((trackId: string, pluginId: string, params: Record<string, any>) => {
    setState(prev => {
      const newTracks = prev.tracks.map(t => (t.id !== trackId) ? t : {
          ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, params: { ...p.params, ...params } } : p)
      });
      return { ...prev, tracks: newTracks };
    });
    const pluginNode = audioEngine.getPluginNodeInstance(trackId, pluginId);
    if (pluginNode && pluginNode.updateParams) { pluginNode.updateParams(params); }
  }, [setState]);

  const handleSeek = useCallback((time: number) => { setVisualState({ currentTime: time }); audioEngine.seekTo(time, stateRef.current.tracks, stateRef.current.isPlaying); }, [setVisualState]);
  
  const handleTogglePlay = useCallback(async () => { 
      await ensureAudioEngine();
      stateRef.current.tracks.forEach(t => audioEngine.updateTrack(t, stateRef.current.tracks));
      if (!stateRef.current.isPlaying) { 
          audioEngine.startPlayback(stateRef.current.currentTime, stateRef.current.tracks); 
          setVisualState({ isPlaying: true }); 
      } else { 
          audioEngine.stopAll(); 
          setVisualState({ isPlaying: false }); 
      } 
  }, [setVisualState]);
  
  const handleStop = useCallback(async () => {
    audioEngine.stopAll();
    audioEngine.seekTo(0, stateRef.current.tracks, false); 
    setVisualState({ isPlaying: false, isRecording: false, currentTime: 0 });
  }, [setVisualState]);

  const handleToggleRecord = useCallback(async () => {
    await ensureAudioEngine();
    
    if (!stateRef.current.isRecording) {
      // === DÉMARRER L'ENREGISTREMENT ===
      
      // 1. Trouver la piste armée
      const armedTrack = stateRef.current.tracks.find(t => t.isTrackArmed);
      
      if (!armedTrack) {
        setNoArmedTrackError(true);
        setTimeout(() => setNoArmedTrackError(false), 2000);
        return;
      }

      // 2. Démarrer la lecture (si pas en cours) pour avoir le contexte musical
      if (!stateRef.current.isPlaying) {
        audioEngine.startPlayback(stateRef.current.currentTime, stateRef.current.tracks);
        setVisualState({ isPlaying: true });
      }

      // 3. Lancer l'enregistrement au niveau moteur
      // Le moteur connectera le flux micro propre vers le recorder
      const success = await audioEngine.startRecording(
        stateRef.current.currentTime,
        armedTrack.id
      );
      
      if (success) {
        setVisualState({ isRecording: true, recStartTime: stateRef.current.currentTime });
        console.log(`🔴 Recording started on track: ${armedTrack.name}`);
      } else {
        console.error('❌ Failed to start recording');
      }
      
    } else {
      // === ARRÊTER L'ENREGISTREMENT ===
      const result = await audioEngine.stopRecording();
      
      if (result) {
        // Ajouter le clip nouvellement créé à la piste
        setState(prev => {
          const tracks = prev.tracks.map(t => {
            if (t.id === result.trackId) {
              return {
                ...t,
                clips: [...t.clips, result.clip]
              };
            }
            return t;
          });
          return { ...prev, tracks };
        });
        console.log(`⏹️ Recording stopped - Clip added`);
      }
      
      setVisualState({ isRecording: false, recStartTime: null });
    }
  }, [setVisualState, setState]);

  const handleDuplicateTrack = useCallback((trackId: string) => {
      setState(prev => {
          const track = prev.tracks.find(t => t.id === trackId);
          if (!track) return prev;
          const newTrack = { 
              ...track, 
              id: `track-${Date.now()}`, 
              name: `${track.name} (Copy)`,
              clips: track.clips.map(c => ({ ...c, id: generateId('c') })) 
          };
          return { ...prev, tracks: [...prev.tracks, newTrack] };
      });
  }, [setState]);

  const handleCreateTrack = useCallback((type: TrackType, name?: string, initialPluginType?: PluginType) => {
      setState(prev => {
          let drumPads: DrumPad[] | undefined = undefined;
          
          if (type === TrackType.DRUM_RACK) {
              drumPads = Array.from({ length: 30 }, (_, i) => ({
                id: i + 1,
                name: `Pad ${i + 1}`,
                sampleName: 'Empty',
                volume: 0.8,
                pan: 0,
                isMuted: false,
                isSolo: false,
                midiNote: 60 + i
              }));
          }

          const plugins: PluginInstance[] = [];
          if (initialPluginType) {
               plugins.push(createDefaultPlugins(initialPluginType, 1.0, prev.bpm));
          }

          const newTrack: Track = {
              id: `track-${Date.now()}`,
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
  }, [setState]);

  const handleDeleteTrack = useCallback((trackId: string) => {
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.filter(t => t.id !== trackId),
          selectedTrackId: prev.selectedTrackId === trackId ? null : prev.selectedTrackId
      }));
  }, [setState]);

  const handleRemovePlugin = useCallback((tid: string, pid: string) => {
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: t.plugins.filter(p => p.id !== pid) } : t)
      }));
      if (activePlugin?.plugin.id === pid) setActivePlugin(null);
  }, [setState, activePlugin]);

  const handleAddPluginFromContext = (tid: string, type: PluginType, meta?: any) => {
      setState(prev => {
          const track = prev.tracks.find(t => t.id === tid);
          if (!track) return prev;
          const newPlugin = createDefaultPlugins(type, 0.5, prev.bpm, meta);
          return { ...prev, tracks: prev.tracks.map(t => t.id === tid ? { ...t, plugins: [...t.plugins, newPlugin] } : t) };
      });
  };

  const handleDropPlugin = useCallback((tid: string, type: PluginType, meta?: any) => {
      handleAddPluginFromContext(tid, type, meta);
  }, [setState]);
  
  const handleUniversalAudioImport = async (source: string | File, name: string) => {
    try {
      setExternalImportNotice(`Analyse du flux binaire : ${name}...`);
      await audioEngine.init();
      let targetUrl: string; let isObjectUrl = false;
      if (source instanceof File) { targetUrl = URL.createObjectURL(source); isObjectUrl = true; } else { targetUrl = source; }
      
      const response = await fetch(targetUrl);
      if (!response.ok) {
          throw new Error(`Fichier audio inaccessible (HTTP ${response.status})`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      if (isObjectUrl) URL.revokeObjectURL(targetUrl);
      const audioBuffer = await audioEngine.ctx!.decodeAudioData(arrayBuffer);
      const newClip: Clip = { id: generateId('c'), name: name.replace(/_/g, ' ').toUpperCase(), start: 0, duration: audioBuffer.duration, offset: 0, fadeIn: 0.05, fadeOut: 0.05, type: TrackType.AUDIO, color: '#eab308', buffer: audioBuffer };
      setState(prev => {
        const instruTrack = prev.tracks.find(t => t.id === 'instrumental');
        let newTracks: Track[]; let targetId: string;
        if (instruTrack && instruTrack.clips.length === 0) { newTracks = prev.tracks.map(t => t.id === 'instrumental' ? { ...t, clips: [newClip], name: name.toUpperCase() } : t); targetId = 'instrumental'; } 
        else { const color = UI_CONFIG.TRACK_COLORS[prev.tracks.length % UI_CONFIG.TRACK_COLORS.length]; const defaultSends = createInitialSends(prev.bpm).map(s => ({ id: s.id, level: 0, isEnabled: true })); const newTrack: Track = { id: `track-ext-${Date.now()}`, name: name.toUpperCase(), type: TrackType.AUDIO, color, isMuted: false, isSolo: false, isTrackArmed: false, isFrozen: false, volume: 1.0, pan: 0, outputTrackId: 'master', sends: defaultSends, clips: [newClip], plugins: [], automationLanes: [createDefaultAutomation('volume', color)], totalLatency: 0 }; newTracks = [...prev.tracks, newTrack]; targetId = newTrack.id; }
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
  }, [setState]);

  const handleCreatePatternAndOpen = useCallback((trackId: string, time: number) => {
      const newClipId = generateId('c');
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
  }, [setState]);

  const handleSwapInstrument = useCallback((trackId: string) => {
      setSideTab('local'); // Changed from 'fx' to 'local'
      setShouldFocusSearch(true);
  }, []);

  const handleAddBus = useCallback(() => {
      handleCreateTrack(TrackType.BUS, "Group Bus");
  }, [handleCreateTrack]);

  const handleToggleBypass = useCallback((trackId: string, pluginId: string) => {
      setState(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => t.id === trackId ? {
              ...t,
              plugins: t.plugins.map(p => p.id === pluginId ? { ...p, isEnabled: !p.isEnabled } : p)
          } : t)
      }));
      
      const track = stateRef.current.tracks.find(t => t.id === trackId);
      const plugin = track?.plugins.find(p => p.id === pluginId);
      if (plugin) {
          const node = audioEngine.getPluginNodeInstance(trackId, pluginId);
          if (node && node.updateParams) node.updateParams({ isEnabled: !plugin.isEnabled });
      }
  }, [setState]);

  const handleCreateAutomationLane = useCallback(() => {
      if (!automationMenu) return;
      const { trackId, paramId, min, max } = automationMenu;
      setState(prev => {
          const track = prev.tracks.find(t => t.id === trackId);
          if (!track) return prev;
          
          if (track.automationLanes.some(l => l.parameterName === paramId)) return prev;

          let val = 0;
          if (paramId === 'volume') val = track.volume;
          else if (paramId === 'pan') val = track.pan;

          const newLane: AutomationLane = {
              id: generateId('auto'),
              parameterName: paramId,
              points: [{ id: 'init', time: 0, value: val }],
              color: track.color,
              isExpanded: true,
              min, max
          };
          
          return {
              ...prev,
              tracks: prev.tracks.map(t => t.id === trackId ? { ...t, automationLanes: [...t.automationLanes, newLane] } : t)
          };
      });
      setAutomationMenu(null);
  }, [automationMenu, setState]);

  const handleToggleDelayComp = useCallback(() => {
      const newState = !state.isDelayCompEnabled;
      setState(prev => ({ ...prev, isDelayCompEnabled: newState }));
      audioEngine.setDelayCompensation(newState);
  }, [state.isDelayCompEnabled, setState]);

  const handleLoadDrumSample = useCallback(async (trackId: string, padId: number, file: File) => {
      try {
          const arrayBuffer = await file.arrayBuffer();
          await ensureAudioEngine();
          const audioBuffer = await audioEngine.ctx!.decodeAudioData(arrayBuffer);
          
          audioEngine.loadDrumRackSample(trackId, padId, audioBuffer);
          
          setState(prev => {
              const track = prev.tracks.find(t => t.id === trackId);
              if (!track || !track.drumPads) return prev;
              
              const newPads = track.drumPads.map(p => 
                  p.id === padId ? { ...p, sampleName: file.name, buffer: audioBuffer } : p
              );
              
              return {
                  ...prev,
                  tracks: prev.tracks.map(t => t.id === trackId ? { ...t, drumPads: newPads } : t)
              };
          });
      } catch (e) {
          console.error("Error loading drum sample:", e);
      }
  }, [setState]);

  useEffect(() => {
    (window as any).DAW_CONTROL = {
      play: handleTogglePlay,
      stop: handleStop,
      record: handleToggleRecord, 
      seek: handleSeek,
      setBpm: handleUpdateBpm,
      setLoop: (start: number, end: number, active?: boolean) => setState(prev => ({ ...prev, loopStart: start, loopEnd: end, isLoopActive: active !== undefined ? active : true })),
      scrub: (time: number, velocity: number) => audioEngine.scrub(stateRef.current.tracks, time, velocity),
      stopScrubbing: () => audioEngine.stopScrubbing(),
      setVolume: (tid: string, vol: number) => { const t = stateRef.current.tracks.find(tr => tr.id === tid); if (t) handleUpdateTrack({ ...t, volume: vol }); },
      setPan: (tid: string, pan: number) => { const t = stateRef.current.tracks.find(tr => tr.id === tid); if (t) handleUpdateTrack({ ...t, pan }); },
      muteTrack: (tid: string, mute: boolean) => { const t = stateRef.current.tracks.find(tr => tr.id === tid); if (t) handleUpdateTrack({ ...t, isMuted: mute }); },
      soloTrack: (tid: string, solo: boolean) => { const t = stateRef.current.tracks.find(tr => tr.id === tid); if (t) handleUpdateTrack({ ...t, isSolo: solo }); },
      renameTrack: (tid: string, name: string) => { const t = stateRef.current.tracks.find(tr => tr.id === tid); if (t) handleUpdateTrack({ ...t, name }); },
      duplicateTrack: handleDuplicateTrack, 
      addTrack: handleCreateTrack,
      deleteTrack: handleDeleteTrack, 
      openPlugin: (tid: string, type: PluginType, paramsOverride = {}) => { /* ... */ },
      closePlugin: () => setActivePlugin(null),
      setPluginParam: (tid: string, pid: string, param: string, val: any) => handleUpdatePluginParams(tid, pid, { [param]: val }),
      bypassPlugin: handleToggleBypass,
      setSendLevel: (tid: string, sid: string, lvl: number) => { /* ... */ },
      runMasterSync: () => {}, 
      normalizeClip: (tid: string, cid: string) => handleEditClip(tid, cid, 'NORMALIZE'),
      splitClip: (tid: string, cid: string, time: number) => handleEditClip(tid, cid, 'SPLIT', { time }),
      removeSilence: (tid: string) => {}, 
      syncAutoTuneScale: (rootKey: number, scale: string) => { /* ... */ },
      getInstrumentalBuffer: () => null, 
      getState: () => stateRef.current,
      previewMidiNote: (trackId: string, pitch: number, duration?: number) => audioEngine.previewMidiNote(trackId, pitch, duration),
      editClip: handleEditClip,
      loadDrumSample: handleLoadDrumSample
    };
  }, [handleUpdateBpm, handleUpdateTrack, handleTogglePlay, handleStop, handleToggleRecord, handleSeek, handleDuplicateTrack, handleCreateTrack, handleDeleteTrack, handleToggleBypass, handleLoadDrumSample, handleEditClip]);

  const executeAIAction = (a: AIAction) => { /* ... */ };

  if (!user) { return <AuthScreen onAuthenticated={(u) => { setUser(u); setIsAuthOpen(false); }} />; }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden relative transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', cursor: isResizingBrowser ? 'col-resize' : 'default' }}>
      {saveState && saveState.isSaving && <SaveOverlay progress={saveState.progress} message={saveState.message} />}

      <div className="relative z-50">
        <TransportBar 
          isPlaying={state.isPlaying} currentTime={state.currentTime} bpm={state.bpm} 
          onBpmChange={handleUpdateBpm} isRecording={state.isRecording} isLoopActive={state.isLoopActive}
          onToggleLoop={() => { setState(prev => { let { loopStart, loopEnd, isLoopActive } = prev; const newActive = !isLoopActive; if (newActive && (loopEnd <= loopStart)) { const beatsPerBar = 4; const secondsPerBeat = 60 / prev.bpm; loopStart = 0; loopEnd = beatsPerBar * 4 * secondsPerBeat; } return { ...prev, isLoopActive: newActive, loopStart, loopEnd }; }); }} 
          onStop={handleStop} onTogglePlay={handleTogglePlay} onToggleRecord={handleToggleRecord} 
          currentView={state.currentView} onChangeView={v => setState(s => ({ ...s, currentView: v }))} 
          statusMessage={externalImportNotice} noArmedTrackError={noArmedTrackError}
          currentTheme={theme} onToggleTheme={toggleTheme}
          
          onOpenSaveMenu={() => setIsSaveMenuOpen(true)}
          onOpenLoadMenu={() => setIsLoadMenuOpen(true)}
          
          onExportMix={handleExportMix} onShareProject={() => setIsShareModalOpen(true)}
          onOpenAudioEngine={() => setIsAudioSettingsOpen(true)}
          
          isDelayCompEnabled={state.isDelayCompEnabled}
          onToggleDelayComp={handleToggleDelayComp}

          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
          user={user} onOpenAuth={() => setIsAuthOpen(true)} onLogout={handleLogout}
          showBrowserToggle={!isMobile} isBrowserOpen={browserWidth > 0} onToggleBrowser={() => setBrowserWidth(prev => prev > 0 ? 0 : 320)}
        >
          <div className="ml-4 border-l border-white/5 pl-4"><ViewModeSwitcher currentMode={viewMode} onChange={handleViewModeChange} /></div>
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
                            handleAddPluginFromContext(state.selectedTrackId, type as PluginType, meta);
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
               onDropPluginOnTrack={handleDropPlugin} 
               onSelectPlugin={(tid, p) => { ensureAudioEngine(); setActivePlugin({trackId:tid, plugin:p}); }} 
               onRemovePlugin={handleRemovePlugin} 
               onRequestAddPlugin={(tid, x, y) => setAddPluginMenu({ trackId: tid, x, y })} 
               onAddTrack={handleCreateTrack} onDuplicateTrack={handleDuplicateTrack} onDeleteTrack={handleDeleteTrack} 
               onFreezeTrack={(tid) => {}} onImportFile={(f) => {}}
               onEditClip={handleEditClip} isRecording={state.isRecording} recStartTime={state.recStartTime}
               onMoveClip={handleMoveClip}
               onEditMidi={(trackId, clipId) => setMidiEditorOpen({ trackId, clipId })}
               onCreatePattern={handleCreatePatternAndOpen}
               onSwapInstrument={handleSwapInstrument}
            /> 
          )}
          
          {((!isMobile && state.currentView === 'MIXER') || (isMobile && activeMobileTab === 'MIXER')) && (
             <MixerView 
                tracks={state.tracks} 
                onUpdateTrack={handleUpdateTrack} 
                onOpenPlugin={(tid, p) => setActivePlugin({trackId:tid, plugin:p})} 
                onDropPluginOnTrack={handleDropPlugin}
                onRemovePlugin={handleRemovePlugin}
                onAddBus={handleAddBus}
                onToggleBypass={handleToggleBypass}
                onRequestAddPlugin={(tid, x, y) => setAddPluginMenu({ trackId: tid, x, y })}
             />
          )}

          {((!isMobile && state.currentView === 'AUTOMATION') || (isMobile && activeMobileTab === 'AUTOMATION')) && (
             <AutomationEditorView 
               tracks={state.tracks} currentTime={state.currentTime} bpm={state.bpm} zoomH={40} 
               onUpdateTrack={handleUpdateTrack} onSeek={handleSeek}
             />
          )}
        </main>
      </div>
      
      {isMobile && <MobileBottomNav activeTab={activeMobileTab} onTabChange={setActiveMobileTab} />}

      {/* --- MODALS --- */}
      
      {isSaveMenuOpen && (
          <SaveProjectModal 
              isOpen={isSaveMenuOpen} 
              onClose={() => setIsSaveMenuOpen(false)} 
              currentName={state.name} 
              user={user} 
              onSaveCloud={handleSaveCloud}
              onSaveLocal={handleSaveLocal}
              onSaveAsCopy={handleSaveAsCopy}
              onOpenAuth={() => setIsAuthOpen(true)}
          />
      )}

      {isLoadMenuOpen && (
          <LoadProjectModal 
              isOpen={isLoadMenuOpen}
              onClose={() => setIsLoadMenuOpen(false)}
              user={user}
              onLoadCloud={handleLoadCloud}
              onLoadLocal={handleLoadLocalFile}
              onOpenAuth={() => setIsAuthOpen(true)}
          />
      )}

      {isExportMenuOpen && <ExportModal isOpen={isExportMenuOpen} onClose={() => setIsExportMenuOpen(false)} projectState={state} />}
      {isAuthOpen && <AuthScreen onAuthenticated={(u) => { setUser(u); setIsAuthOpen(false); }} />}
      
      {addPluginMenu && <ContextMenu x={addPluginMenu.x} y={addPluginMenu.y} onClose={() => setAddPluginMenu(null)} items={AVAILABLE_FX_MENU.map(fx => ({ label: fx.name, icon: fx.icon, onClick: () => handleAddPluginFromContext(addPluginMenu.trackId, fx.id as PluginType) }))} />}
      {automationMenu && <ContextMenu x={automationMenu.x} y={automationMenu.y} onClose={() => setAutomationMenu(null)} items={[{ label: `Automate: ${automationMenu.paramName}`, icon: 'fa-wave-square', onClick: handleCreateAutomationLane }]} />}
      
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

      {isPluginManagerOpen && <PluginManager onClose={() => setIsPluginManagerOpen(false)} onPluginsDiscovered={(plugins) => { console.log("Plugins refreshed:", plugins.length); setIsPluginManagerOpen(false); }} />}
      {isAudioSettingsOpen && <AudioSettingsPanel onClose={() => setIsAudioSettingsOpen(false)} />}
      
      <div className={isMobile && activeMobileTab !== 'NOVA' ? 'hidden' : ''}>
        <ChatAssistant onSendMessage={(msg) => getAIProductionAssistance(stateRef.current, msg)} onExecuteAction={executeAIAction} externalNotification={aiNotification} isMobile={isMobile} forceOpen={isMobile && activeMobileTab === 'NOVA'} onClose={() => setActiveMobileTab('PROJECT')} />
      </div>
      
      {isShareModalOpen && user && <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} onShare={handleShareProject} projectName={state.name} />}
    </div>
  );
}
