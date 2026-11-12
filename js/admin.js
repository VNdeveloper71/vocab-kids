const $ = s => document.querySelector(s);

function gate() {
  const u = Auth.current(), ok = u && u.role === 'admin';
  $('#login').hidden = ok; $('#panel').hidden = !ok; $('#out').hidden = !ok;
  if (ok) draw();
}

function draw() {
  const decks = Store.decks();
  $('#wd').innerHTML = decks.map(d => `<option value="${esc(d.id)}">${esc(d.emoji)} ${esc(d.title)}</option>`).join('');
  $('#list').innerHTML = decks.map(d => `<div class="deckrow">
    <b>${esc(d.emoji)} ${esc(d.title)}</b> – ${d.price} xu – ${d.words.length} từ
    <button class="btn del" data-deck="${esc(d.id)}">Xóa bộ</button>
    <ul>${d.words.map((w, i) => `<li>${esc(w.en)} ${esc(w.ipa)} – ${esc(w.vi)}
      <button class="btn del" data-d="${esc(d.id)}" data-i="${i}">Xóa</button></li>`).join('')}</ul></div>`).join('');
}

$('#lf').addEventListener('submit', e => {
  e.preventDefault();
  const err = Auth.login($('#lu').value.trim(), $('#lp').value);
  const u = Auth.current();
  if (err || !u || u.role !== 'admin') { Auth.logout(); $('#le').textContent = err || 'Tài khoản này không có quyền admin.'; return; }
  $('#le').textContent = ''; gate();
});

$('#out').onclick = () => { Auth.logout(); gate(); };

$('#deckForm').addEventListener('submit', e => {
  e.preventDefault();
  const decks = Store.decks();
  decks.push({ id: 'd' + Date.now(), title: $('#dt').value.trim(), emoji: $('#de').value || '📚', price: +$('#dp').value, words: [] });
  Store.saveDecks(decks); e.target.reset(); $('#de').value = '📚'; $('#dp').value = 50; draw();
});

$('#wordForm').addEventListener('submit', e => {
  e.preventDefault();
  const decks = Store.decks(), d = decks.find(x => x.id === $('#wd').value);
  if (!d) return alert('Hãy tạo bộ từ trước.');
  d.words.push({ en: $('#we').value.trim(), ipa: $('#wi').value.trim(), vi: $('#wv').value.trim(), ex: $('#wx').value.trim() });
  Store.saveDecks(decks);
  ['we', 'wi', 'wv', 'wx'].forEach(i => $('#' + i).value = ''); draw();
});

$('#list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  let decks = Store.decks();
  if (b.dataset.deck) { if (!confirm('Xóa cả bộ từ này?')) return; decks = decks.filter(d => d.id !== b.dataset.deck); }
  else if (b.dataset.d) decks.find(d => d.id === b.dataset.d).words.splice(+b.dataset.i, 1);
  Store.saveDecks(decks); draw();
});

gate();
