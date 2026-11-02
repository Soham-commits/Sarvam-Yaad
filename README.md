# Yaad

A voice-first prototype built with Sarvam AI. Record a familiar voice with permission, then use one orb to talk, hear a poem, or save a story. New questions keep using the saved voice reference.

**[Try Yaad](https://yaad-ui.vercel.app/) · [Guided tutorial](https://yaad-ui.vercel.app/?tour=1) · [Architecture and API](docs/architecture.md)**

## How to use it

1. Tap the orb or **Keep a voice**. Confirm you have permission, then speak clearly for 10–12 seconds. Tap again to save, or wait for recording to finish.
2. Tap **Talk** or the orb and ask a question. With hands-free enabled, a pause sends the message and listening resumes after the reply.
3. Try “Recite Twinkle, Twinkle, Little Star,” or choose **Menu → Hear poem**.
4. Choose **Menu → Settings** to change the reply language. Input speech and output language can differ.
5. Choose **Menu → Save story**, share a memory, then ask about it later. Read saved stories and conversations in **History**.

The bottom dock holds the main voice action and shows mute during a conversation. Typing and New conversation live in **Menu → Settings**. The top-right circular menu also contains Voice, Privacy, and Guide. The layout supports phones, tablets, and laptops; only long secondary panels scroll.

Replies play aloud. Optional subtitles follow estimated audio progress. The first-visit tutorial opens automatically and can be replayed from **Guide**.

## Sarvam integration

| Purpose | API / model |
| --- | --- |
| Speech recognition | `saaras:v4`, automatic input-language detection |
| Conversation and memory replies | `sarvam-105b-conversations` |
| Reply-language check | Text language identification API |
| Translation when needed | `mayura:v1` |
| Speech using the saved reference | Voice Cloning API, inline WAV reference |

The UI requires a saved voice. Failed cloning returns a warning rather than substituting a stock narrator. The backend also retains a Bulbul v3 / v4 Flash narrator path for API callers that omit a reference; this is not the app's normal voice flow.

Reply choices: English, Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi, and Odia. Availability depends on provider access and credits.

## Run locally

Requires Node.js 22.12+ within a Vite-compatible release, Python 3.12 recommended, and a Sarvam key with access to the configured services.

```bash
git clone https://github.com/Soham-commits/Sarvam-Yaad.git
cd Sarvam-Yaad
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

For a fresh setup, fill in `SARVAM_API_KEY=` in `.env`. Do not overwrite an existing file. The server reads the environment first, then `.env`. Keep the key server-side; never use a `VITE_` variable or commit it.

Start the backend and frontend in separate terminals:

```bash
.venv/bin/python server.py
```

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `127.0.0.1:8000`. Stop each server with Ctrl+C. On Windows, use `.venv\Scripts\python.exe` and PowerShell's `Copy-Item` equivalents.

Use the deployed HTTPS site for phone microphone testing; ordinary HTTP LAN addresses generally cannot access the microphone.

## Code map

| Location | Responsibility |
| --- | --- |
| [`src/App.tsx`](src/App.tsx) | Unified screen, recording, session state, requests, playback |
| [`src/Drawer.tsx`](src/Drawer.tsx) | Menu actions, history, voice, privacy, settings |
| [`src/components/ui/`](src/components/ui/) | Shared buttons and animated circular menu |
| [`src/audio.ts`](src/audio.ts) | WAV preparation and IndexedDB voice storage |
| [`src/Orb.tsx`](src/Orb.tsx), [`src/Subtitles.tsx`](src/Subtitles.tsx) | Audio-reactive orb and playback captions |
| [`src/GuidedTour.tsx`](src/GuidedTour.tsx) | First-visit tutorial |
| `src/style.css`, `src/tour.css`, `src/tailwind.css` | Layout, tutorial styling, Tailwind theme/utilities |
| [`server.py`](server.py), [`voice.py`](voice.py) | Shared API handler, model orchestration, voice validation/synthesis |
| [`api/`](api/) | Vercel adapters reusing the Python handler |
| [`tests/test_voice.py`](tests/test_voice.py) | Offline voice-contract and failure tests |
| [`vercel.json`](vercel.json) | Deployment configuration |

Frontend: React 19, TypeScript, Vite 7, Tailwind 4/custom CSS, Framer Motion, Lucide, Three.js/React Three Fiber. Backend: Python standard library and the official `sarvamai` SDK.

## Checks and deployment

```bash
npm run build
.venv/bin/python -m unittest discover -s tests -v
```

The build checks TypeScript and bundles the frontend. Tests use mocked provider calls; they do not verify live Sarvam access. `sarvam_check.py` makes a real chat request when a key is configured and consumes usage. `npm run preview` serves only the static build, without the API proxy.

Before sharing: record a permitted voice, request a spoken reply, change output language, save/recall a story, reload to check persistence, and test menu/keyboard controls on the target device. Phone-size browser checks do not replace physical-device checks.

GitHub `main` is connected to Vercel production. For another deployment, import the repo and set server-only `SARVAM_API_KEY`; use `npm run build` and `dist`. Redeploy after environment changes. Python functions have a 60-second maximum duration. The deployed app does not depend on local servers.

## Storage and limits

- The current browser stores one voice reference in IndexedDB, up to 15 story transcripts, and the last 40 conversation messages. There are no accounts, backups, or cross-device sync. New conversation clears active context, not saved history or voice.
- Requests send relevant audio/text, the reference, and conversation/memory context through the backend to Sarvam. Processing is not entirely on-device.
- Original story audio is not archived. Generated audio is temporary and can be downloaded from History. Privacy controls delete local data; they do not control provider retention.
- Voice cloning approximates the reference. Generated speech is AI-generated, not the original person speaking. Answers and transcription can be wrong.
- This is a public prototype with no app-level authentication or rate limiting. Requests consume the deployment owner's API credits.

## Troubleshooting

| Issue | Check |
| --- | --- |
| Microphone unavailable | HTTPS/localhost, browser/OS permission, recording support |
| No sound | Device volume, **Play reply** fallback, History → Replay latest reply, synthesis warning |
| API failure | Backend availability, key, credits, model and cloning access; health alone does not validate these |
| Missing saved data | Same browser and origin; private mode and another device have separate storage |
| Tutorial already dismissed | Open `?tour=1` or Menu → Guide |

## Attribution

The orb is adapted from [ElevenLabs UI](https://github.com/elevenlabs/ui); its MIT license is retained in [ELEVENLABS-LICENSE.md](ELEVENLABS-LICENSE.md). Yaad does not call an ElevenLabs API. This component license does not establish a repository-wide license.

Model names above describe the implementation. See [Sarvam's documentation](https://docs.sarvam.ai/api/getting-started/welcome) for provider details.
