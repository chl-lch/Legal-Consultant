import json
from collections.abc import AsyncGenerator
from dataclasses import asdict, dataclass
from typing import Union

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.services.llm.factory import get_chat_llm, get_streaming_chat_llm
from app.services.retrieval.hybrid import HybridRetriever
from app.services.retrieval.types import RetrievedChunk


INTENT_SYSTEM_PROMPTS = {
    "statute_lookup": (
        "You are a legal research assistant focused on statute lookup. "
        "Use the retrieval tool before answering. Quote or paraphrase only from retrieved sources. "
        "Cite every substantive claim in square brackets with document title and chunk index."
    ),
    "clause_extraction": (
        "You extract contractual clauses and explain them. "
        "Use the retrieval tool, return the exact or near exact clause wording when available, "
        "and cite each extracted clause."
    ),
    "document_summarisation": (
        "You produce concise document summaries for legal operators. "
        "Use the retrieval tool to gather the most relevant chunks, then summarize the document scope, "
        "key obligations, deadlines, and exceptions with citations."
    ),
    "risk_assessment": (
        "You assess legal risk conservatively. "
        "Use the retrieval tool, identify specific risks, explain why they matter, "
        "and include a short 'Not legal advice' disclaimer at the end."
    ),
}


class RetrievalInput(BaseModel):
    query: str = Field(min_length=3)
    top_k: int = Field(default=6, ge=1, le=12)


class MetadataInput(BaseModel):
    document_ids: list[str] = Field(default_factory=list)


@dataclass(slots=True)
class WorkflowResult:
    answer: str
    retrievals: list[RetrievedChunk]


class IntentWorkflowEngine:
    def __init__(self, retriever: HybridRetriever) -> None:
        self.retriever = retriever

    async def run(
        self,
        *,
        intent: str,
        query: str,
        top_k: int,
        document_ids: list,
        history: list[dict] | None = None,
        refinement_prompt: str | None = None,
    ) -> WorkflowResult:
        retrievals = self.retriever.search(query, top_k=top_k, document_ids=document_ids)
        formatted_history = "\n".join(
            f"{item.get('role', 'user')}: {item.get('content', '')}" for item in (history or [])
        )

        def retrieve_legal_context(query: str, top_k: int = 6) -> str:
            results = self.retriever.search(query, top_k=top_k, document_ids=document_ids)
            return json.dumps([chunk.to_dict() for chunk in results], ensure_ascii=True, indent=2)

        def get_document_metadata(document_ids: list[str]) -> str:
            known = [
                {
                    "document_id": chunk.document_id,
                    "document_title": chunk.document_title,
                    "source_uri": chunk.source_uri,
                }
                for chunk in retrievals
                if not document_ids or chunk.document_id in document_ids
            ]
            return json.dumps(known, ensure_ascii=True, indent=2)

        tools = [
            StructuredTool.from_function(
                func=retrieve_legal_context,
                name="retrieve_legal_context",
                description="Retrieve relevant legal chunks and citations for a user query.",
                args_schema=RetrievalInput,
            ),
            StructuredTool.from_function(
                func=get_document_metadata,
                name="get_document_metadata",
                description="Return document metadata for documents already in the retrieval set.",
                args_schema=MetadataInput,
            ),
        ]
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", INTENT_SYSTEM_PROMPTS[intent]),
                (
                    "system",
                    "Initial retrieved context:\n{initial_context}\n\n"
                    "Use tools if you need more precise evidence. "
                    "If evidence is insufficient, say so explicitly.",
                ),
                ("system", "Conversation history:\n{conversation_history}"),
                (
                    "system",
                    "Refinement notes: {refinement_prompt}",
                ),
                ("human", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )
        llm = get_chat_llm()
        agent = create_tool_calling_agent(llm, tools, prompt)
        executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
        response = await executor.ainvoke(
            {
                "input": query,
                "initial_context": json.dumps([asdict(item) for item in retrievals], ensure_ascii=True, indent=2),
                "conversation_history": formatted_history or "No prior history.",
                "refinement_prompt": refinement_prompt or "None",
            }
        )
        return WorkflowResult(answer=response["output"], retrievals=retrievals)

    async def stream_run(
        self,
        *,
        intent: str,
        query: str,
        top_k: int,
        document_ids: list,
        history: list[dict] | None = None,
        refinement_prompt: str | None = None,
    ) -> AsyncGenerator[Union[str, WorkflowResult], None]:
        """Yield token strings while streaming, then yield a final WorkflowResult."""
        retrievals = self.retriever.search(query, top_k=top_k, document_ids=document_ids)
        formatted_history = "\n".join(
            f"{item.get('role', 'user')}: {item.get('content', '')}" for item in (history or [])
        )

        def retrieve_legal_context(query: str, top_k: int = 6) -> str:
            results = self.retriever.search(query, top_k=top_k, document_ids=document_ids)
            return json.dumps([chunk.to_dict() for chunk in results], ensure_ascii=True, indent=2)

        def get_document_metadata(document_ids: list[str]) -> str:
            known = [
                {"document_id": c.document_id, "document_title": c.document_title, "source_uri": c.source_uri}
                for c in retrievals
                if not document_ids or c.document_id in document_ids
            ]
            return json.dumps(known, ensure_ascii=True, indent=2)

        tools = [
            StructuredTool.from_function(
                func=retrieve_legal_context,
                name="retrieve_legal_context",
                description="Retrieve relevant legal chunks and citations for a user query.",
                args_schema=RetrievalInput,
            ),
            StructuredTool.from_function(
                func=get_document_metadata,
                name="get_document_metadata",
                description="Return document metadata for documents already in the retrieval set.",
                args_schema=MetadataInput,
            ),
        ]
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", INTENT_SYSTEM_PROMPTS[intent]),
                ("system", "Initial retrieved context:\n{initial_context}\n\nUse tools if you need more precise evidence."),
                ("system", "Conversation history:\n{conversation_history}"),
                ("system", "Refinement notes: {refinement_prompt}"),
                ("human", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )
        llm = get_streaming_chat_llm()
        agent = create_tool_calling_agent(llm, tools, prompt)
        executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
        inputs = {
            "input": query,
            "initial_context": json.dumps([asdict(item) for item in retrievals], ensure_ascii=True, indent=2),
            "conversation_history": formatted_history or "No prior history.",
            "refinement_prompt": refinement_prompt or "None",
        }

        collected: list[str] = []
        async for event in executor.astream_events(inputs, version="v2"):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                # Skip tool-call chunks (they have empty content)
                if isinstance(chunk.content, str) and chunk.content:
                    collected.append(chunk.content)
                    yield chunk.content

        yield WorkflowResult(answer="".join(collected), retrievals=retrievals)
