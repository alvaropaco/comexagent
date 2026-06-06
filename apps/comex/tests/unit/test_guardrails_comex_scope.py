from libs.comex_common.guardrails.topic import check_comex_scope


def test_allows_typical_sale_offer():
    res = check_comex_scope("Sell 2 containers of coffee FOB Santos at $3800 to Jordan")
    assert res.allowed is True


def test_allows_buy_order_language():
    res = check_comex_scope("Looking to buy coffee, target price 3900 USD, 1 container to Jordan")
    assert res.allowed is True


def test_denies_out_of_scope_prompt():
    res = check_comex_scope("Write me a poem about penguins")
    assert res.allowed is False
    assert res.reason == "out_of_scope"


def test_denies_empty_text():
    res = check_comex_scope("   ")
    assert res.allowed is False
    assert res.reason == "empty"
