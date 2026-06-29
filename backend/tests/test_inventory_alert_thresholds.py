from app.api.routes.inventory_alert import ThresholdConfig, get_threshold
from app.services.collectors.fenghuang import collect_inventory


def test_exact_product_threshold_wins_over_generic_keyword() -> None:
    config = ThresholdConfig(
        thresholds={
            "可乐": 100,
            "22oz可乐杯": 50,
            "饼干": 20,
            "小马宝莉印花饼干（奶油味）": 3,
        },
        default_threshold=20,
        excluded_products=[],
    )

    assert get_threshold("22oz可乐杯", config) == 50
    assert get_threshold("小马宝莉印花饼干（奶油味）", config) == 3


def test_excluded_product_wins_over_thresholds() -> None:
    config = ThresholdConfig(
        thresholds={"可乐": 100, "百事可乐": 10},
        default_threshold=20,
        excluded_products=["百事可乐"],
    )

    assert get_threshold("百事可乐", config) == -1


def test_fenghuang_inventory_items_include_alert_compatible_stock_fields(monkeypatch) -> None:
    def fake_goods_get(path, params, token):
        return {
            "code": "ok",
            "data": {
                "data": [
                    {
                        "itemName": "昆仑山矿泉水",
                        "itemCode": "WATER",
                        "firstClassName": "瓶装饮料",
                        "itemQuantity": 12,
                        "posPrice": 10,
                        "costWithTax": 3,
                        "costNoTax": 2.8,
                    }
                ]
            },
        }

    monkeypatch.setattr("app.services.collectors.fenghuang._goods_get", fake_goods_get)

    item = collect_inventory("token")[0]

    assert item["quantity"] == 12
    assert item["stock_quantity"] == 12
    assert item["stock_cost"] == 36
