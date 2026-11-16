drop policy if exists "Words in published decks are readable" on public.words;

create policy "Owners and admins read published deck words"
on public.words for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.user_decks ud
    join public.decks d on d.id = ud.deck_id
    where ud.user_id = (select auth.uid())
      and ud.deck_id = words.deck_id
      and d.is_published
  )
);
