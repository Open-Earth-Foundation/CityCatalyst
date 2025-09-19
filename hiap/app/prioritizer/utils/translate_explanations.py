import os
import json
import glob
from openai import OpenAI
import sys

# Debug: Print execution context to verify the script is running
import os as _os
print(f"[script start] __name__={__name__}, file={__file__}, cwd={_os.getcwd()}")

sys.stdout.write("=== DEBUG LOG: translate_explanations.py loaded ===\n")
sys.stdout.flush()

print("DEBUG: translate_explanations starting...")
import dotenv
dotenv.load_dotenv()

# Initialize OpenAI client with API key
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Determine project root and data directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(ROOT_DIR, 'data', 'frontend')

def translate_text(text: str, target_lang: str, model: str = 'gpt-4.1') -> str:
    """Translate given text into the target language using OpenAI GPT-4.1"""
    print(f"[translate_text] Translating to {target_lang}: {text[:60]}...")
    messages = [
        {'role': 'system', 'content': 'You are an expert translator.'},
        {'role': 'user', 'content': f"Please translate the following text to {target_lang}:"},
        {'role': 'user', 'content': text}
    ]
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0
        )
    except Exception as e:
        print(f"[translate_text] Error during translation: {e}")
        return text
    translated = response.choices[0].message.content.strip()
    print(f"[translate_text] Result: {translated[:60]}...")
    return translated


def translate_file_explanations(file_path: str):
    """Load JSON file, translate each 'explanation' entry, and overwrite with translation."""
    print(f"[translate_file_explanations] Processing {file_path}")
    # Determine language from filename suffix
    if file_path.endswith('_es.json'):
        target_lang = 'Spanish'
    elif file_path.endswith('_pt.json'):
        target_lang = 'Portuguese'
    else:
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"[translate_file_explanations] Failed to load {file_path}: {e}")
        return
    print(f"[translate_file_explanations] Loaded {len(data)} entries")

    for entry in data:
        original = entry.get('explanation')
        if original:
            print(f"[translate_file_explanations] Original: {original[:60]}...")
            translated = translate_text(original, target_lang)
            print(f"[translate_file_explanations] Translated: {translated[:60]}...")
            entry['explanation'] = translated

    # Write translated data back to the same file
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[translate_file_explanations] Wrote updated data to {file_path}")
    except Exception as e:
        print(f"[translate_file_explanations] Failed to write {file_path}: {e}")


def main():
    # Find all files with '_es.json' or '_pt.json' in the frontend data directory
    pattern_es = os.path.join(DATA_DIR, '*_es.json')
    pattern_pt = os.path.join(DATA_DIR, '*_pt.json')
    files = glob.glob(pattern_es) + glob.glob(pattern_pt)
    print(f"[main] DATA_DIR={DATA_DIR}")
    print(f"[main] Found {len(files)} files: {files}")
    for file_path in files:
        print(f'Translating explanations in {file_path}')
        translate_file_explanations(file_path)


if __name__ == '__main__':
    print(f"[script __main__] __name__={__name__}")
    main()
