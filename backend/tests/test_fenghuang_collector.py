from app.services.collectors.fenghuang import collect_fenghuang_raw, collect_member_payment, collect_schedule_detail


def _member_payment_row(card_no: str, amount: int) -> dict:
    return {
        "columnValueMap": {
            "cardTypeName": "储值卡",
            "cardNo": card_no,
            "payItemName": "电影票",
            "payItemType": "影票",
            "totalAmt": amount,
            "itemPrice": amount,
            "payDateTime": "2026-06-28 14:10:00",
            "showDateTime": "2026-06-28 15:00:00",
            "empName": "张三",
            "empCode": "E001",
            "orderNo": f"ORD-{card_no}",
            "hallName": "1号厅",
            "channelName": "前台",
            "accountId": "ACC001",
        }
    }


def test_collect_member_payment_fetches_all_bi_pages(monkeypatch) -> None:
    calls = []

    def fake_bi_post(path, body, token):
        calls.append(body.copy())
        if body["pageNo"] == 1:
            return {
                "code": "SUCCESS",
                "data": {
                    "totalItems": 501,
                    "summary": {"columnValueMap": {"totalAmt": 50100}},
                    "list": [_member_payment_row(f"NO{i:03d}", 100) for i in range(500)],
                },
            }
        return {
            "code": "SUCCESS",
            "data": {
                "totalItems": 501,
                "summary": {"columnValueMap": {"totalAmt": 999999}},
                "list": [_member_payment_row("NO500", 100)],
            },
        }

    monkeypatch.setattr("app.services.collectors.fenghuang._bi_post", fake_bi_post)

    result = collect_member_payment("token", "2026-06-28", "2026-06-28")

    assert [call["pageNo"] for call in calls] == [1, 2]
    assert result["consume_amount"] == 501
    assert len(result["items"]) == 501
    assert result["items"][-1]["member_id"] == "NO500"


def test_collect_schedule_detail_treats_null_film_amounts_as_zero(monkeypatch) -> None:
    def fake_bi_post_all_pages(path, body, token):
        return {
            "code": "SUCCESS",
            "data": {
                "summary": {
                    "columnValueMap": {
                        "showTicketNum": 1,
                        "ticketTotalAmount": 0,
                        "scheduleCount": 1,
                        "averageTicketPrice": 0,
                    }
                },
                "list": [
                    {
                        "columnValueMap": {
                            "filmName": "测试影片",
                            "filmCode": "F001",
                            "ticketTotalAmount": None,
                            "showTicketNum": None,
                            "scheduleCount": None,
                        }
                    }
                ],
            },
        }

    monkeypatch.setattr("app.services.collectors.fenghuang._bi_post_all_pages", fake_bi_post_all_pages)

    result = collect_schedule_detail("token", "2026-02-05 06:00", "2026-02-06 05:59")

    assert result["films"][0]["box_office"] == 0
    assert result["films"][0]["audience"] == 0
    assert result["films"][0]["screenings"] == 0


def test_collect_member_payment_maps_pay_report_fields_and_amounts(monkeypatch) -> None:
    captured = {}

    def fake_bi_post(path, body, token):
        captured["path"] = path
        captured["body"] = body
        captured["token"] = token
        return {
            "code": "SUCCESS",
            "data": {
                "summary": {
                    "columnValueMap": {
                        "totalAmt": 12345,
                    }
                },
                "list": [
                    {
                        "columnValueMap": {
                            "cardTypeName": "金卡",
                            "cardNo": "88001",
                            "payItemName": "电影票",
                            "payItemType": "影票",
                            "totalAmt": 8800,
                            "itemPrice": 10000,
                            "payDateTime": "2026-06-28 14:10:00",
                            "showDateTime": "2026-06-28 15:00:00",
                            "empName": "张三",
                            "empCode": "E001",
                            "orderNo": "ORD001",
                            "hallName": "1号厅",
                            "channelName": "前台",
                            "accountId": "ACC001",
                        }
                    }
                ],
            },
        }

    monkeypatch.setattr("app.services.collectors.fenghuang._bi_post", fake_bi_post)

    result = collect_member_payment("token", "2026-06-28", "2026-06-28")

    assert captured == {
        "path": "/bi/card/payReport",
        "body": {
            "pageNo": 1,
            "pageSize": 500,
            "beginTime": "2026-06-28",
            "endTime": "2026-06-28",
        },
        "token": "token",
    }
    assert result["consume_amount"] == 123.45
    assert result["items"] == [
        {
            "card_type": "金卡",
            "card_no": "88001",
            "member_id": "88001",
            "product_name": "电影票",
            "item_name": "电影票",
            "product_type": "影票",
            "amount": 88.0,
            "original_amount": 100.0,
            "consume_time": "2026-06-28 14:10:00",
            "time": "2026-06-28 14:10:00",
            "show_time": "2026-06-28 15:00:00",
            "operator": "张三",
            "emp_name": "张三",
            "emp_code": "E001",
            "order_no": "ORD001",
            "hall_name": "1号厅",
            "channel": "前台",
            "account_id": "ACC001",
        }
    ]


def test_collect_fenghuang_raw_includes_member_payment_summary_and_items(monkeypatch) -> None:
    monkeypatch.setattr("app.services.collectors.fenghuang.get_access_token", lambda: "token")
    monkeypatch.setattr(
        "app.services.collectors.fenghuang.collect_schedule_detail",
        lambda token, begin_time, end_time: {
            "ticket_total_amount": 100,
            "show_ticket_num": 5,
            "schedule_count": 2,
            "average_ticket_price": 20,
            "seat_num_rate": 0.1,
            "refund_ticket_num": 0,
            "refund_ticket_amount": 0,
            "films": [],
        },
    )
    monkeypatch.setattr(
        "app.services.collectors.fenghuang.collect_goods_detail",
        lambda token, begin_time, end_time: {"pay_amount": 42, "items": []},
    )
    monkeypatch.setattr(
        "app.services.collectors.fenghuang.collect_member_open_card",
        lambda token, begin_date, end_date: {"card_count": 1, "items": []},
    )
    monkeypatch.setattr(
        "app.services.collectors.fenghuang.collect_member_recharge",
        lambda token, begin_date, end_date: {"recharge_amount": 88, "items": []},
    )
    monkeypatch.setattr(
        "app.services.collectors.fenghuang.collect_member_payment",
        lambda token, begin_date, end_date: {
            "consume_amount": 66,
            "items": [{"member_id": "88001", "amount": 66, "product_type": "影票"}],
        },
    )
    monkeypatch.setattr("app.services.collectors.fenghuang.collect_inventory", lambda *args, **kwargs: [])

    raw = collect_fenghuang_raw(target_date="2026-06-28")

    assert raw["summary"]["member_consume"] == 66
    assert raw["member_items"] == [{"member_id": "88001", "amount": 66, "product_type": "影票"}]
