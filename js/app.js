const $ = s => document.querySelector(s);
let mode = 'login', pendingBuy = null, activeGame = null, gameTimer = null;

const gameTypes = [
  { id: 'listen', icon: '🔊', title: 'Nghe và chọn hình', age: '5–7 tuổi', text: 'Nghe từ tiếng Anh rồi chọn đúng hình.' },
  { id: 'memory', icon: '🃏', title: 'Lật thẻ tìm cặp', age: '5–9 tuổi', text: 'Ghép từ tiếng Anh với nghĩa tiếng Việt.' },
  { id: 'spell', icon: '🔤', title: 'Xếp chữ', age: '7–12 tuổi', text: 'Nghe gợi ý rồi xếp các chữ thành từ.' },
  { id: 'sentence', icon: '✏️', title: 'Điền từ vào câu', age: '9–12 tuổi', text: 'Chọn từ còn thiếu trong câu ví dụ.' },
  { id: 'truefalse', icon: '⏱️', title: 'Đúng hay sai trong 60 giây', age: '8–12 tuổi', text: 'Đọc nghĩa và trả lời nhanh trong 60 giây.' }
];

function speak(t) {
  if (!window.speechSynthesis) return alert('Trình duyệt này chưa hỗ trợ phát âm.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = 0.8;
  speechSynthesis.speak(u);
}

function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function render() {
  let u = Auth.current();
  if (u) {
    Auth.claimDailyLogin();
    u = Auth.current();
  }
  const daily = u ? Auth.dailyInfo(u.username) : null;
  $('#user').innerHTML = u
    ? `Chào <b>${esc(u.username)}</b>, bạn có 🪙 ${u.coins} xu
       ${u.role === 'admin' ? '<a class="btn s" href="admin.html">Quản trị</a>' : ''}
       <button class="btn s" id="out">Đăng xuất</button>`
    : '<button class="btn s" id="in">Đăng nhập</button>';
  $('#decks').innerHTML = Store.decks().map(d => {
    const own = u && u.owned.includes(d.id);
    return `<article class="card"><div class="em">${esc(d.emoji)}</div><h3>${esc(d.title)}</h3>
      <p>${d.words.length} từ vựng</p>` +
      (own ? `<button class="btn ok" data-open="${esc(d.id)}">Học ngay</button>`
           : d.id === 'starter' ? '<button class="btn ok" data-register>Nhận bộ miễn phí</button>'
           : `<button class="btn" data-buy="${esc(d.id)}">Mua bằng ${d.price} xu</button>`) + '</article>';
  }).join('') || '<p>Chưa có bộ từ nào.</p>';
  $('#dailyNote').textContent = u
    ? `Hôm nay bạn đã kiếm ${daily.earned}/${daily.limit} xu.${u.dailyBonusDate === Auth.today() ? ` Thưởng đăng nhập hôm nay: +${u.dailyBonusAward || 0} xu.` : ' Đăng nhập mỗi ngày nhận 2 xu.'}`
    : 'Đăng nhập để lưu xu và tiến trình học của bạn.';
  renderGameChoices(u);
}

function renderGameChoices(user) {
  const owned = user ? Store.decks().filter(d => user.owned.includes(d.id) && d.words.length >= 5) : [];
  $('#gameDeck').innerHTML = owned.map(d => `<option value="${esc(d.id)}">${esc(d.emoji)} ${esc(d.title)}</option>`).join('');
  $('#gameDeck').disabled = !owned.length;
  $('#games').innerHTML = gameTypes.map(g => `<article class="card game-card">
    <div class="em">${g.icon}</div><h3>${g.title}</h3><span class="age">${g.age}</span>
    <p>${g.text}</p>
    ${g.id === 'memory' ? '<label>Số cặp <select id="pairCount"><option value="4">4 cặp</option><option value="6">6 cặp</option><option value="8">8 cặp</option></select></label>' : ''}
    <button class="btn" data-game="${g.id}" ${!user || !owned.length ? 'disabled' : ''}>${user ? 'Chơi ngay' : 'Đăng nhập để chơi'}</button>
  </article>`).join('');
  updatePairOptions();
}

function updatePairOptions() {
  const count = $('#pairCount'), deckSelect = $('#gameDeck');
  if (!count || !deckSelect) return;
  const deck = Store.decks().find(d => d.id === deckSelect.value);
  Array.from(count.options).forEach(o => { o.disabled = !deck || Number(o.value) > deck.words.length; });
  if (count.selectedOptions[0] && count.selectedOptions[0].disabled) count.value = '4';
}

function openDeck(id) {
  const u = Auth.current(), d = Store.decks().find(x => x.id === id);
  if (!u || !d || !u.owned.includes(id)) return;
  $('#studyTitle').textContent = `${d.emoji} ${d.title}`;
  $('#cards').innerHTML = d.words.map(w => `<article class="card">
    <div class="word"><h3>${esc(w.en)}</h3><button class="btn speak" data-say="${esc(w.en)}" aria-label="Nghe phát âm ${esc(w.en)}">🔊</button></div>
    <div class="ipa">${esc(w.ipa)}</div>
    <div class="vi">${esc(w.vi)}</div>
    <div class="ex">${esc(w.ex)} <button class="btn speak" data-say="${esc(w.ex)}" aria-label="Nghe câu ví dụ">🔊</button></div>
  </article>`).join('');
  $('#home').hidden = true; $('#gameScreen').hidden = true; $('#study').hidden = false; scrollTo(0, 0);
}

function buy(id) {
  const u = Auth.current(), d = Store.decks().find(x => x.id === id);
  if (!u) { pendingBuy = id; return showAuth('login'); }
  if (!d) return;
  if (u.coins < d.price) return alert('Bạn chưa đủ xu. Chơi trò chơi để kiếm thêm nhé!');
  if (!confirm(`Mua bộ "${d.title}" với ${d.price} xu?`)) return;
  Auth.update(u.username, { coins: u.coins - d.price, owned: [...u.owned, id] });
  render(); openDeck(id);
}

function showAuth(m) {
  mode = m;
  const reg = m === 'register';
  $('#authTitle').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
  $('#authBtn').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
  $('#authSwitch').textContent = reg ? 'Tôi đã có tài khoản' : 'Tạo tài khoản mới';
  $('#authErr').textContent = '';
  if (!$('#authDlg').open) $('#authDlg').showModal();
}

function startGame(type) {
  const user = Auth.current(), deck = Store.decks().find(d => d.id === $('#gameDeck').value);
  if (!user) return showAuth('login');
  if (!deck || !user.owned.includes(deck.id) || deck.words.length < 5) return;
  stopGameTimer();
  const pairs = type === 'memory' ? Number($('#pairCount').value) : 0;
  activeGame = {
    type, user: user.username, deck, words: shuffle(deck.words), index: 0,
    total: type === 'memory' ? pairs : type === 'truefalse' ? 0 : 5,
    correct: 0, streak: 0, bonus: 0, answered: false,
    matched: new Set(), flipped: [], mismatch: false, letterOrder: []
  };
  if (type === 'memory') {
    activeGame.cards = shuffle(activeGame.words.slice(0, pairs).flatMap((w, i) => [
      { pair: i, side: 'en', text: w.en, word: w },
      { pair: i, side: 'vi', text: w.vi, word: w }
    ]));
    activeGame.words = activeGame.words.slice(0, pairs);
  }
  $('#home').hidden = true; $('#study').hidden = true; $('#gameScreen').hidden = false;
  if (type === 'truefalse') {
    activeGame.secondsLeft = 60;
    nextTrueFalseQuestion();
    gameTimer = setInterval(() => {
      if (!activeGame) return stopGameTimer();
      activeGame.secondsLeft--;
      const timer = $('#gameTimer');
      if (timer) timer.textContent = `⏱️ ${activeGame.secondsLeft} giây`;
      if (activeGame.secondsLeft <= 0) finishGame();
    }, 1000);
  }
  renderGameQuestion();
  scrollTo(0, 0);
}

function emojiFor(word) {
  const key = `${word.en} ${word.vi}`.toLowerCase();
  const choices = [
    [/dog|chó/, '🐶'], [/cat|mèo/, '🐱'], [/elephant|voi/, '🐘'],
    [/apple|táo/, '🍎'], [/book|sách/, '📚'], [/lion|sư tử/, '🦁'],
    [/monkey|khỉ/, '🐵'], [/penguin|cánh cụt/, '🐧'], [/tiger|hổ/, '🐯'],
    [/bear|gấu/, '🐻'], [/rabbit|thỏ/, '🐰'], [/horse|ngựa/, '🐴']
  ];
  const found = choices.find(([pattern]) => pattern.test(key));
  return found ? found[1] : '🌟';
}

function nextTrueFalseQuestion() {
  const g = activeGame, actual = g.deck.words[Math.floor(Math.random() * g.deck.words.length)];
  const isTrue = Math.random() < 0.5;
  const other = g.deck.words.filter(w => w !== actual)[Math.floor(Math.random() * (g.deck.words.length - 1))];
  g.question = { word: actual, meaning: isTrue ? actual.vi : other.vi, answer: isTrue };
  g.answered = false;
}

function renderGameQuestion() {
  const g = activeGame;
  if (!g) return;
  const meta = gameTypes.find(x => x.id === g.type);
  const progress = g.type === 'truefalse' ? `Đúng ${g.correct} câu` : `${g.index + 1}/${g.total} câu`;
  let body = '';
  if (g.type === 'listen') {
    const word = g.words[g.index], options = shuffle([word, ...shuffle(g.deck.words.filter(w => w !== word)).slice(0, 3)]);
    g.question = { word, options };
    speak(word.en);
    body = `<p>Nghe từ tiếng Anh và chọn hình đúng:</p><button class="btn speak" data-say="${esc(word.en)}">🔊 Nghe lại</button>
      <div class="answer-grid">${options.map((w, i) => {
        const image = emojiFor(w);
        const fallback = ['🌟', '🎈', '🚀', '🍀'][i];
        return `<button class="answer-image" data-choice="${i}" aria-label="Chọn hình ${esc(w.en)}">${image === '🌟' ? fallback : image}</button>`;
      }).join('')}</div>`;
  } else if (g.type === 'spell') {
    const word = g.words[g.index];
    g.question = { word };
    g.chosenLetters = [];
    const letters = shuffle(Array.from(word.en.toUpperCase())).map((letter, i) => ({ letter, id: i }));
    g.letterOrder = letters;
    body = `<p>Xếp chữ thành từ đúng:</p><div class="game-clue">${emojiFor(word)} <span>${esc(word.vi)}</span></div>
      <button class="btn speak" data-say="${esc(word.en)}">🔊 Nghe gợi ý</button>
      <div class="letter-answer" id="letterAnswer"></div>
      <div class="letter-bank">${letters.map(x => `<button class="letter-tile" data-letter="${x.id}">${esc(x.letter)}</button>`).join('')}</div>
      <div class="row"><button class="btn s" data-reset-letters>↩ Xóa chữ</button><button class="btn" data-submit-word>Trả lời</button></div>`;
  } else if (g.type === 'sentence') {
    const word = g.words[g.index], options = shuffle([word, ...shuffle(g.deck.words.filter(w => w !== word)).slice(0, 3)]);
    g.question = { word, options };
    const start = word.ex.toLowerCase().indexOf(word.en.toLowerCase());
    const sentence = start < 0 ? word.ex : `${word.ex.slice(0, start)}_____${word.ex.slice(start + word.en.length)}`;
    body = `<p>Chọn từ còn thiếu:</p><blockquote>${esc(sentence)}</blockquote>
      <button class="btn speak" data-say="${esc(word.ex)}">🔊 Nghe câu</button>
      <div class="answer-grid">${options.map((w, i) => `<button class="btn answer-text" data-choice="${i}">${esc(w.en)}</button>`).join('')}</div>`;
  } else if (g.type === 'memory') {
    g.question = {};
    body = `<p>Lật hai thẻ để ghép từ tiếng Anh với nghĩa tiếng Việt. Ghép đúng sẽ nghe phát âm.</p>
      <div class="memory-grid">${g.cards.map((c, i) => {
        const shown = g.matched.has(c.pair) || g.flipped.includes(i);
        const disabled = g.matched.has(c.pair) || g.flipped.includes(i) || g.mismatch;
        return `<button class="memory-card ${shown ? 'revealed' : ''} ${g.matched.has(c.pair) ? 'matched' : ''}" data-memory="${i}" ${disabled ? 'disabled' : ''}>${shown ? esc(c.text) : '❔'}</button>`;
      }).join('')}</div>`;
  } else {
    const q = g.question;
    body = `<div id="gameTimer" class="timer">⏱️ ${g.secondsLeft} giây</div>
      <p>Đúng hay sai?</p><div class="statement">${esc(q.word.en)} = ${esc(q.meaning)}</div>
      <div class="row centered"><button class="btn ok" data-truth="true" ${g.answered ? 'disabled' : ''}>Đúng</button>
      <button class="btn del" data-truth="false" ${g.answered ? 'disabled' : ''}>Sai</button></div>
      <p id="gameFeedback" class="game-feedback" aria-live="polite"></p>`;
  }
  $('#gameContent').innerHTML = `<h2>${meta.icon} ${meta.title}</h2><p class="game-progress">${progress}</p>${body}
    ${g.type !== 'truefalse' && g.type !== 'memory' ? '<p id="gameFeedback" class="game-feedback" aria-live="polite"></p>' : ''}
    ${g.type !== 'truefalse' && g.type !== 'memory' ? '<button class="btn next-btn" data-next hidden>Tiếp tục →</button>' : ''}`;
}

function submitAnswer(isCorrect) {
  const g = activeGame;
  if (!g || g.answered) return;
  g.answered = true;
  if (isCorrect) {
    g.correct++;
    g.streak++;
    if (g.streak % 3 === 0) g.bonus++;
  } else {
    g.streak = 0;
    speak(g.question.word.en);
  }
  const feedback = $('#gameFeedback');
  if (feedback && g.type !== 'truefalse') {
    feedback.textContent = isCorrect
      ? `🎉 Chính xác!${g.streak && g.streak % 3 === 0 ? ' Thưởng thêm 1 xu vì đúng liên tiếp!' : ''}`
      : `Không sao nhé! Đáp án đúng là: ${g.question.word.en} – ${g.question.word.vi}.`;
  }
  if (g.type === 'truefalse') {
    $('#gameFeedback').textContent = isCorrect ? '✅ Chính xác!' : `💡 Đáp án: ${g.question.word.en} = ${g.question.word.vi}`;
    setTimeout(() => {
      if (!activeGame || activeGame !== g || g.secondsLeft <= 0) return;
      nextTrueFalseQuestion();
      renderGameQuestion();
    }, 350);
  } else {
    const next = $('[data-next]');
    if (next) next.hidden = false;
  }
}

function flipMemoryCard(index) {
  const g = activeGame;
  if (!g || g.type !== 'memory' || g.mismatch || g.flipped.length >= 2) return;
  const card = g.cards[index];
  if (!card || g.matched.has(card.pair) || g.flipped.includes(index)) return;
  g.flipped.push(index);
  if (card.side === 'en') speak(card.word.en);
  if (g.flipped.length === 2) {
    const [a, b] = g.flipped.map(i => g.cards[i]);
    if (a.pair === b.pair) {
      g.matched.add(a.pair);
      g.correct++;
      g.streak++;
      if (g.streak % 3 === 0) g.bonus++;
      setTimeout(() => {
        if (activeGame !== g) return;
        g.flipped = [];
        if (g.matched.size === g.total) finishGame();
        else renderGameQuestion();
      }, 450);
    } else {
      g.streak = 0;
      g.mismatch = true;
      setTimeout(() => {
        if (activeGame !== g) return;
        g.flipped = [];
        g.mismatch = false;
        renderGameQuestion();
      }, 850);
    }
  }
  renderGameQuestion();
}

function finishGame() {
  const g = activeGame;
  if (!g || g.finished) return;
  g.finished = true;
  stopGameTimer();
  const requested = g.correct + g.bonus;
  const awarded = Auth.addEarnedCoins(g.user, requested);
  const total = g.type === 'truefalse' ? Math.max(g.correct, 1) : g.total;
  const ratio = g.correct / total;
  const stars = g.type === 'truefalse'
    ? (g.correct >= 15 ? 3 : g.correct >= 10 ? 2 : 1)
    : (ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1);
  render();
  $('#gameContent').innerHTML = `<div class="game-result">
    <div class="em">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    <h2>Ván chơi hoàn thành!</h2>
    <p>Bạn trả lời đúng <b>${g.correct}</b> câu${g.type === 'truefalse' ? '' : ` trên ${g.total}`}.</p>
    <p>Nhận được <b>🪙 ${awarded} xu</b>${g.bonus ? ` (gồm ${g.bonus} xu thưởng chuỗi)` : ''}.</p>
    ${awarded < requested ? '<p>Đã đạt giới hạn 30 xu hôm nay. Ngày mai bạn có thể kiếm thêm nhé!</p>' : ''}
    <button class="btn" id="gameResultBack">Chơi trò khác</button>
  </div>`;
}

function stopGameTimer() {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
}

function leaveGame() {
  stopGameTimer();
  activeGame = null;
  $('#home').hidden = false; $('#gameScreen').hidden = true;
}

document.addEventListener('click', e => {
  const t = e.target.closest('button,a'); if (!t) return;
  if (t.dataset.buy) buy(t.dataset.buy);
  else if (t.dataset.open) openDeck(t.dataset.open);
  else if (t.hasAttribute('data-register')) showAuth('register');
  else if (t.dataset.say) speak(t.dataset.say);
  else if (t.dataset.game) startGame(t.dataset.game);
  else if (t.dataset.choice !== undefined && activeGame) {
    const selected = activeGame.question.options[Number(t.dataset.choice)];
    submitAnswer(selected === activeGame.question.word);
  } else if (t.dataset.letter !== undefined && activeGame && !activeGame.answered) {
    const index = Number(t.dataset.letter), letter = activeGame.letterOrder[index];
    if (!activeGame.chosenLetters) activeGame.chosenLetters = [];
    if (!activeGame.chosenLetters.some(x => x.id === index)) {
      activeGame.chosenLetters.push({ ...letter, id: index });
      $('#letterAnswer').textContent = activeGame.chosenLetters.map(x => x.letter).join('');
      t.disabled = true;
    }
  } else if (t.hasAttribute('data-reset-letters') && activeGame) {
    activeGame.chosenLetters = [];
    $('#letterAnswer').textContent = '';
    document.querySelectorAll('[data-letter]').forEach(b => { b.disabled = false; });
  } else if (t.hasAttribute('data-submit-word') && activeGame) {
    const guess = (activeGame.chosenLetters || []).map(x => x.letter).join('');
    submitAnswer(guess.toLowerCase() === activeGame.question.word.en.toLowerCase());
  } else if (t.hasAttribute('data-next') && activeGame) {
    if (activeGame.index + 1 >= activeGame.total) finishGame();
    else { activeGame.index++; activeGame.answered = false; renderGameQuestion(); }
  } else if (t.dataset.memory !== undefined) flipMemoryCard(Number(t.dataset.memory));
  else if (t.dataset.truth !== undefined && activeGame && !activeGame.answered) {
    submitAnswer((t.dataset.truth === 'true') === activeGame.question.answer);
  } else if (t.id === 'gameBack' || t.id === 'gameResultBack') leaveGame();
  else if (t.id === 'in') showAuth('login');
  else if (t.id === 'out') { Auth.logout(); leaveGame(); $('#study').hidden = true; render(); }
  else if (t.id === 'back') { $('#home').hidden = false; $('#study').hidden = true; }
  else if (t.id === 'authSwitch') showAuth(mode === 'login' ? 'register' : 'login');
  else if (t.id === 'authClose') $('#authDlg').close();
});

$('#gameDeck').addEventListener('change', updatePairOptions);

$('#authForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('#au').value.trim(), p = $('#ap').value;
  const err = mode === 'register' ? Auth.register(n, p) : Auth.login(n, p);
  if (err) { $('#authErr').textContent = err; return; }
  $('#authDlg').close(); $('#authForm').reset(); render();
  if (pendingBuy) { const id = pendingBuy; pendingBuy = null; buy(id); }
});

render();
