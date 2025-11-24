// ====== CONFIG ======
const EXAM_DURATION_SECONDS = 30 * 60; // 30 phút
const QUESTION_COUNT = 25;
const QUESTIONS_TXT_PATH = "questions.txt";

// ====== STATE & DOM ======
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

const navToggle = document.getElementById("nav-toggle");
const navPanel = document.getElementById("question-nav-panel");
const navGrid = document.getElementById("question-nav-grid");

const metaEl = document.querySelector(".meta");

// ====== UTILS ======
function formatTime(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return (
		String(m).padStart(2, "0") +
		" : " +
		String(s).padStart(2, "0")
	);
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
	// bỏ tag [!b:$ ...], [!info:3], ...
	let s = raw.replace(/\[!.*?\]/g, "");
	// bỏ ký tự $
	s = s.replace(/\$/g, "");
	// gộp khoảng trắng
	s = s.replace(/\s+/g, " ");
	return s.trim();
}

async function loadQuestionsFromTxt() {
	const res = await fetch(QUESTIONS_TXT_PATH);
	if (!res.ok) {
		throw new Error("Không tải được " + QUESTIONS_TXT_PATH);
	}
	const text = await res.text();
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	const questions = [];
	let current = null;
	let lastOptionLetter = null;

	for (const lineRaw of lines) {
		const line = lineRaw.trim();
		if (!line) continue;

		// bắt đầu câu mới
		const cauMatch = line.match(/^Câu\s+(\d+)\s*:?(.*)$/i);
		if (cauMatch) {
			if (current) {
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

		if (!current) continue;

		// dòng đáp án
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

		// dòng nối dài
		const extra = cleanAzotaText(line);
		if (!extra) continue;

		if (lastOptionLetter && current.options[lastOptionLetter]) {
			current.options[lastOptionLetter] += " " + extra;
		} else {
			current.text = (current.text ? current.text + " " : "") + extra;
		}
	}

	if (current && current.correct && Object.keys(current.options).length > 0) {
		questions.push(current);
	}

	return questions;
}

// ====== RENDER ======
function renderQuestions() {
	questionsContainer.innerHTML = "";

	const labelLetters = ["A", "B", "C", "D"];

	selectedQuestions.forEach((q, index) => {
		const card = document.createElement("div");
		card.className = "question-card";
		card.dataset.questionId = q.id;
		card.id = "question-" + (index + 1);

		const header = document.createElement("div");
		header.className = "question-header";

		const title = document.createElement("div");
		title.innerHTML =
			'<span class="question-index">Câu ' +
			(index + 1) +
			' </span><span class="question-text">' +
			q.text +
			"</span>";

		header.appendChild(title);
		card.appendChild(header);

		// 👇 CHUYỂN “Chọn một đáp án đúng” LÊN ĐÂY
		const footer = document.createElement("div");
		footer.className = "question-footer";
		footer.textContent = "Chọn một đáp án đúng";
		card.appendChild(footer);

		const optionsDiv = document.createElement("div");
		optionsDiv.className = "options";

		const entries = Object.entries(q.options);
		const shuffledEntries = shuffleArray(entries);
		let correctDisplayLabel = null;

		shuffledEntries.forEach(([origLetter, text], i) => {
			const displayLetter = labelLetters[i];
			if (!displayLetter) return;

			const optionLabel = document.createElement("label");
			optionLabel.className = "option";
			optionLabel.dataset.label = displayLetter;

			const radio = document.createElement("input");
			radio.type = "radio";
			radio.name = "q-" + index;
			radio.value = displayLetter;

			const inner = document.createElement("div");
			inner.className = "option-inner";

			const circle = document.createElement("div");
			circle.className = "option-circle";
			circle.textContent = displayLetter;

			const textDiv = document.createElement("div");
			textDiv.className = "option-text";
			textDiv.textContent = text;

			inner.appendChild(circle);
			inner.appendChild(textDiv);

			optionLabel.appendChild(radio);
			optionLabel.appendChild(inner);
			optionsDiv.appendChild(optionLabel);

			if (origLetter === q.correct) {
				correctDisplayLabel = displayLetter;
			}
		});

		card.dataset.correct = correctDisplayLabel || q.correct || "";
		card.appendChild(optionsDiv); // 👈 options nằm sau dòng “Chọn một đáp án đúng”

		questionsContainer.appendChild(card);
	});
}



function buildNavGrid() {
	navGrid.innerHTML = "";
	if (!selectedQuestions.length) return;

	selectedQuestions.forEach((q, index) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "nav-item";
		btn.dataset.index = index;
		btn.textContent = String(index + 1).padStart(2, "0");

		btn.addEventListener("click", () => {
			const card = document.getElementById("question-" + (index + 1));
			if (card) {
				card.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		});

		navGrid.appendChild(btn);
	});
}

// ====== TIMER & CHẤM ======
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

	navToggle.style.display = "none";
	navPanel.classList.remove("open");

	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}

	let correctCount = 0;

	selectedQuestions.forEach((q, index) => {
		const card = questionsContainer.children[index];
		const correctLabel = card.dataset.correct;

		const selector = 'input[name="q-' + index + '"]:checked';
		const checkedInput = document.querySelector(selector);
		const userAns = checkedInput ? checkedInput.value : null;

		const optionLabels = card.querySelectorAll(".option");

		optionLabels.forEach((lbl) => {
			const optLabel = lbl.dataset.label;
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
	submitBtn.style.display = "inline-flex";   // 👈 hiện nút Nộp bài sau khi bấm Làm bài

	selectedQuestions = pickRandomQuestions(QUESTION_BANK, QUESTION_COUNT);
	renderQuestions();
	buildNavGrid();
	startTimer();

	// show nút tròn
	navToggle.style.display = "flex";
	navPanel.classList.remove("open");
});


submitBtn.addEventListener("click", () => {
	if (!examStarted || examFinished) return;
	const confirmSubmit = confirm("Bạn chắc chắn muốn nộp bài?");
	if (confirmSubmit) {
		gradeExam(false);
	}
});

// toggle panel danh sách câu hỏi
navToggle.addEventListener("click", () => {
	navPanel.classList.toggle("open");
});

// khi chọn đáp án -> đánh dấu ô tương ứng màu xanh
questionsContainer.addEventListener("change", (e) => {
	if (e.target && e.target.matches('input[type="radio"]')) {
		const name = e.target.name; // q-0
		const idx = parseInt(name.split("-")[1], 10);

		// đánh dấu nav đã trả lời
		const navItem = navGrid.querySelector(
			'.nav-item[data-index="' + idx + '"]'
		);
		if (navItem) {
			navItem.classList.add("answered");
		}

		// thêm class .selected cho option được chọn, bỏ ở các option khác cùng câu
		const card = e.target.closest(".question-card");
		if (card) {
			const allOptions = card.querySelectorAll(".option");
			allOptions.forEach((opt) => opt.classList.remove("selected"));
			const chosen = e.target.closest(".option");
			if (chosen) {
				chosen.classList.add("selected");
			}
		}
	}
});


// set timer ban đầu
timerEl.textContent = formatTime(EXAM_DURATION_SECONDS);


// Thu gọn header khi cuộn xuống trong lúc đang làm bài
window.addEventListener("scroll", () => {
	if (!metaEl) return;

	// Chỉ thu gọn khi ĐANG làm bài
	if (!examStarted || examFinished) {
		metaEl.classList.remove("compact");
		return;
	}

	if (window.scrollY > 80) {
		metaEl.classList.add("compact");
	} else {
		metaEl.classList.remove("compact");
	}
});


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
			"Đã tải " + qs.length + " câu hỏi. Bạn có thể bấm \"Làm bài\".";
		startBtn.disabled = false;
	} catch (e) {
		loadStatus.textContent =
			"Lỗi khi tải/parse de_thi/questions.txt. Mở console để xem chi tiết.";
		console.error(e);
	}
})();
