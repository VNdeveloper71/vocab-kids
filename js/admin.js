const $ = selector => document.querySelector(selector);
let adminUser = null;

function showStatus(text, type) {
  const status = $('#adminStatus');
  status.textContent = text || '';
  status.hidden = !text;
  status.className = `app-status${type ? ` ${type}` : ''}`;
}

function messageFor(error) {
  const message = String(error && error.message || error || '');
  if (message.includes('not configured')) return message;
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/permission denied|row-level security/i.test(message)) return 'Bạn không có quyền thực hiện thao tác này.';
  if (/starter deck cannot be deleted/i.test(message)) return 'Bộ từ miễn phí cần được giữ lại cho tài khoản mới.';
  if (/failed to fetch|network/i.test(message)) return 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.';
  return message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

async function gate() {
  showStatus('Đang kiểm tra phiên đăng nhập…');
  try {
    adminUser = await Auth.current();
    if (adminUser) await Auth.claimDailyLogin();
    adminUser = await Auth.current();
    const isAdmin = Boolean(adminUser && adminUser.role === 'admin');
    $('#login').hidden = isAdmin;
    $('#panel').hidden = !isAdmin;
    $('#out').hidden = !isAdmin;
    if (!isAdmin && adminUser) {
      showStatus('Tài khoản này chưa được cấp quyền quản trị.', 'error');
    } else {
      showStatus('');
    }
    if (isAdmin) await draw();
  } catch (error) {
    $('#login').hidden = false;
    $('#panel').hidden = true;
    $('#out').hidden = true;
    showStatus(messageFor(error), 'error');
  }
}

async function draw() {
  const decks = await Store.decks(adminUser);
  $('#wd').innerHTML = decks.map(deck =>
    `<option value="${esc(deck.id)}">${esc(deck.emoji)} ${esc(deck.title)}</option>`
  ).join('');
  $('#list').innerHTML = decks.map(deck => `<div class="deckrow">
    <div class="deckrow-heading">
      <b>${esc(deck.emoji)} ${esc(deck.title)}</b> – ${deck.price} xu – ${deck.words.length} từ
      ${deck.is_published ? '<span class="admin-badge">Đã xuất bản</span>' : '<span class="admin-badge unpublished">Bản nháp</span>'}
      ${deck.slug === 'starter' ? '<span class="admin-badge">Bộ miễn phí mặc định</span>' : `<button class="btn del" type="button" data-deck="${esc(deck.id)}">Xóa bộ</button>`}
    </div>
    <form class="deck-edit" data-edit-deck="${esc(deck.id)}">
      <label>Tên bộ<input name="title" value="${esc(deck.title)}" maxlength="100" required></label>
      <label>Emoji<input name="emoji" value="${esc(deck.emoji)}" maxlength="8" required></label>
      <label>Giá xu<input name="price" type="number" value="${deck.price}" min="0" required ${deck.slug === 'starter' ? 'disabled' : ''}></label>
      <label class="publish-toggle"><input name="isPublished" type="checkbox" ${deck.is_published ? 'checked' : ''} ${deck.slug === 'starter' ? 'disabled' : ''}> Xuất bản</label>
      <button class="btn s" type="submit">Lưu bộ từ</button>
    </form>
    <ul>${deck.words.map(word => `<li><form class="word-edit" data-edit-word="${esc(word.id)}">
      <label>Tiếng Anh<input name="en" value="${esc(word.en)}" maxlength="160" required></label>
      <label>Phiên âm<input name="ipa" value="${esc(word.ipa)}" maxlength="160"></label>
      <label>Nghĩa<input name="vi" value="${esc(word.vi)}" maxlength="240" required></label>
      <label>Câu ví dụ<input name="ex" value="${esc(word.ex)}" maxlength="500"></label>
      <button class="btn s" type="submit">Lưu từ</button>
      <button class="btn del" type="button" data-word="${esc(word.id)}">Xóa</button>
    </form></li>`).join('')}</ul></div>`
  ).join('') || '<p>Chưa có bộ từ nào.</p>';
}

$('#lf').addEventListener('submit', event => {
  event.preventDefault();
  const submit = event.submitter || $('#lf button[type="submit"]') || $('#lf button');
  submit.disabled = true;
  showStatus('Đang đăng nhập…');
  const task = async () => {
    try {
      await Auth.login($('#lu').value.trim(), $('#lp').value);
      adminUser = await Auth.current();
      if (!adminUser || adminUser.role !== 'admin') {
        showStatus('Tài khoản này chưa được cấp quyền quản trị.', 'error');
        return;
      }
      await Auth.claimDailyLogin();
      showStatus('');
      $('#le').textContent = '';
      $('#lf').reset();
      await gate();
    } catch (error) {
      showStatus(messageFor(error), 'error');
      $('#le').textContent = '';
    } finally {
      submit.disabled = false;
    }
  };
  task();
});

$('#out').addEventListener('click', async () => {
  try {
    await Auth.logout();
    adminUser = null;
    await gate();
  } catch (error) {
    showStatus(messageFor(error), 'error');
  }
});

$('#deckForm').addEventListener('submit', event => {
  event.preventDefault();
  const submit = event.submitter || event.target.querySelector('button');
  submit.disabled = true;
  const task = async () => {
    try {
      await Store.createDeck({
        title: $('#dt').value,
        emoji: $('#de').value,
        price: $('#dp').value
      });
      event.target.reset();
      $('#de').value = '📚';
      $('#dp').value = 50;
      await draw();
      showStatus('Đã tạo bộ từ mới.', 'success');
    } catch (error) {
      showStatus(messageFor(error), 'error');
    } finally {
      submit.disabled = false;
    }
  };
  task();
});

$('#wordForm').addEventListener('submit', event => {
  event.preventDefault();
  const submit = event.submitter || event.target.querySelector('button');
  submit.disabled = true;
  const task = async () => {
    try {
      await Store.addWord($('#wd').value, {
        en: $('#we').value,
        ipa: $('#wi').value,
        vi: $('#wv').value,
        ex: $('#wx').value
      });
      event.target.reset();
      await draw();
      showStatus('Đã thêm từ vựng vào bộ.', 'success');
    } catch (error) {
      showStatus(messageFor(error), 'error');
    } finally {
      submit.disabled = false;
    }
  };
  task();
});

$('#list').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const task = async () => {
    try {
      if (button.dataset.deck) {
        if (!confirm('Xóa cả bộ từ này khỏi cơ sở dữ liệu?')) return;
        await Store.deleteDeck(button.dataset.deck);
      } else if (button.dataset.word) {
        if (!confirm('Xóa từ vựng này?')) return;
        await Store.deleteWord(button.dataset.word);
      } else {
        return;
      }
      await draw();
      showStatus('Đã cập nhật nội dung.', 'success');
    } catch (error) {
      showStatus(messageFor(error), 'error');
    }
  };
  task();
});

$('#list').addEventListener('submit', event => {
  const form = event.target.closest('form');
  if (!form || (!form.dataset.editDeck && !form.dataset.editWord)) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  const task = async () => {
    try {
      if (form.dataset.editDeck) {
        await Store.updateDeck(form.dataset.editDeck, {
          title: form.elements.title.value,
          emoji: form.elements.emoji.value,
          price: form.elements.price.value,
          isPublished: form.querySelector('[name="isPublished"]').checked
        });
      } else {
        await Store.updateWord(form.dataset.editWord, {
          en: form.elements.en.value,
          ipa: form.elements.ipa.value,
          vi: form.elements.vi.value,
          ex: form.elements.ex.value
        });
      }
      await draw();
      showStatus('Đã lưu thay đổi.', 'success');
    } catch (error) {
      showStatus(messageFor(error), 'error');
    } finally {
      submit.disabled = false;
    }
  };
  task();
});

gate();
