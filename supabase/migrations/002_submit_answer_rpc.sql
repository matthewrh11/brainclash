-- Atomic answer submission function to prevent race conditions
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_match_id UUID,
  p_user_id UUID,
  p_question_index INTEGER,
  p_answer TEXT,
  p_is_correct BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match public.matches;
  v_answer_count INTEGER;
  v_result JSONB;
BEGIN
  -- Lock the match row to prevent concurrent updates
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status != 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  IF p_question_index != v_match.current_question THEN
    RAISE EXCEPTION 'Wrong question index. Expected %, got %', v_match.current_question, p_question_index;
  END IF;

  IF p_user_id != v_match.player_one_id AND p_user_id != v_match.player_two_id THEN
    RAISE EXCEPTION 'User is not a player in this match';
  END IF;

  -- Insert the answer (UNIQUE constraint prevents duplicates)
  INSERT INTO public.match_answers (match_id, user_id, question_index, answer, is_correct)
  VALUES (p_match_id, p_user_id, p_question_index, p_answer, p_is_correct);

  -- Update score if correct
  IF p_is_correct THEN
    IF p_user_id = v_match.player_one_id THEN
      UPDATE public.matches SET p1_score = p1_score + 1 WHERE id = p_match_id;
    ELSE
      UPDATE public.matches SET p2_score = p2_score + 1 WHERE id = p_match_id;
    END IF;
  END IF;

  -- Count answers for this question
  SELECT COUNT(*) INTO v_answer_count
  FROM public.match_answers
  WHERE match_id = p_match_id AND question_index = p_question_index;

  -- If both players answered, advance the question
  IF v_answer_count >= 2 THEN
    IF v_match.current_question >= 9 THEN
      -- Match is over
      UPDATE public.matches
      SET current_question = 10,
          status = 'completed',
          completed_at = NOW()
      WHERE id = p_match_id;
    ELSE
      UPDATE public.matches
      SET current_question = current_question + 1
      WHERE id = p_match_id;
    END IF;
  END IF;

  -- Return updated match state
  SELECT row_to_json(m)::JSONB INTO v_result
  FROM public.matches m WHERE m.id = p_match_id;

  RETURN v_result;
END;
$$;
