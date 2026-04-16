from app.services.agents.intents import IntentClassifier


def test_intent_classifier_statute_lookup_heuristic() -> None:
    classifier = IntentClassifier()

    result = classifier._heuristic_classification("Which section of the Fair Work Act covers notice?")

    assert result.intent == "statute_lookup"


def test_intent_classifier_clause_extraction_heuristic() -> None:
    classifier = IntentClassifier()

    result = classifier._heuristic_classification("Extract the termination and indemnity clauses.")

    assert result.intent == "clause_extraction"

