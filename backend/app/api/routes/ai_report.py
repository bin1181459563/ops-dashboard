from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.models.schemas import ApiEnvelope
from app.services.ai_report import answer_ai_question, generate_daily_report

router = APIRouter()


class AiChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)


@router.get("/ai/daily-report")
def daily_report(request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=generate_daily_report(request.app.state.repository), source="api")


@router.post("/ai/chat")
def ai_chat(payload: AiChatRequest, request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=answer_ai_question(request.app.state.repository, payload.question), source="api")
