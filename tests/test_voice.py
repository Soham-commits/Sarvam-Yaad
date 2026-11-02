"""Speech integration contracts: no network requests or credentials needed."""
import base64
import io
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import Mock
from voice import parse_voice, synthesize


def reference(seconds=10):
    out = io.BytesIO()
    with wave.open(out, 'wb') as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(24000)
        clip.writeframes(b'\0\0' * (24000 * seconds))
    return base64.b64encode(out.getvalue()).decode()


class VoiceTests(unittest.TestCase):
    def test_reference_requires_permission(self):
        with self.assertRaises(ValueError):
            parse_voice({'audio': reference(), 'consent': False})

    def test_reference_rejects_long_clip(self):
        with self.assertRaises(ValueError):
            parse_voice({'audio': reference(16), 'consent': True})

    def test_reference_rejects_corrupt_clip(self):
        with self.assertRaises(ValueError):
            parse_voice({'audio': 'not-base64', 'consent': True})

    def test_valid_reference_is_decoded_and_name_bounded(self):
        voice = parse_voice({'audio': reference(), 'name': 'x' * 100, 'consent': True})
        self.assertTrue(voice['audio'].startswith(b'RIFF'))
        self.assertEqual(len(voice['name']), 40)

    def test_cloned_audio_uses_inline_reference_and_selected_language(self):
        client = Mock()
        client.voice_cloning.convert.return_value = SimpleNamespace(audio_b64='generated', audio=None)
        audio, warning = synthesize(client, 'नमस्ते', 'hi-IN', {'name': 'Test', 'audio': b'clip'})
        self.assertEqual((audio, warning), ('generated', None))
        kwargs = client.voice_cloning.convert.call_args.kwargs
        self.assertEqual(kwargs['language_code'], 'hi-IN')
        self.assertEqual(kwargs['ref_audio'][0], 'reference.wav')
        client.text_to_speech.convert.assert_not_called()

    def test_clone_failure_never_substitutes_stock_voice(self):
        client = Mock()
        client.voice_cloning.convert.side_effect = TimeoutError()
        audio, warning = synthesize(client, 'Test', 'en-IN', {'name': 'Test', 'audio': b'clip'})
        self.assertIsNone(audio)
        self.assertIn('no narrator was substituted', warning)
        client.text_to_speech.convert.assert_not_called()

    def test_stock_speech_fallback_keeps_language(self):
        client = Mock()
        client.text_to_speech.convert.side_effect = [TimeoutError(), SimpleNamespace(audios=['fallback'])]
        self.assertEqual(synthesize(client, 'Test', 'mr-IN'), ('fallback', None))
        calls = client.text_to_speech.convert.call_args_list
        self.assertEqual(calls[0].kwargs['model'], 'bulbul:v3')
        self.assertEqual(calls[1].kwargs['model'], 'bulbul:v4-flash')
        self.assertEqual(calls[1].kwargs['language_code'], 'mr-IN')


if __name__ == '__main__':
    unittest.main()
