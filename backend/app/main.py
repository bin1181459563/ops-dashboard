from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai_report, alerts, automation, budget, cinema, collect, concession, concession_recommendations, customer, customer_wake_up, daily_briefing, data_sources, db_detail, detail, employee, employee_coach, finance, inventory_alert, member, overview, realtime, quick_stats, screening_suggestions, sync_logs, trend, data_quality, ai_insights, audit
from app.core.config import settings
from app.core.database import DashboardRepository
from app.core.scheduler import create_scheduler
from app.tasks.collect_job import CollectionJob


def create_app(db_path: str | Path | None = None, start_scheduler: bool = True) -> FastAPI:
    app = FastAPI(title="Ops Dashboard MVP")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 允许所有来源，支持局域网访问
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    repository = DashboardRepository(db_path or settings.database_path)
    repository.initialize()
    repository.initialize_finance_tables()
    collection_job = CollectionJob(repository)
    app.state.repository = repository
    app.state.collection_job = collection_job
    app.state.scheduler = None

    app.include_router(overview.router, prefix="/api")
    app.include_router(realtime.router, prefix="/api")
    app.include_router(alerts.router, prefix="/api")
    app.include_router(collect.router, prefix="/api")
    app.include_router(trend.router, prefix="/api")
    app.include_router(detail.router, prefix="/api")
    app.include_router(cinema.router, prefix="/api")
    app.include_router(concession.router, prefix="/api")
    app.include_router(data_sources.router, prefix="/api")
    app.include_router(sync_logs.router, prefix="/api")
    app.include_router(ai_report.router, prefix="/api")
    app.include_router(automation.router, prefix="/api")
    app.include_router(customer.router, prefix="/api")
    app.include_router(employee.router, prefix="/api")
    app.include_router(data_quality.router, prefix="/api")
    app.include_router(ai_insights.router, prefix="/api")
    app.include_router(audit.router, prefix="/api")
    app.include_router(customer_wake_up.router, prefix="/api")
    app.include_router(daily_briefing.router, prefix="/api")
    app.include_router(employee_coach.router, prefix="/api")
    app.include_router(screening_suggestions.router, prefix="/api")
    app.include_router(concession_recommendations.router, prefix="/api")
    app.include_router(finance.router, prefix="/api")
    app.include_router(member.router, prefix="/api")
    app.include_router(inventory_alert.router, prefix="/api")
    app.include_router(budget.router, prefix="/api")
    app.include_router(quick_stats.router, prefix="/api")
    app.include_router(db_detail.router, prefix="/api")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if start_scheduler and settings.auto_collect_enabled:
        scheduler = create_scheduler(collection_job)
        scheduler.start()
        app.state.scheduler = scheduler

        @app.on_event("shutdown")
        def shutdown_scheduler() -> None:
            if app.state.scheduler:
                app.state.scheduler.shutdown(wait=False)

    return app


app = create_app()
