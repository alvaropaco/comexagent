from apps.agents.buyer import BuyerAgent, heuristic_buyer_parse
from libs.comex_common.agents.schemas import AgentInput, Conversation


def test_buyer_agent_parses_buy_order_from_message():
    agent_input = AgentInput(
        request_id="r1",
        user_id="u1",
        user_message="Looking to buy coffee, target price $3900, 2 containers to Jordan",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    out = BuyerAgent(llm_parse=heuristic_buyer_parse).run(agent_input)
    assert out.intent == "buyer"
    assert out.action.type == "CREATE_BUY_ORDER"
    assert out.action.payload.commodity == "coffee"
    assert out.action.payload.currency == "USD"
    assert out.action.payload.volume.value == 2.0
