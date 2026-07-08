from openai import OpenAI
from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API_KEY)
    return _client
