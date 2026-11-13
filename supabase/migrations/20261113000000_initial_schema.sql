create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 3 and 32),
  role text not null default 'student' check (role in ('student', 'admin')),
  coins integer not null default 0 check (coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_username_lower_uidx on public.profiles (lower(username));

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(title) between 1 and 100),
  emoji text not null default '📚' check (char_length(emoji) between 1 and 8),
  price integer not null default 0 check (price >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  en text not null check (char_length(en) between 1 and 160),
  ipa text not null default '' check (char_length(ipa) <= 160),
  vi text not null check (char_length(vi) between 1 and 240),
  ex text not null default '' check (char_length(ex) <= 500),
  created_at timestamptz not null default now()
);

create index words_deck_id_idx on public.words (deck_id);

create table public.user_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  constraint user_decks_user_deck_unique unique (user_id, deck_id)
);

create index user_decks_user_id_idx on public.user_decks (user_id);

create table public.daily_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_date date not null,
  earned_coins integer not null default 0 check (earned_coins between 0 and 30),
  login_bonus integer not null default 0 check (login_bonus between 0 and 2),
  constraint daily_rewards_user_date_unique unique (user_id, reward_date)
);

create index daily_rewards_user_date_idx on public.daily_rewards (user_id, reward_date desc);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  deck_id uuid references public.decks (id) on delete set null,
  game_type text not null check (game_type in ('listen', 'memory', 'spell', 'sentence', 'truefalse')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  total_questions integer not null check (total_questions >= 0),
  coins_awarded integer not null default 0 check (coins_awarded >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  bonus_coins integer not null default 0 check (bonus_coins >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index game_sessions_user_created_idx on public.game_sessions (user_id, started_at desc);

create table public.game_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  question_index integer not null check (question_index > 0),
  word_id uuid references public.words (id) on delete set null,
  prompt jsonb not null,
  expected_answer text not null,
  answer_display jsonb not null,
  submitted_answer text,
  is_correct boolean,
  answered_at timestamptz,
  awarded_coins integer not null default 0 check (awarded_coins >= 0),
  constraint game_questions_session_index_unique unique (session_id, question_index)
);

create index game_questions_session_idx on public.game_questions (session_id);

create table public.game_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  word_id uuid references public.words (id) on delete set null,
  pair_key uuid not null,
  side text not null check (side in ('en', 'vi')),
  card_text text not null,
  is_matched boolean not null default false,
  constraint game_cards_session_word_side_unique unique (session_id, word_id, side)
);

create index game_cards_session_idx on public.game_cards (session_id);

create or replace function public.abandon_sessions_before_deck_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.slug = 'starter' then
    raise exception 'Starter deck cannot be deleted';
  end if;
  update public.game_sessions
  set status = 'abandoned', finished_at = now()
  where deck_id = old.id and status = 'active';
  return old;
end;
$$;

create trigger decks_abandon_active_games
before delete on public.decks
for each row execute function public.abandon_sessions_before_deck_delete();

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  transaction_type text not null check (transaction_type in ('game_reward', 'daily_login', 'deck_purchase')),
  description text not null check (char_length(description) between 1 and 240),
  game_session_id uuid references public.game_sessions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index coin_transactions_user_created_idx on public.coin_transactions (user_id, created_at desc);

insert into public.decks (id, slug, title, emoji, price, is_published)
values
  ('00000000-0000-4000-8000-000000000001', 'starter', 'Từ vựng đầu tiên', '🌱', 0, true),
  ('00000000-0000-4000-8000-000000000002', 'animals', 'Động vật', '🐾', 10, true);

insert into public.words (deck_id, en, ipa, vi, ex)
select d.id, v.en, v.ipa, v.vi, v.ex
from (values
  ('starter', 'Dog', '/dɒɡ/', 'Con chó', 'The dog barks and guards the house.'),
  ('starter', 'Cat', '/kæt/', 'Con mèo', 'The cat says meow and catches mice.'),
  ('starter', 'Elephant', '/ˈel.ɪ.fənt/', 'Con voi', 'The elephant has a long trunk.'),
  ('starter', 'Apple', '/ˈæp.əl/', 'Quả táo', 'I eat a red apple.'),
  ('starter', 'Book', '/bʊk/', 'Quyển sách', 'I read a book every day.'),
  ('animals', 'Dog', '/dɒɡ/', 'Con chó', 'The dog barks and guards the house.'),
  ('animals', 'Cat', '/kæt/', 'Con mèo', 'The cat says meow and catches mice.'),
  ('animals', 'Elephant', '/ˈel.ɪ.fənt/', 'Con voi', 'The elephant has a long trunk.'),
  ('animals', 'Lion', '/ˈlaɪ.ən/', 'Con sư tử', 'The lion is the king of the jungle.'),
  ('animals', 'Monkey', '/ˈmʌŋ.ki/', 'Con khỉ', 'The monkey loves eating bananas.'),
  ('animals', 'Penguin', '/ˈpeŋ.ɡwɪn/', 'Chim cánh cụt', 'The penguin lives in the ice.'),
  ('animals', 'Tiger', '/ˈtaɪ.ɡər/', 'Con hổ', 'The tiger has orange and black stripes.'),
  ('animals', 'Bear', '/beər/', 'Con gấu', 'The bear loves honey and hibernates.'),
  ('animals', 'Rabbit', '/ˈræb.ɪt/', 'Con thỏ', 'The rabbit has long ears and eats carrots.'),
  ('animals', 'Horse', '/hɔːs/', 'Con ngựa', 'The horse runs fast and people can ride it.')
) as v(slug, en, ipa, vi, ex)
join public.decks d on d.slug = v.slug;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger decks_set_updated_at
before update on public.decks
for each row execute function public.set_updated_at();

create or replace function public.protect_starter_deck()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.slug = 'starter'
    and (new.slug <> 'starter' or new.price <> 0 or not new.is_published) then
    raise exception 'Starter deck must remain free and published';
  end if;
  return new;
end;
$$;

create trigger decks_protect_starter
before update on public.decks
for each row execute function public.protect_starter_deck();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text;
  v_starter_id uuid;
begin
  v_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if char_length(v_username) < 3 or char_length(v_username) > 32 then
    raise exception 'Username must be between 3 and 32 characters';
  end if;

  insert into public.profiles (id, username, role, coins)
  values (new.id, v_username, 'student', 0);

  select id into v_starter_id from public.decks where slug = 'starter' and is_published;
  if v_starter_id is not null then
    insert into public.user_decks (user_id, deck_id) values (new.id, v_starter_id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.words enable row level security;
alter table public.user_decks enable row level security;
alter table public.daily_rewards enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_questions enable row level security;
alter table public.game_cards enable row level security;
alter table public.coin_transactions enable row level security;

create policy "Profiles are visible to their owner"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Students can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Published decks are readable"
on public.decks for select to anon, authenticated
using (is_published or public.is_admin());

create policy "Admins manage decks"
on public.decks for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Words in published decks are readable"
on public.words for select to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.decks d
    where d.id = words.deck_id and d.is_published
  )
);

create policy "Admins manage words"
on public.words for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users read their own deck access"
on public.user_decks for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users read their own daily rewards"
on public.daily_rewards for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users read their own game sessions"
on public.game_sessions for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users read their own coin transactions"
on public.coin_transactions for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.profiles, public.decks, public.words, public.user_decks,
  public.daily_rewards, public.game_sessions, public.game_questions,
  public.game_cards, public.coin_transactions from anon, authenticated;

grant select on public.decks, public.words to anon, authenticated;
grant select on public.profiles, public.user_decks, public.daily_rewards,
  public.game_sessions, public.coin_transactions to authenticated;
grant update (username) on public.profiles to authenticated;
grant insert, update, delete on public.decks, public.words to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_reward public.daily_rewards%rowtype;
  v_award integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  perform 1 from public.profiles where id = v_user_id for update;
  insert into public.daily_rewards (user_id, reward_date)
  values (v_user_id, v_today)
  on conflict (user_id, reward_date) do nothing;
  select * into v_reward from public.daily_rewards
  where user_id = v_user_id and reward_date = v_today for update;

  if v_reward.login_bonus > 0 then
    return jsonb_build_object('awarded', 0, 'earned_today', v_reward.earned_coins, 'limit', 30);
  end if;

  v_award := least(2, 30 - v_reward.earned_coins);
  update public.daily_rewards
  set earned_coins = earned_coins + v_award,
      login_bonus = v_award
  where id = v_reward.id;

  if v_award > 0 then
    update public.profiles set coins = coins + v_award where id = v_user_id;
    insert into public.coin_transactions (user_id, amount, transaction_type, description)
    values (v_user_id, v_award, 'daily_login', 'Thưởng đăng nhập hằng ngày');
  end if;

  return jsonb_build_object(
    'awarded', v_award,
    'earned_today', v_reward.earned_coins + v_award,
    'limit', 30
  );
end;
$$;

create or replace function public.purchase_deck(p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_deck public.decks%rowtype;
  v_balance integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select coins into v_balance from public.profiles
  where id = v_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  select * into v_deck from public.decks
  where id = p_deck_id and is_published;
  if not found then raise exception 'Deck not found'; end if;

  if exists (
    select 1 from public.user_decks
    where user_id = v_user_id and deck_id = p_deck_id
  ) then
    raise exception 'Deck already owned';
  end if;
  if v_balance < v_deck.price then raise exception 'Not enough coins'; end if;

  update public.profiles set coins = coins - v_deck.price where id = v_user_id;
  insert into public.user_decks (user_id, deck_id) values (v_user_id, p_deck_id);
  if v_deck.price > 0 then
    insert into public.coin_transactions (user_id, amount, transaction_type, description)
    values (v_user_id, -v_deck.price, 'deck_purchase', 'Mua bộ từ: ' || v_deck.title);
  end if;

  return jsonb_build_object('deck_id', p_deck_id, 'coins', v_balance - v_deck.price);
end;
$$;

create or replace function public.start_game(
  p_deck_id uuid,
  p_game_type text,
  p_memory_pairs integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_word_count integer;
  v_total integer;
  v_session public.game_sessions%rowtype;
  v_word record;
  v_cards jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_game_type not in ('listen', 'memory', 'spell', 'sentence', 'truefalse') then
    raise exception 'Unsupported game type';
  end if;
  if not exists (
    select 1 from public.decks
    where id = p_deck_id and is_published
  ) then raise exception 'Deck not found'; end if;
  if not exists (
    select 1 from public.user_decks
    where user_id = v_user_id and deck_id = p_deck_id
  ) then raise exception 'Deck is not owned'; end if;

  select count(*) into v_word_count from public.words where deck_id = p_deck_id;
  if v_word_count < 5 then raise exception 'At least five words are required'; end if;
  if p_game_type = 'memory' then
    if p_memory_pairs not in (4, 6, 8) or p_memory_pairs > v_word_count then
      raise exception 'Invalid memory pair count';
    end if;
    v_total := p_memory_pairs;
  elsif p_game_type = 'truefalse' then
    v_total := 0;
  else
    v_total := 5;
  end if;

  insert into public.game_sessions (user_id, deck_id, game_type, total_questions)
  values (v_user_id, p_deck_id, p_game_type, v_total)
  returning * into v_session;

  if p_game_type = 'memory' then
    for v_word in
      select id, en, vi from public.words
      where deck_id = p_deck_id
      order by random()
      limit p_memory_pairs
    loop
      insert into public.game_cards (session_id, word_id, pair_key, side, card_text)
      values
        (v_session.id, v_word.id, v_word.id, 'en', v_word.en),
        (v_session.id, v_word.id, v_word.id, 'vi', v_word.vi);
    end loop;

    select jsonb_agg(jsonb_build_object(
      'id', cards.id,
      'text', cards.card_text,
      'side', cards.side
    ))
    into v_cards
    from (
      select id, card_text, side from public.game_cards
      where session_id = v_session.id
      order by random()
    ) cards;
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'game_type', p_game_type,
    'total_questions', v_total,
    'seconds', case when p_game_type = 'truefalse' then 60 else null end,
    'cards', coalesce(v_cards, '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_game_question(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions%rowtype;
  v_existing public.game_questions%rowtype;
  v_word public.words%rowtype;
  v_other public.words%rowtype;
  v_choices jsonb;
  v_prompt jsonb;
  v_expected text;
  v_index integer;
  v_question_id uuid;
  v_position integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.game_sessions
  where id = p_session_id and user_id = v_user_id for update;
  if not found then raise exception 'Game session not found'; end if;
  if v_session.game_type = 'memory' then raise exception 'Memory games use memory attempts'; end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('finished', true);
  end if;
  if v_session.game_type = 'truefalse' and now() >= v_session.started_at + interval '60 seconds' then
    update public.game_sessions set status = 'completed', finished_at = now()
    where id = v_session.id;
    return jsonb_build_object('finished', true);
  end if;
  if v_session.game_type <> 'truefalse' and now() >= v_session.started_at + interval '30 minutes' then
    update public.game_sessions set status = 'abandoned', finished_at = now()
    where id = v_session.id;
    return jsonb_build_object('finished', true);
  end if;

  select * into v_existing from public.game_questions
  where session_id = v_session.id and answered_at is null
  order by question_index desc limit 1;
  if found then
    return jsonb_build_object(
      'finished', false,
      'id', v_existing.id,
      'index', v_existing.question_index,
      'prompt', v_existing.prompt
    );
  end if;

  if v_session.game_type <> 'truefalse' then
    select count(*) into v_index from public.game_questions
    where session_id = v_session.id and answered_at is not null;
    if v_index >= v_session.total_questions then
      update public.game_sessions set status = 'completed', finished_at = now()
      where id = v_session.id;
      return jsonb_build_object('finished', true);
    end if;
  else
    select count(*) into v_index from public.game_questions
    where session_id = v_session.id;
  end if;

  select * into v_word from public.words
  where deck_id = v_session.deck_id order by random() limit 1;

  if v_session.game_type in ('listen', 'sentence') then
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
    v_expected := v_word.id::text;
    if v_session.game_type = 'listen' then
      v_prompt := jsonb_build_object('en', v_word.en, 'choices', v_choices);
    else
      v_position := strpos(lower(v_word.ex), lower(v_word.en));
      v_prompt := jsonb_build_object(
        'sentence', case when v_position > 0 then
          substr(v_word.ex, 1, v_position - 1) || '_____' ||
          substr(v_word.ex, v_position + char_length(v_word.en))
          else v_word.ex end,
        'choices', v_choices
      );
    end if;
  elsif v_session.game_type = 'spell' then
    v_expected := lower(v_word.en);
    v_prompt := jsonb_build_object(
      'meaning', v_word.vi,
      'en', v_word.en,
      'letters', to_jsonb((
        select array_agg(letter order by random())
        from regexp_split_to_table(upper(v_word.en), '') as letters(letter)
      ))
    );
  else
    if random() < 0.5 then
      v_other := v_word;
      v_expected := 'true';
    else
      select * into v_other from public.words
      where deck_id = v_session.deck_id and id <> v_word.id
      order by random() limit 1;
      v_expected := 'false';
    end if;
    v_prompt := jsonb_build_object('en', v_word.en, 'meaning', v_other.vi);
  end if;

  insert into public.game_questions (
    session_id, question_index, word_id, prompt, expected_answer, answer_display
  )
  values (
    v_session.id,
    v_index + 1,
    v_word.id,
    v_prompt,
    v_expected,
    jsonb_build_object('en', v_word.en, 'vi', v_word.vi)
  )
  returning id into v_question_id;

  return jsonb_build_object(
    'finished', false,
    'id', v_question_id,
    'index', v_index + 1,
    'prompt', v_prompt
  );
end;
$$;

create or replace function public.answer_game_question(p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_question public.game_questions%rowtype;
  v_session public.game_sessions%rowtype;
  v_reward public.daily_rewards%rowtype;
  v_correct boolean;
  v_answer_display jsonb;
  v_streak integer;
  v_requested integer;
  v_award integer;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_answer is null or char_length(p_answer) > 500 then
    raise exception 'Invalid answer';
  end if;
  select q.* into v_question
  from public.game_questions q
  join public.game_sessions s on s.id = q.session_id
  where q.id = p_question_id and s.user_id = v_user_id
  for update of q;
  if not found then raise exception 'Question not found'; end if;

  select * into v_session from public.game_sessions
  where id = v_question.session_id and user_id = v_user_id for update;
  if v_question.answered_at is not null then
    if btrim(v_question.submitted_answer) <> btrim(p_answer) then
      raise exception 'Question already answered with a different response';
    end if;
    return jsonb_build_object(
      'correct', v_question.is_correct,
      'correct_answer', v_question.expected_answer,
      'answer', v_question.answer_display,
      'awarded', v_question.awarded_coins,
      'correct_answers', v_session.correct_answers,
      'streak', v_session.current_streak,
      'finished', v_session.status <> 'active'
        and v_session.game_type <> 'truefalse'
    );
  end if;
  if v_session.status <> 'active' then raise exception 'Game session is not active'; end if;
  if v_session.game_type = 'memory' then raise exception 'Memory games use memory attempts'; end if;
  if v_session.game_type = 'truefalse' and now() >= v_session.started_at + interval '60 seconds' then
    update public.game_sessions set status = 'completed', finished_at = now()
    where id = v_session.id;
    return jsonb_build_object('finished', true);
  end if;
  if v_session.game_type <> 'truefalse' and now() >= v_session.started_at + interval '30 minutes' then
    update public.game_sessions set status = 'abandoned', finished_at = now()
    where id = v_session.id;
    return jsonb_build_object('finished', true);
  end if;
  if v_session.game_type = 'truefalse' and p_answer not in ('true', 'false') then
    raise exception 'Invalid true/false answer';
  end if;

  if v_session.game_type = 'spell' then
    v_correct := lower(btrim(p_answer)) = v_question.expected_answer;
  else
    v_correct := btrim(p_answer) = v_question.expected_answer;
  end if;

  select * into v_reward from public.daily_rewards
  where user_id = v_user_id and reward_date = v_today;
  if not found then
    insert into public.daily_rewards (user_id, reward_date)
    values (v_user_id, v_today)
    on conflict (user_id, reward_date) do nothing;
  end if;
  perform 1 from public.profiles where id = v_user_id for update;
  select * into v_reward from public.daily_rewards
  where user_id = v_user_id and reward_date = v_today for update;

  v_streak := case when v_correct then v_session.current_streak + 1 else 0 end;
  v_requested := case when v_correct then 1 + case when v_streak % 3 = 0 then 1 else 0 end else 0 end;
  v_award := least(v_requested, 30 - v_reward.earned_coins);

  v_answer_display := v_question.answer_display;

  update public.game_questions
  set submitted_answer = p_answer,
      is_correct = v_correct,
      answered_at = now(),
      awarded_coins = v_award
  where id = v_question.id;

  update public.game_sessions
  set correct_answers = correct_answers + case when v_correct then 1 else 0 end,
      current_streak = v_streak,
      bonus_coins = bonus_coins + case when v_correct and v_streak % 3 = 0 and v_award > 1 then 1 else 0 end,
      coins_awarded = coins_awarded + v_award,
      status = case when game_type <> 'truefalse'
        and v_question.question_index >= total_questions then 'completed' else status end,
      finished_at = case when game_type <> 'truefalse'
        and v_question.question_index >= total_questions then now() else finished_at end
  where id = v_session.id;

  if v_award > 0 then
    update public.daily_rewards
    set earned_coins = earned_coins + v_award
    where id = v_reward.id;
    update public.profiles set coins = coins + v_award where id = v_user_id;
    insert into public.coin_transactions (user_id, amount, transaction_type, description, game_session_id)
    values (
      v_user_id,
      v_award,
      'game_reward',
      'Thưởng trò chơi: ' || v_session.game_type,
      v_session.id
    );
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'correct_answer', v_question.expected_answer,
    'answer', v_answer_display,
    'awarded', v_award,
    'correct_answers', v_session.correct_answers + case when v_correct then 1 else 0 end,
    'streak', v_streak,
    'finished', v_session.game_type <> 'truefalse'
      and v_question.question_index >= v_session.total_questions
  );
end;
$$;

create or replace function public.submit_memory_attempt(
  p_session_id uuid,
  p_first_card uuid,
  p_second_card uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions%rowtype;
  v_first public.game_cards%rowtype;
  v_second public.game_cards%rowtype;
  v_pair_other public.game_cards%rowtype;
  v_reward public.daily_rewards%rowtype;
  v_correct boolean;
  v_answer jsonb;
  v_streak integer;
  v_requested integer;
  v_award integer := 0;
  v_matched integer;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_first_card = p_second_card then raise exception 'Choose two different cards'; end if;
  select * into v_session from public.game_sessions
  where id = p_session_id and user_id = v_user_id for update;
  if not found or v_session.game_type <> 'memory' then raise exception 'Memory session not found'; end if;

  select * into v_first from public.game_cards
  where id = p_first_card and session_id = v_session.id for update;
  select * into v_second from public.game_cards
  where id = p_second_card and session_id = v_session.id for update;
  if not found or v_first.id is null or v_second.id is null then
    raise exception 'Card not found in this game';
  end if;
  if v_first.is_matched or v_second.is_matched then
    if v_first.is_matched and v_second.is_matched
      and v_first.pair_key = v_second.pair_key
      and v_first.side <> v_second.side then
      select count(*) / 2 into v_matched from public.game_cards
      where session_id = v_session.id and is_matched;
      v_answer := jsonb_build_object(
        'en', case when v_first.side = 'en' then v_first.card_text else v_second.card_text end,
        'vi', case when v_first.side = 'vi' then v_first.card_text else v_second.card_text end
      );
      return jsonb_build_object(
        'matched', true,
        'answer', v_answer,
        'awarded', 0,
        'matched_pairs', v_matched,
        'finished', v_session.status = 'completed'
      );
    end if;
    raise exception 'Card is already matched';
  end if;
  if v_session.status <> 'active' then raise exception 'Game session is not active'; end if;
  if now() >= v_session.started_at + interval '30 minutes' then
    update public.game_sessions set status = 'abandoned', finished_at = now()
    where id = v_session.id;
    return jsonb_build_object('finished', true);
  end if;

  v_correct := v_first.pair_key = v_second.pair_key and v_first.side <> v_second.side;

  if v_correct then
    v_answer := jsonb_build_object(
      'en', case when v_first.side = 'en' then v_first.card_text else v_second.card_text end,
      'vi', case when v_first.side = 'vi' then v_first.card_text else v_second.card_text end
    );
    update public.game_cards set is_matched = true
    where id in (v_first.id, v_second.id);

    select * into v_reward from public.daily_rewards
    where user_id = v_user_id and reward_date = v_today;
    if not found then
      insert into public.daily_rewards (user_id, reward_date)
      values (v_user_id, v_today)
      on conflict (user_id, reward_date) do nothing;
    end if;
    perform 1 from public.profiles where id = v_user_id for update;
    select * into v_reward from public.daily_rewards
    where user_id = v_user_id and reward_date = v_today for update;

    v_streak := v_session.current_streak + 1;
    v_requested := 1 + case when v_streak % 3 = 0 then 1 else 0 end;
    v_award := least(v_requested, 30 - v_reward.earned_coins);

    select count(*) / 2 into v_matched from public.game_cards
    where session_id = v_session.id and is_matched;
    update public.game_sessions
    set correct_answers = correct_answers + 1,
        current_streak = v_streak,
        bonus_coins = bonus_coins + case when v_streak % 3 = 0 and v_award > 1 then 1 else 0 end,
        coins_awarded = coins_awarded + v_award,
        status = case when v_matched >= total_questions then 'completed' else status end,
        finished_at = case when v_matched >= total_questions then now() else finished_at end
    where id = v_session.id;

    if v_award > 0 then
      update public.daily_rewards set earned_coins = earned_coins + v_award
      where id = v_reward.id;
      update public.profiles set coins = coins + v_award where id = v_user_id;
      insert into public.coin_transactions (user_id, amount, transaction_type, description, game_session_id)
      values (v_user_id, v_award, 'game_reward', 'Thưởng trò chơi: memory', v_session.id);
    end if;
  else
    select * into v_pair_other from public.game_cards
    where session_id = v_session.id
      and pair_key = v_first.pair_key
      and side <> v_first.side
    limit 1;
    v_answer := jsonb_build_object(
      'en', case when v_first.side = 'en' then v_first.card_text else v_pair_other.card_text end,
      'vi', case when v_first.side = 'vi' then v_first.card_text else v_pair_other.card_text end
    );
    update public.game_sessions set current_streak = 0 where id = v_session.id;
    v_matched := v_session.correct_answers;
  end if;

  return jsonb_build_object(
    'matched', v_correct,
    'answer', v_answer,
    'awarded', v_award,
    'matched_pairs', case when v_correct then v_matched else v_session.correct_answers end,
    'finished', v_correct and v_matched >= v_session.total_questions
  );
end;
$$;

create or replace function public.finish_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.game_sessions
  where id = p_session_id and user_id = v_user_id for update;
  if not found then raise exception 'Game session not found'; end if;

  if v_session.game_type = 'truefalse' and v_session.status = 'active' then
    if now() < v_session.started_at + interval '60 seconds' then
      raise exception 'Timed game is still active';
    end if;
    update public.game_sessions set status = 'completed', finished_at = now()
    where id = v_session.id returning * into v_session;
  elsif v_session.status = 'active' then
    raise exception 'Game session is not complete';
  end if;

  return jsonb_build_object(
    'status', v_session.status,
    'correct_answers', v_session.correct_answers,
    'total_questions', v_session.total_questions,
    'coins_awarded', v_session.coins_awarded,
    'bonus_coins', v_session.bonus_coins
  );
end;
$$;

create or replace function public.abandon_game(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.game_sessions
  set status = 'abandoned', finished_at = now()
  where id = p_session_id and user_id = v_user_id and status = 'active';
end;
$$;

revoke all on function public.claim_daily_login() from public, anon;
revoke all on function public.purchase_deck(uuid) from public, anon;
revoke all on function public.start_game(uuid, text, integer) from public, anon;
revoke all on function public.get_game_question(uuid) from public, anon;
revoke all on function public.answer_game_question(uuid, text) from public, anon;
revoke all on function public.submit_memory_attempt(uuid, uuid, uuid) from public, anon;
revoke all on function public.finish_game(uuid) from public, anon;
revoke all on function public.abandon_game(uuid) from public, anon;

grant execute on function public.claim_daily_login() to authenticated;
grant execute on function public.purchase_deck(uuid) to authenticated;
grant execute on function public.start_game(uuid, text, integer) to authenticated;
grant execute on function public.get_game_question(uuid) to authenticated;
grant execute on function public.answer_game_question(uuid, text) to authenticated;
grant execute on function public.submit_memory_attempt(uuid, uuid, uuid) to authenticated;
grant execute on function public.finish_game(uuid) to authenticated;
grant execute on function public.abandon_game(uuid) to authenticated;
