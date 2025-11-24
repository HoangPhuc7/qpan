// ====== CONFIG ======
const EXAM_DURATION_SECONDS = 30 * 60; // 30 phút
const QUESTION_COUNT = 25;
const QUESTIONS_TXT_PATH = "questions.txt";

// ====== STATE ======
let QUESTION_BANK = [];
let selectedQuestions = [];
let timerInterval = null;
let remainingSeconds = EXAM_DURATION_SECONDS;
let examStarted = false;
let examFinished = false;

const startBtn = document.getElementById("start-btn");
const submitBtn = document.getElementById("submit-btn");
const timerEl = document.getElementById("timer");
const questionsContainer = document.getElementById("questions-container");
const resultBox = document.getElementById("result-box");
const loadStatus = document.getElementById("load-status");

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandomQuestions(bank, count) {
    const shuffled = shuffleArray(bank);
    const n = Math.min(count, shuffled.length);
    return shuffled.slice(0, n);
}

function cleanAzotaText(raw) {
    if (!raw) return "";
    // Bỏ mấy tag [!b:$ ...], [!info:3], [!b!i:$.$] ...
    let s = raw.replace(/\[!.*?\]/g, "");
    // Bỏ ký tự $
    s = s.replace(/\$/g, "");
    // Gộp khoảng trắng
    s = s.replace(/\s+/g, " ");
    return s.trim();
}

async function loadQuestionsFromTxt() {
    try {
        const res = await fetch(QUESTIONS_TXT_PATH);
        if (!res.ok) {
            throw new Error("Không tải được " + QUESTIONS_TXT_PATH);
        }
        const text = await res.text();
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        const questions = [];
        let current = null;
        let lastOptionLetter = null;

        for (const lineRaw of lines) {
            const line = lineRaw.trim();
            if (!line) continue;

            // Bắt đầu câu mới
            const cauMatch = line.match(/^Câu\s+(\d+)\s*:?(.*)$/i);
            if (cauMatch) {
                if (current) {
                    // chỉ push khi có đáp án đúng
                    if (current.correct && Object.keys(current.options).length > 0) {
                        questions.push(current);
                    }
                }
                const qId = parseInt(cauMatch[1], 10);
                const qTextRaw = cauMatch[2] || "";
                current = {
                    id: qId,
                    text: cleanAzotaText(qTextRaw),
                    options: {},
                    correct: null,
                };
                lastOptionLetter = null;
                continue;
            }

            if (!current) {
                // Bỏ qua mọi thứ trước Câu 1
                continue;
            }

            // Dòng đáp án: (*?)A. / B. / C. / D.
            const optMatch = line.match(/^\*?([ABCD])\.\s*(.*)$/);
            if (optMatch) {
                const letter = optMatch[1];
                const isCorrect = line.startsWith("*");
                const optTextRaw = optMatch[2] || "";
                const optText = cleanAzotaText(optTextRaw);
                current.options[letter] = optText;
                if (isCorrect) current.correct = letter;
                lastOptionLetter = letter;
                continue;
            }

            // Dòng tiếp tục (câu hỏi hoặc nối dài đáp án)
            const extra = cleanAzotaText(line);
            if (!extra) continue;

            if (lastOptionLetter && current.options[lastOptionLetter]) {
                current.options[lastOptionLetter] += " " + extra;
            } else {
                current.text = (current.text ? current.text + " " : "") + extra;
            }
        }

        // push câu cuối cùng
        if (current && current.correct && Object.keys(current.options).length > 0) {
            questions.push(current);
        }

        return questions;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

function renderQuestions() {
    questionsContainer.innerHTML = "";

    const labelLetters = ["A", "B", "C", "D"]; // vị trí hiển thị cố định

    selectedQuestions.forEach((q, index) => {
        const card = document.createElement("div");
        card.className = "question-card";
        card.dataset.questionId = q.id;

        const header = document.createElement("div");
        header.className = "question-header";

        const title = document.createElement("div");
        title.innerHTML =
            '<span class="question-index">Câu ' +
            (index + 1) +
            '.</span> <span class="question-text">' +
            q.text +
            "</span>";

        header.appendChild(title);
        card.appendChild(header);

        const optionsDiv = document.createElement("div");
        optionsDiv.className = "options";

        // Lấy danh sách đáp án gốc: [ ['A','...'], ['B','...'], ... ]
        const entries = Object.entries(q.options);
        // Trộn thứ tự nội dung
        const shuffledEntries = shuffleArray(entries);

        let correctDisplayLabel = null; // A/B/C/D nào là đúng sau khi trộn

        shuffledEntries.forEach(([origLetter, text], i) => {
            const displayLetter = labelLetters[i];
            if (!displayLetter) return; // phòng hờ nếu thiếu

            const optionLabel = document.createElement("label");
            optionLabel.className = "option";
            optionLabel.dataset.label = displayLetter; // dùng label hiển thị (A/B/C/D) để chấm

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "q-" + index;
            radio.value = displayLetter; // user chọn A/B/C/D mới

            const labelSpan = document.createElement("span");
            labelSpan.className = "option-label";
            labelSpan.textContent = displayLetter + "."; // luôn A. B. C. D.

            const textSpan = document.createElement("span");
            textSpan.textContent = " " + text;

            optionLabel.appendChild(radio);
            optionLabel.appendChild(labelSpan);
            optionLabel.appendChild(textSpan);
            optionsDiv.appendChild(optionLabel);

            // Nếu đáp án gốc đúng (origLetter == q.correct)
            // thì vị trí mới đúng là displayLetter (A/B/C/D mới)
            if (origLetter === q.correct) {
                correctDisplayLabel = displayLetter;
            }
        });

        // Ghi đáp án đúng (theo label mới) lên thẻ câu hỏi để chấm điểm
        if (correctDisplayLabel) {
            card.dataset.correct = correctDisplayLabel;
        } else {
            // fallback, rất hiếm khi cần
            card.dataset.correct = q.correct || "";
        }

        card.appendChild(optionsDiv);

        const footer = document.createElement("div");
        footer.className = "question-footer";
        footer.textContent = "Chọn một đáp án.";
        card.appendChild(footer);

        questionsContainer.appendChild(card);
    });
}

function startTimer() {
    remainingSeconds = EXAM_DURATION_SECONDS;
    timerEl.textContent = formatTime(remainingSeconds);

    timerInterval = setInterval(() => {
        remainingSeconds--;
        timerEl.textContent = formatTime(remainingSeconds);

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (!examFinished) {
                gradeExam(true); // auto nộp
            }
        }
    }, 1000);
}

function gradeExam(auto = false) {
    if (examFinished) return;
    examFinished = true;
    submitBtn.disabled = true;
    startBtn.disabled = false;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    let correctCount = 0;

    selectedQuestions.forEach((q, index) => {
        const card = questionsContainer.children[index];
        const correctLabel = card.dataset.correct; // A/B/C/D sau khi random

        const selector = 'input[name="q-' + index + '"]:checked';
        const checkedInput = document.querySelector(selector);
        const userAns = checkedInput ? checkedInput.value : null; // A/B/C/D user chọn

        const optionLabels = card.querySelectorAll(".option");

        optionLabels.forEach((lbl) => {
            const optLabel = lbl.dataset.label; // A/B/C/D hiển thị
            const radio = lbl.querySelector('input[type="radio"]');
            radio.disabled = true;

            if (optLabel === correctLabel) {
                lbl.classList.add("correct");
            }
            if (userAns && optLabel === userAns && userAns !== correctLabel) {
                lbl.classList.add("incorrect-selected");
            }
        });

        if (userAns === correctLabel) {
            correctCount++;
        }
    });

    const total = selectedQuestions.length;
    const percent = ((correctCount / total) * 100).toFixed(1);
    const score10 = ((correctCount / total) * 10).toFixed(2);

    resultBox.style.display = "block";
    resultBox.innerHTML =
        "Điểm: <span>" + score10 + "</span> - " +
        correctCount + " / " + total +
        (auto
            ? ' <span class="warning">Hết thời gian nên hệ thống tự nộp bài.</span>'
            : "");


    // Kéo lên đầu trang để thấy kết quả
    window.scrollTo({ top: 0, behavior: "smooth" });
}


// ====== EVENTS ======
startBtn.addEventListener("click", () => {
    if (!QUESTION_BANK || QUESTION_BANK.length === 0) {
        alert("Chưa load được ngân hàng câu hỏi.");
        return;
    }
    examStarted = true;
    examFinished = false;
    resultBox.style.display = "none";
    resultBox.textContent = "";

    startBtn.disabled = true;
    submitBtn.disabled = false;

    selectedQuestions = pickRandomQuestions(QUESTION_BANK, QUESTION_COUNT);
    renderQuestions();
    startTimer();
});

submitBtn.addEventListener("click", () => {
    if (!examStarted || examFinished) return;
    const confirmSubmit = confirm("Bạn chắc chắn muốn nộp bài?");
    if (confirmSubmit) {
        gradeExam(false);
    }
});

// Khởi tạo timer mặc định
timerEl.textContent = formatTime(EXAM_DURATION_SECONDS);

// ====== LOAD QUESTION BANK ======
(async () => {
    try {
        const qs = await loadQuestionsFromTxt();
        QUESTION_BANK = qs;
        if (!qs.length) {
            loadStatus.textContent =
                "Không phân tích được câu hỏi từ questions.txt (số câu = 0). Kiểm tra lại format.";
            return;
        }
        loadStatus.textContent =
            "Đã tải " + qs.length + " câu hỏi.";
        startBtn.disabled = false;
    } catch (e) {
        loadStatus.textContent =
            "Lỗi khi tải questions.txt. Mở console để xem chi tiết.";
        console.error(e);
    }
})();