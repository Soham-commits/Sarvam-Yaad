import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Download, Globe2, Menu, Mic2, Settings2, Shield, X } from 'lucide-react';
import type { VoiceProfile } from './audio';

export type Memory = { id: string; text: string; createdAt?: string };
export type Turn = { role: 'user' | 'assistant'; content: string; createdAt?: string; sources?: string[] };
export const LANGUAGES = [{name:'English',code:'en-IN'},{name:'हिन्दी',code:'hi-IN'},{name:'मराठी',code:'mr-IN'},{name:'বাংলা',code:'bn-IN'},{name:'தமிழ்',code:'ta-IN'},{name:'తెలుగు',code:'te-IN'},{name:'ગુજરાતી',code:'gu-IN'},{name:'ಕನ್ನಡ',code:'kn-IN'},{name:'മലയാളം',code:'ml-IN'},{name:'ਪੰਜਾਬੀ',code:'pa-IN'},{name:'ଓଡ଼ିଆ',code:'od-IN'}];
type Panel = 'home' | 'history' | 'voice' | 'privacy' | 'settings';
type Props = {
  open: boolean; onClose: () => void; profile: VoiceProfile | null; history: Turn[]; memories: Memory[];
  language: string; onLanguage: (language: string) => void; subtitles: boolean; onSubtitles: (value: boolean) => void;
  handsFree: boolean; onHandsFree: (value: boolean) => void; onRecord: () => void; onRename: (name: string) => Promise<void>;
  onDeleteVoice: () => Promise<void>; onClearHistory: () => void; onClearMemories: () => void;
  onReplay: () => void; onStory: () => void; onPoem: () => void; onGuide: () => void; audioUrl: string;
};
export function Drawer(props: Props) {
  const [panel, setPanel] = useState<Panel>('home'); const [name, setName] = useState(props.profile?.name || 'Saved voice');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLElement>(null); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setName(props.profile?.name || 'Saved voice'); }, [props.profile]);
  useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement as HTMLElement; setPanel('home'); setError('');
    requestAnimationFrame(() => heading.current?.focus({preventScroll:true}));
    return () => previous?.focus({preventScroll:true});
  }, [props.open]);
  useEffect(() => { if (props.open) heading.current?.focus({preventScroll:true}); }, [panel]);
  const titles = {home:'yaad.', history:'Your history', voice:'Your saved voice', privacy:'Account & privacy', settings:'Settings'};
  const entries = [
    ...props.memories.map(memory => ({key:memory.id, label:'Memory', text:memory.text, date:memory.createdAt || '', sources:[] as string[]})),
    ...props.history.map((turn,index) => ({key:`turn-${index}`, label:turn.role==='user'?'You':'Yaad', text:turn.content, date:turn.createdAt || '', sources:(turn.sources || []).map(id=>props.memories.find(memory=>memory.id===id)?.text).filter((text):text is string=>Boolean(text))})),
  ].sort((a,b) => b.date.localeCompare(a.date));
  return <div className={`drawer-layer ${props.open ? 'is-open' : ''}`} inert={!props.open} aria-hidden={!props.open}>
    <button className="drawer-scrim" aria-hidden="true" tabIndex={-1} onClick={props.onClose}/>
    <aside ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={e => {
      if(e.key==='Escape'){props.onClose();return;}
      if(e.key!=='Tab') return;
      const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')||[]).filter(node=>node.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }}>
      <div className="drawer-header">{panel!=='home'&&<button className="icon-button" aria-label="Back to menu" onClick={()=>{setPanel('home');setError('');}}><ArrowLeft size={19}/></button>}<h2 id="drawer-title" ref={heading} tabIndex={-1}>{titles[panel]}</h2><button className="icon-button" aria-label="Close menu" onClick={props.onClose}><X size={20}/></button></div>
      <div className="drawer-content">
        {panel==='home'&&<><p className="drawer-eyebrow">A FAMILIAR VOICE, ALWAYS CLOSE</p><div className="drawer-links">{([{panel:'history',label:'Conversation & memory history',icon:BookOpen},{panel:'voice',label:'Persona & voice',icon:Mic2},{panel:'privacy',label:'Account, privacy & data',icon:Shield},{panel:'settings',label:'System settings',icon:Settings2}] as const).map(item=><button key={item.panel} onClick={()=>setPanel(item.panel)}><item.icon size={18} strokeWidth={1.5}/><span>{item.label}</span><ChevronRight size={15}/></button>)}</div><div className="drawer-actions"><button onClick={props.onRecord}>{props.profile?'Record a different voice':'Preserve a voice'}<ArrowRight size={15}/></button><button disabled={!props.profile} onClick={props.onPoem}>Hear Twinkle, Twinkle<ArrowRight size={15}/></button><button disabled={!props.profile} onClick={props.onStory}>Save a story<ArrowRight size={15}/></button><button onClick={props.onGuide}>Quick guide<ArrowRight size={15}/></button></div></>}
        {panel==='history'&&<>{entries.length?entries.map(entry=><article className="history-entry" key={entry.key}><span>{entry.label}</span><p>{entry.text}</p>{entry.sources.length>0&&<details className="history-sources"><summary>Original memory</summary>{entry.sources.map((text,index)=><p key={index}>{text}</p>)}</details>}</article>):<p className="drawer-description">Your conversations and saved stories will appear here.</p>}{props.audioUrl&&<><button className="drawer-row" onClick={props.onReplay}>Replay latest reply<Mic2 size={15}/></button><a className="drawer-download" href={props.audioUrl} download="yaad-reply.wav"><Download size={15}/>Download latest spoken reply</a></>}</>}
        {panel==='voice'&&<><p className="drawer-description">{props.profile?'Every new reply uses this saved recording. Questions never replace it.':'Tap the orb to preserve a permitted voice first.'}</p>{props.profile&&<><label className="field-label" htmlFor="voice-name">Voice name</label><input id="voice-name" value={name} onChange={e=>setName(e.target.value)} maxLength={40}/><p className="drawer-fine">{Math.round(props.profile.duration)} second reference · AI-generated speech</p><button className="primary-action" disabled={saving||!name.trim()} onClick={async()=>{setSaving(true);setError('');try{await props.onRename(name.trim());props.onClose();}catch{setError('Could not save the name. Please try again.');}finally{setSaving(false);}}}>{saving?'Saving…':'Save name'}</button></>}<button className="drawer-row" onClick={props.onRecord}>{props.profile?'Record a different voice':'Record a voice'}<Mic2 size={17}/></button></>}
        {panel==='privacy'&&<><p className="drawer-description">No account is required. This prototype stores your voice reference, conversations, and stories in this browser. They do not sync across devices.</p><p className="drawer-description">Messages, story context, and the saved voice reference are sent to Sarvam to generate replies. Cloned speech is AI-generated, not the original person speaking.</p><div className="data-controls"><button disabled={!props.history.length} onClick={()=>{if(window.confirm('Delete conversation history from this browser?'))props.onClearHistory();}}>Clear conversation history</button><button disabled={!props.memories.length} onClick={()=>{if(window.confirm('Delete saved stories from this browser?'))props.onClearMemories();}}>Clear saved stories</button><button disabled={!props.profile||saving} onClick={async()=>{if(!window.confirm('Delete the saved voice from this browser?'))return;setSaving(true);try{await props.onDeleteVoice();props.onClose();}catch{setError('Could not delete this voice. Please try again.');}finally{setSaving(false);}}}>Remove saved voice</button></div><p className="drawer-fine">Deleting local data does not control Sarvam’s processing or retention policies.</p></>}
        {panel==='settings'&&<><label className="setting-select" htmlFor="reply-language"><span><Globe2 size={17}/>Reply language</span><select id="reply-language" aria-label="Reply language" value={props.language} onChange={e=>props.onLanguage(e.target.value)}>{LANGUAGES.map(language=><option key={language.code} value={language.code}>{language.name}</option>)}</select></label><label className="setting-toggle"><span>Subtitles<small>Follow audio playback with approximate timing.</small></span><input type="checkbox" role="switch" checked={props.subtitles} onChange={e=>props.onSubtitles(e.target.checked)}/></label><label className="setting-toggle"><span>Hands-free conversation<small>Listen again after each spoken reply.</small></span><input type="checkbox" role="switch" checked={props.handsFree} onChange={e=>props.onHandsFree(e.target.checked)}/></label><p className="drawer-fine">Subtitles use floating text when sustained frame pressure is detected. Reduced-motion preferences are respected.</p></>}
        {error&&<p className="inline-error" role="alert">{error}</p>}
      </div><div className="drawer-footer"><Menu size={12}/>Your voice stays yours.</div>
    </aside>
  </div>;
}
