"""
预算数据API - 返回各业务月度/年度任务目标
数据来源：2026年翡翠城预算表 + 老板指定的台球任务
"""
from fastapi import APIRouter
from datetime import date

router = APIRouter()

# 预算数据（从Excel预算表提取）
BUDGET_DATA = {
    "cinema": {
        "name": "影院",
        "monthly": {
            1: 235274, 2: 720789, 3: 250326, 4: 243971,
            5: 251986, 6: 388340, 7: 470400, 8: 468509,
            9: 207771, 10: 292780, 11: 223383, 12: 242526
        },
        "annual": 3996054,
        "monthly_box_office": {
            1: 180200, 2: 583000, 3: 190800, 4: 159000,
            5: 190800, 6: 296800, 7: 371000, 8: 360400,
            9: 159000, 10: 222600, 11: 169600, 12: 190800
        },
        "annual_box_office": 3074000,
        "monthly_concession": {
            1: 25500, 2: 82500, 3: 27000, 4: 22500,
            5: 27000, 6: 42000, 7: 52500, 8: 51000,
            9: 22500, 10: 31500, 11: 24000, 12: 27000
        },
        "annual_concession": 435000
    },
    "billiards": {
        "name": "台球",
        "monthly": {
            1: 25000, 2: 25000, 3: 25000, 4: 25000,
            5: 25000, 6: 25000, 7: 25000, 8: 25000,
            9: 25000, 10: 25000, 11: 25000, 12: 25000
        },
        "annual": 300000
    },
    "mahjong": {
        "name": "棋牌",
        "monthly": {
            1: 11000, 2: 11000, 3: 11000, 4: 13000,
            5: 13000, 6: 14000, 7: 14000, 8: 20000,
            9: 11000, 10: 12000, 11: 10000, 12: 10000
        },
        "annual": 150000
    }
}


@router.get("/budget")
def get_budget() -> dict:
    """返回各业务预算数据"""
    today = date.today()
    month = today.month
    
    result = {}
    for biz_type, data in BUDGET_DATA.items():
        monthly_target = data["monthly"].get(month, 0)
        annual_target = data.get("annual", 0)
        
        result[biz_type] = {
            "name": data["name"],
            "monthly_target": monthly_target,
            "annual_target": annual_target,
        }
        
        # 影院额外返回票房和卖品预算
        if biz_type == "cinema":
            result[biz_type]["monthly_box_office_target"] = data["monthly_box_office"].get(month, 0)
            result[biz_type]["annual_box_office_target"] = data.get("annual_box_office", 0)
            result[biz_type]["monthly_concession_target"] = data["monthly_concession"].get(month, 0)
            result[biz_type]["annual_concession_target"] = data.get("annual_concession", 0)
    
    return {"data": result}
