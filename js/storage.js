/* Lớp lưu trữ dùng localStorage. Muốn dùng server thật: thay các hàm trong Store & Auth bằng fetch() tới API. */
const Store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  decks() {
    const decks = this.get('vk_decks', null) || this.seed();
    let changed = false;
    if (!decks.some(d => d.id === 'starter')) {
      decks.unshift(this.starterDeck());
      changed = true;
    }
    const animals = decks.find(d => d.id === 'animals');
    if (animals && animals.price !== 10) {
      animals.price = 10;
      changed = true;
    }
    if (changed) this.saveDecks(decks);
    return decks;
  },
  saveDecks(d) { this.set('vk_decks', d); },
  starterDeck() {
    const w = (en, ipa, vi, ex) => ({ en, ipa, vi, ex });
    return {
      id: 'starter', title: 'Từ vựng đầu tiên', emoji: '🌱', price: 0,
      words: [
        w('Dog', '/dɒɡ/', 'Con chó', 'The dog barks and guards the house.'),
        w('Cat', '/kæt/', 'Con mèo', 'The cat says meow and catches mice.'),
        w('Elephant', '/ˈel.ɪ.fənt/', 'Con voi', 'The elephant has a long trunk.'),
        w('Apple', '/ˈæp.əl/', 'Quả táo', 'I eat a red apple.'),
        w('Book', '/bʊk/', 'Quyển sách', 'I read a book every day.')
      ]
    };
  },
  seed() {
    const w = (en, ipa, vi, ex) => ({ en, ipa, vi, ex });
    const d = [this.starterDeck(), {
      id: 'animals', title: 'Động vật', emoji: '🐾', price: 10,
      words: [
        w('Dog', '/dɒɡ/', 'Con chó', 'The dog barks and guards the house.'),
        w('Cat', '/kæt/', 'Con mèo', 'The cat says meow and catches mice.'),
        w('Elephant', '/ˈel.ɪ.fənt/', 'Con voi', 'The elephant has a long trunk.'),
        w('Lion', '/ˈlaɪ.ən/', 'Con sư tử', 'The lion is the king of the jungle.'),
        w('Monkey', '/ˈmʌŋ.ki/', 'Con khỉ', 'The monkey loves eating bananas.'),
        w('Penguin', '/ˈpeŋ.ɡwɪn/', 'Chim cánh cụt', 'The penguin lives in the ice.'),
        w('Tiger', '/ˈtaɪ.ɡər/', 'Con hổ', 'The tiger has orange and black stripes.'),
        w('Bear', '/beər/', 'Con gấu', 'The bear loves honey and hibernates.'),
        w('Rabbit', '/ˈræb.ɪt/', 'Con thỏ', 'The rabbit has long ears and eats carrots.'),
        w('Horse', '/hɔːs/', 'Con ngựa', 'The horse runs fast and people can ride it.')
      ]
    }];
    this.saveDecks(d); return d;
  }
};

const Auth = {
  hash(s) { let x = 5381; for (const c of s) x = ((x << 5) + x + c.charCodeAt(0)) >>> 0; return x.toString(16); },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  users() {
    const u = Store.get('vk_users', null);
    if (u) {
      let changed = false;
      Store.decks();
      Object.values(u).forEach(user => {
        if (!Array.isArray(user.owned)) { user.owned = []; changed = true; }
        if (!user.owned.includes('starter')) { user.owned.push('starter'); changed = true; }
      });
      if (changed) Store.set('vk_users', u);
      return u;
    }
    const seed = { admin: { pass: this.hash('admin123'), role: 'admin', coins: 500, owned: ['starter'] } };
    Store.set('vk_users', seed); return seed;
  },
  current() { const n = Store.get('vk_session', null); const u = this.users()[n]; return u ? { username: n, ...u } : null; },
  register(name, pass) {
    const us = this.users();
    if (us[name]) return 'Tên đăng nhập đã tồn tại.';
    us[name] = { pass: this.hash(pass), role: 'user', coins: 0, owned: ['starter'] };
    Store.set('vk_users', us); Store.set('vk_session', name); return '';
  },
  login(name, pass) {
    const u = this.users()[name];
    if (!u || u.pass !== this.hash(pass)) return 'Sai tên đăng nhập hoặc mật khẩu.';
    Store.set('vk_session', name); return '';
  },
  logout() { localStorage.removeItem('vk_session'); },
  update(name, patch) { const us = this.users(); Object.assign(us[name], patch); Store.set('vk_users', us); },
  dailyInfo(name) {
    const us = this.users(), user = us[name], today = this.today();
    if (user.dailyEarnedDate !== today) {
      user.dailyEarnedDate = today;
      user.dailyEarned = 0;
      Store.set('vk_users', us);
    }
    return { earned: user.dailyEarned || 0, limit: 30 };
  },
  addEarnedCoins(name, requested) {
    const us = this.users(), user = us[name], today = this.today();
    if (user.dailyEarnedDate !== today) {
      user.dailyEarnedDate = today;
      user.dailyEarned = 0;
    }
    const remaining = Math.max(0, 30 - (user.dailyEarned || 0));
    const award = Math.min(Math.max(0, Math.floor(requested)), remaining);
    user.coins = (user.coins || 0) + award;
    user.dailyEarned = (user.dailyEarned || 0) + award;
    Store.set('vk_users', us);
    return award;
  },
  claimDailyLogin() {
    const user = this.current();
    if (!user || user.dailyBonusDate === this.today()) return 0;
    const us = this.users(), account = us[user.username];
    account.dailyBonusDate = this.today();
    Store.set('vk_users', us);
    const award = this.addEarnedCoins(user.username, 2);
    const updated = this.users();
    updated[user.username].dailyBonusAward = award;
    Store.set('vk_users', updated);
    return award;
  }
};

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
