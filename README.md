# Yaad — Sarvam voice time capsule

Single-screen mobile app with a silver ElevenLabs orb reacting to real microphone input and Sarvam audio playback.

## Live app

https://yaad-ui.vercel.app/

Hosted frontend and Python API run together over HTTPS. Set `SARVAM_API_KEY` as a secret in the Vercel project environment; never put it in frontend code. GitHub main is connected for production deployments. HTTPS enables browser microphone access on phones. Memory transcripts remain browser-local, so localhost memories do not transfer to the hosted origin.

## Start locally

1. `python3 -m venv .venv`
2. `.venv/bin/pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and put your Sarvam key after `SARVAM_API_KEY=`. Never commit this file.
4. Terminal one: `.venv/bin/python server.py`
5. Terminal two: `npm install` then `npm run dev`
6. Open http://localhost:5173.

The private Python bridge listens on 127.0.0.1:8000. Vite proxies `/api` to it. Keep both terminals running. Physical phones require an HTTPS URL for microphone access; ordinary HTTP LAN access does not permit recording. The laptop browser can show the phone layout at localhost.

## Live demo

- Select English, Hindi, or Marathi.
- Choose **Tell a story**, tap the microphone, speak for 10–20 seconds, then tap stop. Recording stops automatically at 25 seconds.
- Saaras v4 transcribes; Sarvam-105B Conversations asks a follow-up; Bulbul v3 speaks the reply. Tap headphones if your browser blocks automatic audio.
- Choose **Ask my capsule** and ask about a detail you just recorded. Expand **Original memory** to inspect the source transcript.
- Ask about something absent from the archive: the assistant should acknowledge that it has not been recorded.
- Tap **+** for a typed fallback. This calls the same real Sarvam backend and skips only speech recognition.

Example test narrative (synthetic): “When I was eight, my grandfather taught me to ride a bicycle in Pune. We celebrated with mango ice cream.” Ask who taught you, where it happened, then ask his first salary, which is absent.

## Boundaries

This is a working local prototype, not a production archival service. Memory transcripts persist in this browser's local storage (last 15 stories). Input audio and relevant transcripts are sent to Sarvam to process the request. Generated speech uses a stock AI narrator; family voice cloning and permanent original-recording storage are not implemented. The language selector controls transcription and spoken reply language.

`SARVAM CONNECTED` confirms the local bridge is running with a configured key; successful voice requests verify upstream Sarvam access. Errors remain visible, and a text reply remains available if TTS fails. API credentials are server-side only.

## Single-call check

`.venv/bin/python sarvam_check.py` reads `.env`, calls `sarvam-105b-conversations`, and prints only the reply.

## Orb attribution

`src/Orb.tsx` uses the MIT-licensed component from https://github.com/elevenlabs/ui, with a silver palette and bundled noise texture. See `ELEVENLABS-LICENSE.md`. The visual requires no ElevenLabs API account.
