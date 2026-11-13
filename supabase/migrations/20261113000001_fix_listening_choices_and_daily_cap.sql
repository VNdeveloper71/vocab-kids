alter table public.daily_rewards
  drop constraint if exists daily_rewards_earned_coins_check;

alter table public.daily_rewards
  add constraint daily_rewards_earned_coins_check
  check (earned_coins between 0 and 100);

do $$
declare
  v_definition text;
  v_updated text;
  v_old_choice_query text := $old$
    select jsonb_agg(jsonb_build_object('id', c.id, 'en', c.en, 'vi', c.vi))
    into v_choices
    from (
      select candidates.id, candidates.en, candidates.vi
      from (
        select id, en, vi, random() as order_key from public.words
        where deck_id = v_session.deck_id and id <> v_word.id
        union all
        select id, en, vi, random() as order_key from public.words
        where id = v_word.id
      ) candidates
      order by order_key
      limit 4
    ) c;
$old$;
  v_new_choice_query text := $new$
    select jsonb_agg(jsonb_build_object('id', c.id, 'en', c.en, 'vi', c.vi) order by c.order_key)
    into v_choices
    from (
      select distractors.id, distractors.en, distractors.vi, random() as order_key
      from (
        select id, en, vi from public.words
        where deck_id = v_session.deck_id and id <> v_word.id
        order by random()
        limit 3
      ) distractors
      union all
      select id, en, vi, random() as order_key from public.words
      where id = v_word.id
    ) c;
$new$;
  v_signature text;
begin
  v_definition := pg_get_functiondef('public.get_game_question(uuid)'::regprocedure);
  if position(v_old_choice_query in v_definition) = 0 then
    raise exception 'Could not locate expected listening-choice query in get_game_question';
  end if;
  v_definition := replace(v_definition, v_old_choice_query, v_new_choice_query);
  execute v_definition;

  foreach v_signature in array array[
    'public.claim_daily_login()',
    'public.answer_game_question(uuid,text)',
    'public.submit_memory_attempt(uuid,uuid,uuid)'
  ]
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_updated := replace(v_definition, '30 - v_reward.earned_coins', '100 - v_reward.earned_coins');
    if v_signature = 'public.claim_daily_login()' then
      v_updated := replace(v_updated, '''limit'', 30', '''limit'', 100');
    end if;
    if v_updated = v_definition then
      raise exception 'Could not locate expected daily coin cap in %', v_signature;
    end if;
    if position('30 - v_reward.earned_coins' in v_updated) > 0 then
      raise exception 'An old daily coin cap remains in %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$$;
