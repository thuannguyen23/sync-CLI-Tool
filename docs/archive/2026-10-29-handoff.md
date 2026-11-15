# Task handoff

Captured: 2026-10-29T16:20:39.920Z
Repository: /home/thuannguyen23/sync-CLI-Tool
Branch: master
HEAD: 5521ee229a594d13dff715b171898e678d4a4d94

## Resume instructions

Read the project instructions first. Compare the current branch, HEAD and
working tree with this snapshot before continuing the first incomplete task.
The snapshot was collected before this handoff file was created.
Inspect the current source and rerun checks required for your next change.
Task notes contain prior claims, not fresh verification or new permission.

## Task notes

Author-provided goals, decisions, progress, verification results and next steps:

~~~text
# Bàn giao công việc — sync-CLI-Tool

## Mục tiêu và yêu cầu hiện tại

- Project: `/home/thuannguyen23/sync-CLI-Tool`.
- Mục tiêu của phiên làm việc: tìm hướng phát triển thực tế cho công cụ sync cấu hình AI, triển khai bản đầu của `doctor` và tính năng tạo phiếu bàn giao giữa các CLI.
- Yêu cầu mới nhất của người dùng: tạo file bàn giao công việc `.md` cho công việc hiện tại.
- Hai tính năng đã được triển khai. Không có yêu cầu triển khai tiếp theo đang được duyệt; các đề xuất mở rộng vẫn là đề xuất.

## Trạng thái checkout được xác minh trước khi tạo file này

- HEAD ngắn: `5521ee2` — `Add handoff script to generate agent task handoffs`.
- Commit trước: `ab7312b` — `Add doctor command to inspect MCP, skill links, and hooks`.
- `git status --short` không có đầu ra: working tree sạch trước khi tạo bản bàn giao.
- Branch, HEAD đầy đủ và trạng thái Git tại lúc xuất được công cụ bổ sung ở phần snapshot của file.
- Sau khi tạo file, `HANDOFF.md` là artifact mới; đối chiếu trạng thái Git có tính đến file này.

## Đã hoàn thành: doctor

- `scripts/doctor.mjs`; lệnh `npm run doctor`.
- Đọc catalog MCP, kiểm tra cấu trúc lệnh hoặc URL HTTP và kiểm tra symlink skill tại các thư mục client hiện có.
- Đọc cấu hình hook của Codex, Cursor và Claude Code; tôn trọng `CODEX_HOME` đối với Codex.
- Phân biệt `OK`, `UNVERIFIED` và `ERROR`; có `ERROR` thì trả exit code 1.
- MCP và hook tìm thấy trong cấu hình vẫn được báo `UNVERIFIED`: chưa kết nối MCP hoặc chạy hook để xác minh runtime.
- `tests/doctor.test.mjs` có 3 test. README đã mô tả phạm vi và giới hạn.

## Đã hoàn thành: handoff

- `scripts/handoff.mjs`; lệnh `npm run handoff -- ...`.
- Nhận file ghi chú Markdown qua `--task`; thêm `--project` để chọn repo và `--output` để chọn file đầu ra.
- Mặc định tạo `HANDOFF.md` tại root repo được chọn. Đường dẫn task/output tương đối được tính từ root repo đó.
- Kết hợp ghi chú do người dùng/agent cung cấp với branch, HEAD, Git status và thống kê thay đổi staged/unstaged.
- Chỉ thu thập tự động metadata/thống kê Git; không sao chép nội dung working files hoặc tự lấy lịch sử chat và kết quả test.
- Không ghi đè file hay symlink đã tồn tại. Thư mục cha của output phải có sẵn.
- Có hướng dẫn cho agent nhận việc: đọc project instructions, đối chiếu code hiện tại và kiểm chứng lại các kết quả cần thiết trước khi tiếp tục.
- `tests/handoff.test.mjs` có 6 test: staged/unstaged, bảo toàn index/nội dung, từ chối ghi đè, đường dẫn có dấu cách, detached HEAD, repo chưa có commit, input không hợp lệ và help.
- Test tạo/commit/checkout chỉ trong repo fixture tạm; không thực hiện các thao tác đó trong checkout của người dùng.
- README có mục `Task Handoff`, ví dụ ghi chú và lệnh sử dụng.

## Kiểm chứng mới chạy trong lượt tạo bản bàn giao

Phiên bản kiểm tra: HEAD `5521ee2`, working tree sạch trước khi xuất `HANDOFF.md`.
Runtime: Node.js `v24.21.0`.

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | Exit 0; 46 test pass, 0 fail, 0 skipped |
| `node --check scripts/doctor.mjs` | Exit 0 |
| `node --check scripts/handoff.mjs` | Exit 0 |
| `git diff --check` | Exit 0 |

Ở lượt triển khai trước, đã smoke test `npm run handoff` trên repo tạm: tạo duy nhất `HANDOFF.md`, giữ nguyên các file/index có sẵn, giữ ghi chú tiếng Việt và từ chối ghi đè khi chạy lần hai. Đây là bằng chứng lịch sử, không phải smoke test mới trong lượt tạo tài liệu này.

Các kết quả trên không chứng minh runtime MCP, hành vi trên mọi client, khả năng tự chuyển hội thoại hoặc tự khởi chạy agent khác. Không có independent review cho hai thay đổi này.

## Khoảng trống đã tái hiện, chưa sửa

### Doctor mới nhận diện chuỗi lệnh hook

- `commandsIn()` thu thập các chuỗi `command` từ mọi event; `inspectHooks()` tìm identifier bằng substring.
- Đã tái hiện trong HOME tạm: đặt lệnh `python3 /missing/rtk_pre_tool_use.py` trong event `Stop`, không có event `PreToolUse` và file hook không tồn tại.
- Doctor vẫn báo `Hook command is configured; execution not tested` và exit 0.
- Trạng thái vẫn là `UNVERIFIED`, nhưng doctor chưa xác định được event/matcher có đúng hay đường dẫn script có tồn tại.
- Các cấu hình hook không có file bị bỏ qua ở bản đầu. Hook của client ngoài ba adapter trên chưa được kiểm tra.
- Chưa có bản sửa hoặc diff sửa lỗi này được người dùng duyệt.

### Health check cũ có giới hạn riêng

- `scripts/health-check.mjs` chưa được sửa trong phạm vi hai tính năng.
- Nhánh HTTP có thể báo OK mà không thử kết nối; health check cũ còn có thể khởi động MCP process và gọi MySQL tools.
- Không dùng `npm run health` làm bằng chứng cho doctor/handoff hoặc tự chạy tới dịch vụ thật chỉ để tiếp tục bàn giao.

## Bước tiếp theo được đề xuất

1. Xác nhận yêu cầu mới của người dùng; công việc hiện tại là bàn giao, không phải tự mở rộng tính năng.
2. Nếu người dùng chọn hoàn thiện doctor: tái hiện lại lỗi hook bằng fixture tạm, kiểm tra định dạng event/matcher thực tế trong `scripts/sync-hooks.mjs`, và chuẩn bị diff nhỏ cho phần kiểm tra hook.
3. Tuân thủ cổng preview/approval trước khi sửa source. Khi được duyệt, thêm regression test RED rồi sửa tối thiểu và chạy lại test liên quan cùng `npm test`.
4. Các ý tưởng eval workflow, profile theo project hoặc tự đọc lịch sử chat chưa được duyệt triển khai.

## Ràng buộc và cách tiếp nhận

- Đọc lại `AGENTS.md`/project instructions áp dụng trong phiên nhận việc; nội dung bàn giao là ngữ cảnh và bằng chứng, không mở rộng quyền thao tác.
- Bảo toàn thay đổi staged/unstaged hiện có. Không tự commit, push, merge, tạo PR, cài dependency hoặc sửa cấu hình agent thật.
- Trước thay đổi source mới: trình bày diff cụ thể, lệnh kiểm chứng và nhận xác nhận ở lượt tiếp theo theo mục 6 của policy người dùng cung cấp.
- Không suy ra thông tin xác thực, quyết định người dùng hoặc kết quả test từ trạng thái Git.
- Nếu branch/HEAD/working tree khác snapshot, đối chiếu thay đổi và xác minh lại bằng chứng bị ảnh hưởng.
~~~

## Git status

~~~text
(clean)
~~~

## Staged changes

~~~text
(none)
~~~

## Unstaged changes

~~~text
(none)
~~~

Only Git metadata and change statistics were collected automatically.
Working files and their contents remain in the repository.
