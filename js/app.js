const $ = selector => document.querySelector(selector);
let mode = 'login', pendingBuy = null, activeGame = null, gameTimer = null;
let currentUser = null, decksCache = [], dailyClaimedUserId = null;
const purchasesInProgress = new Set();
let gameStarting = false;

const gameTypes = [
  { id: 'listen', icon: '🔊', title: 'Nghe và chọn hình', age: '5–7 tuổi', text: 'Nghe từ tiếng Anh rồi chọn đúng hình.' },
  { id: 'memory', icon: '🃏', title: 'Lật thẻ tìm cặp', age: '5–9 tuổi', text: 'Ghép từ tiếng Anh với nghĩa tiếng Việt.' },
  { id: 'spell', icon: '🔤', title: 'Xếp chữ', age: '7–12 tuổi', text: 'Nghe gợi ý rồi xếp các chữ thành từ.' },
  { id: 'sentence', icon: '✏️', title: 'Điền từ vào câu', age: '9–12 tuổi', text: 'Chọn từ còn thiếu trong câu ví dụ.' },
  { id: 'truefalse', icon: '⏱️', title: 'Đúng hay sai trong 60 giây', age: '8–12 tuổi', text: 'Đọc và trả lời nhanh trong 60 giây.' }
];

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}

function messageFor(error) {
  const message = String(error && error.message || error || '');
  if (message.includes('not configured')) return message;
  if (/not enough coins/i.test(message)) return 'Bạn chưa đủ xu để mua bộ từ này.';
  if (/already owned/i.test(message)) return 'Bạn đã sở hữu bộ từ này rồi.';
  if (/already answered/i.test(message)) return 'Câu trả lời đã được ghi nhận. Hãy tiếp tục nhé!';
  if (/answer too quickly/i.test(message)) return 'Hãy nghe hoặc đọc gợi ý trước khi trả lời nhé.';
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/email not confirmed/i.test(message)) return 'Hãy xác nhận email trước khi đăng nhập.';
  if (/user already registered|already been registered/i.test(message)) return 'Email này đã có tài khoản.';
  if (/username_lower_uidx|duplicate key/i.test(message)) return 'Tên hiển thị đã được sử dụng.';
  if (/permission denied|row-level security/i.test(message)) return 'Bạn không có quyền thực hiện thao tác này.';
  if (/failed to fetch|network/i.test(message)) return 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.';
  return message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

function setStatus(text, type) {
  const status = $('#appStatus');
  if (!status) return;
  status.textContent = text || '';
  status.hidden = !text;
  status.className = `app-status${type ? ` ${type}` : ''}`;
}

function setAuthStatus(text, type) {
  const status = $('#authErr');
  status.textContent = text || '';
  status.className = type === 'success' ? 'success-message' : 'err';
}

async function render() {
  setStatus('Đang tải dữ liệu học tập…');
  try {
    currentUser = await Auth.current();
    if (currentUser && dailyClaimedUserId !== currentUser.id) {
      await Auth.claimDailyLogin();
      dailyClaimedUserId = currentUser.id;
      currentUser = await Auth.current();
    }

    const results = await Promise.all([
      Store.decks(currentUser),
      currentUser ? Auth.dailyInfo(currentUser) : Promise.resolve(null)
    ]);
    decksCache = results[0];
    renderHeader(currentUser);
    renderDecks(currentUser);
    renderDailyNote(currentUser, results[1]);
    renderGameChoices(currentUser);
    setStatus('');
  } catch (error) {
    setStatus(messageFor(error), 'error');
  }
}

function renderHeader(user) {
  $('#user').innerHTML = user
    ? `Chào <b>${esc(user.username)}</b>, bạn có 🪙 ${user.coins} xu
       ${user.role === 'admin' ? '<a class="btn s" href="admin.html">Quản trị</a>' : ''}
       <button class="btn s" id="out">Đăng xuất</button>`
    : '<button class="btn s" id="in">Đăng nhập</button>';
}

function renderDecks(user) {
  $('#decks').innerHTML = decksCache.map(deck => `<article class="card">
    <div class="em">${esc(deck.emoji)}</div><h3>${esc(deck.title)}</h3>
    <p>${deck.words.length} từ vựng</p>
    ${deck.owned
      ? `<button class="btn ok" data-open="${esc(deck.id)}">Học ngay</button>`
      : deck.price === 0
        ? '<button class="btn ok" data-register>Nhận bộ miễn phí</button>'
      : `<button class="btn" data-buy="${esc(deck.id)}">Mua bằng ${deck.price} xu</button>`}
  </article>`).join('') || '<p>Chưa có bộ từ nào được xuất bản.</p>';
}

function renderDailyNote(user, daily) {
  $('#dailyNote').textContent = user
    ? `Hôm nay bạn đã kiếm ${daily.earned}/${daily.limit} xu.${daily.loginBonus ? ` Thưởng đăng nhập hôm nay: +${daily.loginBonus} xu.` : ' Đăng nhập mỗi ngày nhận tối đa 2 xu.'}`
    : 'Đăng nhập để lưu xu và tiến trình học của bạn.';
}

function renderGameChoices(user) {
  const owned = user ? decksCache.filter(deck => deck.owned && deck.words.length >= 5) : [];
  $('#gameDeck').innerHTML = owned.map(deck =>
    `<option value="${esc(deck.id)}">${esc(deck.emoji)} ${esc(deck.title)}</option>`
  ).join('');
  $('#gameDeck').disabled = !owned.length;
  $('#games').innerHTML = gameTypes.map(game => `<article class="card game-card">
    <div class="em">${game.icon}</div><h3>${game.title}</h3><span class="age">${game.age}</span>
    <p>${game.text}</p>
    ${game.id === 'memory'
      ? '<label>Số cặp <select id="pairCount"><option value="4">4 cặp</option><option value="6">6 cặp</option><option value="8">8 cặp</option></select></label>'
      : ''}
    <button class="btn" data-game="${game.id}" ${!user || !owned.length ? 'disabled' : ''}>
      ${user ? 'Chơi ngay' : 'Đăng nhập để chơi'}
    </button>
  </article>`).join('');
  updatePairOptions();
}

function updatePairOptions() {
  const pairCount = $('#pairCount'), deckSelect = $('#gameDeck');
  if (!pairCount || !deckSelect) return;
  const deck = decksCache.find(item => item.id === deckSelect.value);
  Array.from(pairCount.options).forEach(option => {
    option.disabled = !deck || Number(option.value) > deck.words.length;
  });
  if (pairCount.selectedOptions[0] && pairCount.selectedOptions[0].disabled) pairCount.value = '4';
}

function openDeck(deckId) {
  const deck = decksCache.find(item => item.id === deckId);
  if (!currentUser || !deck || !deck.owned) return;
  $('#studyTitle').textContent = `${deck.emoji} ${deck.title}`;
  $('#cards').innerHTML = deck.words.map(word => `<article class="card">
    <div class="word"><h3>${esc(word.en)}</h3><button class="btn speak" data-say="${esc(word.en)}" aria-label="Nghe phát âm ${esc(word.en)}">🔊</button></div>
    <div class="ipa">${esc(word.ipa)}</div>
    <div class="vi">${esc(word.vi)}</div>
    <div class="ex">${esc(word.ex)} <button class="btn speak" data-say="${esc(word.ex)}" aria-label="Nghe câu ví dụ">🔊</button></div>
  </article>`).join('');
  $('#home').hidden = true;
  $('#gameScreen').hidden = true;
  $('#study').hidden = false;
  scrollTo(0, 0);
}

async function buy(deckId) {
  if (purchasesInProgress.has(deckId)) return;
  const deck = decksCache.find(item => item.id === deckId);
  if (!currentUser) {
    pendingBuy = deckId;
    return showAuth('login');
  }
  if (!deck) return;
  if (!confirm(`Mua bộ "${deck.title}" với ${deck.price} xu?`)) return;
  purchasesInProgress.add(deckId);
  try {
    await Store.purchaseDeck(deckId);
    await render();
    openDeck(deckId);
  } catch (error) {
    setStatus(messageFor(error), 'error');
  } finally {
    purchasesInProgress.delete(deckId);
  }
}

function showAuth(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';
  $('#authTitle').textContent = registering ? 'Tạo tài khoản mới' : 'Đăng nhập';
  $('#authBtn').textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập';
  $('#authSwitch').textContent = registering ? 'Tôi đã có tài khoản' : 'Tạo tài khoản mới';
  $('#authUsernameLabel').hidden = !registering;
  $('#authUsername').required = registering;
  $('#authEmailLabel').hidden = false;
  $('#au').autocomplete = 'email';
  $('#ap').autocomplete = registering ? 'new-password' : 'current-password';
  setAuthStatus('');
  if (!$('#authDlg').open) $('#authDlg').showModal();
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

async function startGame(type) {
  if (!currentUser) return showAuth('login');
  if (gameStarting) return;
  const deck = decksCache.find(item => item.id === $('#gameDeck').value && item.owned);
  if (!deck || deck.words.length < 5) return;

  gameStarting = true;
  stopGameTimer();
  setStatus('Đang chuẩn bị trò chơi…');
  try {
    const memoryPairs = type === 'memory' ? Number($('#pairCount').value) : 4;
    const session = await Auth.startGame(deck.id, type, memoryPairs);
    activeGame = {
      type,
      userId: currentUser.id,
      deck,
      sessionId: session.session_id,
      total: session.total_questions,
      correct: 0,
      answered: false,
      question: null,
      cards: session.cards || [],
      flipped: [],
      matched: new Set(),
      mismatch: false,
      busy: false
    };
    $('#home').hidden = true;
    $('#study').hidden = true;
    $('#gameScreen').hidden = false;
    setStatus('');

    if (type === 'truefalse') startTrueFalseTimer();
    if (type === 'memory') renderGameQuestion();
    else await nextGameQuestion();
    scrollTo(0, 0);
  } catch (error) {
    activeGame = null;
    $('#home').hidden = false;
    $('#gameScreen').hidden = true;
    setStatus(messageFor(error), 'error');
  } finally {
    gameStarting = false;
  }
}

async function nextGameQuestion() {
  const game = activeGame;
  if (!game) return;
  const question = await Auth.getGameQuestion(game.sessionId);
  if (question.finished) return finishGame();
  game.question = question;
  game.answered = false;
  renderGameQuestion();
}

function startTrueFalseTimer() {
  const game = activeGame;
  const start = Date.now();
  game.secondsLeft = 60;
  gameTimer = setInterval(() => {
    if (activeGame !== game) return stopGameTimer();
    game.secondsLeft = Math.max(0, 60 - Math.floor((Date.now() - start) / 1000));
    const timer = $('#gameTimer');
    if (timer) timer.textContent = `⏱️ ${game.secondsLeft} giây`;
    if (game.secondsLeft === 0) {
      stopGameTimer();
      setTimeout(() => finishGame(), 700);
    }
  }, 200);
}

function renderGameQuestion() {
  const game = activeGame;
  if (!game) return;
  const meta = gameTypes.find(item => item.id === game.type);
  const progress = game.type === 'truefalse'
    ? `Đúng ${game.correct} câu`
    : game.type === 'memory'
      ? `${game.correct}/${game.total} cặp`
      : `${game.question.index}/${game.total} câu`;
  let body = '';

  if (game.type === 'listen') {
    const prompt = game.question.prompt;
    body = `<p>Nghe từ tiếng Anh và chọn hình đúng:</p>
      <button class="btn speak" data-say="${esc(prompt.en)}">🔊 Nghe lại</button>
      <div class="answer-grid">${prompt.choices.map((word, index) => {
        const image = emojiFor(word), fallback = ['🌟', '🎈', '🚀', '🍀'][index];
        return `<button class="answer-image" data-choice="${esc(word.id)}" aria-label="Chọn hình ${esc(word.en)}">${image === '🌟' ? `${fallback}<span>${esc(word.en)}</span>` : image}</button>`;
      }).join('')}</div>`;
  } else if (game.type === 'spell') {
    const prompt = game.question.prompt;
    game.letterOrder = prompt.letters.map((letter, index) => ({ letter, id: index }));
    game.chosenLetters = [];
    body = `<p>Xếp chữ thành từ đúng:</p><div class="game-clue">${emojiFor({ en: prompt.en, vi: prompt.meaning })} <span>${esc(prompt.meaning)}</span></div>
      <button class="btn speak" data-say="${esc(prompt.en)}">🔊 Nghe gợi ý</button>
      <div class="letter-answer" id="letterAnswer"></div>
      <div class="letter-bank">${game.letterOrder.map(item => `<button class="letter-tile" data-letter="${item.id}">${esc(item.letter)}</button>`).join('')}</div>
      <div class="row"><button class="btn s" data-reset-letters>↩ Xóa chữ</button><button class="btn" data-submit-word>Trả lời</button></div>`;
  } else if (game.type === 'sentence') {
    const prompt = game.question.prompt;
    body = `<p>Chọn từ còn thiếu:</p><blockquote>${esc(prompt.sentence)}</blockquote>
      <div class="answer-grid">${prompt.choices.map(word => `<button class="btn answer-text" data-choice="${esc(word.id)}">${esc(word.en)}</button>`).join('')}</div>`;
  } else if (game.type === 'memory') {
    body = `<p>Lật hai thẻ để ghép từ tiếng Anh với nghĩa tiếng Việt. Ghép đúng sẽ nghe phát âm.</p>
      <div class="memory-grid">${game.cards.map(card => {
        const shown = game.matched.has(card.id) || game.flipped.includes(card.id);
        const disabled = game.matched.has(card.id) || game.flipped.includes(card.id) || game.mismatch || game.busy;
        return `<button class="memory-card ${shown ? 'revealed' : ''} ${game.matched.has(card.id) ? 'matched' : ''}" data-memory="${esc(card.id)}" ${disabled ? 'disabled' : ''}>${shown ? esc(card.text) : '❔'}</button>`;
      }).join('')}</div><p id="gameFeedback" class="game-feedback" aria-live="polite"></p>`;
  } else {
    const prompt = game.question.prompt;
    body = `<div id="gameTimer" class="timer">⏱️ ${game.secondsLeft} giây</div>
      <p>Đúng hay sai?</p><div class="statement">${esc(prompt.en)}: ${esc(prompt.meaning)}</div>
      <div class="row centered"><button class="btn ok" data-truth="true" ${game.answered ? 'disabled' : ''}>Đúng</button>
      <button class="btn del" data-truth="false" ${game.answered ? 'disabled' : ''}>Sai</button></div>
      <p id="gameFeedback" class="game-feedback" aria-live="polite"></p>`;
  }

  $('#gameContent').innerHTML = `<h2>${meta.icon} ${meta.title}</h2><p class="game-progress">${progress}</p>${body}
    ${game.type !== 'truefalse' && game.type !== 'memory' ? '<p id="gameFeedback" class="game-feedback" aria-live="polite"></p>' : ''}
    ${game.type !== 'truefalse' && game.type !== 'memory' ? '<button class="btn next-btn" data-next hidden>Tiếp tục →</button>' : ''}`;
}

async function submitAnswer(answer) {
  const game = activeGame;
  if (!game || game.answered || game.busy) return;
  const submittedAnswer = String(answer);
  if (game.pendingAnswer !== undefined && game.pendingAnswer !== submittedAnswer) return;
  game.pendingAnswer = submittedAnswer;
  game.busy = true;
  game.answered = true;
  try {
    const result = await Auth.answerGameQuestion(game.question.id, submittedAnswer);
    game.busy = false;
    game.pendingAnswer = undefined;
    game.correct = result.correct_answers;
    if (result.finished) return finishGame();
    const feedback = $('#gameFeedback');
    if (feedback && !result.correct) {
      feedback.textContent = `Không sao nhé! Đáp án đúng là: ${result.answer.en} – ${result.answer.vi}.`;
      speak(result.answer.en);
    } else if (feedback) {
      feedback.textContent = `🎉 Chính xác!${result.awarded > 1 ? ' Thưởng thêm xu vì đúng liên tiếp!' : ''}`;
    }

    if (game.type === 'truefalse') {
      setTimeout(() => {
        if (activeGame === game && game.secondsLeft > 0) {
          nextGameQuestion().catch(error => setStatus(messageFor(error), 'error'));
        }
      }, 350);
    } else if (result.finished) {
      setTimeout(() => finishGame(), 700);
    } else {
      $('[data-next]').hidden = false;
    }
    currentUser = await Auth.current();
    renderHeader(currentUser);
    const daily = await Auth.dailyInfo(currentUser);
    renderDailyNote(currentUser, daily);
  } catch (error) {
    game.busy = false;
    game.answered = false;
    setStatus(messageFor(error), 'error');
  }
}

async function flipMemoryCard(cardId) {
  const game = activeGame;
  if (!game || game.type !== 'memory' || game.busy || game.mismatch || game.flipped.length >= 2) return;
  const card = game.cards.find(item => item.id === cardId);
  if (!card || game.matched.has(card.id) || game.flipped.includes(card.id)) return;
  game.flipped.push(card.id);
  if (card.side === 'en') speak(card.text);
  if (game.flipped.length < 2) return renderGameQuestion();

  game.busy = true;
  renderGameQuestion();
  try {
    const result = await Auth.submitMemoryAttempt(game.sessionId, game.flipped[0], game.flipped[1]);
    game.busy = false;
    if (result.finished && !result.matched) return finishGame();
    if (result.matched) {
      game.matched.add(game.flipped[0]);
      game.matched.add(game.flipped[1]);
      game.flipped = [];
      game.correct = result.matched_pairs;
      speak(result.answer.en);
      renderGameQuestion();
      if (result.finished) setTimeout(() => finishGame(), 500);
      return;
    }
    game.mismatch = true;
    const feedback = $('#gameFeedback');
    if (feedback) feedback.textContent = `Không sao nhé! Cặp đúng là ${result.answer.en} – ${result.answer.vi}.`;
    speak(result.answer.en);
    setTimeout(() => {
      if (activeGame !== game) return;
      game.flipped = [];
      game.mismatch = false;
      renderGameQuestion();
    }, 900);
  } catch (error) {
    game.busy = false;
    game.flipped = [];
    setStatus(messageFor(error), 'error');
    renderGameQuestion();
  }
}

async function finishGame() {
  const game = activeGame;
  if (!game || game.finishing) return;
  game.finishing = true;
  stopGameTimer();
  try {
    const summary = await Auth.finishGame(game.sessionId);
    if (summary.status === 'abandoned') {
      leaveGame(false);
      return;
    }
    currentUser = await Auth.current();
    const daily = await Auth.dailyInfo(currentUser);
    renderHeader(currentUser);
    renderDailyNote(currentUser, daily);
    const ratio = summary.total_questions ? summary.correct_answers / summary.total_questions : 0;
    const stars = game.type === 'truefalse'
      ? (summary.correct_answers >= 15 ? 3 : summary.correct_answers >= 10 ? 2 : 1)
      : (ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1);
    $('#gameContent').innerHTML = `<div class="game-result">
      <div class="em">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <h2>Ván chơi hoàn thành!</h2>
      <p>Bạn trả lời đúng <b>${summary.correct_answers}</b> câu${game.type === 'truefalse' ? '' : ` trên ${summary.total_questions}`}.</p>
      <p>Nhận được <b>🪙 ${summary.coins_awarded} xu</b>${summary.bonus_coins ? ` (gồm ${summary.bonus_coins} xu thưởng chuỗi)` : ''}.</p>
      ${daily.earned >= daily.limit ? `<p>Đã đạt giới hạn ${daily.limit} xu hôm nay. Ngày mai bạn có thể kiếm thêm nhé!</p>` : ''}
      <button class="btn" id="gameResultBack">Chơi trò khác</button>
    </div>`;
    game.finished = true;
  } catch (error) {
    game.finishing = false;
    setStatus(messageFor(error), 'error');
    if (game.type === 'truefalse') {
      setTimeout(() => finishGame(), 1000);
    }
  }
}

function stopGameTimer() {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
}

async function leaveGame(abandon = true) {
  const game = activeGame;
  stopGameTimer();
  activeGame = null;
  $('#home').hidden = false;
  $('#gameScreen').hidden = true;
  if (abandon && game && !game.finished) {
    try {
      await Auth.abandonGame(game.sessionId);
    } catch (error) {
      setStatus(messageFor(error), 'error');
    }
  }
}

document.addEventListener('click', event => {
  const target = event.target.closest('button,a');
  if (!target) return;
  const task = async () => {
    if (target.dataset.buy) await buy(target.dataset.buy);
    else if (target.dataset.open) openDeck(target.dataset.open);
    else if (target.hasAttribute('data-register')) showAuth('register');
    else if (target.dataset.say) speak(target.dataset.say);
    else if (target.dataset.game) await startGame(target.dataset.game);
    else if (target.dataset.choice !== undefined && activeGame) await submitAnswer(target.dataset.choice);
    else if (target.dataset.letter !== undefined && activeGame && !activeGame.answered) {
      const index = Number(target.dataset.letter), letter = activeGame.letterOrder[index];
      if (!activeGame.chosenLetters.some(item => item.id === index)) {
        activeGame.chosenLetters.push({ ...letter });
        $('#letterAnswer').textContent = activeGame.chosenLetters.map(item => item.letter).join('');
        target.disabled = true;
      }
    } else if (target.hasAttribute('data-reset-letters') && activeGame) {
      activeGame.chosenLetters = [];
      $('#letterAnswer').textContent = '';
      document.querySelectorAll('[data-letter]').forEach(button => { button.disabled = false; });
    } else if (target.hasAttribute('data-submit-word') && activeGame) {
      const guess = (activeGame.chosenLetters || []).map(item => item.letter).join('');
      await submitAnswer(guess);
    } else if (target.hasAttribute('data-next') && activeGame) {
      await nextGameQuestion();
    } else if (target.dataset.memory && activeGame) {
      await flipMemoryCard(target.dataset.memory);
    } else if (target.dataset.truth !== undefined && activeGame && !activeGame.answered) {
      await submitAnswer(target.dataset.truth);
    } else if (target.id === 'gameBack' || target.id === 'gameResultBack') await leaveGame();
    else if (target.id === 'in') showAuth('login');
    else if (target.id === 'out') {
      await leaveGame();
      await Auth.logout();
      currentUser = null;
      dailyClaimedUserId = null;
      $('#study').hidden = true;
      await render();
    } else if (target.id === 'back') {
      $('#home').hidden = false;
      $('#study').hidden = true;
    } else if (target.id === 'authSwitch') showAuth(mode === 'login' ? 'register' : 'login');
    else if (target.id === 'authClose') $('#authDlg').close();
  };
  task().catch(error => setStatus(messageFor(error), 'error'));
});

$('#gameDeck').addEventListener('change', updatePairOptions);

$('#authForm').addEventListener('submit', event => {
  event.preventDefault();
  const email = $('#au').value.trim();
  const password = $('#ap').value;
  const username = $('#authUsername').value.trim();
  const submit = $('#authBtn');
  submit.disabled = true;
  setAuthStatus('Đang xác thực…');
  const task = async () => {
    try {
      if (mode === 'register') {
        const result = await Auth.register(username, email, password);
        if (result.confirmationRequired) {
          $('#authDlg').close();
          $('#authForm').reset();
          setStatus('Tài khoản đã tạo. Hãy mở email để xác nhận trước khi đăng nhập.', 'success');
          return;
        }
      } else {
        await Auth.login(email, password);
      }
      $('#authDlg').close();
      $('#authForm').reset();
      setAuthStatus('');
      dailyClaimedUserId = null;
      await render();
      if (pendingBuy) {
        const deckId = pendingBuy;
        pendingBuy = null;
        await buy(deckId);
      }
    } catch (error) {
      setAuthStatus(messageFor(error));
    } finally {
      submit.disabled = false;
    }
  };
  task();
});

render();
