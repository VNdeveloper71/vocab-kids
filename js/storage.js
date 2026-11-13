const supabaseConfig = window.VOCAB_KIDS_SUPABASE_CONFIG || {};
const supabaseReady = Boolean(
  window.supabase &&
  typeof window.supabase.createClient === 'function' &&
  typeof supabaseConfig.url === 'string' &&
  supabaseConfig.url.startsWith('https://') &&
  typeof supabaseConfig.publishableKey === 'string' &&
  supabaseConfig.publishableKey.length > 20 &&
  !supabaseConfig.publishableKey.includes('YOUR_')
);
const supabaseClient = supabaseReady
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  })
  : null;

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error('Ứng dụng chưa được cấu hình Supabase. Hãy tạo js/supabase-config.js theo hướng dẫn trong README.');
  }
  return supabaseClient;
}

function throwOnError(result) {
  if (result.error) throw result.error;
  return result.data;
}

function vietnamDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const Auth = {
  async register(username, email, password) {
    const result = await requireSupabase().auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } }
    });
    const data = throwOnError(result);
    return { confirmationRequired: !data.session };
  },
  async login(email, password) {
    const result = await requireSupabase().auth.signInWithPassword({ email, password });
    return throwOnError(result);
  },
  async logout() {
    const result = await requireSupabase().auth.signOut();
    throwOnError(result);
  },
  async current() {
    const client = requireSupabase();
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    if (!sessionResult.data.session) return null;

    const authResult = await client.auth.getUser();
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user) return null;

    const result = await client
      .from('profiles')
      .select('id, username, role, coins')
      .eq('id', authResult.data.user.id)
      .single();
    const profile = throwOnError(result);
    return { ...profile, email: authResult.data.user.email };
  },
  async claimDailyLogin() {
    const result = await requireSupabase().rpc('claim_daily_login');
    return throwOnError(result);
  },
  async dailyInfo(user) {
    user = user || await this.current();
    if (!user) return { earned: 0, loginBonus: 0, limit: 30 };
    const result = await requireSupabase()
      .from('daily_rewards')
      .select('earned_coins, login_bonus')
      .eq('user_id', user.id)
      .eq('reward_date', vietnamDate())
      .maybeSingle();
    const reward = throwOnError(result);
    return {
      earned: reward ? reward.earned_coins : 0,
      loginBonus: reward ? reward.login_bonus : 0,
      limit: 30
    };
  },
  async startGame(deckId, gameType, memoryPairs) {
    const result = await requireSupabase().rpc('start_game', {
      p_deck_id: deckId,
      p_game_type: gameType,
      p_memory_pairs: memoryPairs || 4
    });
    return throwOnError(result);
  },
  async getGameQuestion(sessionId) {
    const result = await requireSupabase().rpc('get_game_question', { p_session_id: sessionId });
    return throwOnError(result);
  },
  async answerGameQuestion(questionId, answer) {
    const result = await requireSupabase().rpc('answer_game_question', {
      p_question_id: questionId,
      p_answer: String(answer)
    });
    return throwOnError(result);
  },
  async submitMemoryAttempt(sessionId, firstCardId, secondCardId) {
    const result = await requireSupabase().rpc('submit_memory_attempt', {
      p_session_id: sessionId,
      p_first_card: firstCardId,
      p_second_card: secondCardId
    });
    return throwOnError(result);
  },
  async finishGame(sessionId) {
    const result = await requireSupabase().rpc('finish_game', { p_session_id: sessionId });
    return throwOnError(result);
  },
  async abandonGame(sessionId) {
    if (!sessionId) return;
    const result = await requireSupabase().rpc('abandon_game', { p_session_id: sessionId });
    throwOnError(result);
  },
  today() {
    return vietnamDate();
  }
};

const Store = {
  async decks(user) {
    const client = requireSupabase();
    const deckResult = await client
      .from('decks')
      .select('id, slug, title, emoji, price, is_published')
      .order('title');
    const decks = throwOnError(deckResult);

    const wordsResult = await client
      .from('words')
      .select('id, deck_id, en, ipa, vi, ex')
      .order('en');
    const words = throwOnError(wordsResult);

    let ownedIds = new Set();
    if (user) {
      const ownedResult = await client
        .from('user_decks')
        .select('deck_id')
        .eq('user_id', user.id);
      ownedIds = new Set(throwOnError(ownedResult).map(item => item.deck_id));
    }

    return decks.map(deck => ({
      ...deck,
      owned: ownedIds.has(deck.id),
      words: words.filter(word => word.deck_id === deck.id)
    }));
  },
  async createDeck(deck) {
    const slugBase = deck.title.trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'deck';
    const result = await requireSupabase().from('decks').insert({
      slug: `${slugBase}-${crypto.randomUUID().slice(0, 8)}`,
      title: deck.title.trim(),
      emoji: deck.emoji || '📚',
      price: Number(deck.price),
      is_published: true
    });
    throwOnError(result);
  },
  async deleteDeck(deckId) {
    const result = await requireSupabase().from('decks').delete().eq('id', deckId);
    throwOnError(result);
  },
  async updateDeck(deckId, deck) {
    const result = await requireSupabase().from('decks')
      .update({
        title: deck.title.trim(),
        emoji: deck.emoji || '📚',
        price: Number(deck.price),
        is_published: Boolean(deck.isPublished)
      })
      .eq('id', deckId)
      .select('id')
      .single();
    throwOnError(result);
  },
  async addWord(deckId, word) {
    const result = await requireSupabase().from('words').insert({
      deck_id: deckId,
      en: word.en.trim(),
      ipa: word.ipa.trim(),
      vi: word.vi.trim(),
      ex: word.ex.trim()
    });
    throwOnError(result);
  },
  async updateWord(wordId, word) {
    const result = await requireSupabase().from('words')
      .update({
        en: word.en.trim(),
        ipa: word.ipa.trim(),
        vi: word.vi.trim(),
        ex: word.ex.trim()
      })
      .eq('id', wordId)
      .select('id')
      .single();
    throwOnError(result);
  },
  async deleteWord(wordId) {
    const result = await requireSupabase().from('words').delete().eq('id', wordId);
    throwOnError(result);
  },
  async purchaseDeck(deckId) {
    const result = await requireSupabase().rpc('purchase_deck', { p_deck_id: deckId });
    return throwOnError(result);
  }
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
