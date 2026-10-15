# A little universe — Diễm Thúy

Landing page sinh nhật nền đen với lời chúc vui vẻ từ một người bạn. Thiên hà và bề mặt hành tinh được tính bằng Python; các ngôi sao chuyển động trên ba mặt phẳng quỹ đạo quanh hành tinh. Có thể kéo hành tinh để xoay, cuộn xuống khám phá lời chúc cho Diễm Thúy và bấm vào lời mời được khoanh tròn để đếm ngược trước khi ước.

Khi mới vào trang, hai cánh rèm có nếp vải che kín màn hình. Người xem bấm **Bấm để kéo rèm** hoặc chạm vào rèm để hai cánh từ từ được kéo sang trái và phải, mở ra vũ trụ phía sau. Trang được khóa cuộn trong lúc chờ và kéo rèm.

## Chạy website

Yêu cầu Python 3.11 trở lên, không cần cài thư viện hay npm:

```powershell
python app.py
```

Mở **http://127.0.0.1:8000**. Có thể đổi cổng bằng `--port 8080`.

Trên máy này, nếu lệnh `python` mở Microsoft Store, dùng runtime đã cài:

```powershell
& "$env:LOCALAPPDATA\Python\pythoncore-3.11-64\python.exe" app.py
```

## Python và chuyển động

- `generate_universe.py` dùng các hàm toán học để phân bố sao và vẽ thiên hà. Kết quả tính một lần vào `assets/galaxy.png` và `assets/universe.json`.
- `generate_orbits.py` tính bề mặt hành tinh có mây xoáy, ánh sáng và khí quyển, cùng 430 ngôi sao có bán kính, pha, vận tốc và mặt phẳng quỹ đạo riêng. Kết quả ở `assets/planet.png` và `assets/orbits.json`.
- `generate_planet_texture.py` tạo bản đồ bề mặt hành tinh ở `assets/planet-texture.png`. `planet-renderer.js` bọc bản đồ này lên một khối cầu WebGL có ánh sáng để thấy bề mặt xoay khi kéo chuột hoặc vuốt. Hình hành tinh dựng sẵn được dùng dự phòng khi WebGL không khả dụng.
- `app.py` chạy máy chủ Python chỉ phục vụ nội dung website; hỗ trợ tải từng đoạn của file MP3 để trình duyệt phát nhạc và tiếp tục sau khi tạm dừng.
- `script.js` chiếu quỹ đạo elip từ dữ liệu Python lên Canvas, vẽ sao phía sau rồi hành tinh rồi sao phía trước để tạo chiều sâu. Một vòng lặp duy nhất nhắm 60 khung hình/giây ở phần mở đầu, 30 khi cuộn qua, giảm số sao trên điện thoại, giới hạn độ phân giải Canvas và dừng khi tab bị ẩn. Canvas hành tinh ngừng vẽ khi ra khỏi màn hình.
- Sao bay từ xa vào quỹ đạo trong vài giây đầu, sau đó chuyển động liên tục quanh hành tinh. Nền sao trôi, sao băng xuất hiện mỗi vài giây. Rê chuột làm góc nhìn chuyển động nhẹ; chạm hoặc bấm vào khoảng trống tạo một đợt bụi sao.
- Kéo hoặc vuốt hành tinh để xoay; chuyển động tiếp tục nhẹ sau khi thả tay. Hướng dẫn nhỏ ở đầu trang nhắc người xem cuộn xuống.
- Ô điều ước có lời mời được khoanh tròn để bấm. Khi mở, nền tối lại và hiện đếm ngược **3, 2, 1** trước khi mời người xem nhắm mắt, ước một điều.
- Hình thiên hà được dựng sẵn nên không phải tính lại hàng trăm nghìn điểm ở mỗi khung hình. Cuộn trang và phần lớn hiệu ứng dùng CSS transform/opacity.
- Trang hỗ trợ `prefers-reduced-motion`, bàn phím và giao diện điện thoại. Nhạc **COME MY WAY — Sơn Tùng M-TP x Tyga** dùng file người dùng cung cấp tại `assets/come-my-way.mp3`, chỉ bắt đầu sau khi người xem nhấn nút nhạc; bấm lại để tạm dừng. File gốc trong thư mục project được giữ lại.

Tính lại thiên hà, hành tinh và quỹ đạo rồi chạy website:

```powershell
python app.py --generate
```

Chạy bằng Python giúp tải đầy đủ bản đồ sao, bề mặt hành tinh và nhạc. Font Google cần kết nối Internet và có font hệ thống dự phòng.
