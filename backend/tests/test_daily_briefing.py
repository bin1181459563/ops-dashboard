from app.services.daily_briefing import (
    _build_image_overview_metrics,
    _classify_handover_image_line,
    _classify_inventory_image_line,
    _tag_palette,
    build_employee_lines,
    briefing_performance_date,
    build_inventory_alert_lines,
    collect_briefing_warnings,
    compose_message,
    filter_employee_performance,
    format_handover_task_line,
    render_briefing_image_png,
)

from datetime import date
from io import BytesIO

from PIL import Image


def test_inventory_alert_lines_match_dashboard_thresholds() -> None:
    items = [
        {
            "item_name": "三得利乌龙茶",
            "category": "瓶装饮料",
            "front_stock": 8,
            "wh_stock": 0,
            "threshold": 15,
            "status": "critical",
            "is_excluded": False,
        },
        {
            "item_name": "乐事薯片",
            "category": "零食",
            "front_stock": 8,
            "wh_stock": 36,
            "threshold": 10,
            "status": "warning",
            "is_excluded": False,
        },
        {
            "item_name": "22oz可乐杯",
            "category": "包材",
            "front_stock": 57,
            "wh_stock": 2700,
            "threshold": 50,
            "status": "ok",
            "is_excluded": False,
        },
        {
            "item_name": "百事可乐",
            "category": "瓶装饮料",
            "front_stock": 2,
            "wh_stock": 12,
            "threshold": 20,
            "status": "excluded",
            "is_excluded": True,
        },
    ]

    assert build_inventory_alert_lines(items) == [
        "• 三得利乌龙茶 → 前台8 / 大仓0",
        "• 乐事薯片 → 前台8",
    ]


def test_employee_performance_keeps_target_staff_and_drops_missing() -> None:
    employees = [
        {
            "name": "刘柯鑫",
            "package_count": 5,
            "activity_count": 6,
            "recharge_amount": 400,
            "open_count": 1,
        },
        {
            "name": "邓晓阗",
            "package_count": 2,
            "activity_count": 16,
            "recharge_amount": 200,
            "open_count": 0,
        },
        {
            "name": "张莎",
            "package_count": 1,
            "activity_count": 1,
            "recharge_amount": 0,
            "open_count": 0,
        },
    ]

    filtered = filter_employee_performance(employees)

    assert [employee["name"] for employee in filtered] == ["邓晓阗", "刘柯鑫"]
    assert build_employee_lines(filtered) == [
        "邓晓阗：套餐2份 / 活动16份 / 充值¥200 / 开卡0张",
        "刘柯鑫：套餐5份 / 活动6份 / 充值¥400 / 开卡1张",
    ]


def test_performance_date_follows_selected_briefing_target_date() -> None:
    assert briefing_performance_date(date(2026, 6, 29)) == date(2026, 6, 28)
    assert briefing_performance_date(date(2026, 6, 30)) == date(2026, 6, 29)


def test_booking_handover_uses_full_detail_when_title_is_truncated() -> None:
    task = {
        "type": "booking",
        "title": "gicd包场 6月28日 周日 6号厅（69人） 19:00-2",
        "detail": "gicd包场 6月28日 周日 6号厅（69人） 19:00-20:40 《All I wanna do》观影 20:40-21:10 映后",
    }

    assert format_handover_task_line(task) == "• 6月28日 6号厅 19:00-20:40 《All I wanna do》"


def test_booking_handover_keeps_multiple_show_times() -> None:
    task = {
        "type": "booking",
        "title": "四渡包场 6月29日 周一 8号厅 9:30-11:50 / 14:00-16:30",
        "detail": (
            "时间：2026年6月29日（周一）\n"
            "9:30-11:50  14:00-16:30\n"
            "影片：《四渡》-观影包场\n"
            "影厅：8号厅\n"
            "人次：整包"
        ),
    }

    assert format_handover_task_line(task) == "• 6月29日 8号厅 9:30-11:50 / 14:00-16:30 《四渡》"


def test_booking_handover_keeps_multiple_show_times_with_escaped_newlines_and_note() -> None:
    task = {
        "type": "booking",
        "title": "四渡包场 6月30日 周二 8号厅 9:30-11:50 / 14:00-16:30",
        "detail": (
            "时间：2026年6月30日（周二）\\n"
            "9:30-11:50 14:00-16:30\\n"
            "影片：《四渡》-观影包场\\n"
            "影厅：8号厅\\n"
            "备注：映后需要话筒"
        ),
    }

    assert format_handover_task_line(task) == "• 6月30日 8号厅 9:30-11:50 / 14:00-16:30 《四渡》"


def test_image_overview_uses_compact_metrics_without_tip() -> None:
    metrics = _build_image_overview_metrics(
        {
            "title": "明日班次 · 6月29日 周一",
            "weather": "Sunny 21-31℃",
            "film": ["首场 09:30 《影片》预售12人", "全天预售 88人 / 预测 176人"],
        }
    )

    assert metrics == [
        ("日期", "6月29日 周一"),
        ("天气", "Sunny 21-31℃"),
        ("首场", "09:30"),
        ("预售", "88人"),
        ("预测", "176人"),
    ]


def test_handover_image_line_adds_category_prefix() -> None:
    assert _classify_handover_image_line("6月28日 6号厅 19:00-20:40 《All I wanna do》") == (
        "包场",
        "6月28日 6号厅 19:00-20:40 《All I wanna do》",
    )
    assert _classify_handover_image_line("典映会 2号厅 6月28号（周日）晚 19:00-22:10") == (
        "包场",
        "典映会 2号厅 6月28号（周日）晚 19:00-22:10",
    )
    assert _classify_handover_image_line("活动套餐改名为暑期套餐") == ("活动", "活动套餐改名为暑期套餐")


def test_inventory_image_line_shortens_long_cup_name() -> None:
    assert _classify_inventory_image_line("98-18A PET冷饮杯 → 前台18") == ("补", "冷饮杯 → 前台18")


def test_inventory_image_line_keeps_low_warehouse_stock() -> None:
    assert _classify_inventory_image_line("星巴克咖啡 → 前台6 / 大仓4") == ("补", "星巴克咖啡 → 前台6 / 大仓4")


def test_tag_palette_supports_row_cards_and_row_variation() -> None:
    normal = _tag_palette("补", "白糖 → 前台2821", 1)
    alternate = _tag_palette("补", "焦糖 → 前台2846", 2)
    blocked = _tag_palette("补", "星巴克咖啡 → 前台6 / 大仓4", 3)

    assert normal["card"] == alternate["card"]
    assert normal["line"] == alternate["line"]
    assert normal["ink"] == alternate["ink"]
    assert blocked["ink"] == "#b42318"
    assert blocked["line"] != normal["line"]


def test_briefing_warnings_stay_out_of_employee_message() -> None:
    sections = {
        "schedule": {"early": [], "middle": [], "late": [], "rest": []},
        "weather": "天气暂无",
        "cinema": {"first_time": "无", "first_film": "无", "first_presale": 0, "total_presale": 0},
        "prediction": 0,
        "handover": [],
        "inventory": [],
        "employees": [],
        "activity": ["🎯 活动套票：买票送爆米花+饮料", "💡 前台默认出活动套票，不用询问顾客"],
    }

    warnings = collect_briefing_warnings(sections)
    message = compose_message(date(2026, 6, 29), date(2026, 6, 27), sections)

    assert "未找到目标日期排班" in warnings
    assert any("影讯暂无" in warning for warning in warnings)
    assert "昨日业绩暂无可展示员工数据" in warnings
    assert "昨日业绩暂无可展示员工数据" not in message
    assert "📊 昨日业绩" not in message


def test_render_briefing_image_png_returns_png_bytes() -> None:
    image = render_briefing_image_png(
        "\n".join(
            [
                "📅 明日班次 · 6月29日 周一",
                "🌤 Sunny 20-32℃",
                "",
                "班次安排",
                "早班：杨高峰、曹丽梅",
                "",
                "📊 昨日业绩（6月28日）",
                "邓晓阗：套餐2份 / 活动16份 / 充值¥200 / 开卡0张",
            ]
        )
    )

    assert image.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(image) > 1000
    rendered = Image.open(BytesIO(image))
    assert rendered.size == (1672, 941)
