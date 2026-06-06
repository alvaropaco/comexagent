from libs.comex_common.agents.schemas import AgentInput, AgentOutput, ChatMsg, Conversation, CreateSaleAction


def test_normalize_sets_usd_when_dollar_sign_present():
    from apps.agents.seller import _normalize_seller_output

    agent_input = AgentInput(
        request_id="r1",
        user_id="u1",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    agent_output = AgentOutput(
        intent="seller",
        output_text="need currency",
        action=CreateSaleAction(
            type="CREATE_SALE",
            payload={
                "commodity": "coffee",
                "incoterm": "FOB",
                "price": 3800.0,
                "currency": None,
                "volume": {"value": 2.0, "unit": "containers"},
                "origin": "Santos",
                "destination": "Jordan",
            },
            confidence=0.6,
            validation_errors=["currency"],
        ),
    )

    normalized = _normalize_seller_output(agent_input=agent_input, agent_output=agent_output)
    assert normalized.action.payload.currency == "USD"
    assert normalized.action.validation_errors == []


def test_normalize_infers_volume_unit_from_message():
    from apps.agents.seller import _normalize_seller_output

    agent_input = AgentInput(
        request_id="r2",
        user_id="u1",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    agent_output = AgentOutput(
        intent="seller",
        output_text="need volume unit",
        action=CreateSaleAction(
            type="CREATE_SALE",
            payload={
                "commodity": "coffee",
                "incoterm": "FOB",
                "price": 3800.0,
                "currency": "USD",
                "volume": {"value": 2.0, "unit": ""},
                "origin": "Santos",
                "destination": "Jordan",
            },
            confidence=0.6,
            validation_errors=["volume.unit"],
        ),
    )

    normalized = _normalize_seller_output(agent_input=agent_input, agent_output=agent_output)
    assert normalized.action.payload.volume.unit == "containers"
    assert normalized.action.validation_errors == []
