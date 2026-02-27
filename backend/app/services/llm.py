import json
from google import genai
from google.genai import types
from typing import Any, Dict, Optional
from app.config import settings

class LLMExtractionError(Exception):
    pass

async def extract_structured_data(
    content: str, 
    prompt: str, 
    schema: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Uses Gemini to extract structured JSON from the provided content based on a prompt and optional schema.
    """
    if not settings.gemini_api_key:
        raise LLMExtractionError("GEMINI_API_KEY is not configured.")

    client = genai.Client(api_key=settings.gemini_api_key)
    
    system_prompt = (
        "You are an expert data extractor. You will be provided with webpage content in Markdown format. "
        "Your goal is to extract specific information as requested by the user and return it in valid JSON format. "
        "Do not include any preamble or explanation, only the JSON object."
    )

    if schema:
        system_prompt += f"\n\nThe extracted data MUST strictly follow this JSON schema: {json.dumps(schema)}"

    user_input = f"User Request: {prompt}\n\nWebpage Content:\n{content}"

    try:
        # Use generate_content with the new SDK patterns
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=user_input,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json"
            )
        )
        
        if not response.text:
            raise LLMExtractionError("Gemini returned an empty response.")
            
        return json.loads(response.text)
    except Exception as e:
        raise LLMExtractionError(f"Failed to extract data using Gemini: {str(e)}")
