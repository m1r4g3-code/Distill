import json
import google.generativeai as genai
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

    genai.configure(api_key=settings.gemini_api_key)
    
    # We use gemini-1.5-flash for speed and cost-efficiency in MVP
    model = genai.GenerativeModel('gemini-1.5-flash')

    system_prompt = (
        "You are an expert data extractor. You will be provided with webpage content in Markdown format. "
        "Your goal is to extract specific information as requested by the user and return it in valid JSON format. "
        "Do not include any preamble or explanation, only the JSON object."
    )

    if schema:
        system_prompt += f"\n\nThe extracted data MUST strictly follow this JSON schema: {json.dumps(schema)}"

    user_input = f"User Request: {prompt}\n\nWebpage Content:\n{content}"

    try:
        # Use generate_content for extraction
        # Note: In a more advanced version, we could use Gemini's structured output features (response_mime_type: application/json)
        response = model.generate_content(
            f"{system_prompt}\n\n{user_input}",
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json"
            )
        )
        
        if not response.text:
            raise LLMExtractionError("Gemini returned an empty response.")
            
        return json.loads(response.text)
    except Exception as e:
        raise LLMExtractionError(f"Failed to extract data using Gemini: {str(e)}")
