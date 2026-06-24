"""
详情API路由 - 台球/棋牌全量数据
"""
from fastapi import APIRouter

from app.services.collectors.xiaotie import check_xiaotie_token
from app.services.detail_xiaotie import get_xiaotie_full_detail
from app.services.detail_wu_laoban import get_wu_laoban_full_detail

router = APIRouter()


@router.get("/detail/xiaotie")
def xiaotie_detail() -> dict:
    """
    台球全量详情：球桌状态、收入概览(月/年)、日均、每桌排行、会员TOP、
    时段分布、经营汇总、充值统计、VIP、评论、桌台异常、微信支付投诉
    """
    token_status = check_xiaotie_token()
    if not token_status.get("valid"):
        return {"error": "小铁 token 已失效，请重新抓取 token 后更新。"}
    detail = get_xiaotie_full_detail()
    if not detail:
        return {"error": "小铁 token 已失效，请重新抓取 token 后更新。"}
    return detail


@router.get("/detail/wu_laoban")
def wu_laoban_detail() -> dict:
    """
    棋牌全量详情：包间实时状态、今日/月/年收入、收入构成、各包间排名、订单统计
    """
    detail = get_wu_laoban_full_detail()
    if not detail:
        return {"error": "未配置token或获取失败"}
    return detail
