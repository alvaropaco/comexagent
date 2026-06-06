import os

from apps.agents.buyer import BuyerAgent, heuristic_buyer_parse
from apps.orchestrator import execute_action
from libs.comex_common.agents.schemas import Conversation
from libs.comex_common.storage.in_memory import get_db


def test_buyer_to_create_buy_order_persists_in_db():
    get_db().reset()
    os.environ.pop("CORE_DATA_API_URL", None)

    agent = BuyerAgent(llm_parse=heuristic_buyer_parse)
    agent_output = agent.process_message(
        request_id="req-1",
        user_id="user-1",
        user_message="Looking to buy coffee, target price $3900, 2 containers to Jordan",
        conversation=Conversation(messages=[]),
        context={},
    )

    tool_result = execute_action(agent_output=agent_output, idempotency_key="idem-1")
    assert tool_result["ok"] is True
    buy_order_id = tool_result["buy_order_id"]
    assert buy_order_id in get_db().buy_orders
