"""One Sarvam chat call. Reads the private .env without extra dependencies."""
import os
from pathlib import Path

from sarvamai import SarvamAI

env_file = Path(__file__).with_name('.env')
if env_file.exists():
    for line in env_file.read_text().splitlines():
        name, separator, value = line.partition('=')
        if separator and name.strip() == 'SARVAM_API_KEY':
            os.environ.setdefault(name.strip(), value.strip().strip('\"\''))

key = os.environ.get('SARVAM_API_KEY', '').strip()
if not key:
    raise SystemExit('Add SARVAM_API_KEY to .env before running this script.')

client = SarvamAI(api_subscription_key=key)
response = client.chat.completions(
    model='sarvam-105b-conversations',
    messages=[{'role': 'user', 'content': 'You are Yaad, a warm family memory interviewer. In one short sentence in English, ask me about a happy childhood memory.'}],
    max_tokens=100,
)
print(response.choices[0].message.content)
