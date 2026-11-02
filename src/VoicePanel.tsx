import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { saveVoice, type VoiceProfile } from './audio';

type Props = { profile: VoiceProfile; onSave: (profile: VoiceProfile) => void; onClose: () => void; onRecord: () => void; onRemove: () => void };
export function VoicePanel({ profile, onSave, onClose, onRecord, onRemove }: Props) {
  const [name, setName] = useState(profile.name); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  async function rename() {
    setSaving(true); setError('');
    try { const next = { ...profile, name: name.trim() }; await saveVoice(next); onSave(next); onClose(); }
    catch { setError('Could not save the name. Please try again.'); } finally { setSaving(false); }
  }
  return <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }} onKeyDown={e => {
    if (e.key === 'Escape' && !saving) onClose();
    if (e.key === 'Tab') {
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><div ref={panel} className="voice-sheet glass-panel" role="dialog" aria-modal="true" aria-labelledby="voice-title"><div className="sheet-heading"><h2 id="voice-title">Your saved voice</h2><button ref={close} className="icon-button" aria-label="Close voice settings" disabled={saving} onClick={onClose}><X size={20}/></button></div><p className="sheet-description">Every reply uses this recording as its voice reference.</p><label className="field-label" htmlFor="voice-name">Name</label><input id="voice-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} disabled={saving}/><button className="primary-action" disabled={saving || !name.trim()} onClick={() => void rename()}>{saving ? 'Saving…' : 'Save name'}</button><button className="text-action" disabled={saving} onClick={onRecord}>Record a new voice</button><button className="text-action remove-voice" disabled={saving} onClick={async () => { if (!window.confirm('Remove the saved voice from this browser?')) return; setSaving(true); try { await saveVoice(null); onRemove(); } catch { setError('Could not remove this voice.'); } finally { setSaving(false); } }}>Remove saved voice</button>{error && <p className="inline-error" role="alert">{error}</p>}<p className="voice-disclosure">Saved on this device. Sent to Sarvam when generating speech. Questions never overwrite it.</p></div></div>;
}
