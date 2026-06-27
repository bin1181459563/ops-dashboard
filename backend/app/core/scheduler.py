from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.tasks.collect_job import CollectionJob


def create_scheduler(job: CollectionJob) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
    
    # 每天凌晨00:10采集前一天数据
    scheduler.add_job(
        job.run_yesterday,
        CronTrigger(hour=0, minute=10),
        id="collect_job",
        max_instances=1,
        replace_existing=True,
    )
    
    return scheduler
