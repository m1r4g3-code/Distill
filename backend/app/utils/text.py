def sanitize_text(text: str) -> str:
    """Remove null bytes and non-printable characters from text."""
    if not text:
        return ""
    text = text.replace('\x00', '')
    text = ''.join(
        c for c in text
        if ord(c) >= 32 or c in '\n\t\r'
    )
    text = text.encode('utf-8', errors='ignore').decode('utf-8')
    return text.strip()
