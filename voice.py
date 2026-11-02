"""Speech generation and bounded, consented inline voice references."""
import base64
import io
import wave


def parse_voice(data):
    if not data:
        return None
    if not isinstance(data, dict) or data.get('consent') is not True:
        raise ValueError('Confirm permission to use this voice before generating speech.')
    encoded = data.get('audio')
    if not isinstance(encoded, str) or len(encoded) > 1_000_000:
        raise ValueError('Choose a voice reference between 5 and 15 seconds.')
    try:
        raw = base64.b64decode(encoded, validate=True)
        with wave.open(io.BytesIO(raw), 'rb') as clip:
            duration = clip.getnframes() / clip.getframerate()
            if clip.getnchannels() != 1 or clip.getsampwidth() != 2 or not 5 <= duration <= 15:
                raise ValueError('Invalid reference format or duration')
    except Exception as exc:
        raise ValueError('Use a 5–15 second voice clip prepared through the voice settings.') from exc
    return {'audio': raw, 'name': str(data.get('name') or 'Familiar voice')[:40]}


def synthesize(client, text, language, voice=None):
    if voice:
        # Never replace a failed clone with a stock narrator without telling the user.
        try:
            result = client.voice_cloning.convert(
                text=text[:1000], ref_audio=('reference.wav', io.BytesIO(voice['audio']), 'audio/wav'),
                language_code=language, output_audio_codec='wav', enable_qc=True,
                request_options={'timeout_in_seconds': 30, 'max_retries': 0},
            )
            audio = result.audio_b64 or result.audio
            if audio:
                return audio, None
        except Exception as exc:
            print(f'Cloned speech failed: {type(exc).__name__}, HTTP {getattr(exc, "status_code", "unknown")}', flush=True)
        return None, 'Your selected cloned voice could not be generated. Check voice-cloning access or try a clearer reference in Voice settings. Your text reply is ready; no narrator was substituted.'

    flash_voices = {
        'en-IN': 'simran_en_customer', 'hi-IN': 'roopa_hi_conversational',
        'mr-IN': 'ishita_mr_conversational', 'bn-IN': 'roopa_bn_conversational',
        'ta-IN': 'gokul_ta_narration', 'te-IN': 'kavitha_te_conversation',
        'gu-IN': 'pooja_gu_conversational', 'kn-IN': 'chaitra_kn_conversation',
        'pa-IN': 'anand_pa_conversation',
    }
    attempts = [('bulbul:v3', 'shubh')]
    attempts.append(('bulbul:v4-flash', flash_voices[language]) if language in flash_voices else ('bulbul:v3', 'shubh'))
    for model, speaker in attempts:
        try:
            result = client.text_to_speech.convert(
                text=text, language_code=language, model=model, speaker=speaker, output_audio_codec='wav',
                request_options={'timeout_in_seconds': 12, 'max_retries': 0},
            )
            if result.audios:
                return result.audios[0], None
        except Exception as exc:
            print(f'Speech generation failed: {type(exc).__name__}, HTTP {getattr(exc, "status_code", "unknown")}', flush=True)
    return None, 'Your reply is ready, but speech generation did not respond. Please try again.'
