from apps.agents.seller import SellerAgent
from libs.comex_common.agents.schemas import AgentOutput, Conversation, CreateSaleAction


def test_seller_extracts_complete_coffee_offer():
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
    result = agent.process_message(
        request_id="test-123",
        user_id="user-456",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
    )

    assert result.action.type == "CREATE_SALE"
    assert result.action.confidence > 0.9
    assert result.action.validation_errors == []
    assert result.action.payload.commodity == "coffee"
    assert result.action.payload.incoterm == "FOB"
    assert result.action.payload.price == 3800.0
    assert result.action.payload.currency == "USD"
    assert result.action.payload.volume.value == 2.0
    assert result.action.payload.volume.unit == "containers"
    assert result.action.payload.origin == "Santos"
    assert result.action.payload.destination == "Jordan"


def test_seller_returns_validation_errors_for_missing_volume():
    def llm_parse(agent_input):
        return AgentOutput(
            intent="seller",
            output_text="need volume",
            action=CreateSaleAction(
                type="CREATE_SALE",
                payload={},
                confidence=0.8,
                validation_errors=["volume"],
            ),
        )

    agent = SellerAgent(llm_parse=llm_parse)
    result = agent.process_message(
        request_id="test-124",
        user_id="user-456",
        user_message="Sell coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
    )

    assert result.action.type == "CREATE_SALE"
    assert result.action.validation_errors == ["volume"]


def test_seller_returns_validation_errors_for_missing_currency():
    def llm_parse(agent_input):
        return AgentOutput(
            intent="seller",
            output_text="need currency",
            action=CreateSaleAction(
                type="CREATE_SALE",
                payload={},
                confidence=0.75,
                validation_errors=["currency"],
            ),
        )

    agent = SellerAgent(llm_parse=llm_parse)
    result = agent.process_message(
        request_id="test-125",
        user_id="user-456",
        user_message="Sell 2 containers of coffee FOB Santos at 3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
    )

    assert result.action.type == "CREATE_SALE"
    assert result.action.validation_errors == ["currency"]
