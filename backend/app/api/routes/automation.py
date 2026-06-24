from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, Field

from app.models.schemas import ApiEnvelope
from app.services.hermes_automation import build_automation_prompt, execute_automation_task

router = APIRouter()


class AutomationTaskRequest(BaseModel):
    task_type: str = Field(..., min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    venue: str = Field("全场馆", max_length=80)
    prompt: str | None = Field(default=None, max_length=4000)


@router.post("/automation/tasks")
def create_automation_task(payload: AutomationTaskRequest, request: Request, background_tasks: BackgroundTasks) -> ApiEnvelope:
    prompt = build_automation_prompt(payload.task_type, payload.title, payload.venue, payload.prompt)
    task = request.app.state.repository.create_automation_task(payload.task_type, payload.title, payload.venue, prompt)
    background_tasks.add_task(execute_automation_task, request.app.state.repository, task["id"])
    return ApiEnvelope(data=task, source="api")


@router.get("/automation/tasks")
def list_automation_tasks(request: Request, limit: int = 20) -> ApiEnvelope:
    return ApiEnvelope(data={"tasks": request.app.state.repository.latest_automation_tasks(limit)}, source="api")
