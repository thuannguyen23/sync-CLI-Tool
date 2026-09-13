# Cẩm Nang Khôi Phục & Phòng Ngừa Mất Session Chat Trong Google Antigravity IDE

> **Google Antigravity IDE Chat History Recovery & Stability Hardening Guide**  
> *Tổng hợp giải pháp kỹ thuật, phân tích nguyên nhân gốc rễ và bộ công cụ tự động hóa từ cộng đồng nhà phát triển.*

---

## 📌 Mục Lục
1. [Bản Chất Vấn Đề (Dữ Liệu Có Thực Sự Mất Không?)](#1-bản-chất-vấn-đề)
2. [Nguyên Nhân Gốc Rễ Từ Kiến Trúc](#2-nguyên-nhân-gốc-rễ)
3. [Quy Trình Khôi Phục Dữ Liệu Thực Chiến](#3-quy-trình-khôi-phục-dữ-liệu)
4. [Công Cụ Cứu Hộ Tự Động 1-Click: `agy-rescue`](#4-công-cụ-cứu-hộ-tự-động-1-click-agy-rescue)
5. [Bộ Cấu Hình Bọc Giáp (`settings.json`)](#5-bộ-cấu-hình-bọc-giáp-settingsjson)
6. [Có Nên Dùng Chung Session Giữa IDE, 2.0 Và CLI?](#6-có-nên-dùng-chung-session-giữa-ide-20-và-cli)
7. [Thói Quen Vàng Để Không Bao Giờ Bị Mất Chat](#7-thói-quen-vàng-để-không-bao-giờ-bị-mất-chat)

---

## 1. Bản Chất Vấn Đề

Khi bạn mở Antigravity IDE lên và thấy khung chat trống trơn hoặc chỉ hiển thị các session từ nhiều tuần trước:

> [!NOTE]  
> **Dữ liệu hội thoại của bạn CHƯA HỀ BỊ XÓA khỏi ổ cứng.**  
> Các tệp cơ sở dữ liệu SQLite (`.db`) và Protobuf (`.pb`) vẫn nằm nguyên vẹn trong hệ thống tệp cục bộ. Cái bị mất chỉ là **Bộ chỉ mục hiển thị (Display Index)** trên thanh bên giao diện.

---

## 2. Nguyên Nhân Gốc Rễ

Hiện tượng này xuất phát từ 4 cơ chế ngầm trong kiến trúc của Antigravity IDE:

1. **Lỗi Migration cấu trúc thư mục sau Auto-Update:**  
   Antigravity đổi tên thư mục dữ liệu giữa các phiên bản (từ `~/.gemini/antigravity/` sang `~/.gemini/antigravity-ide/`). IDE chỉ nạp các file trong thư mục mới, biến toàn bộ các session nằm ở thư mục cũ thành "mồ côi" (orphaned).
2. **Lỗi reset `chat.ChatSessionStore.index`:**  
   Khi IDE tự động cập nhật ngầm dưới nền, tiến trình migration gặp lỗi parse schema và tự động reset trường chỉ mục trong SQLite `state.vscdb` về rỗng (`{"version": 1, "entries": {}}`), đồng thời ghi đè luôn file backup.
3. **Tắt máy đột ngột làm treo file Write-Ahead Log (`.db-wal`):**  
   IDE giữ các tin nhắn mới nhất trên RAM và chỉ xả xuống đĩa khi thoát ứng dụng. Nếu hệ điều hành bị tắt nóng (shutdown máy khi IDE còn mở), dữ liệu bị kẹt lại ở file `*.db-wal` chưa kịp checkpoint vào file `.db` chính.
4. **Lệch định danh Workspace Hash:**  
   IDE gán lịch sử chat theo đường dẫn mở dự án. Nếu mở từ terminal trong thư mục con thay vì thư mục gốc, IDE sẽ sinh ra một Workspace ID mới và giấu toàn bộ lịch sử của thư mục cha.

---

## 3. Quy Trình Khôi Phục Dữ Liệu

### Bước 1: Hợp nhất các phiên chat bị phân mảnh
Sao chép an toàn các file database hội thoại từ thư mục cũ sang thư mục hoạt động của IDE (không ghi đè file hiện có):
```bash
cp --update=none ~/.gemini/antigravity/conversations/*.db ~/.gemini/antigravity-ide/conversations/
cp --update=none ~/.gemini/antigravity/conversation_summaries.db ~/.gemini/antigravity-ide/ 2>/dev/null || true
```

### Bước 2: Giải phóng và commit file WAL bị treo
Nếu có phiên chat bị crash do tắt máy đột ngột (xuất hiện file `.db-wal`), chạy lệnh SQLite checkpoint:
```python
import sqlite3, glob, os

convs_dir = os.path.expanduser("~/.gemini/antigravity-ide/conversations")
for db in glob.glob(os.path.join(convs_dir, "*.db")):
    if os.path.exists(db + "-wal"):
        con = sqlite3.connect(db)
        con.execute("PRAGMA wal_checkpoint(FULL);")
        con.close()
        print(f"Checkpointed: {os.path.basename(db)}")
```

---

## 4. Công Cụ Cứu Hộ Tự Động 1-Click: `agy-rescue`

Cài đặt script này vào `~/.local/bin/agy-rescue` (cấp quyền `chmod +x`) để có thể chạy cứu hộ bất cứ lúc nào:

```bash
#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== [Antigravity IDE Rescue & Sync Tool] ===${NC}"

if pgrep -fl -i "antigravity" | grep -v "grep" | grep -v "agy-rescue" > /dev/null 2>&1; then
    echo -e "${YELLOW}[!] Khuyến nghị đóng IDE (Ctrl+Q) trước để tránh xung đột khóa file SQLite.${NC}"
fi

CONVS_DIR="$HOME/.gemini/antigravity-ide/conversations"
LEGACY_DIR="$HOME/.gemini/antigravity/conversations"
STATE_DIR="$HOME/.config/Antigravity IDE/User/globalStorage"
BACKUP_DIR="$HOME/.gemini/antigravity-ide/backups"

mkdir -p "$CONVS_DIR" "$BACKUP_DIR"

# 1. Checkpoint WAL bị treo
python3 -c "
import os, glob, sqlite3
convs_dir = os.path.expanduser('~/.gemini/antigravity-ide/conversations')
for db in glob.glob(os.path.join(convs_dir, '*.db')):
    if os.path.exists(db + '-wal'):
        try:
            con = sqlite3.connect(db)
            con.execute('PRAGMA wal_checkpoint(FULL);')
            con.close()
            print(f'  ✓ Checkpointed: {os.path.basename(db)}')
        except Exception as e:
            print(f'  ✗ Lỗi {os.path.basename(db)}: {e}')
"

# 2. Đồng bộ các session từ thư mục cũ
if [ -d "$LEGACY_DIR" ]; then
    cp --update=none "$LEGACY_DIR"/*.db "$CONVS_DIR"/ 2>/dev/null || true
    cp --update=none "$HOME/.gemini/antigravity/conversation_summaries.db" "$HOME/.gemini/antigravity-ide/" 2>/dev/null || true
fi

# 3. Tạo snapshot xoay vòng (giữ 7 ngày gần nhất)
TODAY=$(date +%Y%m%d_%H%M%S)
if [ -f "$STATE_DIR/state.vscdb" ]; then
    cp "$STATE_DIR/state.vscdb" "$BACKUP_DIR/state_${TODAY}.vscdb"
    find "$BACKUP_DIR" -name "state_*.vscdb" -mtime +7 -delete 2>/dev/null || true
fi

TOTAL_CHATS=$(ls -1 "$CONVS_DIR"/*.db 2>/dev/null | wc -l)
echo -e "${GREEN}✓ Đã bảo vệ và đồng bộ toàn bộ dữ liệu! (Hiện có: $TOTAL_CHATS phiên)${NC}"
```

---

## 5. Bộ Cấu Hình Bọc Giáp (`settings.json`)

Thêm các cấu hình sau vào `~/.config/Antigravity IDE/User/settings.json` (và cả VS Code chuẩn):

```json
{
  // 1. Khóa cập nhật ngầm - triệt tiêu nguyên nhân gây mất session định kỳ
  "update.mode": "none",

  // 2. Ép khôi phục đúng Workspace và trạng thái làm việc cũ
  "window.restoreWindows": "all",
  "workbench.editor.restoreViewState": true,

  // 3. Chống lệch diff: Formatter chỉ format dòng bạn sửa, không format đè cả file khi Agent can thiệp
  "editor.formatOnSaveMode": "modificationsIfAvailable",

  // 4. Chống khựng phím trên Linux X11: Tắt truy vấn clipboard ngầm
  "chat.clipboardContext.enabled": false,

  // 5. Chống kẹt indexing & giảm 70% CPU: Loại trừ thư mục rác
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/node_modules/**": true,
    "**/.venv/**": true,
    "**/dist/**": true,
    "**/build/**": true
  },

  // 6. Các tính năng nâng tầm trải nghiệm đọc code (QoL)
  "editor.stickyScroll.enabled": true,
  "editor.guides.bracketPairs": "active",
  "terminal.integrated.scrollback": 10000,
  "search.smartCase": true
}
```

---

## 6. Có Nên Dùng Chung Session Giữa IDE, 2.0 Và CLI?

> [!WARNING]  
> **KHÔNG NÊN dùng chung active database giữa 3 bên.**

- **Xung đột khóa file:** Cùng truy cập SQLite sẽ gây lỗi `database is locked`, làm hỏng tiến trình ghi.
- **Lệch cấu trúc dữ liệu:** IDE cần lưu tọa độ con trỏ và diff khối code; 2.0 lưu cây tác vụ đa Agent; CLI lưu luồng văn bản append-only.
- **Ô nhiễm ngữ cảnh:** Dùng chung session sẽ làm phình token không cần thiết khi chỉ hỏi những câu ngắn trong IDE.

### Mô hình phối hợp chuẩn (Separation of Concerns):
- **Antigravity 2.0:** Đóng vai trò **Tổng hành dinh (Architect)** — Lập kế hoạch, thiết kế kiến trúc tổng thể, xuất ra file `PLAN.md`.
- **Antigravity IDE:** Đóng vai trò **Xưởng thi công (Builder)** — Mở file `PLAN.md`, nhận diện code lenses, duyệt inline diff từng dòng.
- **Antigravity CLI:** Đóng vai trò **Tác chiến nhanh (DevOps)** — Chạy test tự động, debug terminal.
- **Cầu nối duy nhất:** **Git Repo & các file tài liệu Markdown** (`AGENTS.md`, `docs/plans/`).

---

## 7. Thói Quen Vàng Để Không Bao Giờ Bị Mất Chat

1. **Graceful Exit (`Ctrl + Q`):** Trước khi tắt máy tính, hãy đóng Antigravity IDE trước 3–5 giây để SQLite xả sạch dữ liệu từ RAM xuống đĩa.
2. **Tuyệt chiêu F5 khi bị ẩn chat:** Mở **Open Agent Manager** > bấm **Open Workspace** > chọn lại thư mục gốc dự án để kích hoạt đọc lại toàn bộ đĩa.
3. **Session Hygiene (`Ctrl + N`):** Xong một tính năng lớn hoặc sau 1–2 ngày, hãy mở chat mới. Đừng dồn một session kéo dài hàng tháng làm vỡ bộ đệm SQLite.
