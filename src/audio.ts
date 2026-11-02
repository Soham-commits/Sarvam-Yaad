export type VoiceProfile = { id: string; name: string; audio: string; duration: number; consent: true };

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the audio file.'));
    reader.readAsDataURL(blob);
  });
}

// A short mono WAV keeps inline reference uploads small and format-independent.
export async function prepareReference(file: File): Promise<{ audio: string; duration: number }> {
  if (file.size > 20_000_000) throw new Error('Choose an audio file smaller than 20 MB.');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < 5 || decoded.duration > 15) throw new Error('Choose a clip between 5 and 15 seconds. 10–15 seconds works best.');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 24000), 24000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
    const write = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767), true));
    return { audio: await blobToBase64(new Blob([buffer], { type: 'audio/wav' })), duration: decoded.duration };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') throw new Error('This file cannot be decoded. Try WAV, MP3, or M4A.');
    throw error;
  } finally { await context.close(); }
}

async function voiceStore(mode: IDBTransactionMode, value?: VoiceProfile | null): Promise<VoiceProfile | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('yaad-voices', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('profiles');
    open.onerror = () => reject(new Error('Voice storage is unavailable in this browser.'));
    open.onsuccess = () => {
      const db = open.result; const transaction = db.transaction('profiles', mode); const store = transaction.objectStore('profiles');
      const request = mode === 'readonly' ? store.get('reference') : value ? store.put(value, 'reference') : store.delete('reference');
      transaction.oncomplete = () => { db.close(); resolve(mode === 'readonly' ? (request.result || null) : (value || null)); };
      transaction.onerror = () => { db.close(); reject(new Error('Could not save the voice. Check available browser storage.')); };
      transaction.onabort = () => { db.close(); reject(new Error('Voice storage was interrupted. Please try again.')); };
    };
  });
}
export const loadVoice = () => voiceStore('readonly');
export const saveVoice = (voice: VoiceProfile | null) => voiceStore('readwrite', voice);
