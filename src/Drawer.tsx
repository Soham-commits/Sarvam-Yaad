import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronDown, CircleHelp, Download, Headphones, Globe2, Keyboard, RotateCcw, Menu, Mic2, Play, Quote, Settings2, Shield, Trash2, X } from 'lucide-react';
import type { VoiceProfile } from './audio';
import { CircleMenu, type CircleMenuItem } from './components/ui/circle-menu';
import { Button } from './components/ui/button';
import { ButtonIcon, ButtonWithIcon, IconButton } from './components/ui/button-witn-icon';

export type Memory = { id: string; text: string; createdAt?: string };
export type Turn = { role: 'user' | 'assistant'; content: string; createdAt?: string; sources?: string[] };
export const LANGUAGES = [{name:'English',code:'en-IN'},{name:'हिन्दी',code:'hi-IN'},{name:'मराठी',code:'mr-IN'},{name:'বাংলা',code:'bn-IN'},{name:'தமிழ்',code:'ta-IN'},{name:'తెలుగు',code:'te-IN'},{name:'ગુજરાતી',code:'gu-IN'},{name:'ಕನ್ನಡ',code:'kn-IN'},{name:'മലയാളം',code:'ml-IN'},{name:'ਪੰਜਾਬੀ',code:'pa-IN'},{name:'ଓଡ଼ିଆ',code:'od-IN'}];
type Panel = 'home' | 'history' | 'voice' | 'privacy' | 'settings';
type Props = {
  open: boolean; onClose: () => void; onType: () => void; onNewSession: () => void; profile: VoiceProfile | null; history: Turn[]; memories: Memory[];
  language: string; onLanguage: (language: string) => void; subtitles: boolean; onSubtitles: (value: boolean) => void;
  handsFree: boolean; onHandsFree: (value: boolean) => void; onRecord: () => void; onRename: (name: string) => Promise<void>;
  onDeleteVoice: () => Promise<void>; onClearHistory: () => void; onClearMemories: () => void;
  onReplay: () => void; onStory: () => void; onPoem: () => void; onGuide: () => void; audioUrl: string;
};
export function Drawer(props: Props) {
  const [closeRequest, setCloseRequest] = useState(0); const [returning, setReturning] = useState(false);
  const [panel, setPanel] = useState<Panel>('home'); const [name, setName] = useState(props.profile?.name || 'Saved voice');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLElement>(null); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setName(props.profile?.name || 'Saved voice'); }, [props.profile]);
  useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement as HTMLElement; setPanel('home'); setError(''); setCloseRequest(0); setReturning(false);
    requestAnimationFrame(() => heading.current?.focus({preventScroll:true}));
    return () => previous?.focus({preventScroll:true});
  }, [props.open]);
  useEffect(() => { if (props.open) heading.current?.focus({preventScroll:true}); }, [panel]);
  const titles = {home:'yaad.', history:'Your history', voice:'Your saved voice', privacy:'Account & privacy', settings:'Settings'};
  const shortcuts: CircleMenuItem[] = [
    {id:'history',label:'History',accessibleLabel:'Conversation & memory history',icon:<BookOpen/>,onSelect:()=>setPanel('history')},
    {id:'voice',label:'Voice',accessibleLabel:'Persona & voice',icon:<Mic2/>,onSelect:()=>setPanel('voice')},
    {id:'privacy',label:'Privacy',accessibleLabel:'Account, privacy & data',icon:<Shield/>,onSelect:()=>setPanel('privacy')},
    {id:'settings',label:'Settings',accessibleLabel:'System settings',icon:<Settings2/>,onSelect:()=>setPanel('settings')},
    {id:'story',label:'Save story',accessibleLabel:'Save a story',icon:<Quote/>,onSelect:props.onStory,disabled:!props.profile},
    {id:'poem',label:'Hear poem',accessibleLabel:'Hear Twinkle, Twinkle',icon:<Play/>,onSelect:props.onPoem,disabled:!props.profile},
    {id:'guide',label:'Guide',accessibleLabel:'Quick guide',icon:<CircleHelp/>,onSelect:props.onGuide},
  ];
  const entries = [
    ...props.memories.map(memory => ({key:memory.id, label:'Memory', text:memory.text, date:memory.createdAt || '', sources:[] as string[]})),
    ...props.history.map((turn,index) => ({key:`turn-${index}`, label:turn.role==='user'?'You':'Yaad', text:turn.content, date:turn.createdAt || '', sources:(turn.sources || []).map(id=>props.memories.find(memory=>memory.id===id)?.text).filter((text):text is string=>Boolean(text))})),
  ].sort((a,b) => b.date.localeCompare(a.date));
  return <div className={`drawer-layer ${props.open ? 'is-open' : ''} ${panel==='home'?'radial-home':''} ${returning?'menu-returning':''}`} inert={!props.open} aria-hidden={!props.open}>
    <Button variant="ghost" className="drawer-scrim rounded-none p-0" aria-hidden="true" tabIndex={-1} onClick={()=>panel==='home'?setCloseRequest(value=>value+1):props.onClose()}/>
    <aside ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={e => {
      if(e.key==='Escape'){if(panel==='home')setCloseRequest(value=>value+1);else props.onClose();return;}
      if(e.key!=='Tab') return;
      const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')||[]).filter(node=>node.getClientRects().length);
      if(!nodes.length){e.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }}>
      {panel==='home'?<h2 id="drawer-title" className="radial-menu-title" ref={heading} tabIndex={-1}>yaad.</h2>:<div className="drawer-header"><IconButton className="icon-button" aria-label="Back to menu" onClick={()=>{setPanel('home');setError('');}}><ArrowLeft size={19}/></IconButton><h2 id="drawer-title" ref={heading} tabIndex={-1}>{titles[panel]}</h2><IconButton className="icon-button" aria-label="Close menu" onClick={props.onClose}><X size={20}/></IconButton></div>}
      <div className="drawer-content">
        {panel==='home'&&<CircleMenu items={shortcuts} open={props.open} closeRequest={closeRequest} onReturning={()=>setReturning(true)} onClose={props.onClose}/>}
        {panel==='history'&&<>{entries.length?entries.map(entry=><article className="history-entry" key={entry.key}><span>{entry.label}</span><p>{entry.text}</p>{entry.sources.length>0&&<details className="history-sources"><summary data-ui-button="" data-variant="secondary" className="yaad-action yaad-action-label yaad-action-small history-memory-action"><span className="button-label">Original memory</span><ButtonIcon><ChevronDown size={16}/></ButtonIcon></summary>{entry.sources.map((text,index)=><p key={index}>{text}</p>)}</details>}</article>):<p className="drawer-description">Your conversations and saved stories will appear here.</p>}{props.audioUrl&&<><ButtonWithIcon variant="secondary" className="drawer-row" icon={<Headphones size={16}/>} onClick={props.onReplay}>Replay latest reply</ButtonWithIcon><ButtonWithIcon asChild variant="secondary" className="drawer-download" icon={<Download size={16}/>}><a href={props.audioUrl} download="yaad-reply.wav">Download latest spoken reply</a></ButtonWithIcon></>}</>}
        {panel==='voice'&&<><p className="drawer-description">{props.profile?'Every new reply uses this saved recording. Questions never replace it.':'Tap the orb to preserve a permitted voice first.'}</p>{props.profile&&<><label className="field-label" htmlFor="voice-name">Voice name</label><input id="voice-name" value={name} onChange={e=>setName(e.target.value)} maxLength={40}/><p className="drawer-fine">{Math.round(props.profile.duration)} second reference · AI-generated speech</p><ButtonWithIcon icon={<Check size={16}/>} className="primary-action" disabled={saving||!name.trim()} onClick={async()=>{setSaving(true);setError('');try{await props.onRename(name.trim());props.onClose();}catch{setError('Could not save the name. Please try again.');}finally{setSaving(false);}}}>{saving?'Saving…':'Save name'}</ButtonWithIcon></>}<ButtonWithIcon variant="secondary" className="drawer-row" icon={<Mic2 size={16}/>} onClick={props.onRecord}>{props.profile?'Record a different voice':'Record a voice'}</ButtonWithIcon></>}
        {panel==='privacy'&&<><p className="drawer-description">No account is required. This prototype stores your voice reference, conversations, and stories in this browser. They do not sync across devices.</p><p className="drawer-description">Messages, story context, and the saved voice reference are sent to Sarvam to generate replies. Cloned speech is AI-generated, not the original person speaking.</p><div className="data-controls"><ButtonWithIcon variant="destructive" icon={<Trash2 size={16}/>} disabled={!props.history.length} onClick={()=>{if(window.confirm('Delete conversation history from this browser?'))props.onClearHistory();}}>Clear conversation history</ButtonWithIcon><ButtonWithIcon variant="destructive" icon={<Trash2 size={16}/>} disabled={!props.memories.length} onClick={()=>{if(window.confirm('Delete saved stories from this browser?'))props.onClearMemories();}}>Clear saved stories</ButtonWithIcon><ButtonWithIcon variant="destructive" icon={<Trash2 size={16}/>} disabled={!props.profile||saving} onClick={async()=>{if(!window.confirm('Delete the saved voice from this browser?'))return;setSaving(true);try{await props.onDeleteVoice();props.onClose();}catch{setError('Could not delete this voice. Please try again.');}finally{setSaving(false);}}}>Remove saved voice</ButtonWithIcon></div><p className="drawer-fine">Deleting local data does not control Sarvam’s processing or retention policies.</p></>}
        {panel==='settings'&&<><ButtonWithIcon variant="secondary" className="drawer-row" icon={<Keyboard size={16}/>} disabled={!props.profile} onClick={props.onType}>Type a message</ButtonWithIcon><ButtonWithIcon variant="secondary" className="drawer-row" icon={<RotateCcw size={16}/>} onClick={props.onNewSession}>New conversation</ButtonWithIcon><label className="setting-select" htmlFor="reply-language"><span><Globe2 size={17}/>Reply language</span><select id="reply-language" aria-label="Reply language" value={props.language} onChange={e=>props.onLanguage(e.target.value)}>{LANGUAGES.map(language=><option key={language.code} value={language.code}>{language.name}</option>)}</select></label><label className="setting-toggle"><span>Subtitles<small>Follow audio playback with approximate timing.</small></span><input type="checkbox" role="switch" checked={props.subtitles} onChange={e=>props.onSubtitles(e.target.checked)}/></label><label className="setting-toggle"><span>Hands-free conversation<small>Listen again after each spoken reply.</small></span><input type="checkbox" role="switch" checked={props.handsFree} onChange={e=>props.onHandsFree(e.target.checked)}/></label><p className="drawer-fine">Subtitles use floating text when sustained frame pressure is detected. Reduced-motion preferences are respected.</p></>}
        {error&&<p className="inline-error" role="alert">{error}</p>}
      </div><div className="drawer-footer"><Menu size={12}/>Your voice stays yours.</div>
    </aside>
  </div>;
}
