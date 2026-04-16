import ipaddress
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader


@dataclass(slots=True)
class LoadedSection:
    text: str
    page_number: int | None
    metadata: dict


@dataclass(slots=True)
class LegalDocumentPayload:
    title: str
    source_uri: str | None
    mime_type: str
    sections: list[LoadedSection]
    metadata_json: dict


_BLOCKED_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1"})


def _validate_url_for_ssrf(url: str) -> None:
    """Prevent SSRF by rejecting requests to private/internal addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"URL scheme '{parsed.scheme}' is not allowed. Only http and https are permitted.")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("URL must contain a valid hostname.")
    if hostname in _BLOCKED_HOSTNAMES:
        raise ValueError("Requests to localhost or loopback addresses are not allowed.")
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ValueError("Requests to private or reserved IP addresses are not allowed.")
    except ValueError as exc:
        if "not allowed" in str(exc) or "reserved" in str(exc) or "private" in str(exc):
            raise
        # hostname is a domain name, not a literal IP — allowed


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def load_pdf(path: str, title: str | None = None, metadata_json: dict | None = None) -> LegalDocumentPayload:
    reader = PdfReader(path)
    sections: list[LoadedSection] = []
    for index, page in enumerate(reader.pages, start=1):
        text = _normalize_text(page.extract_text() or "")
        if text:
            sections.append(LoadedSection(text=text, page_number=index, metadata={"page_number": index}))
    resolved_title = title or Path(path).stem
    return LegalDocumentPayload(
        title=resolved_title,
        source_uri=str(Path(path)),
        mime_type="application/pdf",
        sections=sections,
        metadata_json=metadata_json or {},
    )


def load_html_bytes(content: bytes, *, source_uri: str | None, title: str | None, metadata_json: dict | None = None) -> LegalDocumentPayload:
    soup = BeautifulSoup(content, "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.extract()
    page_title = title or (soup.title.string.strip() if soup.title and soup.title.string else "HTML Legal Material")
    sections: list[LoadedSection] = []
    for idx, node in enumerate(soup.find_all(["h1", "h2", "h3", "p", "li"])):
        text = _normalize_text(node.get_text(" ", strip=True))
        if len(text) >= 40:
            sections.append(LoadedSection(text=text, page_number=None, metadata={"html_section_index": idx}))
    if not sections:
        text = _normalize_text(soup.get_text(" ", strip=True))
        if text:
            sections.append(LoadedSection(text=text, page_number=None, metadata={}))
    return LegalDocumentPayload(
        title=page_title,
        source_uri=source_uri,
        mime_type="text/html",
        sections=sections,
        metadata_json=metadata_json or {},
    )


async def load_from_url(url: str, title: str | None = None, metadata_json: dict | None = None) -> LegalDocumentPayload:
    _validate_url_for_ssrf(url)
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        response = await client.get(url)
        response.raise_for_status()
    guessed_title = title or urlparse(url).path.rsplit("/", maxsplit=1)[-1] or "Legal Material"
    return load_html_bytes(
        response.content,
        source_uri=url,
        title=guessed_title,
        metadata_json=metadata_json,
    )

