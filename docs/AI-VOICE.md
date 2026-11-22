# De VERVE AI speech and multilingual voice

**Status:** implemented in the 22 November 2026 production release; physical-device and live-provider acceptance still required.

## How customer speech works

1. The customer selects **Auto detect** or a manual language in the AI chat voice-language control.
2. The browser sends the assistant message text and selected language to the same-origin `POST /api/ai/speech` endpoint.
3. The Worker uses an enabled Gemini key from the existing encrypted server-side key vault. No API key is sent to the browser.
4. The Worker requests speech audio from `gemini-3.1-flash-tts-preview`, with `gemini-2.5-flash-preview-tts` as the model fallback.
5. The Worker returns a short-lived audio response. Generated audio is not stored in D1, R2, or browser storage.
6. The browser starts Web Audio playback from the user's click gesture. If the online speech endpoint, audio decoding, or playback is unavailable, the UI falls back to the device's installed Web Speech voices where available.

## Language behavior

- Gemini TTS automatically detects the transcript language and supports a published list of approximately 80 languages, including Urdu (`ur`), English (`en`), Arabic, Punjabi (`pa`), Hindi (`hi`), Persian (`fa`), and many others. This is the model's supported-language list, not a promise that every language, dialect, accent or local pronunciation is supported.
- Urdu script is sent to TTS as Urdu. English is spoken in English. Mixed-language text is prompted to preserve code-switching rather than translating the sentence.
- Roman Urdu is not a separate standard BCP-47 speech language. When the text is detected as predominantly Roman Urdu and the selected language is Auto or Urdu (Pakistan), the Worker first asks the existing Gemini text model to transliterate Roman Urdu into Urdu script. The instruction preserves English phrases, names, numbers, punctuation and order. The resulting Urdu-script transcript is then spoken with a natural Pakistani Urdu direction.
- Transliteration is model-assisted. Proper nouns, regional spellings, slang and ambiguous Roman Urdu spellings can still need human review. If the transliteration step fails, the original transcript is sent with a Pakistani Urdu pronunciation instruction.
- Manual language selection can override automatic detection. Auto is recommended for mixed English/Urdu and for the full supported language list.

## Security and operational limits

- Endpoint: `POST /api/ai/speech` (same-origin customer chat use).
- Input: plain text only, maximum 1,800 characters.
- Rate limit: 24 requests per client IP per 15 minutes.
- API keys: decrypted server-side from the existing encrypted Gemini key vault; never returned to the client.
- Audio: Gemini PCM output is framed as a 24 kHz, mono, 16-bit WAV response for browser playback.
- Persistence: neither the submitted speech text nor generated audio is saved by this endpoint.
- Failure behavior: a temporary provider failure returns a controlled error; the browser falls back to device-installed speech voices. A device without the required voice may not be able to speak that language offline.
- Model availability and quota depend on the configured Gemini API key and current provider access. The primary TTS model is a preview model; the secondary model is also preview.

## Acceptance checklist

- [ ] Verify live TTS generation with the production Gemini key for Urdu script.
- [ ] Verify Roman Urdu transliteration and playback (for example: “Aap kaise hain? Main aap ki madad kar sakta hoon.”).
- [ ] Verify mixed Urdu-English code-switching and English-only playback.
- [ ] Verify at least one non-Urdu language in Auto and one manual language selection.
- [ ] Test on a physical Android device: tap-to-play, pause/stop, speaker output, Bluetooth output, network failure and device-voice fallback.
- [ ] Confirm that no API key, transcript or audio is exposed in browser logs, persistent storage, or analytics.
- [ ] Review current Gemini TTS supported languages, model availability and terms before changing model versions: https://ai.google.dev/gemini-api/docs/speech-generation

Automated CI validates the server adapter's model fallback, PCM-to-WAV framing, client request contract and mocked playback integration. It does not prove that a real production key can access the TTS preview models or that every language is pronounced correctly on every device. Do not mark voice acceptance complete until the checklist above has been run and recorded.
