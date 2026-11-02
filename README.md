# Yaad — phone UI

A single mobile screen with a white canvas, a silver ElevenLabs orb, and glass controls. The layout stays at phone width on larger displays.

## Run

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Recording requires localhost or HTTPS. Opening the app over an ordinary phone LAN address does not enable microphone access; use an HTTPS development URL for physical-phone microphone testing.

## Working interactions

- Tap the microphone to record; tap again to stop. The orb responds to real microphone amplitude through Web Audio.
- Tap headphones to play/pause the recording. The orb responds to the actual playback waveform.
- Add an audio file with the plus button and play it through the same output meter.
- Download the current memory from the more menu. Recordings remain in browser memory and are cleared when the page closes/reloads.
- Language selection is a memory label in this UI preview; it does not translate the interface or audio.

This is a UI prototype. Sarvam conversation, transcription, translation, voice cloning, and durable memory storage are not connected. An eventual Sarvam audio response can use the same HTML audio element and output analyser.

## Orb attribution

`src/Orb.tsx` uses the actual MIT-licensed ElevenLabs UI Orb component from https://github.com/elevenlabs/ui, with silver colors selected by the parent screen. License is included in `ELEVENLABS-LICENSE.md`. No ElevenLabs API or account is needed for the visual component. The component's noise texture is bundled locally for reliable rendering.
