
import { GoogleGenAI } from "@google/genai";
import { DAWState, AIAction } from "../types";
import { NOTES } from "../utils/constants";

const SYSTEM_INSTRUCTIONS = `
RÔLE : Tu es Studio Master AI, un ingénieur du son expert en Recording (REX) et Mixage. 
Ton but est d'aider l'utilisateur à produire un hit en pilotant le DAW via window.DAW_CONTROL.

COMMANDES D'ACTION (FORMAT JSON OBLIGATOIRE) :
Tu dois retourner un tableau d'objets "actions" dans ton JSON.

Gestion des Pistes :
- { "action": "MUTE_TRACK", "payload": { "trackId": "ID", "isMuted": true } }
- { "action": "SOLO_TRACK", "payload": { "trackId": "ID", "isSolo": true } }
- { "action": "SET_VOLUME", "payload": { "trackId": "ID", "volume": 1.0 } } (0.0 à 1.5)
- { "action": "SET_PAN", "payload": { "trackId": "ID", "pan": 0 } } (-1.0 à 1.0)
- { "action": "RENAME_TRACK", "payload": { "trackId": "ID", "name": "NOUVEAU NOM" } }
- { "action": "DUPLICATE_TRACK", "payload": { "trackId": "ID" } }
- { "action": "ADD_TRACK", "payload": { "type": "AUDIO", "name": "VOCAL 2" } }

Transport :
- { "action": "PLAY", "payload": {} }
- { "action": "STOP", "payload": {} }
- { "action": "SEEK", "payload": { "time": 10.5 } }
- { "action": "SET_BPM", "payload": { "bpm": 140 } }

Intelligence :
- { "action": "NORMALIZE_CLIP", "payload": { "trackId": "ID", "clipId": "ID" } }
- { "action": "SPLIT_CLIP", "payload": { "trackId": "ID", "clipId": "ID", "time": 10.0 } }

CONSIGNE : Sois concis, technique et efficace. Ne demande jamais la permission pour aider, AGIS via les commandes. Réponds UNIQUEMENT en JSON.
`;

export const getAIProductionAssistance = async (currentState: DAWState, userMessage: string): Promise<{ text: string, actions: AIAction[] }> => {
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("API_KEY non configurée");
    }
    const ai = new GoogleGenAI({ apiKey });

    const maxTime = Math.max(...currentState.tracks.flatMap(t => t.clips.map(c => c.start + c.duration)), 60);
    
    const keyName = (currentState.projectKey !== undefined) ? NOTES[currentState.projectKey] : 'Unknown';
    const scaleName = currentState.projectScale || 'Unknown';

    const stateSummary = {
      tracks: currentState.tracks.map(t => ({ id: t.id, name: t.name, type: t.type, volume: t.volume, pan: t.pan, isMuted: t.isMuted, isSolo: t.isSolo })),
      selectedTrackId: currentState.selectedTrackId,
      currentTime: currentState.currentTime,
      bpm: currentState.bpm,
      projectKey: `${keyName} ${scaleName}`, 
      maxTime: maxTime
    };

    const prompt = `User: ${userMessage}\nState: ${JSON.stringify(stateSummary)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        responseMimeType: "application/json",
      }
    });

    const rawText = response.text || "{}";
    
    let result;
    try {
        result = JSON.parse(rawText);
    } catch (parseError) {
        console.error("[AI_SERVICE] JSON invalide:", rawText);
        throw new Error("Réponse AI invalide");
    }
    
    return {
      text: result.text || "Commande reçue.",
      actions: result.actions || []
    };
  } catch (error) {
    console.error("[AI_SERVICE] Erreur :", error);
    throw error;
  }
};

export const generateCreativeMetadata = async (category: string): Promise<{ name: string, prompt: string }> => {
    try {
        const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API_KEY missing");
        const ai = new GoogleGenAI({ apiKey });
        
        const systemPrompt = `You are a creative director for a top-tier Hip-Hop/Rap producer.
        Task:
        1. Generate a **HARD, IMPACTFUL** Beat Name (1-3 words max, uppercase). Think: Future, Metro Boomin, Drake, Drill, Trap style. Use words related to: Money, Night, Street, Power, Space, Emotions, Luxury.
        2. Generate a highly detailed **Visual Prompt** for the album cover art.
        
        Visual Style Requirements:
        - Urban, Dark, Cinematic, High Contrast.
        - Elements: Neon lights, Smoke, Luxury cars, Cash, Abstract geometry, Cyberpunk cityscapes, Hoodies, Grillz texture, Chrome.
        - Vibe: Fits the genre "${category}".
        
        Return JSON only.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ 
                role: 'user', 
                parts: [{ text: `Genre: ${category}. Generate metadata.` }] 
            }],
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT" as any,
                    properties: {
                        name: { type: "STRING" as any },
                        prompt: { type: "STRING" as any }
                    }
                }
            }
        });
        
        return JSON.parse(response.text || '{"name": "NIGHT RIDER", "prompt": "Neon city street at night with a matte black sports car"}');
    } catch (e) {
        console.error("AI Metadata Error:", e);
        return { name: `${category.toUpperCase()} ANTHEM`, prompt: "Abstract dark neon geometric shapes with smoke" };
    }
};

export const generateCoverArt = async (beatName: string, category: string, vibe: string): Promise<string | null> => {
  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API_KEY missing");
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `High quality Hip-Hop Album Cover Art for a beat named "${beatName}" (${category}).
    Visual Description: ${vibe || 'Dark moody street atmosphere'}.
    
    Aesthetic Rules:
    - Style: 3D Render, Digital Art, Unreal Engine 5, or High-end Photography.
    - Atmosphere: Urban, Gritty, Hype, Trap, Drill, or Lo-Fi (depending on category).
    - Lighting: Cinematic lighting, volumetric fog, neon accents (Cyan, Purple, Red or Gold).
    - Composition: Centered, symmetrical or rule of thirds. Professional Mixtape Cover standard.
    
    IMPORTANT: **NO TEXT**, NO LETTERS on the image. Just the artwork.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1" 
        }
      },
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("[AI_SERVICE] Image Generation Error:", error);
    throw error;
  }
};
