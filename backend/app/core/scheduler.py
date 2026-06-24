from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.tasks.collect_job import CollectionJob


def create_scheduler(job: CollectionJob) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        job.run_once,
        "interval",
        minutes=settings.collect_interval_minutes,
        id="collect_job",
        max_instances=1,
        replace_existing=True,
    )
    return scheduler

