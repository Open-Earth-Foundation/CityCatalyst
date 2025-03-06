from prioritizer.utils.ml_comparator import ml_compare
from prioritizer.prioritizer import quantitative_score, qualitative_score


def majority_vote_compare(city: dict, action_A: dict, action_B: dict) -> int:
    """
    Compares two actions using the majority vote method.
    Returns 1 if action A is preferred, -1 if action B is preferred, and 0 if they are equally preferred.
    """

    # input("Press Enter to continue...")
    # print("Comparing actions using the majority vote method...")
    # print(f"City: {city}")
    # print(f"Action A: {action_A}")
    # print(f"Action B: {action_B}")

    winner_quant = 0
    winner_quali = 0
    ml_winner = 0

    # Get the quantitative scores for both actions
    score_A = quantitative_score(city, action_A)
    score_B = quantitative_score(city, action_B)

    # Assign winner_quant based on score comparison
    winner_quant = 0 if score_A == score_B else 1 if score_A > score_B else -1

    # print("winner_quant", winner_quant)

    # Get the winner of qualitative score
    quali_score = qualitative_score(city, [action_A, action_B])

    # print("quali_score", quali_score)

    if quali_score:
        winner_quali_action_id = quali_score.actions[0].action_id

        winner_quali = 1 if winner_quali_action_id == action_A["ActionID"] else -1

        # print("winner_quali", winner_quali)

    # Get the winner of the ML model
    ml_winner = ml_compare(city, action_A, action_B)

    # print("ml_winner", ml_winner)

    # Get the majority vote
    print("Calculating majority vote...")
    print("winner_quant", winner_quant)
    print("winner_quali", winner_quali)
    print("ml_winner", ml_winner)
    majority_vote = winner_quant + winner_quali + ml_winner
    print("majority_vote", majority_vote)

    # print("majority_vote", majority_vote)

    # if majority_vote == 0:
    #     print("No majority vote, using ML model winner.")
    #     return ml_winner

    final_winner = 1 if majority_vote > 0 else -1

    print("final_winner", final_winner)

    if final_winner != ml_winner:
        print("ML != final_winner")

    # print("final_winner", final_winner)

    return final_winner


# City: BRCMG
# Action A: icare_0175
# Action B: icare_0144
# Preferred action: icare_0175
# winner_quant -1
# ml_winner 1
# final_winner -1


def consensus_compare(city: dict, action_A: dict, action_B: dict) -> int:
    """
    Compares two actions using a weighted decision approach:
    - If winner_quant and ml_winner agree, we take that action.
    - If they disagree, winner_quali decides.
    """

    # Get the quantitative scores for both actions
    score_A = quantitative_score(city, action_A)
    score_B = quantitative_score(city, action_B)

    # Assign winner_quant based on score comparison
    winner_quant = 0 if score_A == score_B else 1 if score_A > score_B else -1

    # Get the ML winner
    ml_winner = ml_compare(city, action_A, action_B)

    # If winner_quant and ml_winner agree, return their decision
    if winner_quant == ml_winner:
        return winner_quant

    else:
        print("Disagreement between winner_quant and ml_winner.")
        print("Using winner_quali to decide...")
        # Get the winner of qualitative score (always -1 or 1)
        quali_score = qualitative_score(city, [action_A, action_B])
        print("quali_score", quali_score)
        winner_quali_action_id = quali_score.actions[0].action_id
        winner_quali = 1 if winner_quali_action_id == action_A["ActionID"] else -1

        # If there is a disagreement, winner_quali decides
        return winner_quali
