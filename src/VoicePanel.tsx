import { useEffect, useRef, useState } from 'react';
import { ArrowUpFromLine, Check, Headphones, Mic2, Trash2, X } from 'lucide-react';
import { prepareReference, saveVoice, type VoiceProfile } from './audio';

type Props = { profile: VoiceProfile | null; selected: boolean; onSelect: (selected: boolean) => void; onSave: (profile: VoiceProfile | null) => void; onClose: () => void; onPreview: () => Promise<void>; previewing: boolean };
export function VoicePanel({ profile, selected, onSelect, onSave, onClose, onPreview, previewing }: Props) {
  const [name, setName] = useState('Grandparent'); const [consent, setConsent] = useState(false);
  const [tested, setTested] = useState(false);
  const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement; const overflow = document.body.style.overflow;
    close.current?.focus(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; before?.focus(); };
  }, []);
  async function upload() {
    if (!file || !consent || !name.trim()) return;
    setSaving(true); setError('');
    try {
      const reference = await prepareReference(file);
      const next: VoiceProfile = { id: crypto.randomUUID(), name: name.trim().slice(0, 40), ...reference, consent: true };
      await saveVoice(next); onSave(next); onSelect(true); setFile(null); setConsent(false); setTested(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add this voice.'); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm('Remove this voice recording from this browser?')) return;
    try { await saveVoice(null); onSave(null); onSelect(false); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove the voice.'); }
  }
  return <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }} onKeyDown={e => {
    if (e.key === 'Escape' && !saving) onClose();
    if (e.key === 'Tab') {
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="voice-sheet glass-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="voice-title">
      <div className="sheet-heading"><span className="section-kicker">A FAMILIAR SOUND</span><button ref={close} className="icon-button" onClick={onClose} disabled={saving} aria-label="Close voice settings"><X size={20}/></button></div>
      <h2 id="voice-title">A voice to come home to.</h2><p className="sheet-description">Choose the narrator, or bring a familiar voice with a short recording.</p>
      <button className={`voice-choice ${!selected ? 'selected' : ''}`} disabled={previewing || saving} onClick={() => onSelect(false)}><span className="voice-avatar"><Mic2 size={18}/></span><span><strong>Yaad narrator</strong><small>A standard Sarvam voice</small></span>{!selected && <Check size={17}/>}</button>
      {profile && <div className="saved-voice"><button className={`voice-choice ${selected ? 'selected' : ''}`} disabled={previewing || saving} onClick={() => onSelect(true)}><span className="voice-avatar initials">{profile.name.slice(0, 1)}</span><span><strong>{profile.name}</strong><small>AI-cloned voice · {Math.round(profile.duration)}s reference</small></span>{selected && <Check size={17}/>}</button><div className="voice-actions"><button disabled={previewing || saving} onClick={() => { setError(''); setTested(false); void onPreview().then(() => setTested(true)).catch(e => setError(e instanceof Error ? e.message : 'Voice preview failed.')); }}><Headphones size={14}/>{previewing ? 'Preparing preview…' : 'Test this voice'}</button><button aria-label="Remove cloned voice" disabled={previewing || saving} onClick={() => void remove()}><Trash2 size={14}/>Remove</button></div></div>}
      <div className="voice-upload"><h3>{profile ? 'Replace the reference' : 'Add a familiar voice'}</h3><p>Use 5–15 seconds of one person speaking clearly, without music. We recommend 10–15 seconds.</p><label className="field-label" htmlFor="voice-name">Voice name</label><input id="voice-name" value={name} onChange={e => setName(e.target.value)} maxLength={40} disabled={saving || previewing} placeholder="Grandmother, Grandfather, or your name"/>
      <label className="file-drop"><ArrowUpFromLine size={20}/><span>{file ? file.name : 'Choose a voice recording'}<small>WAV, MP3, M4A or another browser-supported audio file</small></span><input type="file" accept="audio/*" disabled={saving || previewing} onChange={e => { setFile(e.target.files?.[0] || null); setError(''); setConsent(false); }}/></label>
      <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={saving || previewing}/><span>I have permission and the rights to clone this voice and generate new speech with it.</span></label>
      <button className="primary-action" disabled={!file || !consent || !name.trim() || saving || previewing} onClick={() => void upload()}>{saving ? 'Preparing recording…' : profile ? 'Replace voice' : 'Add voice'}</button>
      </div>
      {tested && !error && <p className="preview-status" role="status">Preview ready. If you didn’t hear it, close this panel and tap headphones to play.</p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <p className="voice-disclosure">This creates AI-generated speech, not the person speaking live. The reference stays in this browser and is sent to Sarvam when you use it. Removing it here deletes the local copy. Service access and voice quality may vary.</p>
    </div>
  </div>;
}
