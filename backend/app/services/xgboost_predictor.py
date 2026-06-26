"""
XGBoost 收入预测模型
基于历史数据训练，预测未来收入和人次
"""

import json
import pickle
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error

from app.core.database import DashboardRepository


# 模型存储路径
MODEL_DIR = Path(__file__).parent.parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)


def _now_beijing() -> datetime:
    return datetime.now(timezone(timedelta(hours=8)))


def _get_daily_revenues(
    repo: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
    days: int = 180,
) -> list[dict]:
    """获取每日收入数据"""
    snapshots = repo.daily_snapshots_for(business_type, platform, store_id, days)
    result = []
    for snap in snapshots:
        raw = snap.get("raw_json") or {}
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}

        date_str = snap.get("date", "")
        revenue = 0
        order_count = 0

        if business_type == "billiards":
            summary = raw.get("summary", {})
            revenue = float(summary.get("total_amount", 0) or 0)
            order_count = int(summary.get("order_count", 0) or 0)
        elif business_type == "mahjong":
            overview = raw.get("overview", {})
            revenue = float(overview.get("paid_amount", 0) or 0)
            order_count = int(overview.get("orders", 0) or 0)
        elif business_type == "cinema":
            summary = raw.get("summary", {})
            revenue = float(summary.get("revenue", 0) or 0)
            order_count = int(summary.get("customer_count", 0) or 0)

        if date_str:
            result.append({
                "date": date_str,
                "revenue": revenue,
                "order_count": order_count,
            })

    result.sort(key=lambda x: x["date"])
    return result


def _create_features(data: list[dict], box_office_data: dict = None) -> tuple[np.ndarray, np.ndarray]:
    """
    创建特征矩阵和目标变量
    特征：
    1. 星期几（0-6）
    2. 是否周末
    3. 是否节假日（简化版）
    4. 前7天收入（滞后特征）
    5. 前7天平均收入
    6. 前30天平均收入
    7. 收入趋势（7天线性回归斜率）
    8. 大盘票房（如果有）
    """
    if len(data) < 30:
        return np.array([]), np.array([])
    
    features = []
    targets = []
    
    for i in range(30, len(data)):
        row = data[i]
        date = datetime.fromisoformat(row["date"])
        
        # 基础特征
        weekday = date.weekday()
        is_weekend = 1 if weekday >= 5 else 0
        is_holiday = 0  # 简化版，可以后续扩展
        
        # 滞后特征（前7天收入）
        lag_7 = [data[i-j]["revenue"] for j in range(1, 8)]
        lag_7_avg = np.mean(lag_7)
        lag_30_avg = np.mean([data[i-j]["revenue"] for j in range(1, min(31, i+1))])
        
        # 趋势特征（7天线性回归斜率）
        if len(lag_7) >= 2:
            x = np.arange(len(lag_7))
            slope = np.polyfit(x, lag_7, 1)[0]
        else:
            slope = 0
        
        # 大盘票房特征
        box_office = 0
        if box_office_data and row["date"] in box_office_data:
            box_office = box_office_data[row["date"]].get("total_box", 0)
        
        # 大盘衍生特征
        all_boxes = [v.get("total_box", 0) for v in box_office_data.values() if v.get("total_box", 0) > 0] if box_office_data else []
        box_avg_30 = sum(all_boxes[-30:]) / min(30, len(all_boxes)) if all_boxes else 1
        box_ratio = box_office / box_avg_30 if box_avg_30 > 0 else 1.0
        
        feature = [
            weekday,
            is_weekend,
            is_holiday,
            *lag_7,  # 前7天收入
            lag_7_avg,
            lag_30_avg,
            slope,
            box_office,
            box_ratio,  # 大盘相对比率
        ]
        
        features.append(feature)
        targets.append(row["revenue"])
    
    return np.array(features), np.array(targets)


def train_model(
    repo: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
    box_office_data: dict = None,
) -> dict:
    """
    训练 XGBoost 模型
    """
    # 获取历史数据
    data = _get_daily_revenues(repo, business_type, platform, store_id, 180)
    
    if len(data) < 60:
        return {
            "status": "error",
            "message": f"数据不足，需要至少60天，当前{len(data)}天",
        }
    
    # 创建特征
    X, y = _create_features(data, box_office_data)
    
    if len(X) == 0:
        return {
            "status": "error",
            "message": "特征创建失败",
        }
    
    # 训练模型（调整参数，增大大盘票房权重）
    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=4,  # 降低复杂度防过拟合
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,  # L1正则化
        reg_lambda=1.0,  # L2正则化
        random_state=42,
    )
    
    # 时间序列交叉验证
    tscv = TimeSeriesSplit(n_splits=5)
    cv_scores = []
    
    for train_idx, val_idx in tscv.split(X):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )
        
        y_pred = model.predict(X_val)
        mae = mean_absolute_error(y_val, y_pred)
        cv_scores.append(mae)
    
    # 用全部数据重新训练
    model.fit(X, y)
    
    # 保存模型
    model_path = MODEL_DIR / f"xgboost_{business_type}_{platform}_{store_id}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    
    # 计算特征重要性
    feature_names = [
        "weekday", "is_weekend", "is_holiday",
        *[f"lag_{i}" for i in range(1, 8)],
        "lag_7_avg", "lag_30_avg", "slope", "box_office",
    ]
    importance = dict(zip(feature_names, model.feature_importances_.tolist()))
    
    return {
        "status": "ok",
        "model_path": str(model_path),
        "data_days": len(data),
        "training_samples": len(X),
        "cv_mae": round(np.mean(cv_scores), 2),
        "cv_std": round(np.std(cv_scores), 2),
        "feature_importance": importance,
    }


def predict_with_xgboost(
    repo: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
    days: int = 7,
    box_office_predictions: list[dict] = None,
) -> dict:
    """
    使用 XGBoost 模型预测未来收入
    """
    # 加载模型
    model_path = MODEL_DIR / f"xgboost_{business_type}_{platform}_{store_id}.pkl"
    if not model_path.exists():
        return {
            "status": "error",
            "message": "模型未训练，请先调用训练接口",
        }
    
    with open(model_path, "rb") as f:
        model = pickle.load(f)
    
    # 获取最近数据用于特征构建
    data = _get_daily_revenues(repo, business_type, platform, store_id, 60)
    
    if len(data) < 30:
        return {
            "status": "error",
            "message": "历史数据不足，无法预测",
        }
    
    # 从数据库获取大盘数据
    box_office_data = repo.get_box_office_dict(days=90)
    
    # 如果有未来大盘预测，合并到数据中
    if box_office_predictions:
        for pred in box_office_predictions:
            box_office_data[pred["date"]] = {"total_box": pred["total_box"]}
    
    # 预测未来N天
    predictions = []
    current_data = data.copy()
    
    # 计算起始日期（历史数据最后一天的下一天）
    last_history_date = datetime.fromisoformat(current_data[-1]["date"])
    
    # 计算市占率（按星期几分别计算）
    weekday_shares = {i: [] for i in range(7)}
    if box_office_data:
        for cinema_day in data[-60:]:
            if cinema_day["date"] in box_office_data:
                box = box_office_data[cinema_day["date"]].get("total_box", 0)
                if box > 0 and cinema_day["revenue"] > 0:
                    dt = datetime.fromisoformat(cinema_day["date"])
                    weekday_shares[dt.weekday()].append(cinema_day["revenue"] / (box * 10000))
    
    weekday_market_share = {}
    for wd in range(7):
        if weekday_shares[wd]:
            weekday_market_share[wd] = sum(weekday_shares[wd]) / len(weekday_shares[wd])
        else:
            weekday_market_share[wd] = 0.000073  # 默认0.0073%
    
    # 计算平均票价
    total_rev = sum(d["revenue"] for d in data if d["revenue"] > 0)
    total_cnt = sum(d["order_count"] for d in data if d["revenue"] > 0)
    avg_ticket_price = total_rev / total_cnt if total_cnt > 0 else 40
    
    # 按星期几计算历史平均收入（用于无大盘数据时）
    weekday_avg_revenue = {i: [] for i in range(7)}
    for d in data[-60:]:
        dt = datetime.fromisoformat(d["date"])
        if d["revenue"] > 0:
            weekday_avg_revenue[dt.weekday()].append(d["revenue"])
    
    weekday_avg = {}
    for wd in range(7):
        if weekday_avg_revenue[wd]:
            weekday_avg[wd] = sum(weekday_avg_revenue[wd]) / len(weekday_avg_revenue[wd])
        else:
            weekday_avg[wd] = 5000  # 默认5000元
    
    for i in range(0, days + 1):
        # 构建特征
        if len(current_data) < 30:
            break
        
        # 获取最近30天数据
        recent = current_data[-30:]
        
        # 构建特征向量（从起始日期连续推算）
        pred_date = last_history_date + timedelta(days=i)
        
        weekday = pred_date.weekday()
        is_weekend = 1 if weekday >= 5 else 0
        is_holiday = 0
        
        # 滞后特征（使用最近7天的实际/预测值）
        lag_7 = [current_data[-j]["revenue"] for j in range(1, 8)]
        lag_7_avg = np.mean(lag_7)
        lag_30_avg = np.mean([current_data[-j]["revenue"] for j in range(1, min(31, len(current_data)+1))])
        
        # 趋势特征
        if len(lag_7) >= 2:
            x = np.arange(len(lag_7))
            slope = np.polyfit(x, lag_7, 1)[0]
        else:
            slope = 0
        
        # 大盘票房（只用数据库中真实存在的数据）
        pred_date_str = pred_date.date().isoformat()
        box_office = 0
        if pred_date_str in box_office_data:
            box_office = box_office_data[pred_date_str].get("total_box", 0)
        
        # 大盘衍生特征
        all_boxes = [v.get("total_box", 0) for v in box_office_data.values() if v.get("total_box", 0) > 0]
        box_avg_30 = sum(all_boxes[-30:]) / min(30, len(all_boxes)) if all_boxes else 1
        box_ratio = box_office / box_avg_30 if box_avg_30 > 0 else 1.0  # 相对30天平均的比率
        
        feature = np.array([[
            weekday,
            is_weekend,
            is_holiday,
            *lag_7,
            lag_7_avg,
            lag_30_avg,
            slope,
            box_office,
            box_ratio,  # 大盘相对比率
        ]])
        
        # 预测
        pred_revenue = max(0, float(model.predict(feature)[0]))
        
        # 大盘预测法（如果有大盘数据）
        box_pred_revenue = 0
        if box_office > 0:
            market_share = weekday_market_share.get(weekday, 0.000073)
            box_pred_revenue = box_office * market_share * 10000  # 万元→元
        
        # 混合预测
        if box_pred_revenue > 0:
            # 有大盘数据：大盘法权重80%
            final_revenue = box_pred_revenue * 0.8 + pred_revenue * 0.2
        else:
            # 无大盘数据：参考前一天收入，根据星期变化调整
            prev_revenue = current_data[-1]["revenue"] if current_data else 0
            prev_date = datetime.fromisoformat(current_data[-1]["date"]) if current_data else pred_date - timedelta(days=1)
            prev_weekday = prev_date.weekday()
            
            # 根据前一天和当天的星期几计算衰减系数
            if prev_weekday == 6 and weekday == 0:  # 周日→周一
                decay = 0.30
            elif prev_weekday == 5 and weekday == 6:  # 周六→周日
                decay = 0.80
            elif prev_weekday == 3 and weekday == 4:  # 周四→周五
                decay = 2.0
            elif weekday == 0:  # 其他→周一
                decay = 0.35
            elif weekday >= 5:  # 其他→周末
                decay = 1.5
            else:  # 工作日→工作日
                decay = 0.90
            
            final_revenue = prev_revenue * decay
        
        predictions.append({
            "date": pred_date_str,
            "predicted": round(final_revenue, 1),
            "predicted_revenue": round(final_revenue, 1),
            "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekday],
            "range_low": round(final_revenue * 0.85, 1),
            "range_high": round(final_revenue * 1.15, 1),
            "confidence": "high",
            "model": "xgboost",
            "predicted_audience": round(final_revenue / avg_ticket_price) if avg_ticket_price > 0 else 0,
        })
        
        # 将预测值加入数据，用于下一天的滞后特征
        current_data.append({
            "date": pred_date_str,
            "revenue": final_revenue,  # 用混合后的最终值
            "order_count": 0,
        })
    
    return {
        "status": "ok",
        "business_type": business_type,
        "predictions": predictions,
        "model": "xgboost",
    }


def get_model_info(business_type: str, platform: str, store_id: str) -> dict:
    """获取模型信息"""
    model_path = MODEL_DIR / f"xgboost_{business_type}_{platform}_{store_id}.pkl"
    
    if not model_path.exists():
        return {
            "status": "not_found",
            "message": "模型未训练",
        }
    
    # 获取文件信息
    stat = model_path.stat()
    
    return {
        "status": "ok",
        "model_path": str(model_path),
        "file_size_kb": round(stat.st_size / 1024, 1),
        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }
