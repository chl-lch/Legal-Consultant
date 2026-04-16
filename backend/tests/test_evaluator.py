from app.services.evaluation.answer_evaluator import AnswerEvaluator


def test_heuristic_evaluator_rewards_citations() -> None:
    evaluator = AnswerEvaluator()

    result = evaluator._heuristic(
        query="Summarise the agreement risks.",
        answer="The indemnity is broad and uncapped [Supplier Agreement chunk 7].",
    )

    assert result.citation_accuracy >= 7
    assert result.hallucination_risk >= 7
