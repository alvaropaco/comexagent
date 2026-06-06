import os

from apps.agents.seller import SellerAgent
from apps.orchestrator import execute_action
from libs.comex_common.agents.schemas import AgentOutput, Conversation, CreateSaleAction
from libs.comex_common.storage.in_memory import get_db


def test_seller_to_create_sale_persists_in_db():
    get_db().reset()
    os.environ.pop("CORE_DATA_API_URL", None)

    def llm_parse(agent_input):
        return AgentOutput(
            intent="seller",
            output_text="ok",
            action=CreateSaleAction(
                type="CREATE_SALE",
                payload={
                    "commodity": "coffee",
                    "incoterm": "FOB",
                    "price": 3800.0,
                    "currency": "USD",
                    "volume": {"value": 2.0, "unit": "containers"},
                    "origin": "Santos",
                    "destination": "Jordan",
                },
                confidence=0.95,
                validation_errors=[],
            ),
        )

    agent = SellerAgent(llm_parse=llm_parse)
    agent_output = agent.process_message(
        request_id="req-1",
        user_id="user-1",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
    )

    tool_result = execute_action(agent_output=agent_output, idempotency_key="idem-1")
    assert tool_result["ok"] is True
    sale_id = tool_result["sale_id"]
    assert sale_id in get_db().sales
    stored = get_db().sales[sale_id]
    assert stored["commodity"] == "coffee"
    assert stored["incoterm"] == "FOB"
    assert stored["price"] == 3800.0
    assert stored["currency"] == "USD"
    assert stored["volume"]["value"] == 2.0
    assert stored["volume"]["unit"] == "containers"
    assert stored["origin"] == "Santos"
    assert stored["destination"] == "Jordan"
