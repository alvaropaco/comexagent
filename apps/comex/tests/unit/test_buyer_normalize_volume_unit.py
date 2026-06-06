from apps.agents.buyer import _normalize_buyer_output
from libs.comex_common.agents.schemas import AgentInput, AgentOutput, Conversation, CreateBuyOrderAction


def test_buyer_normalize_infers_volume_unit_from_message():
    agent_input = AgentInput(
        request_id="r1",
        user_id="u1",
        user_message="Looking to buy coffee, target price $3900, 2 containers to Jordan",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    agent_output = AgentOutput(
        intent="buyer",
        output_text="need volume unit",
        action=CreateBuyOrderAction(
            type="CREATE_BUY_ORDER",
            payload={
                "commodity": "coffee",
                "target_price": 3900.0,
                "currency": "USD",
                "volume": {"value": 2.0, "unit": ""},
                "destination": "Jordan",
            },
            confidence=0.6,
            validation_errors=["volume.unit"],
        ),
    )

    normalized = _normalize_buyer_output(agent_input=agent_input, agent_output=agent_output)
    assert normalized.action.payload.volume.unit == "containers"
    assert normalized.action.validation_errors == []
