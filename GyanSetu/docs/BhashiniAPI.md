Bhashini API: Architecture & Methods Guide
Yes. If you're building a backend, it is useful to think of Bhashini as a set of language services, not as one single function.
> Correction Note: "Bhashini API" can refer to different Bhashini offerings. The official government Bhashini/ULCA APIs use the pipeline model, while Bhashini.ai currently exposes REST/WebSocket APIs directly for services such as STT, TTS, translation, and OCR. Their current Swagger documentation lists the REST operations explicitly.
> 
1. The Main Services
For a normal application, these are the most useful services:
| Service | What it does | Input → Output |
|---|---|---|
| ASR / STT | Speech recognition | Audio → Text |
| Translation | Language translation | Text → Text |
| TTS | Speech synthesis | Text → Audio |
| OCR | Read text from image/document | Image → Text |
| Transliteration | Change script | Text → Text |
| Normalization | Normalize Indic text | Text → Text |
| Document Translation | Translate documents | PDF/DOC/DOCX/HTML → Translated document |
| Batch Translation | Translate multiple texts | List of texts → Translated texts |
The current Bhashini.ai REST API exposes endpoints for all of these services.
2. Authentication
First, obtain your API key.
API_KEY = "your_api_key"

Send it with requests according to the API's authentication requirements. For Bhashini.ai, API-key authentication is used for external/B2B applications.
> Security Warning: Never put keys inside frontend code:
> const API_KEY = "my-secret-key"; // DO NOT DO THIS
> 
> 
Recommended Architecture Flow
Frontend
   ↓
Your FastAPI Backend
   ↓
Bhashini API

Always keep your API key secured on your backend.
3. Speech-to-Text (ASR)
Purpose
Converts a user's voice into text.
🎤 "मला गणित शिकायचे आहे"
              ↓
            ASR
              ↓
"मला गणित शिकायचे आहे"

 * REST Endpoint: POST /{version}/asr
 * Bhashini.ai also provides a streaming WebSocket STT API for real-time transcription.
Conceptual Implementation (Python)
import requests

url = "https://.../{version}/asr"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

files = {
    "audio": open("audio.wav", "rb")
}

response = requests.post(
    url,
    headers=headers,
    files=files
)

print(response.json())

Note: The exact URL, authentication header, and request body depend on the API version/account you are using—do not use placeholder URLs in production.
Use Case Workflow
User speaks
     ↓
    ASR
     ↓
   Text
     ↓
LLM / Database / Application Logic

text = speech_to_text(audio)

4. Translation
This is the most commonly used feature.
Purpose
Translates text between supported language pairs:
 * Marathi → Hindi
 * Marathi → English
 * Hindi → Marathi
 * English → Marathi
 * Tamil → Hindi
 * REST Endpoint: POST /{version}/translate (Supports English → Indic, Indic → English, and Indic → Indic).
Conceptual Example
result = translate(
    text="मला अभ्यास करायचा आहे",
    source="mr",
    target="en"
)
# Result: "I want to study."

Backend Integration
def translate(text, source, target):
    # Call Bhashini API
    return translated_text

# Usage
english = translate(
    "मला गणित शिकायचे आहे",
    "mr",
    "en"
)

5. Text-to-Speech (TTS)
Converts written text into spoken audio output.
"नमस्कार, तुम्ही कसे आहात?"
              ↓
             TTS
              ↓
       Marathi audio

 * REST Endpoint: POST /{version}/synthesize
Conceptual Example
audio = text_to_speech(
    text="नमस्कार",
    language="mr"
)

Your application can then stream or return the generated audio file to the client.
6. Optical Character Recognition (OCR)
Extracts printed or handwritten text from images or documents.
📷 Photo
   ↓
 OCR
   ↓
"भारत माझा देश आहे..."

 * REST Endpoint: POST /{version}/ocr
 * Bhashini.ai also provides an OCR operation for creating searchable text PDFs from OCR XML.
Conceptual Example
def extract_text(image):
    # Send image to Bhashini OCR
    return extracted_text

# Usage
text = extract_text("textbook_page.jpg")

7. Transliteration
Converts text between different writing systems/scripts while maintaining phonetic pronunciation.
| Type | Source | Target |
|---|---|---|
| Translation | नमस्कार | Hello |
| Transliteration | नमस्कार | Namaskar |
 * REST Endpoint: POST /{version}/transliterate
 * Common Use Case: Marathi Devanagari → Roman/Latin representation.
8. Text Normalization
Standardizes raw or user-generated text into clean, canonical forms prior to downstream processing.
 * REST Endpoint: POST /{version}/normalize
normalized = normalize(text)

Useful when processing large volumes of unstructured user-generated Indic text.
9. Batch Translation
Process multiple strings within a single API request instead of making sequential calls.
Sequential Approach (Inefficient)
Text 1 → API
Text 2 → API
Text 3 → API

Batch Approach (Recommended)
[
  "Hello",
  "How are you?",
  "Good morning"
]
       ↓
   Bhashini
       ↓
[
  "नमस्कार",
  "तुम्ही कसे आहात?",
  "शुभ सकाळ"
]

 * REST Endpoint: POST /{version}/translate/batch
10. Document Translation
Translates structured document files while preserving overall formatting.
 * REST Endpoint: POST /{version}/translate/document
 * Supported Formats: HTML, DOC, DOCX, PDF
English PDF → Bhashini → Marathi PDF

11. Chaining Pipeline Methods
Combine individual services to build complex multi-modal capabilities like a voice translator.
Pipeline Architecture
User speaks Marathi
        ↓
       ASR
        ↓
Marathi text
        ↓
   Translation
        ↓
English text
        ↓
       TTS
        ↓
English audio

Backend Implementation
text = speech_to_text(audio)

translated = translate(
    text,
    source="mr",
    target="en"
)

audio = text_to_speech(
    translated,
    language="en"
)

12. Complete Real-World Example: Educational Assistant
📷 Marathi textbook page
           ↓
          OCR
           ↓
     Marathi text
           ↓
      Translation
           ↓
     English text
           ↓
   Your AI / Backend
           ↓
    Generate answer
           ↓
      Translation
           ↓
    Marathi answer
           ↓
          TTS
           ↓
    🔊 Marathi voice

13. Architecture Comparison: Bhashini.ai vs. Government Bhashini/ULCA
| Architecture Feature | Government Bhashini / ULCA | Bhashini.ai |
|---|---|---|
| Design Model | Pipeline-based architecture | Direct REST / WebSocket endpoints |
| Core Operations | Pipeline Search, Pipeline Config, Pipeline Compute | /asr, /translate, /synthesize, /ocr, etc. |
| Implementation | Dynamically evaluates and resolves appropriate models | Explicit functional endpoints |
14. Recommended Backend Architecture
Encapsulate all Bhashini integrations within a dedicated service module rather than dispersing API calls across your codebase.
Project Structure
backend/
├── main.py
├── services/
│   └── bhashini/
│       ├── client.py
│       ├── speech.py
│       ├── translation.py
│       ├── tts.py
│       └── ocr.py
└── .env

Module Implementations
 * speech.py: def speech_to_text(audio): ...
 * translation.py: def translate(text, source, target): ...
 * tts.py: def text_to_speech(text, language): ...
 * ocr.py: def extract_text(image): ...
Usage in Application Layer
text = speech_to_text(audio)
translated = translate(text, "mr", "en")
audio = text_to_speech(translated, "en")

Quick Reference Summary
Bhashini API
│
├── ASR / STT             (Audio → Text)
├── Translation           (Language A → Language B)
├── TTS                   (Text → Audio)
├── OCR                   (Image → Text)
├── Transliteration       (Script A → Script B)
├── Normalization         (Clean / Normalize Indic Text)
├── Batch Translation     (List of Texts → List of Translations)
└── Document Translation  (PDF/DOC/DOCX/HTML Document Translation)

Note: For real-time voice interaction, Bhashini.ai also provides WebSocket-based streaming STT/TTS APIs.
Resources & Documentation
 * Bhashini.ai API Swagger / OpenAPI
 * Bhashini.ai API Documentation
