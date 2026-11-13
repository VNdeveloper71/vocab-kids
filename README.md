# Từ Vựng Vui (Vocab Kids)

Website học tiếng Anh cho trẻ em bằng thẻ từ và trò chơi. Tài khoản, nội dung, quyền sở hữu bộ từ và xu được lưu trên Supabase để đồng bộ giữa các thiết bị.

## Kiến trúc

- Frontend tĩnh: HTML, CSS và JavaScript hiện có.
- Authentication và PostgreSQL: Supabase Auth + Supabase Database.
- Truy cập dữ liệu từ trình duyệt bằng Supabase JavaScript SDK v2 và **publishable key**.
- RLS áp dụng cho tất cả bảng trong `public`. Mua bộ, thưởng đăng nhập và chấm trò chơi thực hiện bằng PostgreSQL RPC có kiểm tra `auth.uid()`.
- Không dùng Supabase Storage vì hiện chưa có nội dung tải lên.

### Các bảng chính

`profiles`, `decks`, `words`, `user_decks`, `daily_rewards`, `game_sessions`, `game_questions`, `game_cards`, `coin_transactions`.

`game_questions` và `game_cards` không có policy đọc trực tiếp. Các RPC chỉ trả đề bài/thẻ cần thiết, giữ đáp án đúng ở database và ghi điểm sau khi kiểm tra câu trả lời. Mua bộ khóa hồ sơ người dùng trong transaction, kiểm tra số dư và quyền sở hữu trước khi trừ xu. Thưởng từ trò chơi và đăng nhập cùng dùng giới hạn 100 xu/ngày theo múi giờ Việt Nam.

## Cài đặt Supabase

1. Tạo một project tại [supabase.com](https://supabase.com/). Lưu database password ở trình quản lý mật khẩu, không đưa vào repository.
2. Cài Supabase CLI theo tài liệu chính thức, đăng nhập và liên kết project:

   ```text
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Lệnh `db push` chạy các migration trong `supabase/migrations/`, tạo schema, seed hai bộ từ mẫu, RLS, RPC và các cập nhật sau này. Nếu chạy SQL thủ công trong SQL Editor, chỉ chạy từng migration mới một lần theo thứ tự; không chạy lặp migration đã áp dụng.
   Nếu project đã chạy migration khởi tạo trước đó bằng SQL Editor, hãy chạy riêng migration mới nhất chưa áp dụng, hiện tại là `supabase/migrations/20261113000001_fix_listening_choices_and_daily_cap.sql`. Không chạy lại migration khởi tạo.
3. Trong **Authentication → URL Configuration**, đặt Site URL theo địa chỉ triển khai, ví dụ `https://your-site.example`. Thêm URL localhost dùng khi phát triển vào Redirect URLs. Bật xác nhận email, đặt độ dài mật khẩu tối thiểu 8 ký tự và cấu hình SMTP nếu muốn email xác nhận được gửi ổn định trong production.
4. Trong **Project Settings → API**, lấy Project URL và **Publishable key** (`sb_publishable_...`). Không dùng `service_role`, secret key hay database password trên frontend.
5. Tạo `js/supabase-config.js` bằng cách sao chép `js/supabase-config.example.js`, rồi thay URL và publishable key bằng giá trị của project:

   ```js
   window.VOCAB_KIDS_SUPABASE_CONFIG = {
     url: 'https://YOUR_PROJECT_REF.supabase.co',
     publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY'
   };
   ```

   Tệp cấu hình thật đã được `.gitignore` loại trừ. `.env.example` chỉ là tài liệu placeholder: website tĩnh không tự đọc biến môi trường; khi deploy, đưa hai giá trị công khai này vào tệp cấu hình riêng hoặc bước thay thế cấu hình của hosting.
6. Chạy local bằng một static server, ví dụ:

   ```text
   python -m http.server 8000
   ```

   Mở `http://localhost:8000`. Không nên dùng `file://` vì Auth callback và HTTPS/secure context có thể không hoạt động như khi deploy.

## Tạo Admin đầu tiên an toàn

1. Đăng ký tài khoản qua website bằng email của người quản trị và xác nhận email.
2. Trong Supabase Dashboard, mở **Authentication → Users**, sao chép UUID của tài khoản đã xác nhận.
3. Trong SQL Editor, chạy câu lệnh sau và thay UUID bằng đúng giá trị:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = 'AUTH_USER_UUID';
   ```

Chỉ chủ project/quản trị viên tin cậy thực hiện bước này. Trigger đăng ký luôn đặt role là `student`; role trong user metadata không được dùng để cấp quyền. Không có tài khoản admin mặc định trong ứng dụng.

## Deploy frontend

Deploy `index.html`, `admin.html`, thư mục `css/`, `js/` và tệp `js/supabase-config.js` lên static hosting hỗ trợ HTTPS (ví dụ GitHub Pages, Netlify hoặc Cloudflare Pages). Tệp cấu hình production chứa URL và publishable key — key này được thiết kế để trình duyệt nhìn thấy; an toàn phụ thuộc vào RLS và RPC. Không deploy `.env` thật, secret key hoặc `service_role`.

Sau khi deploy, cập nhật Site URL/Redirect URLs trong Supabase Authentication và kiểm tra đăng ký, xác nhận email, đăng nhập, mua bộ và các trò chơi. Đăng nhập cùng một tài khoản trên thiết bị khác để kiểm tra dữ liệu cloud đồng bộ.

## Dữ liệu localStorage cũ

Migration không đọc hoặc xóa `vk_users`, `vk_decks` hay `vk_session` trên thiết bị. Các mật khẩu trước đây dùng hash tự viết; role, xu, bộ đã mua và điểm game đều có thể bị sửa từ trình duyệt nên **không được tự động tin cậy/chuyển sang cloud**. Người dùng cần đăng ký Supabase Auth mới. Hai bộ từ mẫu được seed dùng chung; nội dung do admin tạo cục bộ cần được rà soát và nhập lại từ trang quản trị sau khi cấp quyền Admin. Giữ bản lưu localStorage cũ cho tới khi xác nhận đã xử lý nội dung cần giữ.

## Checklist kiểm thử bảo mật và chức năng

Các mục dưới đây là checklist để chạy trên project Supabase đã cấu hình; **chưa được xác nhận chạy trên một project cloud thực tế**.

- [ ] Anonymous: đọc được deck/word đã published; không đọc profile, đơn mua, lịch sử game, thưởng hoặc giao dịch.
- [ ] Student: đăng ký với username/email, xác nhận email, đăng nhập/đăng xuất; phiên được khôi phục sau khi mở lại trang.
- [ ] Student A: không đọc được profile, đơn mua, rewards, game session hoặc coin transactions của Student B.
- [ ] Student: thử cập nhật `profiles.role='admin'` — phải bị chặn bởi quyền cột/RLS.
- [ ] Student: thử cập nhật `profiles.coins` — phải bị chặn.
- [ ] Student: thử insert vào `user_decks`, `daily_rewards`, `game_sessions`, `game_questions`, `game_cards` và `coin_transactions` — phải bị chặn.
- [ ] Student thiếu xu: `purchase_deck` thất bại, số dư không âm và không có giao dịch mua được ghi.
- [ ] Student mua cùng deck đồng thời/lặp lại: chỉ một quyền sở hữu; không bị trừ xu hai lần.
- [ ] Student gọi thưởng đăng nhập nhiều lần cùng ngày: chỉ nhận một lần; game + login không vượt 100 xu/ngày.
- [ ] Student thay điểm/answer request từ DevTools: chỉ câu trả lời được RPC chấm đúng mới có xu; answer replay không cộng xu lần nữa.
- [ ] Admin đã được cấp role trong Dashboard/SQL Editor: tạo deck, thêm/xóa từ và xóa deck thành công.
- [ ] Student hoặc anonymous gọi trực tiếp thao tác quản trị qua REST: RLS từ chối.
- [ ] Đăng nhập cùng tài khoản ở hai thiết bị: profile, xu, quyền sở hữu và nội dung hiển thị đồng bộ.
- [ ] Tắt mạng, token hết hạn và email chưa xác nhận: giao diện báo lỗi/trạng thái phù hợp; không hiển thị thành công giả.

## Hạn chế hiện tại

- Do chưa có Supabase project/credentials trong repository, không thể chạy migration hoặc xác minh chính sách trên PostgreSQL thật trong quá trình phát triển tại đây. Hãy chạy toàn bộ checklist sau khi tạo project.
- Website cần kết nối mạng tới Supabase và CDN của Supabase JS SDK.
- Điểm game được xác minh bởi RPC theo câu trả lời gửi lên; server không thể chứng minh một người thật đã tự thao tác UI. Giới hạn thời gian, quyền sở hữu câu hỏi, chống gửi lại và daily cap giảm khả năng gian lận; không dùng xu làm tài sản có giá trị thật.
